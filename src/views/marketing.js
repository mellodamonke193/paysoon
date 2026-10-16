import { config, yearlyEnabled, billingEnabled } from '../config.js';
import { html } from '../lib/html.js';
import { CURRENCIES, formatMoney } from '../lib/money.js';
import { STAGES } from '../lib/schedule.js';
import { reminderCopy, copyToText } from '../services/templates.js';
import { page, icons, input } from './layout.js';

const check = (text) => html`<li>${icons.check}<span>${text}</span></li>`;

function heroMock() {
  const rows = [
    ['sent', 'Friendly heads-up', '3 days before due', 'Oct 7'],
    ['sent', 'Due today', 'Sent at 9:00 AM', 'Oct 10'],
    ['sent', 'Follow-up', '3 days overdue', 'Oct 13'],
    ['viewed', 'Client opened the invoice', 'Viewed twice', 'Oct 13'],
  ];
  return html`<div class="card mock" aria-label="Example of an invoice being followed up automatically">
  <div class="mock-head">
    <div>
      <div class="small muted"><span class="mock-label">Example</span> Invoice #1042 · Northwind Studio</div>
      <div class="mock-amount">$2,400.00</div>
    </div>
    <span class="badge badge-success">Paid</span>
  </div>
  <ul class="timeline">
    ${rows.map(
      ([state, title, sub, when]) => html`<li class="${state === 'sent' ? 'tl-sent' : 'tl-next'}">
      <span class="tl-dot">${state === 'sent' ? icons.check : icons.eye}</span>
      <div><div class="tl-title">${title}</div><div class="tl-sub">${sub}</div></div>
      <div class="tl-when">${when}</div>
    </li>`,
    )}
  </ul>
  <div class="mock-paid">${icons.checkCircle} Paid Oct 14. Remaining reminders cancelled automatically.</div>
</div>`;
}

export function landingPage(ctx) {
  const free = config.limits.freeActiveInvoices;
  const body = html`
<section class="hero">
  <div class="container hero-grid">
    <div>
      <span class="eyebrow"><b>New</b> Automatic invoice follow-ups</span>
      <h1>Get paid on time <em>without chasing anyone.</em></h1>
      <p class="lede">Add an invoice in under a minute. ${config.appName} sends polite, well-timed reminders that get firmer as the due date passes, and stops as soon as your client pays.</p>
      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="/signup">Start free ${icons.arrowRight}</a>
        <a class="btn btn-lg" href="#how">See how it works</a>
      </div>
      <div class="hero-note">
        <span>${icons.check} Free for ${free} invoices</span>
        <span>${icons.check} No card required</span>
        <span>${icons.check} Works with any invoicing tool</span>
      </div>
    </div>
    ${heroMock()}
  </div>
</section>

<section class="section section-alt">
  <div class="container">
    <div class="section-head">
      <div class="kicker">Sound familiar?</div>
      <h2>You did the work. Getting paid shouldn't be a second job.</h2>
      <p>Late invoices drain your cash flow and your energy. Most people put off the follow-up because it's awkward, so they get paid even later.</p>
    </div>
    <div class="pain">
      <div class="card"><q>Just following up on my last email…</q><p>Writing the same nervous nudge for the fourth time, for the third client this month.</p></div>
      <div class="card"><q>Wait, did they ever pay that?</q><p>Digging through your inbox and bank statements to work out who still owes you.</p></div>
      <div class="card"><q>I don't want to sound pushy.</q><p>Waiting another week because being firm with a client feels uncomfortable.</p></div>
    </div>
  </div>
</section>

<section class="section" id="how">
  <div class="container">
    <div class="section-head">
      <div class="kicker">How it works</div>
      <h2>Set it once. Get paid.</h2>
      <p>Keep invoicing however you do today (QuickBooks, FreshBooks, Stripe, Word). ${config.appName} just handles the follow-up.</p>
    </div>
    <div class="steps">
      <div class="card step"><h3>Add the invoice</h3><p>Client, amount, due date and your payment link (Stripe, PayPal, Wise, Square) or bank details.</p></div>
      <div class="card step"><h3>Pick a cadence</h3><p>Gentle, Standard or Persistent. Reminders go out at 9 AM on weekdays in your timezone.</p></div>
      <div class="card step"><h3>${config.appName} follows up</h3><p>Emails come from your name and replies go to your inbox. It stops when they pay or tell you they've paid.</p></div>
    </div>
  </div>
</section>

<section class="section section-alt">
  <div class="container">
    <div class="section-head">
      <div class="kicker">Features</div>
      <h2>Everything a great accounts assistant would do</h2>
    </div>
    <div class="features">
      <div class="card feature"><div class="feature-icon">${icons.trending}</div><h3>Tone that escalates</h3><p>Friendly before the due date, clear on the day, firm when it's late. Every email reads like you wrote it yourself.</p></div>
      <div class="card feature"><div class="feature-icon">${icons.user}</div><h3>Sent in your name</h3><p>Clients see your business name, and replies land straight in your inbox. No new tools for them to learn.</p></div>
      <div class="card feature"><div class="feature-icon">${icons.hand}</div><h3>One-click “I've paid”</h3><p>Clients can tell you they've paid. Reminders pause instantly so nobody gets nagged by mistake.</p></div>
      <div class="card feature"><div class="feature-icon">${icons.eye}</div><h3>Know when they look</h3><p>See exactly when a client opens their invoice, so you know whether they're ignoring you or just busy.</p></div>
      <div class="card feature"><div class="feature-icon">${icons.sun}</div><h3>Business hours only</h3><p>Reminders go out at 9 AM in your timezone and never on weekends. Professional, never spammy.</p></div>
      <div class="card feature"><div class="feature-icon">${icons.shield}</div><h3>Never touches your money</h3><p>Clients pay you directly through your own payment link or bank details. We just make sure they do.</p></div>
    </div>
  </div>
</section>

<section class="section" id="pricing">
  <div class="container">
    <div class="section-head">
      <div class="kicker">Pricing</div>
      <h2>Costs less than one late invoice</h2>
      <p>Start free. Upgrade when ${config.appName} is chasing more than ${free} invoices for you.</p>
    </div>
    <div class="pricing">
      <div class="card plan">
        <h3>Free</h3>
        <div class="price">$0 <small>forever</small></div>
        <p class="muted">For trying it out on your latest late invoice.</p>
        <ul>
          ${check(`Up to ${free} open invoices`)}
          ${check('Gentle & Standard cadences')}
          ${check('Client invoice page with “I\'ve paid” button')}
          ${check('View tracking')}
          ${check(`Small “Sent with ${config.appName}” footer`)}
        </ul>
        <a class="btn btn-block btn-lg" href="/signup">Start free</a>
      </div>
      <div class="card plan plan-featured">
        <span class="plan-tag">Recommended</span>
        <h3>Pro</h3>
        <div class="price">${config.proPriceLabel} <small>/ month</small></div>
        ${yearlyEnabled() ? html`<p class="small muted">or ${config.proYearlyLabel} / year, billed annually</p>` : ''}
        <p class="muted">For freelancers and small teams who are done chasing.</p>
        <ul>
          ${check('Unlimited invoices')}
          ${check('All cadences, including Persistent (10 touches)')}
          ${check(`No ${config.appName} branding, so emails are 100% yours`)}
          ${check('Higher daily sending limits')}
          ${check('Cancel anytime in one click')}
        </ul>
        <a class="btn btn-primary btn-block btn-lg" href="/signup?plan=pro">${billingEnabled() && config.trialDays ? `Start ${config.trialDays}-day free trial` : 'Get Pro'}</a>
      </div>
    </div>
    <p class="roi">If ${config.appName} gets a single invoice paid one week sooner, it has paid for itself.</p>
  </div>
</section>

<section class="section section-alt">
  <div class="container">
    <div class="section-head"><div class="kicker">FAQ</div><h2>Questions, answered</h2></div>
    <div class="faq">
      <details class="card"><summary>Will my clients know I'm using a tool?</summary><p>Emails come from your business name and replies go straight to you. Free plan emails include a small “Sent with ${config.appName}” line in the footer. Pro removes it completely.</p></details>
      <details class="card"><summary>What if my client already paid?</summary><p>Every email links to a simple invoice page with an “I've already paid” button, where they can add the payment date and method. Reminders pause and you get an email to confirm. Mark the invoice paid and you're done.</p></details>
      <details class="card"><summary>Can't a client just click “I've already paid” to make the reminders stop?</summary><p>Not for long. If you don't confirm the payment within ${config.limits.claimGraceDays} days, reminders restart automatically and politely ask for the payment details. Each client can only use the button twice per invoice.</p></details>
      <details class="card"><summary>Do you process payments or hold my money?</summary><p>No. Clients pay you directly using your own payment link (Stripe, PayPal, Wise, Square…) or bank details. ${config.appName} never touches your money.</p></details>
      <details class="card"><summary>Do I need to create my invoices in ${config.appName}?</summary><p>No. Keep using whatever you use today. Just add the invoice number, amount, due date and how to pay, and ${config.appName} handles the follow-up.</p></details>
      <details class="card"><summary>Can I stop or change the reminders?</summary><p>Anytime. Pause, edit, change the cadence or mark as paid with one click. Reminders never go out on weekends.</p></details>
      <details class="card"><summary>Can I cancel Pro?</summary><p>Yes, in one click from the billing page. You keep Pro until the end of the period you've paid for.</p></details>
      <details class="card"><summary>Is ${config.appName} a collection agency?</summary><p>No. ${config.appName} sends friendly reminders in your name, the same emails you'd write yourself, just on time and without the awkwardness. The wording stays professional and never makes threats.</p></details>
      <details class="card"><summary>Can my clients opt out?</summary><p>Yes. Every email lets your client say they've already paid, flag a problem or unsubscribe. Reminders stop right away and we email you, so you can follow up personally. It keeps you on the right side of anti-spam rules and keeps client relationships healthy.</p></details>
      <details class="card"><summary>Is my data safe?</summary><p>Passwords are hashed, every page is served over HTTPS with strict security headers, and we never sell data or use tracking cookies. You can export everything or delete your account at any time. Read our <a href="/privacy">Privacy Policy</a>.</p></details>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="cta-band">
      <h2>Your next late invoice is already on its way.</h2>
      <p>Let ${config.appName} handle the awkward part. Set up takes about two minutes.</p>
      <a class="btn btn-primary btn-lg" href="/signup">Start free ${icons.arrowRight}</a>
    </div>
  </div>
</section>`;
  return page(ctx, { body, canonical: '/' });
}

// ---------------------------------------------------------------------------------------------
// Free SEO tool: a late-payment email generator. Server-rendered from the same copy the product sends.

const TOOL_STAGES = ['upcoming', 'due', 'overdue', 'firm', 'final'];

export function toolPage(ctx, { values, generated }) {
  const exampleAmount = formatMoney(240000, 'USD');
  const examples = TOOL_STAGES.map((stage) => {
    const daysLate = { upcoming: -3, due: 0, overdue: 7, firm: 21, final: 45 }[stage];
    const copy = reminderCopy({ clientName: 'Jordan', number: 'INV-1042', amount: exampleAmount, dueDate: '2026-03-01', daysLate, stage, sign: 'Alex' });
    return { stage, copy };
  });
  const textOf = (copy) => [...copyToText(copy, '[your payment link]'), copy.closing].join('\n\n');

  const body = html`<div class="page container">
  <div class="page-head">
    <div>
      <h1>Free late payment reminder email generator</h1>
      <p>Write a polite (or firm) payment reminder in seconds. Copy it, send it, get paid.</p>
    </div>
  </div>
  <div class="tool-grid">
    <form class="card card-pad stack" method="get" action="/tools/late-payment-email">
      ${input({ name: 'client', label: "Client's name", value: values.client, placeholder: 'Jordan Lee', maxlength: 80 })}
      ${input({ name: 'invoice', label: 'Invoice number', value: values.invoice, placeholder: 'INV-1042', maxlength: 40 })}
      <div class="field">
        <label class="label" for="amount">Amount</label>
        <div class="input-group">
          <select class="select" name="currency" aria-label="Currency">
            ${Object.keys(CURRENCIES).map((c) => html`<option value="${c}" ${c === values.currency ? 'selected' : ''}>${c}</option>`)}
          </select>
          <input class="input" id="amount" name="amount" inputmode="decimal" value="${values.amount}" placeholder="2400.00" maxlength="16">
        </div>
      </div>
      ${input({ name: 'due', label: 'Due date', type: 'date', value: values.due })}
      <div class="field">
        <label class="label" for="stage">Tone</label>
        <select class="select" id="stage" name="stage">
          ${TOOL_STAGES.map((s) => html`<option value="${s}" ${s === values.stage ? 'selected' : ''}>${STAGES[s]}</option>`)}
        </select>
      </div>
      ${input({ name: 'from', label: 'Your name', value: values.from, placeholder: 'Alex', maxlength: 80 })}
      <button class="btn btn-primary btn-block" type="submit">Generate email</button>
    </form>
    <div class="stack">
      ${generated
        ? html`<div class="card">
        <div class="card-head"><h2>Your email</h2><button class="btn btn-sm" type="button" data-copy="generated-email">Copy</button></div>
        <div class="card-body stack-sm">
          <div class="small muted">Subject</div>
          <div><strong>${generated.subject}</strong></div>
          <textarea class="textarea mono" id="generated-email" rows="14" readonly>${'Subject: ' + generated.subject + '\n\n' + textOf(generated)}</textarea>
        </div>
      </div>`
        : html`<div class="card card-pad"><h2 class="mt-0">Fill in the details</h2><p class="muted">Your ready-to-send email appears here. Every template below is free to copy.</p></div>`}
      <div class="card card-pad stack-sm">
        <h2>Tired of sending these yourself?</h2>
        <p class="muted">${config.appName} sends the right one at the right time, from your name, and stops the moment your client pays. Free for ${config.limits.freeActiveInvoices} invoices.</p>
        <p><a class="btn btn-primary" href="/signup?ref=tool">Automate my reminders ${icons.arrowRight}</a></p>
      </div>
    </div>
  </div>

  <div class="section-head tool-templates">
    <h2>Payment reminder email templates</h2>
    <p>From a friendly heads-up to a final notice, here's the full sequence ${config.appName} uses.</p>
  </div>
  <div class="template-list">
    ${examples.map(
      ({ stage, copy }) => html`<div class="email-preview">
      <div class="email-preview-head"><span class="badge ${stage === 'final' || stage === 'firm' ? 'badge-danger' : stage === 'overdue' ? 'badge-warn' : 'badge-success'}">${STAGES[stage]}</span>
        <div class="mt-0"><strong>Subject:</strong> ${copy.subject}</div></div>
      <div class="email-preview-body">${textOf(copy)}</div>
    </div>`,
    )}
  </div>
</div>`;
  return page(ctx, {
    title: 'Free Late Payment Reminder Email Generator (Polite to Firm)',
    description: 'Generate a polite or firm late payment reminder email in seconds. Free templates for before the due date, on the day, overdue and final notice.',
    body,
    canonical: '/tools/late-payment-email',
  });
}

