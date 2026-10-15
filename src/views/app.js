import { config, billingEnabled, yearlyEnabled } from '../config.js';
import { html, safeUrl } from '../lib/html.js';
import { CURRENCIES, formatMoney } from '../lib/money.js';
import { CADENCES } from '../lib/schedule.js';
import { formatDate, formatDateTime, timeAgo, daysBetween, TIMEZONES, plural, DAY } from '../lib/time.js';
import { invoiceState, isPro } from '../services/invoices.js';
import { page, csrfField, flash, icons, input, fieldError } from './layout.js';

const appPage = (ctx, active, title, body) => page(ctx, { title, nav: 'app', active, body: html`<div class="page container">${body}</div>` });

function moneyTotals(totals, key) {
  const parts = totals.filter((t) => t[key] > 0).map((t) => formatMoney(t[key], t.currency));
  if (!parts.length) return formatMoney(0, totals[0]?.currency || 'USD');
  return html`${parts[0]}${parts.length > 1 ? html`<span class="more">+ ${parts.slice(1).join(' · ')}</span>` : ''}`;
}

function verifyBanner(ctx) {
  if (ctx.user.email_verified_at) return '';
  return html`<div class="alert alert-warn">
  <span><strong>Confirm your email to start sending reminders.</strong> We sent a link to ${ctx.user.email}.</span>
  <form method="post" action="/verify/resend">${csrfField(ctx)}<button class="btn btn-sm" type="submit">Resend link</button></form>
</div>`;
}

function suspendedBanner(ctx) {
  if (!ctx.user.suspended_at) return '';
  return html`<div class="alert alert-danger" role="alert"><span><strong>Sending is paused on your account.</strong> Several recipients said they don't recognize invoices from you, so we've paused reminders while we review.
  ${config.supportEmail ? html`Contact <a href="mailto:${config.supportEmail}">${config.supportEmail}</a> to sort it out.` : ''}</span></div>`;
}

const badge = (state) => html`<span class="badge badge-${state.tone}">${state.label}</span>`;

function nextReminderCell(invoice, user) {
  if (invoice.status !== 'active') return html`<span class="faint">—</span>`;
  if (!invoice.next_send_at) return html`<span class="faint">Sequence complete</span>`;
  if (!user.email_verified_at) return html`<span class="faint">After you confirm your email</span>`;
  if (user.suspended_at) return html`<span class="faint">Sending paused</span>`;
  return formatDateTime(invoice.next_send_at, user.timezone);
}

function gettingStarted(user, counts, testSent) {
  const steps = [
    { done: Boolean(user.email_verified_at), label: 'Confirm your email address', href: null },
    { done: counts.all_count > 0, label: 'Add your first invoice', href: '/app/invoices/new' },
    { done: testSent, label: 'Send yourself a test reminder (open an invoice, click “Send me a test”)', href: null },
    { done: Boolean(user.signature || user.reply_to), label: 'Personalize your email sign-off', href: '/app/settings' },
  ];
  const remaining = steps.filter((s) => !s.done).length;
  if (!remaining || Date.now() - user.created_at > 30 * DAY) return '';
  return html`<div class="card card-pad checklist">
  <div class="row row-between"><h2>Getting started</h2><span class="small muted">${steps.length - remaining} of ${steps.length} done</span></div>
  <ol>
    ${steps.map(
      (s) => html`<li class="${s.done ? 'done' : ''}"><span class="check-dot" aria-hidden="true">${s.done ? icons.check : ''}</span>
      ${s.href && !s.done ? html`<a href="${s.href}">${s.label}</a>` : html`<span>${s.label}</span>`}<span class="sr-only">${s.done ? ' (done)' : ' (to do)'}</span></li>`,
    )}
  </ol>
</div>`;
}

export function dashboardPage(ctx, { data, filter }) {
  const user = ctx.user;
  const { today, totals, counts, remindersSent, invoices, testSent } = data;
  const atLimit = !isPro(user) && counts.overdue + counts.upcoming >= config.limits.freeActiveInvoices;
  const tabs = [
    ['all', 'All', counts.all_count],
    ['overdue', 'Overdue', counts.overdue],
    ['upcoming', 'Upcoming', counts.upcoming],
    ['paused', 'Paused', counts.paused],
    ['paid', 'Paid', counts.paid],
  ];

  const table = invoices.length
    ? html`<div class="card table-wrap"><table class="table">
  <caption class="sr-only">Invoices</caption>
  <thead><tr><th scope="col">Client</th><th scope="col">Invoice</th><th scope="col" class="num">Amount</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col">Next reminder</th></tr></thead>
  <tbody>
  ${invoices.map((inv) => {
    const state = invoiceState(inv, today);
    const days = daysBetween(today, inv.due_date);
    return html`<tr>
    <td data-label="Client"><a class="row-link" href="/app/invoices/${inv.id}">${inv.client_name}</a><span class="cell-sub">${inv.client_email}</span></td>
    <td data-label="Invoice">#${inv.number}</td>
    <td data-label="Amount" class="num">${formatMoney(inv.amount_minor, inv.currency)}</td>
    <td data-label="Due" class="nowrap">${formatDate(inv.due_date)}${inv.status !== 'paid' && days === 0 ? html`<span class="cell-sub">today</span>` : ''}</td>
    <td data-label="Status">${badge(state)}</td>
    <td data-label="Next reminder" class="small">${nextReminderCell(inv, user)}</td>
  </tr>`;
  })}
  </tbody>
</table></div>`
    : counts.all_count
      ? html`<div class="card empty"><h2>Nothing here</h2><p>No invoices match this filter.</p><a class="btn" href="/app">Show all invoices</a></div>`
      : html`<div class="card empty">
  <div class="empty-icon">${icons.send}</div>
  <h2>Add your first invoice</h2>
  <p>Got a client who owes you money? Add the invoice and ${config.appName} starts following up for you, politely and automatically.</p>
  <a class="btn btn-primary btn-lg" href="/app/invoices/new">${icons.plus} Add an invoice</a>
</div>`;

  return appPage(
    ctx,
    'invoices',
    'Invoices',
    html`<div class="alerts">
  ${flash(ctx)}
  ${suspendedBanner(ctx)}
  ${verifyBanner(ctx)}
  ${atLimit
    ? html`<div class="alert alert-info"><span>You're using all ${config.limits.freeActiveInvoices} open invoices on the Free plan. Upgrade to Pro for unlimited invoices.</span><a class="btn btn-sm" href="/app/billing">Upgrade</a></div>`
    : ''}
  ${gettingStarted(user, counts, testSent)}
</div>
<div class="page-head">
  <div><h1>Invoices</h1><p>${config.appName} follows up on every open invoice until it's paid.</p></div>
  <a class="btn btn-primary" href="/app/invoices/new">${icons.plus} New invoice</a>
</div>
<div class="stats">
  <div class="card stat"><div class="stat-label">Outstanding</div><div class="stat-value">${moneyTotals(totals, 'outstanding')}</div><div class="stat-sub">${plural(counts.overdue + counts.upcoming, 'open invoice')}</div></div>
  <div class="card stat ${counts.overdue ? 'stat-danger' : ''}"><div class="stat-label">Overdue</div><div class="stat-value">${moneyTotals(totals, 'overdue')}</div><div class="stat-sub">${plural(counts.overdue, 'invoice')}</div></div>
  <div class="card stat stat-success"><div class="stat-label">Collected · 30d</div><div class="stat-value">${moneyTotals(totals, 'collected')}</div><div class="stat-sub">${plural(counts.recovered, 'paid after a reminder', 'paid after reminders')}</div></div>
  <div class="card stat"><div class="stat-label">Reminders · 30d</div><div class="stat-value">${remindersSent}</div><div class="stat-sub">emails you didn't have to write</div></div>
</div>
<nav class="tabs" aria-label="Filter invoices">
  ${tabs.map(([key, label, n]) => html`<a href="/app${key === 'all' ? '' : `?filter=${key}`}" class="${filter === key ? 'active' : ''}" ${filter === key ? html`aria-current="page"` : ''}>${label}<span class="count">${n || 0}</span></a>`)}
</nav>
<div class="spacer"></div>
${table}`,
  );
}

export function invoiceFormPage(ctx, { invoice, values, errors = {}, today }) {
  const user = ctx.user;
  const editing = Boolean(invoice);
  const action = editing ? `/app/invoices/${invoice.id}/edit` : '/app/invoices';
  const body = html`<a class="back" href="${editing ? `/app/invoices/${invoice.id}` : '/app'}">${icons.arrowLeft} ${editing ? 'Back to invoice' : 'Invoices'}</a>
<div class="page-head"><div><h1>${editing ? `Edit invoice #${invoice.number}` : 'New invoice'}</h1>
<p>${editing ? 'Changing the due date or cadence reschedules upcoming reminders.' : "Add the invoice you've already sent. We'll handle the follow-up."}</p></div></div>
<div class="alerts">${suspendedBanner(ctx)}${verifyBanner(ctx)}</div>
<form method="post" action="${action}" class="detail-grid" novalidate>
  ${csrfField(ctx)}
  <div class="card">
    <div class="card-head"><h2>Invoice details</h2></div>
    <div class="card-body form-grid">
      ${input({ name: 'client_name', label: 'Client name', value: values.client_name, errors, placeholder: 'Northwind Studio', maxlength: 120, autocomplete: 'off' })}
      ${input({ name: 'client_email', label: 'Client email', type: 'email', value: values.client_email, errors, placeholder: 'accounts@northwind.com', maxlength: 254, autocomplete: 'off' })}
      ${input({ name: 'number', label: 'Invoice number', value: values.number, errors, placeholder: 'INV-1042', maxlength: 40, autocomplete: 'off' })}
      <div class="field ${errors.amount || errors.currency ? 'has-error' : ''}">
        <label class="label" for="amount">Amount</label>
        <div class="input-group">
          <select class="select" name="currency" aria-label="Currency">
            ${Object.keys(CURRENCIES).map((c) => html`<option value="${c}" ${c === values.currency ? 'selected' : ''}>${c}</option>`)}
          </select>
          <input class="input" id="amount" name="amount" inputmode="decimal" value="${values.amount}" placeholder="2400.00" maxlength="16" autocomplete="off" ${errors.amount ? html`aria-invalid="true" aria-describedby="amount-error"` : ''}>
        </div>
        ${fieldError(errors, 'amount')}${fieldError(errors, 'currency')}
      </div>
      ${input({ name: 'issue_date', label: 'Issue date', type: 'date', value: values.issue_date, errors, optional: true })}
      ${input({ name: 'due_date', label: 'Due date', type: 'date', value: values.due_date, errors })}
      <div class="span-2">${input({ name: 'payment_url', label: 'Payment link', type: 'url', value: values.payment_url, errors, placeholder: 'https://buy.stripe.com/… or https://paypal.me/…', maxlength: 2000, hint: 'Your Stripe, PayPal, Wise or Square link. Clients see a big “Pay now” button.' })}</div>
      <div class="field span-2 ${errors.note ? 'has-error' : ''}">
        <label class="label" for="note">Payment instructions or note <span class="opt">(optional)</span></label>
        <textarea class="textarea" id="note" name="note" maxlength="1500" placeholder="Bank transfer details, PO number, or a thank-you note. Shown on the client's invoice page.">${values.note}</textarea>
        ${fieldError(errors, 'note')}
      </div>
      <div class="field span-2 ${errors.message ? 'has-error' : ''}">
        <label class="label" for="message">Personal message in reminders <span class="opt">(optional)</span></label>
        <textarea class="textarea textarea-sm" id="message" name="message" maxlength="500" placeholder="Thanks again for a great project! Let me know if you need anything for your records.">${values.message}</textarea>
        ${errors.message ? fieldError(errors, 'message') : html`<span class="hint">Added to every reminder for this invoice, so the emails sound even more like you. Keep it friendly; no threats or legal language.</span>`}
      </div>
    </div>
  </div>
  <div class="stack">
    <div class="card">
      <div class="card-head"><h2>Reminder cadence</h2></div>
      <div class="card-body stack">
        <fieldset class="choice-grid choice-grid-1">
          <legend class="sr-only">Reminder cadence</legend>
          ${Object.entries(CADENCES).map(([key, c]) => {
            const locked = c.pro && !isPro(user) && !(editing && invoice.cadence === key);
            return html`<label class="choice">
            <input type="radio" name="cadence" value="${key}" data-offsets="${c.offsets.join(',')}" ${values.cadence === key ? 'checked' : ''} ${locked ? 'disabled' : ''}>
            <span class="choice-box"><span class="choice-title">${c.label}${c.pro ? html`<span class="badge badge-pro badge-plain">PRO</span>` : ''}</span><span class="choice-sub">${c.blurb}</span></span>
          </label>`;
          })}
        </fieldset>
        ${fieldError(errors, 'cadence')}
        <div>
          <div class="label" id="schedule-label">Schedule</div>
          <ul class="schedule-preview" id="schedule-preview" data-today="${today}" aria-live="polite" aria-labelledby="schedule-label"></ul>
          <p class="hint">Sent at 9:00 AM ${user.timezone.replace(/_/g, ' ')} time, weekdays only. Stops automatically when paid.</p>
        </div>
      </div>
    </div>
    <button class="btn btn-primary btn-lg btn-block" type="submit">${editing ? 'Save changes' : 'Add invoice & start reminders'}</button>
  </div>
</form>`;
  return appPage(ctx, 'invoices', editing ? `Edit #${invoice.number}` : 'New invoice', body);
}

const TIMELINE_LABEL = {
  sent: (at, tz) => `Sent ${formatDateTime(at, tz)}`,
  next: (at, tz) => `Next · ${formatDateTime(at, tz)}`,
  scheduled: (at, tz) => formatDateTime(at, tz),
  skipped: () => 'Skipped',
  paused: () => 'Paused',
  cancelled: () => 'Not needed',
};

const EVENT_LABEL = {
  created: 'Invoice added',
  reminder_sent: 'Reminder sent',
  viewed: 'Client viewed invoice',
  claimed: 'Client says they paid',
  disputed: 'Client flagged a problem',
  not_mine: "Recipient doesn't recognize this invoice",
  opted_out: 'Client unsubscribed from reminders',
  suppressed: 'Reminder not sent: client unsubscribed',
  paid: 'Marked as paid',
  reopened: 'Reopened',
  paused: 'Reminders paused',
  resumed: 'Reminders resumed',
  edited: 'Invoice edited',
  send_retry: 'Delivery retry scheduled',
  send_failed: 'Delivery failed, reminders paused',
};

export function invoiceDetailPage(ctx, { invoice, timeline, events, preview, suppressed, today }) {
  const user = ctx.user;
  const tz = user.timezone;
  const state = invoiceState(invoice, today);
  const clientUrl = `${config.appUrl}/i/${invoice.public_token}`;
  const post = (path, label, cls = 'btn', confirm) =>
    html`<form class="inline-form" method="post" action="/app/invoices/${invoice.id}/${path}" ${confirm ? html`data-confirm="${confirm}"` : ''}>${csrfField(ctx)}<button class="${cls}" type="submit">${label}</button></form>`;
  const canSendNow = invoice.status === 'active' && invoice.next_send_at && user.email_verified_at && !user.suspended_at && !suppressed;

  const actions = html`<div class="actions">
  ${invoice.status !== 'paid' ? post('paid', html`${icons.check} Mark as paid`, 'btn btn-primary') : post('reopen', 'Reopen invoice', 'btn', 'Reopen this invoice and restart reminders?')}
  ${canSendNow ? post('send-now', html`${icons.send} Send reminder now`, 'btn', `Send the next reminder to ${invoice.client_email} right now?`) : ''}
  ${invoice.status === 'active' ? post('pause', html`${icons.pause} Pause`) : ''}
  ${invoice.status === 'paused' && !suppressed ? post('resume', html`${icons.play} Resume reminders`) : ''}
  <a class="btn" href="/app/invoices/${invoice.id}/edit">Edit</a>
</div>`;

  const body = html`<a class="back" href="/app">${icons.arrowLeft} Invoices</a>
<div class="alerts">${flash(ctx)}${suspendedBanner(ctx)}${verifyBanner(ctx)}
${suppressed
  ? html`<div class="alert alert-warn"><span><strong>${invoice.client_email} has opted out.</strong> They unsubscribed or said this invoice isn't theirs, so ${config.appName} won't send them any more reminders. Please double-check the address or contact them directly.</span></div>`
  : invoice.disputed_at && invoice.status === 'paused'
    ? html`<div class="alert alert-warn"><span><strong>${invoice.client_name} flagged a problem with this invoice</strong> (${timeAgo(invoice.disputed_at)}). Reminders are paused. Check the details with them, edit the invoice if needed, then resume.</span></div>`
    : invoice.client_claimed_at && invoice.status === 'paused'
      ? html`<div class="alert alert-info"><span><strong>${invoice.client_name} says they've paid</strong> (${timeAgo(invoice.client_claimed_at)}). Reminders are paused. Check your account, then mark it paid, or resume reminders if the money hasn't arrived.</span></div>`
      : ''}
</div>
<div class="detail-hero">
  <div>
    <div class="row"><span class="muted">Invoice #${invoice.number} · ${invoice.client_name}</span>${badge(state)}</div>
    <div class="detail-amount">${formatMoney(invoice.amount_minor, invoice.currency)}</div>
    <div class="muted small">Due ${formatDate(invoice.due_date, 'long')}${invoice.paid_at ? html` · Paid ${formatDate(new Date(invoice.paid_at).toISOString().slice(0, 10), 'long')}` : ''}</div>
  </div>
  ${actions}
</div>
<div class="detail-grid">
  <div class="stack">
    <div class="card">
      <div class="card-head"><h2>Reminders</h2><span class="small muted">${CADENCES[invoice.cadence].label} cadence · ${invoice.reminders_sent} sent</span></div>
      <div class="card-body">
        <ul class="timeline">
          ${timeline.map(
            (t) => html`<li class="tl-${t.state}">
            <span class="tl-dot" aria-hidden="true">${t.state === 'sent' ? icons.check : t.state === 'next' ? icons.clock : icons.dot}</span>
            <div><div class="tl-title">${t.stage}</div><div class="tl-sub">${t.offset < 0 ? `${-t.offset} days before due` : t.offset === 0 ? 'On the due date' : `${t.offset} days after due`}</div></div>
            <div class="tl-when">${TIMELINE_LABEL[t.state](t.at, tz)}</div>
          </li>`,
          )}
        </ul>
      </div>
    </div>
    ${preview
      ? html`<div class="card">
      <div class="card-head"><h2>Next email preview</h2>${post('test', html`${icons.mail} Send me a test`, 'btn btn-sm')}</div>
      <div class="card-body stack-sm">
        <p class="small muted">To ${invoice.client_email}. “Send me a test” delivers this exact email to ${user.email} so you can see it in a real inbox.</p>
        <div class="email-preview">
          <div class="email-preview-head"><strong>Subject:</strong> ${preview.subject}</div>
          <div class="email-preview-body">${preview.text}</div>
        </div>
      </div>
    </div>`
      : ''}
  </div>
  <div class="stack">
    <div class="card">
      <div class="card-head"><h2>Details</h2><a class="btn btn-sm" href="/app/invoices/new?from=${invoice.id}">${icons.plus} New for this client</a></div>
      <div class="card-body">
        <dl class="kv">
          <dt>Client</dt><dd>${invoice.client_name}</dd>
          <dt>Email</dt><dd>${invoice.client_email}</dd>
          ${invoice.issue_date ? html`<dt>Issued</dt><dd>${formatDate(invoice.issue_date)}</dd>` : ''}
          <dt>Due</dt><dd>${formatDate(invoice.due_date)}</dd>
          <dt>Payment link</dt><dd>${invoice.payment_url ? html`<a href="${safeUrl(invoice.payment_url)}" target="_blank" rel="noopener noreferrer">${new URL(invoice.payment_url).hostname}</a>` : html`<span class="faint">In note</span>`}</dd>
          <dt>Client views</dt><dd>${invoice.view_count ? html`${plural(invoice.view_count, 'view')} · last ${timeAgo(invoice.last_viewed_at)}` : html`<span class="faint">Not opened yet</span>`}</dd>
        </dl>
        ${invoice.note ? html`<div class="client-note">${invoice.note}</div>` : ''}
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Client invoice page</h2></div>
      <div class="card-body stack-sm">
        <p class="small muted">Every reminder links here. Share it anywhere: it shows the amount, a Pay button and an “I've paid” option.</p>
        <div class="copy-field"><input class="input" id="client-link" value="${clientUrl}" readonly data-select-on-focus aria-label="Client invoice link"><button class="btn btn-sm" type="button" data-copy="client-link">Copy</button></div>
        <a class="small" href="${clientUrl}" target="_blank" rel="noopener">Open client view ↗</a>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Activity</h2></div>
      <div class="card-body">
        <ul class="feed">
          ${events.map((e) => html`<li><span>${EVENT_LABEL[e.kind] || e.kind}</span><span class="faint nowrap">${timeAgo(e.created_at)}</span></li>`)}
        </ul>
      </div>
    </div>
    <form method="post" action="/app/invoices/${invoice.id}/delete" data-confirm="Delete this invoice and its history? This can't be undone.">
      ${csrfField(ctx)}<button class="btn btn-danger btn-sm" type="submit">Delete invoice</button>
    </form>
  </div>
</div>`;
  return appPage(ctx, 'invoices', `#${invoice.number} · ${invoice.client_name}`, body);
}

export function settingsPage(ctx, { values, errors = {}, pwErrors = {} }) {
  const user = ctx.user;
  const body = html`<div class="page-head"><div><h1>Settings</h1><p>How you appear to clients, and your account.</p></div></div>
<div class="stack-lg container-narrow mt-0">
  ${flash(ctx)}
  <form class="card" method="post" action="/app/settings" novalidate>
    ${csrfField(ctx)}
    <div class="card-head"><h2>Sender profile</h2></div>
    <div class="card-body stack">
      ${input({ name: 'business_name', label: 'Name or business name', value: values.business_name, errors, maxlength: 80, hint: 'Shown as the sender of every reminder.' })}
      ${input({ name: 'reply_to', label: 'Reply-to email', type: 'email', value: values.reply_to, errors, maxlength: 254, optional: true, hint: `Client replies go here. Defaults to ${user.email}.` })}
      <div class="field ${errors.signature ? 'has-error' : ''}">
        <label class="label" for="signature">Email sign-off <span class="opt">(optional)</span></label>
        <textarea class="textarea" id="signature" name="signature" maxlength="300" placeholder="Alex Rivera&#10;Rivera Design Co.">${values.signature}</textarea>
        ${fieldError(errors, 'signature')}
      </div>
      <div class="field ${errors.timezone ? 'has-error' : ''}">
        <label class="label" for="timezone">Timezone</label>
        <select class="select" id="timezone" name="timezone">
          ${TIMEZONES.map((tz) => html`<option value="${tz}" ${tz === values.timezone ? 'selected' : ''}>${tz.replace(/_/g, ' ')}</option>`)}
        </select>
        <span class="hint">Reminders go out at 9:00 AM on weekdays in this timezone.</span>
      </div>
      <label class="checkbox"><input type="checkbox" name="weekly_digest" value="yes" ${values.weekly_digest === 'yes' ? 'checked' : ''}>
        <span>Email me a weekly summary on Monday mornings (who's overdue, what got paid)</span></label>
    </div>
    <div class="card-foot row row-between"><span class="small muted">Account email: ${user.email}</span><button class="btn btn-primary" type="submit">Save</button></div>
  </form>

  <form class="card" method="post" action="/app/settings/password" novalidate>
    ${csrfField(ctx)}
    <div class="card-head"><h2>Password</h2></div>
    <div class="card-body form-grid">
      ${input({ name: 'current_password', label: 'Current password', type: 'password', errors: pwErrors, autocomplete: 'current-password', maxlength: 200 })}
      ${input({ name: 'new_password', label: 'New password', type: 'password', errors: pwErrors, autocomplete: 'new-password', maxlength: 200, hint: 'At least 10 characters.' })}
    </div>
    <div class="card-foot row row-between"><span class="small muted">Changing it signs out your other devices.</span><button class="btn" type="submit">Change password</button></div>
  </form>

  <div class="card">
    <div class="card-head"><h2>Your data</h2></div>
    <div class="card-body stack-sm">
      <p class="muted small">Download everything ${config.appName} holds about your account (profile, invoices, activity and email history) as a JSON file.</p>
      <p><a class="btn" href="/app/settings/export">Download my data</a></p>
    </div>
  </div>

  <form class="card" method="post" action="/app/settings/delete" data-confirm="Permanently delete your account, all invoices and cancel any subscription? This can't be undone." novalidate>
    ${csrfField(ctx)}
    <div class="card-head"><h2>Delete account</h2></div>
    <div class="card-body stack">
      <p class="muted small">Deletes your account and every invoice immediately, stops all reminders and cancels your subscription.</p>
      ${input({ name: 'confirm_password', label: 'Confirm with your password', type: 'password', errors: pwErrors, autocomplete: 'current-password', maxlength: 200 })}
    </div>
    <div class="card-foot row"><button class="btn btn-danger" type="submit">Delete my account</button></div>
  </form>
</div>`;
  return appPage(ctx, 'settings', 'Settings', body);
}

export function billingPage(ctx, { openCount }) {
  const user = ctx.user;
  const pro = isPro(user);
  const enabled = billingEnabled();
  const renewal = user.current_period_end ? formatDate(new Date(user.current_period_end).toISOString().slice(0, 10), 'long') : null;
  const trial = enabled && config.trialDays > 0 && !user.stripe_subscription_id;
  const feature = (text) => html`<li>${icons.check}<span>${text}</span></li>`;
  const checkout = (interval, label, cls) =>
    html`<form method="post" action="/app/billing/checkout">${csrfField(ctx)}<input type="hidden" name="interval" value="${interval}"><button class="${cls}" type="submit">${label}</button></form>`;
  const body = html`<div class="page-head"><div><h1>Billing</h1><p>Simple pricing. Cancel anytime.</p></div></div>
<div class="stack-lg container-narrow mt-0">
  ${flash(ctx)}
  <div class="card">
    <div class="card-head"><h2>Current plan</h2>${pro ? html`<span class="badge badge-pro badge-plain">PRO</span>` : html`<span class="badge badge-plain">FREE</span>`}</div>
    <div class="card-body stack">
      ${pro
        ? html`<p>You're on <strong>Pro</strong>${user.subscription_status === 'trialing' ? ' (free trial)' : ''}${user.subscription_status === 'past_due' ? html` <span class="badge badge-danger">Payment issue</span>` : ''}.
          ${renewal ? (user.cancel_at_period_end ? html`Your plan ends on <strong>${renewal}</strong>.` : html`Renews on <strong>${renewal}</strong>.`) : ''}</p>
          ${user.subscription_status === 'past_due' ? html`<div class="alert alert-danger">Your last payment failed. Update your card to keep Pro.</div>` : ''}`
        : html`<p>You're on the <strong>Free</strong> plan: ${openCount} of ${config.limits.freeActiveInvoices} open invoices used.</p>`}
    </div>
    ${enabled && (pro || user.stripe_customer_id)
      ? html`<div class="card-foot row">
      <form method="post" action="/app/billing/portal">${csrfField(ctx)}<button class="btn" type="submit">Manage subscription & receipts</button></form>
      <span class="small muted">Change plan, update your card or cancel.</span>
    </div>`
      : ''}
  </div>
  ${pro
    ? ''
    : html`<div class="card plan plan-featured">
    <span class="plan-tag">Recommended</span>
    <h3>Pro</h3>
    <div class="price">${config.proPriceLabel} <small>/ month</small></div>
    ${yearlyEnabled() ? html`<p class="small muted">or ${config.proYearlyLabel} / year, billed annually</p>` : ''}
    <ul>
      ${feature('Unlimited invoices')}
      ${feature('Persistent cadence (10 touches over 45 days)')}
      ${feature(`Remove “Sent with ${config.appName}” from every email`)}
      ${feature('Higher daily sending limits')}
      ${feature('Cancel anytime in one click')}
    </ul>
    ${enabled
      ? html`<div class="stack-sm">
        ${checkout('month', trial ? `Start ${config.trialDays}-day free trial` : `Upgrade monthly · ${config.proPriceLabel}/mo`, 'btn btn-primary btn-lg btn-block')}
        ${yearlyEnabled() ? checkout('year', `Pay yearly · ${config.proYearlyLabel}/yr`, 'btn btn-lg btn-block') : ''}
      </div>
      <p class="tiny faint center mt-sm">Secure checkout by Stripe.${trial ? ` No charge until your ${config.trialDays}-day trial ends.` : ''} Renews automatically until you cancel. See our <a href="/terms">Terms</a>.</p>`
      : html`<div class="alert alert-info">Upgrades are temporarily unavailable. Please check back soon.</div>`}
  </div>`}
</div>`;
  return appPage(ctx, 'billing', 'Billing', body);
}

export function adminPage(ctx, { stats, recent, suspended }) {
  const stat = (label, value, sub = '') =>
    html`<div class="card stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`;
  const body = html`<div class="page-head"><div><h1>Admin</h1><p>Business health at a glance.</p></div></div>
<div class="alerts">${flash(ctx)}</div>
<div class="stats">
  ${stat('Est. MRR', `$${(stats.pro * config.proPriceMonthly).toLocaleString('en-US')}`, `${plural(stats.pro, 'Pro subscriber')}`)}
  ${stat('Users', stats.users.toLocaleString('en-US'), `+${stats.signups7} this week · +${stats.signups30} in 30d`)}
  ${stat('Open invoices', stats.openInvoices.toLocaleString('en-US'), `${stats.paidInvoices.toLocaleString('en-US')} paid all-time`)}
  ${stat('Reminders · 30d', stats.reminders30.toLocaleString('en-US'), `${stats.failed30} failed · ${stats.reports30} recipient reports`)}
</div>
${suspended.length
  ? html`<div class="card table-wrap">
  <div class="card-head"><h2>Suspended accounts (${suspended.length})</h2><span class="small muted">Auto-suspended after repeated "I don't recognize this invoice" reports</span></div>
  <table class="table">
  <thead><tr><th scope="col">Account</th><th scope="col">Reason</th><th scope="col">Reports</th><th scope="col">Since</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>
  <tbody>${suspended.map(
    (u) => html`<tr><td data-label="Account"><strong>${u.business_name}</strong><span class="cell-sub">${u.email}</span></td>
    <td data-label="Reason" class="small">${u.suspended_reason}</td>
    <td data-label="Reports">${u.report_count}</td>
    <td data-label="Since">${timeAgo(u.suspended_at)}</td>
    <td data-label="Action"><form class="inline-form" method="post" action="/admin/users/${u.id}/unsuspend" data-confirm="Restore sending for ${u.email}?">${csrfField(ctx)}<button class="btn btn-sm" type="submit">Unsuspend</button></form></td></tr>`,
  )}</tbody>
  </table>
</div>
<div class="spacer"></div>`
  : ''}
<div class="card table-wrap"><table class="table">
  <thead><tr><th scope="col">Recent signups</th><th scope="col">Plan</th><th scope="col">Verified</th><th scope="col">Invoices</th><th scope="col">Joined</th></tr></thead>
  <tbody>${recent.map(
    (u) => html`<tr><td data-label="User"><strong>${u.business_name}</strong><span class="cell-sub">${u.email}</span></td>
    <td data-label="Plan">${u.plan === 'pro' ? html`<span class="badge badge-pro badge-plain">PRO</span>` : 'Free'}</td>
    <td data-label="Verified">${u.email_verified_at ? 'Yes' : html`<span class="faint">No</span>`}</td>
    <td data-label="Invoices">${u.invoice_count}</td>
    <td data-label="Joined">${timeAgo(u.created_at)}</td></tr>`,
  )}</tbody>
</table></div>`;
  return appPage(ctx, 'admin', 'Admin', body);
}
