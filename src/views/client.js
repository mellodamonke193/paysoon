import { config } from '../config.js';
import { html, safeUrl } from '../lib/html.js';
import { formatMoney } from '../lib/money.js';
import { formatDate, daysBetween, plural } from '../lib/time.js';
import { page, csrfField, icons } from './layout.js';

const DONE_MESSAGES = {
  claimed: (o) => `Thanks for letting ${o} know. Reminders are paused while they confirm your payment.`,
  wrong: (o) => `Thanks. ${o} has been told something looks wrong, and reminders are paused while they check.`,
  not_mine: () => "Thanks for letting us know. You won't receive any more reminders from this sender.",
  stop: () => "You've been unsubscribed. You won't receive any more automated reminders from this sender.",
};

function poweredBy(owner, invoice) {
  return html`<p class="powered">${owner.plan === 'pro' ? '' : html`Payment reminders by <a href="${config.appUrl}/?ref=invoice">${config.appName}</a> · `}<a href="/acceptable-use">Report abuse</a>${config.supportEmail ? html` · <a href="mailto:${config.supportEmail}?subject=Report%20${invoice.public_token.slice(0, 8)}">Contact ${config.appName}</a>` : ''}</p>`;
}

export function clientInvoicePage(ctx, { invoice, owner, today, done, optedOut }) {
  const amount = formatMoney(invoice.amount_minor, invoice.currency);
  const days = daysBetween(invoice.due_date, today);
  const paid = invoice.status === 'paid';
  const claimed = Boolean(invoice.client_claimed_at);
  const status = paid
    ? html`<span class="badge badge-success">Paid, thank you!</span>`
    : claimed
      ? html`<span class="badge badge-info">Payment reported</span>`
      : days > 0
        ? html`<span class="badge badge-danger">${plural(days, 'day')} overdue</span>`
        : days === 0
          ? html`<span class="badge badge-warn">Due today</span>`
          : html`<span class="badge">Due in ${plural(-days, 'day')}</span>`;
  const contact = owner.reply_to || owner.email;
  const ownerName = owner.business_name;

  const body = html`<div class="client">
  <div class="card client-card">
    <div class="client-top">
      <div class="client-from">Invoice from</div>
      <div class="client-biz">${ownerName}</div>
    </div>
    <div class="client-main stack">
      ${done ? html`<div class="alert alert-success" role="status">${DONE_MESSAGES[done](ownerName)}</div>` : ''}
      <div class="row row-between"><span class="muted">Invoice #${invoice.number}</span>${status}</div>
      <div class="client-amount">${amount}</div>
      <div class="muted">${paid ? 'Paid in full' : `Due ${formatDate(invoice.due_date, 'long')}`}${invoice.issue_date ? ` · Issued ${formatDate(invoice.issue_date)}` : ''}</div>
      ${!paid && invoice.payment_url
        ? html`<a class="btn btn-primary btn-lg btn-block" href="${safeUrl(invoice.payment_url)}" rel="noopener noreferrer nofollow">Pay ${amount} ${icons.arrowRight}</a>
        <p class="tiny faint center">You'll pay ${ownerName} directly via ${new URL(invoice.payment_url).hostname}. ${config.appName} never handles the payment.</p>`
        : ''}
      ${invoice.note ? html`<div class="client-note">${invoice.note}</div>` : ''}
      ${!paid && !claimed
        ? html`<form method="post" action="/i/${invoice.public_token}/paid" data-confirm="Let ${ownerName} know you've paid this invoice?">
        ${csrfField(ctx)}
        <button class="btn btn-block" type="submit">${icons.check} I've already paid this</button>
      </form>`
        : ''}
      ${!paid && !optedOut
        ? html`<details class="problem" id="problem">
        <summary>Something wrong with this invoice?</summary>
        <form method="post" action="/i/${invoice.public_token}/report" class="stack-sm">
          ${csrfField(ctx)}
          <fieldset class="stack-sm">
            <legend class="sr-only">What's wrong?</legend>
            <label class="checkbox"><input type="radio" name="reason" value="wrong" required> <span>The amount or details are wrong</span></label>
            <label class="checkbox"><input type="radio" name="reason" value="not_mine"> <span>I don't recognize this invoice</span></label>
            <label class="checkbox"><input type="radio" name="reason" value="stop"> <span>Please stop sending me reminders</span></label>
          </fieldset>
          <button class="btn btn-sm" type="submit">Send</button>
          <p class="tiny faint">Reminders pause straight away and ${ownerName} is notified.</p>
        </form>
      </details>`
        : ''}
    </div>
    <div class="client-foot">Questions about this invoice? Email <a href="mailto:${contact}">${contact}</a>.</div>
  </div>
  ${poweredBy(owner, invoice)}
</div>`;

  return page(ctx, {
    title: `Invoice ${invoice.number} from ${ownerName}`,
    description: `Invoice ${invoice.number} from ${ownerName}`,
    nav: 'bare',
    noindex: true,
    body,
  });
}

export function unsubscribePage(ctx, { invoice, owner, optedOut }) {
  const body = html`<div class="client">
  <div class="card client-card">
    <div class="client-top">
      <div class="client-from">Reminders from</div>
      <div class="client-biz">${owner.business_name}</div>
    </div>
    <div class="client-main stack">
      ${optedOut
        ? html`<div class="alert alert-success" role="status">You're unsubscribed. You won't receive any more automated reminders from ${owner.business_name}.</div>`
        : html`<p>Stop receiving automated payment reminders from <strong>${owner.business_name}</strong> at this email address?</p>
      <form method="post" action="/i/${invoice.public_token}/report">
        ${csrfField(ctx)}
        <input type="hidden" name="reason" value="stop">
        <button class="btn btn-primary btn-block" type="submit">Unsubscribe</button>
      </form>
      <p class="small muted">Already paid? <a href="/i/${invoice.public_token}">Tell ${owner.business_name}</a> instead and the reminders will stop too.</p>`}
    </div>
  </div>
  ${poweredBy(owner, invoice)}
</div>`;
  return page(ctx, { title: 'Unsubscribe', nav: 'bare', noindex: true, body });
}
