import { config, billingEnabled } from '../config.js';
import { get, run } from '../db.js';
import { HttpError } from '../lib/http.js';
import { rateLimit } from '../lib/security.js';
import { line } from '../lib/validate.js';
import { CURRENCIES, formatMoney, parseAmount } from '../lib/money.js';
import { isValidDateStr, localDate, daysBetween, HOUR, MINUTE } from '../lib/time.js';
import { serveAsset } from '../assets.js';
import { logEvent } from '../services/invoices.js';
import { sendSystemEmail } from '../services/email.js';
import { clientResponseEmail, reminderCopy } from '../services/templates.js';
import { isSuppressed, suppress, recordAbuseReport } from '../services/abuse.js';
import { verifyStripeSignature, handleStripeEvent } from '../services/billing.js';
import { landingPage, toolPage } from '../views/marketing.js';
import { legalPage, LEGAL_PAGES } from '../views/legal.js';
import { templatesIndexPage, templatePage, guidePage, lateFeePage, TEMPLATE_SLUGS, calculateLateFee } from '../views/content.js';
import { clientInvoicePage, unsubscribePage } from '../views/client.js';

const PUBLIC_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const TOOL_STAGES = new Set(['upcoming', 'due', 'overdue', 'firm', 'final']);
const CLIENT_RESPONSES = new Set(['claimed', 'wrong', 'not_mine', 'stop']);

function loadPublicInvoice(token) {
  if (!PUBLIC_TOKEN_RE.test(token)) throw new HttpError(404);
  const invoice = get('SELECT * FROM invoices WHERE public_token = ?', token);
  if (!invoice) throw new HttpError(404);
  const owner = get('SELECT id, email, business_name, reply_to, plan, timezone FROM users WHERE id = ?', invoice.user_id);
  return { invoice, owner };
}

const EVENT_FOR = { claimed: 'claimed', wrong: 'disputed', not_mine: 'not_mine', stop: 'opted_out' };

/**
 * A client told us something about an invoice. Every response pauses reminders; "not mine" and "stop" also
 * block all future reminders from this sender to that address. The owner is emailed once per change.
 */
async function recordClientResponse(invoice, owner, kind) {
  const now = Date.now();
  let changed = false;
  if (kind === 'claimed') {
    changed = invoice.status !== 'paid' && !invoice.client_claimed_at;
    if (changed) {
      run(
        `UPDATE invoices SET client_claimed_at = ?, status = CASE WHEN status = 'active' THEN 'paused' ELSE status END,
                next_send_at = NULL, updated_at = ? WHERE id = ?`,
        now, now, invoice.id,
      );
    }
  } else if (kind === 'wrong') {
    changed = !invoice.disputed_at && invoice.status !== 'paid';
    if (changed) {
      run(
        `UPDATE invoices SET disputed_at = ?, status = CASE WHEN status = 'active' THEN 'paused' ELSE status END,
                next_send_at = NULL, updated_at = ? WHERE id = ?`,
        now, now, invoice.id,
      );
    }
  } else {
    changed = !isSuppressed(owner.id, invoice.client_email);
    suppress(owner.id, invoice.client_email, kind);
    run(
      `UPDATE invoices SET status = 'paused', next_send_at = NULL, updated_at = ?
        WHERE user_id = ? AND client_email = ? AND status = 'active'`,
      now, owner.id, invoice.client_email,
    );
    if (kind === 'not_mine') {
      run('UPDATE invoices SET disputed_at = COALESCE(disputed_at, ?) WHERE id = ?', now, invoice.id);
      if (changed) recordAbuseReport(owner.id, invoice.id, invoice.client_email, 'not_mine');
    }
  }
  if (!changed) return;
  logEvent(invoice.id, EVENT_FOR[kind]);
  await sendSystemEmail({
    userId: owner.id,
    to: owner.email,
    kind: `client_${kind}`,
    message: clientResponseEmail({ invoice, kind, url: `${config.appUrl}/app/invoices/${invoice.id}` }),
  });
}

const clientLimit = (ctx) => {
  if (!rateLimit(`client-action:${ctx.ip}`, 10, HOUR)) throw new HttpError(429, 'Too many requests. Please try again later.');
};

export default function publicRoutes(router) {
  router.get('/', (ctx) => ctx.html(landingPage(ctx)));
  for (const slug of Object.keys(LEGAL_PAGES)) router.get(`/${slug}`, (ctx) => ctx.html(legalPage(ctx, slug)));

  router.get('/tools/late-payment-email', (ctx) => {
    const q = ctx.query;
    const values = {
      client: line(q.get('client')).slice(0, 80),
      invoice: line(q.get('invoice')).slice(0, 40),
      amount: line(q.get('amount')).slice(0, 16),
      currency: CURRENCIES[q.get('currency')] !== undefined ? q.get('currency') : 'USD',
      due: isValidDateStr(q.get('due')) ? q.get('due') : '',
      stage: TOOL_STAGES.has(q.get('stage')) ? q.get('stage') : 'overdue',
      from: line(q.get('from')).slice(0, 80),
    };
    let generated = null;
    if (q.size) {
      const today = localDate(Date.now(), 'UTC');
      const minor = parseAmount(values.amount, values.currency);
      const due = values.due || today;
      const actualLate = daysBetween(due, today);
      const daysLate = { upcoming: Math.min(actualLate, -1), due: 0, overdue: Math.max(actualLate, 1), firm: Math.max(actualLate, 14), final: Math.max(actualLate, 30) }[values.stage];
      generated = reminderCopy({
        clientName: values.client || 'there',
        number: values.invoice || '[invoice number]',
        amount: minor ? formatMoney(minor, values.currency) : '[amount]',
        dueDate: due,
        daysLate: Math.abs(daysLate) > 3650 ? 30 : daysLate,
        stage: values.stage,
        sign: values.from || '[your name]',
      });
    }
    ctx.html(toolPage(ctx, { values, generated }));
  });

  router.get('/tools/late-fee-calculator', (ctx) => {
    const q = ctx.query;
    const values = {
      amount: line(q.get('amount')).slice(0, 16),
      currency: CURRENCIES[q.get('currency')] !== undefined ? q.get('currency') : 'USD',
      rate: line(q.get('rate')).slice(0, 8),
      period: q.get('period') === 'year' ? 'year' : 'month',
      days: line(q.get('days')).slice(0, 5),
      flat: line(q.get('flat')).slice(0, 12),
    };
    const result = q.size ? calculateLateFee(values) : null;
    ctx.html(lateFeePage(ctx, { values, result }));
  });

  router.get('/templates', (ctx) => ctx.html(templatesIndexPage(ctx)));
  router.get('/templates/:slug', (ctx) => {
    const page = templatePage(ctx, ctx.params.slug);
    if (!page) throw new HttpError(404);
    ctx.html(page);
  });
  router.get('/guides/how-to-ask-for-payment', (ctx) => ctx.html(guidePage(ctx)));

  // The page every reminder links to. Capability URL: 192-bit random token, never guessable.
  router.get('/i/:token', (ctx) => {
    const { invoice, owner } = loadPublicInvoice(ctx.params.token);
    const isOwner = ctx.user?.id === owner.id;
    if (ctx.method === 'GET' && !isOwner && invoice.status !== 'paid' && rateLimit(`view:${invoice.id}:${ctx.ip}`, 1, 30 * MINUTE)) {
      const now = Date.now();
      run(
        'UPDATE invoices SET view_count = view_count + 1, first_viewed_at = COALESCE(first_viewed_at, ?), last_viewed_at = ? WHERE id = ?',
        now, now, invoice.id,
      );
      if (!invoice.first_viewed_at) logEvent(invoice.id, 'viewed');
    }
    const done = CLIENT_RESPONSES.has(ctx.query.get('done')) ? ctx.query.get('done') : null;
    ctx.html(
      clientInvoicePage(ctx, {
        invoice,
        owner,
        today: localDate(Date.now(), owner.timezone),
        done,
        optedOut: isSuppressed(owner.id, invoice.client_email),
      }),
    );
  });

  router.post('/i/:token/paid', async (ctx) => {
    const { invoice, owner } = loadPublicInvoice(ctx.params.token);
    clientLimit(ctx);
    await recordClientResponse(invoice, owner, 'claimed');
    ctx.redirect(`/i/${invoice.public_token}?done=claimed`);
  });

  router.post('/i/:token/report', async (ctx) => {
    const { invoice, owner } = loadPublicInvoice(ctx.params.token);
    clientLimit(ctx);
    const reason = (await ctx.form()).reason;
    if (!['wrong', 'not_mine', 'stop'].includes(reason)) throw new HttpError(400, 'Please choose one of the options.');
    await recordClientResponse(invoice, owner, reason);
    ctx.redirect(`/i/${invoice.public_token}?done=${reason}`);
  });

  // Unsubscribe link in every reminder. GET shows a confirmation page (link scanners must not unsubscribe people).
  router.get('/u/:token', (ctx) => {
    const { invoice, owner } = loadPublicInvoice(ctx.params.token);
    ctx.html(unsubscribePage(ctx, { invoice, owner, optedOut: isSuppressed(owner.id, invoice.client_email) }));
  });

  // RFC 8058 one-click unsubscribe, POSTed directly by Gmail/Yahoo/Apple Mail. No CSRF token by design;
  // the unguessable token in the URL is the authorization, and the only effect is stopping emails.
  router.post(
    '/u/:token',
    async (ctx) => {
      const { invoice, owner } = loadPublicInvoice(ctx.params.token);
      await ctx.rawBody(8 * 1024).catch(() => null);
      if (!rateLimit(`unsub:${ctx.ip}`, 30, HOUR)) throw new HttpError(429);
      await recordClientResponse(invoice, owner, 'stop');
      ctx.text('You have been unsubscribed from these reminders.');
    },
    { csrf: false },
  );

  router.post(
    '/webhooks/stripe',
    async (ctx) => {
      if (!billingEnabled()) throw new HttpError(404);
      const raw = await ctx.rawBody(1024 * 1024);
      if (!verifyStripeSignature(raw, ctx.header('stripe-signature'), config.stripe.webhookSecret)) {
        return ctx.json({ error: 'invalid signature' }, 400);
      }
      let event;
      try {
        event = JSON.parse(raw.toString('utf8'));
      } catch {
        return ctx.json({ error: 'invalid payload' }, 400);
      }
      if (typeof event?.id !== 'string' || typeof event?.type !== 'string') return ctx.json({ error: 'invalid event' }, 400);
      handleStripeEvent(event);
      ctx.json({ received: true });
    },
    { csrf: false },
  );

  router.get('/assets/app.css', (ctx) => serveAsset(ctx, 'app.css'));
  router.get('/assets/app.js', (ctx) => serveAsset(ctx, 'app.js'));
  router.get('/assets/favicon.svg', (ctx) => serveAsset(ctx, 'favicon.svg'));
  router.get('/favicon.ico', (ctx) => serveAsset(ctx, 'favicon.svg'));

  router.get('/robots.txt', (ctx) =>
    ctx.text(
      `User-agent: *\nDisallow: /app\nDisallow: /i/\nDisallow: /u/\nDisallow: /admin\nDisallow: /reset\nDisallow: /verify\nSitemap: ${config.appUrl}/sitemap.xml\n`,
      200,
      { 'Cache-Control': 'public, max-age=86400' },
    ),
  );

  router.get('/sitemap.xml', (ctx) => {
    const urls = [
      '/',
      '/tools/late-payment-email',
      '/tools/late-fee-calculator',
      '/templates',
      ...TEMPLATE_SLUGS.map((s) => `/templates/${s}`),
      '/guides/how-to-ask-for-payment',
      '/signup',
      ...Object.keys(LEGAL_PAGES).map((s) => `/${s}`),
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${config.appUrl}${u}</loc></url>`).join('\n')}\n</urlset>\n`;
    ctx.send(200, body, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
  });

  // RFC 9116: tells security researchers how to report vulnerabilities privately.
  router.get('/.well-known/security.txt', (ctx) => {
    const expires = new Date(Date.now() + 365 * 24 * HOUR).toISOString();
    const contact = config.supportEmail ? `mailto:${config.supportEmail}` : `${config.appUrl}/acceptable-use`;
    ctx.text(`Contact: ${contact}\nExpires: ${expires}\nPolicy: ${config.appUrl}/acceptable-use\nPreferred-Languages: en\n`, 200, {
      'Cache-Control': 'public, max-age=86400',
    });
  });

  router.get('/healthz', (ctx) => {
    get('SELECT 1 AS ok');
    ctx.json({ ok: true });
  });
}
