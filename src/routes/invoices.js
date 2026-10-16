import { get, all, run, tx } from '../db.js';
import { HttpError } from '../lib/http.js';
import { requireUser } from '../lib/auth.js';
import { randomToken, rateLimit } from '../lib/security.js';
import { isId } from '../lib/validate.js';
import { amountInputValue } from '../lib/money.js';
import { MIN_GAP_MS } from '../lib/schedule.js';
import { localDate, HOUR } from '../lib/time.js';
import {
  canOpenAnother,
  findInvoice,
  logEvent,
  reschedule,
  parseInvoiceForm,
  dashboardData,
  buildTimeline,
  previewStage,
  isPro,
  clientLink,
  optOutLink,
} from '../services/invoices.js';
import { isSuppressed } from '../services/abuse.js';
import { sendReminder, sendTestEmail } from '../services/worker.js';
import { reminderEmail } from '../services/templates.js';
import { dashboardPage, invoiceFormPage, invoiceDetailPage } from '../views/app.js';

const FILTERS = new Set(['all', 'overdue', 'upcoming', 'paused', 'paid']);

function loadInvoice(ctx) {
  const user = requireUser(ctx);
  if (!isId(ctx.params.id)) throw new HttpError(404);
  const invoice = findInvoice(user.id, ctx.params.id);
  if (!invoice) throw new HttpError(404); // other users' invoices are indistinguishable from missing ones
  return { user, invoice };
}

const limitRedirect = (ctx) => ctx.redirect('/app/billing?m=limit');
const back = (ctx, invoice, message) => ctx.redirect(`/app/invoices/${invoice.id}${message ? `?m=${message}` : ''}`);

export default function invoiceRoutes(router) {
  router.get('/app', (ctx) => {
    const user = requireUser(ctx);
    const filter = FILTERS.has(ctx.query.get('filter')) ? ctx.query.get('filter') : 'all';
    ctx.html(dashboardPage(ctx, { data: dashboardData(user, filter), filter }));
  });

  router.get('/app/invoices/new', (ctx) => {
    const user = requireUser(ctx);
    if (!canOpenAnother(user)) return limitRedirect(ctx);
    const last = get('SELECT currency, cadence FROM invoices WHERE user_id = ? ORDER BY id DESC LIMIT 1', user.id);
    // "New invoice for this client" pre-fills everything except the number, amount and dates.
    const from = isId(ctx.query.get('from')) ? findInvoice(user.id, ctx.query.get('from')) : null;
    const values = {
      client_name: from?.client_name || '',
      client_email: from?.client_email || '',
      number: '',
      amount: '',
      currency: from?.currency || last?.currency || 'USD',
      issue_date: '',
      due_date: '',
      payment_url: from?.payment_url || '',
      note: from?.note || '',
      message: from?.message || '',
      cadence: from?.cadence || last?.cadence || 'standard',
    };
    ctx.html(invoiceFormPage(ctx, { values, today: localDate(Date.now(), user.timezone) }));
  });

  router.post('/app/invoices', async (ctx) => {
    const user = requireUser(ctx);
    if (!rateLimit(`create:${user.id}`, 60, HOUR)) throw new HttpError(429, 'You are adding invoices very quickly. Please wait a bit.');
    const { values, errors, data } = parseInvoiceForm(await ctx.form(), user);
    if (Object.keys(errors).length) {
      return ctx.html(invoiceFormPage(ctx, { values, errors, today: localDate(Date.now(), user.timezone) }), 422);
    }
    const now = Date.now();
    const id = tx(() => {
      if (!canOpenAnother(user)) return null;
      const result = run(
        `INSERT INTO invoices (user_id, public_token, number, client_name, client_email, amount_minor, currency, issue_date, due_date,
                               payment_url, note, message, cadence, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        user.id, randomToken(24), data.number, data.client_name, data.client_email, data.amount_minor, data.currency,
        data.issue_date, data.due_date, data.payment_url, data.note, data.message, data.cadence, now, now,
      );
      const invoiceId = Number(result.lastInsertRowid);
      reschedule(findInvoice(user.id, invoiceId), user, now);
      logEvent(invoiceId, 'created');
      return invoiceId;
    });
    if (!id) return limitRedirect(ctx);
    ctx.redirect(`/app/invoices/${id}?m=created`);
  });

  router.get('/app/invoices/:id', (ctx) => {
    const { user, invoice } = loadInvoice(ctx);
    const events = all('SELECT kind, detail, created_at FROM invoice_events WHERE invoice_id = ? ORDER BY id DESC LIMIT 50', invoice.id);
    let preview = null;
    if (invoice.status !== 'paid') {
      const { stage, daysLate } = previewStage(invoice, user);
      const email = reminderEmail({
        invoice,
        user,
        stage,
        daysLate,
        link: clientLink(invoice),
        optOutLink: optOutLink(invoice),
        branded: !isPro(user),
      });
      preview = { subject: email.subject, text: email.text };
    }
    ctx.html(
      invoiceDetailPage(ctx, {
        invoice,
        timeline: buildTimeline(invoice, user),
        events,
        preview,
        suppressed: isSuppressed(user.id, invoice.client_email),
        today: localDate(Date.now(), user.timezone),
      }),
    );
  });

  router.get('/app/invoices/:id/edit', (ctx) => {
    const { user, invoice } = loadInvoice(ctx);
    const values = { ...invoice, amount: amountInputValue(invoice.amount_minor, invoice.currency), issue_date: invoice.issue_date || '' };
    ctx.html(invoiceFormPage(ctx, { invoice, values, today: localDate(Date.now(), user.timezone) }));
  });

  router.post('/app/invoices/:id/edit', async (ctx) => {
    const { user, invoice } = loadInvoice(ctx);
    const form = await ctx.form();
    // Keep an existing Persistent cadence even if the user has since downgraded.
    const effectiveUser = form.cadence === invoice.cadence ? { ...user, plan: 'pro' } : user;
    const { values, errors, data } = parseInvoiceForm(form, effectiveUser);
    if (Object.keys(errors).length) {
      return ctx.html(invoiceFormPage(ctx, { invoice, values, errors, today: localDate(Date.now(), user.timezone) }), 422);
    }
    const now = Date.now();
    tx(() => {
      run(
        `UPDATE invoices SET number = ?, client_name = ?, client_email = ?, amount_minor = ?, currency = ?, issue_date = ?, due_date = ?,
                payment_url = ?, note = ?, message = ?, cadence = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        data.number, data.client_name, data.client_email, data.amount_minor, data.currency, data.issue_date, data.due_date,
        data.payment_url, data.note, data.message, data.cadence, now, invoice.id, user.id,
      );
      if (invoice.status === 'active' && (data.due_date !== invoice.due_date || data.cadence !== invoice.cadence)) {
        reschedule(findInvoice(user.id, invoice.id), user, now);
      }
      logEvent(invoice.id, 'edited');
    });
    back(ctx, invoice, 'updated');
  });

  router.post('/app/invoices/:id/paid', (ctx) => {
    const { invoice } = loadInvoice(ctx);
    if (invoice.status !== 'paid') {
      const now = Date.now();
      run(`UPDATE invoices SET status = 'paid', paid_at = ?, next_send_at = NULL, claim_resume_at = NULL, updated_at = ? WHERE id = ?`, now, now, invoice.id);
      logEvent(invoice.id, 'paid');
    }
    back(ctx, invoice, 'paid');
  });

  router.post('/app/invoices/:id/reopen', (ctx) => {
    const { user, invoice } = loadInvoice(ctx);
    if (invoice.status !== 'paid') return back(ctx, invoice);
    if (isSuppressed(user.id, invoice.client_email)) return back(ctx, invoice, 'suppressed');
    const ok = tx(() => {
      if (!canOpenAnother(user)) return false;
      run(
        `UPDATE invoices SET status = 'active', paid_at = NULL, client_claimed_at = NULL, claim_resume_at = NULL, disputed_at = NULL,
                updated_at = ? WHERE id = ?`,
        Date.now(),
        invoice.id,
      );
      reschedule(findInvoice(user.id, invoice.id), user);
      logEvent(invoice.id, 'reopened');
      return true;
    });
    if (!ok) return limitRedirect(ctx);
    back(ctx, invoice, 'reopened');
  });

  router.post('/app/invoices/:id/pause', (ctx) => {
    const { invoice } = loadInvoice(ctx);
    if (invoice.status === 'active') {
      run(`UPDATE invoices SET status = 'paused', next_send_at = NULL, updated_at = ? WHERE id = ?`, Date.now(), invoice.id);
      logEvent(invoice.id, 'paused');
    } else if (invoice.status === 'paused' && invoice.claim_resume_at) {
      // The sender chose to keep it paused (e.g. agreed a payment plan): cancel the automatic restart.
      run('UPDATE invoices SET claim_resume_at = NULL, updated_at = ? WHERE id = ?', Date.now(), invoice.id);
      logEvent(invoice.id, 'paused');
    }
    back(ctx, invoice, 'paused');
  });

  router.post('/app/invoices/:id/resume', (ctx) => {
    const { user, invoice } = loadInvoice(ctx);
    if (invoice.status !== 'paused') return back(ctx, invoice);
    // Never resume reminders to someone who unsubscribed or said the invoice isn't theirs.
    if (isSuppressed(user.id, invoice.client_email)) return back(ctx, invoice, 'suppressed');
    tx(() => {
      run(
        `UPDATE invoices SET status = 'active', client_claimed_at = NULL, claim_resume_at = NULL, disputed_at = NULL, updated_at = ? WHERE id = ?`,
        Date.now(),
        invoice.id,
      );
      reschedule(findInvoice(user.id, invoice.id), user);
      logEvent(invoice.id, 'resumed');
    });
    back(ctx, invoice, 'resumed');
  });

  router.post('/app/invoices/:id/send-now', async (ctx) => {
    const { user, invoice } = loadInvoice(ctx);
    if (!user.email_verified_at) return back(ctx, invoice, 'verify_first');
    if (user.suspended_at) return back(ctx, invoice, 'suspended');
    if (isSuppressed(user.id, invoice.client_email)) return back(ctx, invoice, 'suppressed');
    if (invoice.status !== 'active' || invoice.next_send_at === null) return back(ctx, invoice, 'cannot_send');
    const now = Date.now();
    if (invoice.last_sent_at && now - invoice.last_sent_at < MIN_GAP_MS) return back(ctx, invoice, 'too_soon');
    if (!rateLimit(`send-now:${user.id}`, 20, HOUR)) throw new HttpError(429, 'Too many manual sends. Please wait a bit.');
    run('UPDATE invoices SET next_send_at = ? WHERE id = ?', now, invoice.id);
    const result = await sendReminder(invoice.id, now);
    back(ctx, invoice, result === 'sent' ? 'sent_now' : result === 'suppressed' ? 'suppressed' : 'cannot_send');
  });

  router.post('/app/invoices/:id/test', async (ctx) => {
    const { user, invoice } = loadInvoice(ctx);
    if (!user.email_verified_at) return back(ctx, invoice, 'verify_first');
    if (!rateLimit(`test-email:${user.id}`, 10, HOUR)) throw new HttpError(429, 'Too many test emails. Please wait a bit.');
    const ok = await sendTestEmail(invoice, user);
    back(ctx, invoice, ok ? 'test_sent' : 'test_failed');
  });

  router.post('/app/invoices/:id/delete', (ctx) => {
    const { user, invoice } = loadInvoice(ctx);
    run('DELETE FROM invoices WHERE id = ? AND user_id = ?', invoice.id, user.id);
    ctx.redirect('/app?m=deleted');
  });
}
