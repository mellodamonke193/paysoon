import { config, billingEnabled } from '../config.js';
import { get, all, run } from '../db.js';
import { HttpError } from '../lib/http.js';
import { requireUser, destroySession, createSession, isAdmin } from '../lib/auth.js';
import { hashPassword, verifyPassword, passwordProblem, rateLimit, impersonationProblem } from '../lib/security.js';
import { line, multiline, isEmail, isId } from '../lib/validate.js';
import { isValidTimeZone, DAY, HOUR, MINUTE } from '../lib/time.js';
import { openInvoiceCount, isPro } from '../services/invoices.js';
import { unsuspend } from '../services/abuse.js';
import { createCheckoutSession, createPortalSession, cancelSubscriptionNow } from '../services/billing.js';
import { settingsPage, billingPage, adminPage } from '../views/app.js';

const profileValues = (user) => ({
  business_name: user.business_name,
  reply_to: user.reply_to,
  signature: user.signature,
  timezone: user.timezone,
  weekly_digest: user.weekly_digest ? 'yes' : '',
});

async function checkPassword(user, password) {
  if (!rateLimit(`pw-check:${user.id}`, 10, 15 * MINUTE)) throw new HttpError(429, 'Too many attempts. Please wait a few minutes.');
  const row = get('SELECT password_hash FROM users WHERE id = ?', user.id);
  return verifyPassword(String(password || '').slice(0, 200), row.password_hash);
}

function requireAdmin(ctx) {
  const user = requireUser(ctx);
  if (!isAdmin(user)) throw new HttpError(404);
  return user;
}

export default function accountRoutes(router) {
  router.get('/app/settings', (ctx) => {
    const user = requireUser(ctx);
    ctx.html(settingsPage(ctx, { values: profileValues(user) }));
  });

  router.post('/app/settings', async (ctx) => {
    const user = requireUser(ctx);
    const form = await ctx.form();
    const values = {
      business_name: line(form.business_name),
      reply_to: line(form.reply_to).toLowerCase(),
      signature: multiline(form.signature),
      timezone: line(form.timezone),
      weekly_digest: form.weekly_digest === 'yes' ? 'yes' : '',
    };
    const errors = {};
    if (!values.business_name || values.business_name.length > 80) errors.business_name = 'Enter your name or business name (up to 80 characters).';
    else if (impersonationProblem(values.business_name, config.appName)) errors.business_name = impersonationProblem(values.business_name, config.appName);
    if (values.reply_to && !isEmail(values.reply_to)) errors.reply_to = 'Enter a valid email, or leave blank to use your account email.';
    if (values.signature.length > 300) errors.signature = 'Keep your sign-off under 300 characters.';
    if (!isValidTimeZone(values.timezone)) errors.timezone = 'Choose a timezone from the list.';
    if (Object.keys(errors).length) return ctx.html(settingsPage(ctx, { values, errors }), 422);
    run(
      'UPDATE users SET business_name = ?, reply_to = ?, signature = ?, timezone = ?, weekly_digest = ?, updated_at = ? WHERE id = ?',
      values.business_name, values.reply_to, values.signature, values.timezone, values.weekly_digest ? 1 : 0, Date.now(), user.id,
    );
    ctx.redirect('/app/settings?m=settings_saved');
  });

  // Everything we hold about the account, as JSON (GDPR/CCPA access and portability).
  router.get('/app/settings/export', (ctx) => {
    const user = requireUser(ctx);
    if (!rateLimit(`export:${user.id}`, 10, HOUR)) throw new HttpError(429, 'Too many exports. Please wait a bit.');
    const data = {
      exported_at: new Date().toISOString(),
      account: get(
        `SELECT id, email, email_verified_at, business_name, reply_to, signature, timezone, plan, subscription_status,
                current_period_end, weekly_digest, terms_accepted_at, terms_version, created_at, updated_at
           FROM users WHERE id = ?`,
        user.id,
      ),
      invoices: all('SELECT * FROM invoices WHERE user_id = ? ORDER BY id', user.id),
      invoice_events: all(
        `SELECT e.invoice_id, e.kind, e.detail, e.created_at FROM invoice_events e
           JOIN invoices i ON i.id = e.invoice_id WHERE i.user_id = ? ORDER BY e.id`,
        user.id,
      ),
      emails_sent: all(
        'SELECT invoice_id, kind, step, to_email, subject, status, created_at FROM email_log WHERE user_id = ? ORDER BY id',
        user.id,
      ),
      unsubscribed_recipients: all('SELECT email, reason, created_at FROM suppressions WHERE user_id = ?', user.id),
    };
    const name = `${config.appName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-export-${new Date().toISOString().slice(0, 10)}.json`;
    ctx.send(200, JSON.stringify(data, null, 2), {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    });
  });

  router.post('/app/settings/password', async (ctx) => {
    const user = requireUser(ctx);
    const form = await ctx.form();
    const pwErrors = {};
    if (!(await checkPassword(user, form.current_password))) pwErrors.current_password = 'That password is incorrect.';
    const problem = passwordProblem(form.new_password, user.email);
    if (problem) pwErrors.new_password = problem;
    if (Object.keys(pwErrors).length) return ctx.html(settingsPage(ctx, { values: profileValues(user), pwErrors }), 422);
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', await hashPassword(form.new_password), Date.now(), user.id);
    run('DELETE FROM sessions WHERE user_id = ?', user.id); // sign out everywhere…
    createSession(ctx, user.id); // …except here
    ctx.redirect('/app/settings?m=password_changed');
  });

  router.post('/app/settings/delete', async (ctx) => {
    const user = requireUser(ctx);
    const form = await ctx.form();
    if (!(await checkPassword(user, form.confirm_password))) {
      return ctx.html(settingsPage(ctx, { values: profileValues(user), pwErrors: { confirm_password: 'That password is incorrect.' } }), 422);
    }
    if (user.stripe_subscription_id && billingEnabled() && user.subscription_status !== 'canceled') {
      try {
        await cancelSubscriptionNow(user.stripe_subscription_id);
      } catch (err) {
        console.error(`[billing] cancel on delete failed for user ${user.id}:`, err.message);
      }
    }
    run('DELETE FROM users WHERE id = ?', user.id); // cascades to sessions, tokens, invoices, events, suppressions
    destroySession(ctx);
    ctx.redirect('/?m=account_deleted');
  });

  router.get('/app/billing', (ctx) => {
    const user = requireUser(ctx);
    ctx.html(billingPage(ctx, { openCount: openInvoiceCount(user.id) }));
  });

  router.post('/app/billing/checkout', async (ctx) => {
    const user = requireUser(ctx);
    if (!billingEnabled()) throw new HttpError(503, 'Billing is not available right now.');
    if (isPro(user)) return ctx.redirect('/app/billing');
    if (!rateLimit(`checkout:${user.id}`, 10, HOUR)) throw new HttpError(429, 'Too many attempts. Please wait a bit.');
    const interval = (await ctx.form()).interval === 'year' ? 'year' : 'month';
    try {
      ctx.redirect(await createCheckoutSession(user, interval));
    } catch (err) {
      console.error('[billing] checkout failed:', err.message);
      ctx.redirect('/app/billing?m=billing_error');
    }
  });

  router.post('/app/billing/portal', async (ctx) => {
    const user = requireUser(ctx);
    if (!billingEnabled() || !user.stripe_customer_id) return ctx.redirect('/app/billing');
    try {
      ctx.redirect(await createPortalSession(user));
    } catch (err) {
      console.error('[billing] portal failed:', err.message);
      ctx.redirect('/app/billing?m=billing_error');
    }
  });

  router.get('/admin', (ctx) => {
    requireAdmin(ctx);
    const now = Date.now();
    const stats = get(
      `SELECT (SELECT COUNT(*) FROM users) AS users,
              (SELECT COUNT(*) FROM users WHERE plan = 'pro') AS pro,
              (SELECT COUNT(*) FROM users WHERE created_at >= ?) AS signups7,
              (SELECT COUNT(*) FROM users WHERE created_at >= ?) AS signups30,
              (SELECT COUNT(*) FROM invoices WHERE status IN ('active','paused')) AS openInvoices,
              (SELECT COUNT(*) FROM invoices WHERE status = 'paid') AS paidInvoices,
              (SELECT COUNT(*) FROM email_log WHERE kind = 'reminder' AND status IN ('sent','logged') AND created_at >= ?) AS reminders30,
              (SELECT COUNT(*) FROM invoice_events WHERE kind = 'send_failed' AND created_at >= ?) AS failed30,
              (SELECT COUNT(*) FROM abuse_reports WHERE created_at >= ?) AS reports30`,
      now - 7 * DAY,
      now - 30 * DAY,
      now - 30 * DAY,
      now - 30 * DAY,
      now - 30 * DAY,
    );
    const recent = all(
      `SELECT u.email, u.business_name, u.plan, u.email_verified_at, u.created_at,
              (SELECT COUNT(*) FROM invoices i WHERE i.user_id = u.id) AS invoice_count
         FROM users u ORDER BY u.id DESC LIMIT 25`,
    );
    const suspended = all(
      `SELECT u.id, u.email, u.business_name, u.suspended_at, u.suspended_reason,
              (SELECT COUNT(*) FROM abuse_reports r WHERE r.user_id = u.id) AS report_count
         FROM users u WHERE u.suspended_at IS NOT NULL ORDER BY u.suspended_at DESC LIMIT 100`,
    );
    ctx.html(adminPage(ctx, { stats, recent, suspended }));
  });

  router.post('/admin/users/:id/unsuspend', (ctx) => {
    requireAdmin(ctx);
    if (!isId(ctx.params.id)) throw new HttpError(404);
    unsuspend(Number(ctx.params.id));
    ctx.redirect('/admin?m=unsuspended');
  });
}
