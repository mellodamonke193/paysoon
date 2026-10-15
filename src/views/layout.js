import { config, operatorName } from '../config.js';
import { assetUrl } from '../assets.js';
import { html, raw } from '../lib/html.js';
import { csrfToken, isAdmin } from '../lib/auth.js';

const svg = (body) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`);

export const icons = {
  logo: raw('<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor"/><path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  checkCircle: svg('<circle cx="12" cy="12" r="10"/><path d="m8.5 12 2.5 2.5 5-5"/>'),
  clock: svg('<circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/>'),
  mail: svg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>'),
  send: svg('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  pause: svg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'),
  play: svg('<path d="m6 3 14 9-14 9V3z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  arrowLeft: svg('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  arrowRight: svg('<path d="M5 12h14M12 5l7 7-7 7"/>'),
  trending: svg('<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>'),
  hand: svg('<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
  file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  dot: svg('<circle cx="12" cy="12" r="3" fill="currentColor"/>'),
};

const DEFAULT_DESCRIPTION = `${config.appName} sends polite, well-timed invoice reminders that get firmer as the due date passes, and stops as soon as your client pays. Free for freelancers.`;

export const csrfField = (ctx) => html`<input type="hidden" name="_csrf" value="${csrfToken(ctx)}">`;

const MESSAGES = {
  welcome: ['success', 'Welcome aboard! Confirm your email (check your inbox), then add your first invoice.'],
  verified: ['success', 'Email confirmed. Your reminders are live.'],
  verification_sent: ['info', 'We sent a fresh confirmation link. Check your inbox and spam folder.'],
  created: ['success', `Invoice added. ${config.appName} will take it from here. Tip: use "Send me a test" to see exactly what your client will get.`],
  test_sent: ['success', 'Test sent to your inbox. It shows exactly what your client will receive.'],
  test_failed: ['danger', "We couldn't send the test email. Please try again in a minute."],
  sent_now: ['success', 'Reminder sent.'],
  too_soon: ['info', 'A reminder went out less than 20 hours ago. To stay polite, the next one waits a little longer.'],
  cannot_send: ['info', 'There is no reminder to send right now for this invoice.'],
  suppressed: ['warn', 'This client unsubscribed or said the invoice isn\'t theirs, so no more reminders can be sent to them. Please contact them directly.'],
  suspended: ['danger', 'Sending is paused on your account while we review recipient reports. Please contact support.'],
  verify_first: ['warn', 'Confirm your email address first. We sent you a link.'],
  unsuspended: ['success', 'Account unsuspended.'],
  updated: ['success', 'Invoice updated.'],
  deleted: ['success', 'Invoice deleted.'],
  paid: ['success', 'Marked as paid. All remaining reminders are cancelled.'],
  paused: ['info', 'Reminders paused.'],
  resumed: ['success', 'Reminders resumed.'],
  reopened: ['info', 'Invoice reopened and reminders rescheduled.'],
  settings_saved: ['success', 'Settings saved.'],
  password_changed: ['success', 'Password changed. Other devices have been signed out.'],
  upgraded: ['success', "You're on Pro. Unlimited invoices are unlocked. Thank you!"],
  logged_out: ['info', "You've been logged out."],
  reset_sent: ['info', 'If an account exists for that email, a reset link is on its way.'],
  password_reset: ['success', 'Password updated. Log in with your new password.'],
  verified_login: ['success', 'Email confirmed. Log in to continue.'],
  account_deleted: ['info', 'Your account and all its data have been deleted.'],
  limit: ['info', `The Free plan includes ${config.limits.freeActiveInvoices} open invoices. Upgrade to Pro for unlimited invoices, or mark one as paid.`],
  billing_error: ['danger', "We couldn't reach the payment provider. Please try again in a minute."],
};

export function flash(ctx) {
  const msg = MESSAGES[ctx.query.get('m')];
  return msg ? html`<div class="alert alert-${msg[0]}" role="status">${msg[1]}</div>` : '';
}

function publicNav(ctx) {
  return html`<header class="topbar">
  <div class="container topbar-inner">
    <a class="brand" href="/">${icons.logo}${config.appName}</a>
    <nav class="topnav" aria-label="Main">
      <a class="hide-sm" href="/#how">How it works</a>
      <a class="hide-sm" href="/#pricing">Pricing</a>
      ${ctx.user
        ? html`<a class="btn btn-primary btn-sm" href="/app">Dashboard</a>`
        : html`<a href="/login">Log in</a><a class="btn btn-primary btn-sm" href="/signup">Start free</a>`}
    </nav>
  </div>
</header>`;
}

function appNav(ctx, active) {
  const user = ctx.user;
  const link = (href, key, label) =>
    html`<a href="${href}" class="${active === key ? 'active' : ''}" ${active === key ? raw('aria-current="page"') : ''}>${label}</a>`;
  return html`<header class="appbar">
  <div class="container appbar-inner">
    <a class="brand" href="/app">${icons.logo}${config.appName}</a>
    <nav class="appnav" aria-label="App">
      ${link('/app', 'invoices', 'Invoices')}
      ${link('/app/settings', 'settings', 'Settings')}
      ${link('/app/billing', 'billing', 'Billing')}
      ${isAdmin(user) ? link('/admin', 'admin', 'Admin') : ''}
    </nav>
    <div class="appbar-right">
      ${user.plan === 'pro'
        ? html`<span class="badge badge-pro badge-plain">PRO</span>`
        : html`<a class="btn btn-sm" href="/app/billing">Upgrade</a>`}
      <form class="inline-form" method="post" action="/logout">${csrfField(ctx)}<button class="btn btn-ghost btn-sm" type="submit">Log out</button></form>
    </div>
  </div>
</header>`;
}

function footer() {
  return html`<footer class="footer">
  <div class="container footer-grid">
    <div class="stack-sm">
      <a class="brand" href="/">${icons.logo}${config.appName}</a>
      <p class="small">Invoice reminders on autopilot.</p>
      <p class="tiny">© ${new Date().getFullYear()} ${operatorName()}${config.company.address ? ` · ${config.company.address}` : ''}</p>
    </div>
    <nav aria-label="Free tools">
      <h2 class="footer-head">Free tools</h2>
      <a href="/tools/late-payment-email">Late payment email generator</a>
      <a href="/tools/late-fee-calculator">Late fee calculator</a>
      <a href="/templates">Payment reminder templates</a>
      <a href="/guides/how-to-ask-for-payment">How to ask for payment</a>
    </nav>
    <nav aria-label="Legal">
      <h2 class="footer-head">Legal</h2>
      <a href="/terms">Terms of Service</a>
      <a href="/privacy">Privacy Policy</a>
      <a href="/acceptable-use">Acceptable Use</a>
      <a href="/dpa">Data Processing Addendum</a>
      ${config.supportEmail ? html`<a href="mailto:${config.supportEmail}">Contact</a>` : ''}
    </nav>
  </div>
</footer>`;
}

/**
 * @param {object} opts
 * @param {'public'|'app'|'bare'} opts.nav
 */
export function page(ctx, { title, description, body, nav = 'public', active, noindex = false, canonical }) {
  const fullTitle = title ? `${title} · ${config.appName}` : `${config.appName}: invoice reminders on autopilot`;
  const desc = description || DEFAULT_DESCRIPTION;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
${noindex || nav === 'app' ? html`<meta name="robots" content="noindex, nofollow">` : ''}
${canonical ? html`<link rel="canonical" href="${config.appUrl}${canonical}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${fullTitle}">
<meta property="og:description" content="${desc}">
<meta property="og:site_name" content="${config.appName}">
<meta name="theme-color" content="#0d7a5f">
<link rel="icon" href="${assetUrl('favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${assetUrl('app.css')}">
<script src="${assetUrl('app.js')}" defer></script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${nav === 'app' ? appNav(ctx, active) : nav === 'public' ? publicNav(ctx) : ''}
<main id="main">${body}</main>
${nav === 'bare' ? '' : footer()}
</body>
</html>`;
}

export function errorPage(ctx, status, message) {
  const titles = { 403: 'Not allowed', 404: "We couldn't find that page", 429: 'Slow down a little', 500: 'Something went wrong' };
  return page(ctx, {
    title: titles[status] || 'Error',
    nav: ctx.user ? 'app' : 'public',
    noindex: true,
    body: html`<div class="error-page container">
  <div class="code">${status}</div>
  <h1>${titles[status] || 'Something went wrong'}</h1>
  <p>${message}</p>
  <a class="btn btn-primary" href="${ctx.user ? '/app' : '/'}">${ctx.user ? 'Back to dashboard' : 'Go home'}</a>
</div>`,
  });
}

// Form helpers. Every value is escaped by html``.
export function fieldError(errors, name) {
  return errors?.[name] ? html`<span class="error-text" id="${name}-error">${errors[name]}</span>` : '';
}

export function input({ name, label, type = 'text', value = '', errors, hint, optional, autocomplete, placeholder, required, maxlength, attrs = '' }) {
  const hasError = Boolean(errors?.[name]);
  return html`<div class="field ${hasError ? 'has-error' : ''}">
  <label class="label" for="${name}">${label}${optional ? html` <span class="opt">(optional)</span>` : ''}</label>
  <input class="input" id="${name}" name="${name}" type="${type}" value="${value}"
    ${autocomplete ? html`autocomplete="${autocomplete}"` : ''} ${placeholder ? html`placeholder="${placeholder}"` : ''}
    ${maxlength ? html`maxlength="${maxlength}"` : ''} ${required ? raw('required') : ''} ${attrs}
    ${hasError ? html`aria-invalid="true" aria-describedby="${name}-error"` : ''}>
  ${hint && !hasError ? html`<span class="hint">${hint}</span>` : ''}
  ${fieldError(errors, name)}
</div>`;
}
