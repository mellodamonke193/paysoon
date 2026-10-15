import { config } from '../config.js';
import { get, run } from '../db.js';
import { HttpError } from '../lib/http.js';
import { createSession, destroySession, requireUser, issueToken, consumeToken, peekToken } from '../lib/auth.js';
import { hashPassword, verifyPassword, burnPasswordCheck, passwordProblem, rateLimit, impersonationProblem } from '../lib/security.js';
import { line, isEmail, safeNext } from '../lib/validate.js';
import { isValidTimeZone, HOUR, MINUTE } from '../lib/time.js';
import { sendSystemEmail } from '../services/email.js';
import { verifyEmail, resetEmail } from '../services/templates.js';
import { signupPage, loginPage, forgotPage, resetPage, verifyFailedPage } from '../views/auth.js';

const tooMany = (what) => new HttpError(429, `Too many ${what}. Please wait a few minutes and try again.`);

export async function sendVerification(user) {
  const token = issueToken(user.id, 'verify', 48 * HOUR);
  await sendSystemEmail({ userId: user.id, to: user.email, kind: 'verify', message: verifyEmail(`${config.appUrl}/verify?token=${token}`) });
}

export default function authRoutes(router) {
  router.get('/signup', (ctx) => (ctx.user ? ctx.redirect('/app') : ctx.html(signupPage(ctx))));

  router.post('/signup', async (ctx) => {
    const form = await ctx.form();
    if (!rateLimit(`signup:${ctx.ip}`, 8, HOUR)) throw tooMany('sign-up attempts');
    const values = {
      email: line(form.email).toLowerCase(),
      business_name: line(form.business_name),
      plan: form.plan === 'pro' ? 'pro' : '',
      agree: form.agree === 'yes' ? 'yes' : '',
    };
    const errors = {};
    if (form.website) errors._form = 'Something went wrong. Please try again.'; // honeypot
    if (!isEmail(values.email)) errors.email = 'Enter a valid email address.';
    if (!values.business_name || values.business_name.length > 80) errors.business_name = 'Enter your name or business name (up to 80 characters).';
    else if (impersonationProblem(values.business_name, config.appName)) errors.business_name = impersonationProblem(values.business_name, config.appName);
    const pwProblem = passwordProblem(form.password, values.email);
    if (pwProblem) errors.password = pwProblem;
    if (!values.agree) errors.agree = 'Please confirm to continue.';
    if (!errors.email && get('SELECT 1 AS x FROM users WHERE email = ?', values.email)) {
      errors.email = 'An account with this email already exists. Try logging in.';
    }
    if (Object.keys(errors).length) return ctx.html(signupPage(ctx, { values, errors }), 422);

    const now = Date.now();
    const timezone = isValidTimeZone(form.timezone) ? form.timezone : 'UTC';
    const passwordHash = await hashPassword(form.password);
    let userId;
    try {
      userId = Number(
        run(
          `INSERT INTO users (email, password_hash, business_name, timezone, terms_accepted_at, terms_version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          values.email,
          passwordHash,
          values.business_name,
          timezone,
          now,
          config.termsVersion,
          now,
          now,
        ).lastInsertRowid,
      );
    } catch {
      return ctx.html(signupPage(ctx, { values, errors: { email: 'An account with this email already exists. Try logging in.' } }), 422);
    }
    destroySession(ctx);
    createSession(ctx, userId);
    await sendVerification({ id: userId, email: values.email });
    ctx.redirect(values.plan === 'pro' ? '/app/billing' : '/app?m=welcome');
  });

  router.get('/login', (ctx) => {
    if (ctx.user) return ctx.redirect('/app');
    ctx.html(loginPage(ctx, { next: safeNext(ctx.query.get('next')) }));
  });

  router.post('/login', async (ctx) => {
    const form = await ctx.form();
    const email = line(form.email).toLowerCase().slice(0, 254);
    if (!rateLimit(`login-ip:${ctx.ip}`, 30, 15 * MINUTE) || !rateLimit(`login-email:${email}`, 10, 15 * MINUTE)) throw tooMany('login attempts');
    const password = String(form.password || '').slice(0, 200);
    const user = isEmail(email) ? get('SELECT id, password_hash FROM users WHERE email = ?', email) : undefined;
    const ok = user ? await verifyPassword(password, user.password_hash) : await burnPasswordCheck(password);
    if (!ok) {
      return ctx.html(loginPage(ctx, { values: { email }, error: 'Incorrect email or password.', next: safeNext(form.next) }), 401);
    }
    destroySession(ctx); // rotate session id on login
    createSession(ctx, user.id);
    ctx.redirect(safeNext(form.next) || '/app');
  });

  router.post('/logout', (ctx) => {
    destroySession(ctx);
    ctx.redirect('/login?m=logged_out');
  });

  router.get('/verify', (ctx) => {
    const token = consumeToken(ctx.query.get('token'), 'verify');
    if (!token) return ctx.html(verifyFailedPage(ctx), 410);
    run('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?', Date.now(), Date.now(), token.user_id);
    ctx.redirect(ctx.user?.id === token.user_id ? '/app?m=verified' : '/login?m=verified_login');
  });

  router.post('/verify/resend', async (ctx) => {
    const user = requireUser(ctx);
    if (user.email_verified_at) return ctx.redirect('/app');
    if (!rateLimit(`verify:${user.id}`, 3, HOUR)) throw tooMany('confirmation emails');
    await sendVerification(user);
    ctx.redirect('/app?m=verification_sent');
  });

  router.get('/forgot', (ctx) => ctx.html(forgotPage(ctx)));

  router.post('/forgot', async (ctx) => {
    const form = await ctx.form();
    const email = line(form.email).toLowerCase().slice(0, 254);
    if (!rateLimit(`forgot-ip:${ctx.ip}`, 10, HOUR)) throw tooMany('reset requests');
    const user = isEmail(email) ? get('SELECT id, email FROM users WHERE email = ?', email) : undefined;
    // Same response whether or not the account exists.
    if (user && rateLimit(`forgot-user:${user.id}`, 3, HOUR)) {
      const token = issueToken(user.id, 'reset', HOUR);
      await sendSystemEmail({ userId: user.id, to: user.email, kind: 'reset', message: resetEmail(`${config.appUrl}/reset?token=${token}`) });
    }
    ctx.html(forgotPage(ctx, { sent: true, email }));
  });

  router.get('/reset', (ctx) => {
    const token = ctx.query.get('token');
    ctx.html(peekToken(token, 'reset') ? resetPage(ctx, { token }) : resetPage(ctx, { invalid: true }));
  });

  router.post('/reset', async (ctx) => {
    const form = await ctx.form();
    if (!rateLimit(`reset:${ctx.ip}`, 20, HOUR)) throw tooMany('attempts');
    const pending = peekToken(form.token, 'reset');
    if (!pending) return ctx.html(resetPage(ctx, { invalid: true }), 410);
    const user = get('SELECT id, email FROM users WHERE id = ?', pending.user_id);
    const problem = passwordProblem(form.password, user?.email);
    if (problem) return ctx.html(resetPage(ctx, { token: form.token, errors: { password: problem } }), 422);
    const hash = await hashPassword(form.password);
    const token = consumeToken(form.token, 'reset');
    if (!token) return ctx.html(resetPage(ctx, { invalid: true }), 410);
    const now = Date.now();
    run('UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?', hash, now, now, token.user_id);
    run('DELETE FROM sessions WHERE user_id = ?', token.user_id);
    run(`UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND kind = 'reset' AND used_at IS NULL`, now, token.user_id);
    destroySession(ctx);
    ctx.redirect('/login?m=password_reset');
  });
}
