import { config } from '../config.js';
import { html } from '../lib/html.js';
import { page, csrfField, flash, input } from './layout.js';

const shell = (ctx, title, inner) =>
  page(ctx, {
    title,
    noindex: true,
    body: html`<div class="auth"><div class="auth-card">
  <div class="card card-pad stack">${inner}</div>
</div></div>`,
  });

export function signupPage(ctx, { values = {}, errors = {} } = {}) {
  const wantsPro = ctx.query.get('plan') === 'pro' || values.plan === 'pro';
  return shell(
    ctx,
    'Create your account',
    html`<div>
  <h1>Stop chasing invoices</h1>
  <p class="lede">Create your free account. No card needed${wantsPro ? '. You can upgrade to Pro right after' : ''}.</p>
</div>
${errors._form ? html`<div class="alert alert-danger" role="alert">${errors._form}</div>` : ''}
<form method="post" action="/signup" class="stack" novalidate>
  ${csrfField(ctx)}
  <input type="hidden" name="timezone" value="UTC" data-timezone>
  <input type="hidden" name="plan" value="${wantsPro ? 'pro' : ''}">
  <div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
  ${input({ name: 'business_name', label: 'Your name or business name', value: values.business_name, errors, autocomplete: 'organization', placeholder: 'Alex Rivera Design', maxlength: 80, hint: 'Your clients see this as the sender.' })}
  ${input({ name: 'email', label: 'Email', type: 'email', value: values.email, errors, autocomplete: 'email', maxlength: 254 })}
  ${input({ name: 'password', label: 'Password', type: 'password', errors, autocomplete: 'new-password', hint: 'At least 10 characters.', maxlength: 200 })}
  <div class="field ${errors.agree ? 'has-error' : ''}">
    <label class="checkbox"><input type="checkbox" name="agree" value="yes" ${values.agree === 'yes' ? 'checked' : ''} ${errors.agree ? html`aria-invalid="true" aria-describedby="agree-error"` : ''}>
      <span>I'm 18 or older, I'll only add real invoices for clients who owe me money, and I agree to the <a href="/terms" target="_blank" rel="noopener">Terms</a>, <a href="/acceptable-use" target="_blank" rel="noopener">Acceptable Use Policy</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>
    ${errors.agree ? html`<span class="error-text" id="agree-error">${errors.agree}</span>` : ''}
  </div>
  <button class="btn btn-primary btn-block btn-lg" type="submit">Create free account</button>
</form>
<p class="auth-foot">Already have an account? <a href="/login">Log in</a></p>`,
  );
}

export function loginPage(ctx, { values = {}, error, next } = {}) {
  return shell(
    ctx,
    'Log in',
    html`<div>
  <h1>Welcome back</h1>
  <p class="lede">Log in to see who's paid and who's next.</p>
</div>
${flash(ctx)}
${error ? html`<div class="alert alert-danger" role="alert">${error}</div>` : ''}
<form method="post" action="/login" class="stack" novalidate>
  ${csrfField(ctx)}
  <input type="hidden" name="next" value="${next || ''}">
  ${input({ name: 'email', label: 'Email', type: 'email', value: values.email, autocomplete: 'email', maxlength: 254 })}
  ${input({ name: 'password', label: 'Password', type: 'password', autocomplete: 'current-password', maxlength: 200 })}
  <button class="btn btn-primary btn-block btn-lg" type="submit">Log in</button>
</form>
<p class="auth-foot"><a href="/forgot">Forgot your password?</a> · <a href="/signup">Create an account</a></p>`,
  );
}

export function forgotPage(ctx, { sent, email = '' } = {}) {
  return shell(
    ctx,
    'Reset password',
    sent
      ? html`<div><h1>Check your email</h1><p class="lede">If an account exists for <strong>${email}</strong>, we've sent a link to reset your password. It expires in 1 hour.</p></div>
<p class="auth-foot"><a href="/login">Back to log in</a></p>`
      : html`<div><h1>Reset your password</h1><p class="lede">Enter your email and we'll send you a reset link.</p></div>
<form method="post" action="/forgot" class="stack" novalidate>
  ${csrfField(ctx)}
  ${input({ name: 'email', label: 'Email', type: 'email', value: email, autocomplete: 'email', maxlength: 254 })}
  <button class="btn btn-primary btn-block" type="submit">Send reset link</button>
</form>
<p class="auth-foot"><a href="/login">Back to log in</a></p>`,
  );
}

export function resetPage(ctx, { token, errors = {}, invalid } = {}) {
  if (invalid) {
    return shell(
      ctx,
      'Link expired',
      html`<div><h1>This link has expired</h1><p class="lede">Reset links work once and expire after an hour.</p></div>
<a class="btn btn-primary btn-block" href="/forgot">Send a new link</a>`,
    );
  }
  return shell(
    ctx,
    'Choose a new password',
    html`<div><h1>Choose a new password</h1><p class="lede">You'll be signed out on all other devices.</p></div>
<form method="post" action="/reset" class="stack" novalidate>
  ${csrfField(ctx)}
  <input type="hidden" name="token" value="${token}">
  ${input({ name: 'password', label: 'New password', type: 'password', errors, autocomplete: 'new-password', hint: 'At least 10 characters.', maxlength: 200 })}
  <button class="btn btn-primary btn-block" type="submit">Update password</button>
</form>`,
  );
}

export function verifyFailedPage(ctx) {
  return shell(
    ctx,
    'Link expired',
    html`<div><h1>This confirmation link has expired</h1>
<p class="lede">Confirmation links work once and expire after 48 hours.</p></div>
${ctx.user
  ? html`<form method="post" action="/verify/resend">${csrfField(ctx)}<button class="btn btn-primary btn-block" type="submit">Send a new link to ${ctx.user.email}</button></form>`
  : html`<a class="btn btn-primary btn-block" href="/login">Log in to get a new link</a>`}
<p class="auth-foot"><a href="${ctx.user ? '/app' : '/'}">Back to ${config.appName}</a></p>`,
  );
}
