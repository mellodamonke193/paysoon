import { config } from '../config.js';
import { html } from '../lib/html.js';
import { CURRENCIES, formatMoney, parseAmount } from '../lib/money.js';
import { reminderCopy, copyToText } from '../services/templates.js';
import { page, icons, input } from './layout.js';

// SEO content: free, genuinely useful pages that rank for what freelancers search for, each
// ending in a soft call to action. Copy is generated from the same templates the product sends.

const SAMPLE = { clientName: 'Jordan', number: 'INV-1042', amount: '$2,400.00', dueDate: '2026-03-02', sign: 'Alex' };

const TEMPLATES = [
  {
    slug: 'friendly-payment-reminder',
    stage: 'upcoming',
    daysLate: -3,
    title: 'Friendly Payment Reminder Email Template (Before the Due Date)',
    h1: 'Friendly payment reminder email (before the due date)',
    description: 'A short, polite payment reminder to send a few days before an invoice is due. Free template you can copy.',
    when: 'Send it 3 days before the due date. It is the single most effective reminder: it catches invoices that were forgotten or stuck in an approval queue before they become late.',
    tips: [
      'Keep it short. One sentence about the invoice, one link, one thank-you.',
      'Always include a direct payment link so paying takes one click.',
      'Send it in the morning on a weekday, when people work through their inbox.',
    ],
  },
  {
    slug: 'invoice-due-today-reminder',
    stage: 'due',
    daysLate: 0,
    title: 'Invoice Due Today Reminder Email Template',
    h1: '"Invoice due today" reminder email',
    description: 'A polite email to send on the day an invoice is due. Free, copy-and-paste template.',
    when: 'Send it on the due date. It is a neutral nudge, not a chase, so keep the tone warm.',
    tips: [
      'Mention the amount and invoice number in the subject line so it is easy to find later.',
      "Don't apologize for asking. You did the work, and this is normal business.",
      'If you offer several ways to pay, list them on the invoice page rather than in the email.',
    ],
  },
  {
    slug: 'overdue-invoice-follow-up',
    stage: 'overdue',
    daysLate: 7,
    title: 'Overdue Invoice Follow-Up Email Template (1 Week Late)',
    h1: 'Overdue invoice follow-up email (1 week late)',
    description: 'A professional follow-up email for an invoice that is a week overdue. Free template plus tips.',
    when: 'Send it 3 to 7 days after the due date. Assume good intent: most late payments are oversights.',
    tips: [
      "State the facts (amount, due date, days overdue) without blame.",
      'Give the client an easy way to say "already paid" so you are not chasing money that is on its way.',
      'Invite them to reply if something is wrong with the invoice. Disputes are easier to fix early.',
    ],
  },
  {
    slug: 'second-payment-reminder',
    stage: 'firm',
    daysLate: 21,
    title: 'Second Payment Reminder Email Template (Firm but Polite)',
    h1: 'Second payment reminder email (firm but polite)',
    description: 'A firmer, still-polite payment reminder for an invoice that is 2 to 3 weeks overdue. Free template.',
    when: 'Send it 2 to 3 weeks after the due date, when earlier reminders have gone unanswered.',
    tips: [
      'Firm means clear, not aggressive. Ask for payment "as soon as you can" and offer to help.',
      'Never threaten consequences you do not intend to follow through on.',
      'This is a good moment to also pick up the phone or message your contact directly.',
    ],
  },
  {
    slug: 'final-payment-reminder',
    stage: 'final',
    daysLate: 45,
    title: 'Final Payment Reminder Email Template (Professional)',
    h1: 'Final payment reminder email',
    description: 'A professional last reminder for a long-overdue invoice that stays courteous and avoids threats. Free template.',
    when: "Send it 30 to 45 days after the due date as your last automated reminder. After this, follow up personally.",
    tips: [
      'Say it is your last automated reminder; that is honest and creates natural urgency.',
      'Keep the door open: offer to talk about a payment plan if the client is struggling.',
      'Avoid legal threats in writing unless you have taken advice and genuinely intend to act.',
    ],
  },
];

export const TEMPLATE_SLUGS = TEMPLATES.map((t) => t.slug);

const copyFor = (t) =>
  reminderCopy({ ...SAMPLE, daysLate: t.daysLate, stage: t.stage });
const textFor = (copy) => [...copyToText(copy, '[your payment link]'), copy.closing].join('\n\n');

function ctaCard() {
  return html`<div class="card card-pad stack-sm cta-card">
  <h2>Let ${config.appName} send these for you</h2>
  <p class="muted">Add an invoice once and ${config.appName} sends the right reminder at the right time, in your name, and stops as soon as your client pays. Free for ${config.limits.freeActiveInvoices} invoices.</p>
  <p><a class="btn btn-primary" href="/signup?ref=content">Automate my reminders ${icons.arrowRight}</a></p>
</div>`;
}

function relatedLinks(currentSlug) {
  return html`<nav class="card card-pad stack-sm cta-card" aria-label="More templates">
  <h2>More free resources</h2>
  <ul class="link-list">
    ${TEMPLATES.filter((t) => t.slug !== currentSlug).map((t) => html`<li><a href="/templates/${t.slug}">${t.h1}</a></li>`)}
    <li><a href="/guides/how-to-ask-for-payment">How to ask a client for payment</a></li>
    <li><a href="/tools/late-payment-email">Late payment email generator</a></li>
    <li><a href="/tools/late-fee-calculator">Late fee calculator</a></li>
  </ul>
</nav>`;
}

export function templatesIndexPage(ctx) {
  const body = html`<div class="page container">
  <div class="page-head"><div>
    <h1>Free payment reminder email templates</h1>
    <p>The full sequence, from a friendly heads-up to a final reminder. Polite, professional and ready to copy.</p>
  </div></div>
  <div class="template-grid">
    ${TEMPLATES.map(
      (t) => html`<a class="card card-pad template-card" href="/templates/${t.slug}">
      <h2>${t.h1}</h2>
      <p class="muted small">${t.when}</p>
      <span class="small template-more">Read the template ${icons.arrowRight}</span>
    </a>`,
    )}
  </div>
  <div class="spacer"></div>
  ${ctaCard()}
</div>`;
  return page(ctx, {
    title: 'Free Payment Reminder Email Templates for Freelancers',
    description: 'Copy-and-paste payment reminder email templates for every stage: before the due date, due today, overdue, second reminder and final reminder.',
    body,
    canonical: '/templates',
  });
}

export function templatePage(ctx, slug) {
  const t = TEMPLATES.find((x) => x.slug === slug);
  if (!t) return null;
  const copy = copyFor(t);
  const body = html`<div class="page container">
  <a class="back" href="/templates">${icons.arrowLeft} All templates</a>
  <div class="tool-grid">
    <article class="stack">
      <div>
        <h1 class="article-title">${t.h1}</h1>
        <p class="muted">${t.description}</p>
      </div>
      <div class="card">
        <div class="card-head"><h2>The template</h2><button class="btn btn-sm" type="button" data-copy="template-text">Copy</button></div>
        <div class="card-body stack-sm">
          <div class="small muted">Subject</div>
          <div><strong>${copy.subject}</strong></div>
          <textarea class="textarea mono" id="template-text" rows="14" readonly aria-label="Email template">${'Subject: ' + copy.subject + '\n\n' + textFor(copy)}</textarea>
          <p class="hint">Replace the name, invoice number, amount and dates with your own, or <a href="/tools/late-payment-email?stage=${t.stage}">generate a filled-in version</a>.</p>
        </div>
      </div>
      <div class="prose">
        <h2>When to send it</h2>
        <p>${t.when}</p>
        <h2>Tips</h2>
        <ul>${t.tips.map((tip) => html`<li>${tip}</li>`)}</ul>
      </div>
    </article>
    <div class="stack">
      ${ctaCard()}
      ${relatedLinks(t.slug)}
    </div>
  </div>
</div>`;
  return page(ctx, { title: t.title, description: t.description, body, canonical: `/templates/${t.slug}` });
}

export function guidePage(ctx) {
  const body = html`<div class="page container">
  <article class="prose">
    <h1>How to ask a client for payment (without it being awkward)</h1>
    <p class="lede-text">Asking for money you are owed is part of running a business, not a favor. Here is a simple, polite system that gets invoices paid sooner and keeps client relationships intact.</p>

    <h2>1. Set expectations before you start</h2>
    <p>Agree on payment terms up front: the amount or rate, when you'll invoice, and when payment is due (for example "net 14", meaning 14 days after the invoice date). Put the terms in your proposal or contract and repeat them on every invoice. If you plan to charge late fees, they must be agreed in advance; you can't add them after the fact.</p>

    <h2>2. Make paying effortless</h2>
    <p>Every extra step delays payment. Include a direct payment link (Stripe, PayPal, Wise, Square) or clear bank details on the invoice, with the invoice number to use as a reference. Send the invoice to whoever actually pays bills, which is often an accounts address rather than your day-to-day contact.</p>

    <h2>3. Follow a reminder schedule</h2>
    <p>Consistency matters more than wording. A schedule that works for most freelancers and small businesses:</p>
    <ul>
      <li><strong>3 days before the due date:</strong> <a href="/templates/friendly-payment-reminder">a friendly heads-up</a>.</li>
      <li><strong>On the due date:</strong> <a href="/templates/invoice-due-today-reminder">a short "due today" note</a>.</li>
      <li><strong>3 to 7 days late:</strong> <a href="/templates/overdue-invoice-follow-up">a polite follow-up</a>.</li>
      <li><strong>2 to 3 weeks late:</strong> <a href="/templates/second-payment-reminder">a firmer reminder</a>, plus a personal call or message.</li>
      <li><strong>30 to 45 days late:</strong> <a href="/templates/final-payment-reminder">a final reminder</a>, then follow up personally.</li>
    </ul>

    <h2>4. Keep the tone professional</h2>
    <p>Stick to facts: invoice number, amount, due date, how many days overdue, and how to pay. Assume good intent; most late payments are oversights, cash-flow hiccups or invoices stuck in someone's inbox. Avoid sarcasm, guilt and threats. Firm means clear, not hostile.</p>

    <h2>5. Make it easy to say "already paid" or "there's a problem"</h2>
    <p>Payments cross in the post, and invoices sometimes have mistakes. Give clients an easy way to tell you, and pause your reminders when they do. Nothing damages a relationship faster than chasing someone who already paid.</p>

    <h2>6. Know your options when an invoice stays unpaid</h2>
    <p>If friendly follow-ups fail, talk to the client directly and consider offering a payment plan. Beyond that, options include formal demand letters or small-claims court, which vary by location; check your local rules or get professional advice before taking those steps. This guide is general information, not legal advice.</p>

    <h2>7. Automate the routine part</h2>
    <p>The hard part of chasing invoices is remembering and finding the energy to write the email. ${config.appName} does both: add an invoice once and it sends this exact schedule in your name, at 9 AM on weekdays, and stops the moment your client pays or tells you they have.</p>
    <p><a class="btn btn-primary" href="/signup?ref=guide">Try ${config.appName} free ${icons.arrowRight}</a></p>
  </article>
  <div class="spacer"></div>
  ${relatedLinks('')}
</div>`;
  return page(ctx, {
    title: 'How to Ask a Client for Payment (Polite, Proven Steps)',
    description: 'A simple system for asking clients to pay overdue invoices without being awkward: payment terms, reminder schedule, wording and what to do if they still do not pay.',
    body,
    canonical: '/guides/how-to-ask-for-payment',
  });
}

const RATE_RE = /^\d{1,2}(\.\d{1,3})?$/;

/** Simple (non-compounding) late interest plus an optional flat fee. */
export function calculateLateFee(values) {
  const principal = parseAmount(values.amount, values.currency);
  if (principal === null) return { error: 'Enter the invoice amount, like 2400 or 2400.00.' };
  if (!RATE_RE.test(values.rate) || Number(values.rate) > 50) return { error: 'Enter an interest rate between 0 and 50 percent.' };
  if (!/^\d{1,4}$/.test(values.days) || Number(values.days) < 1 || Number(values.days) > 3650) return { error: 'Enter how many days late the invoice is (1 to 3650).' };
  const flat = values.flat ? parseAmount(values.flat, values.currency) : 0;
  if (flat === null) return { error: 'Enter the flat fee as an amount, or leave it blank.' };
  const rate = Number(values.rate) / 100;
  const days = Number(values.days);
  const periods = values.period === 'year' ? days / 365 : days / (365 / 12);
  const interest = Math.round(principal * rate * periods);
  const fmt = (n) => formatMoney(n, values.currency);
  return {
    interest: fmt(interest),
    flat: fmt(flat),
    total: fmt(principal + interest + flat),
    fees: fmt(interest + flat),
    explanation: `${values.rate}% per ${values.period} for ${days} ${days === 1 ? 'day' : 'days'} on ${fmt(principal)} = ${fmt(interest)} interest${flat ? ` + ${fmt(flat)} flat fee` : ''}.`,
  };
}

export function lateFeePage(ctx, { values, result }) {
  const body = html`<div class="page container">
  <div class="page-head"><div>
    <h1>Late fee calculator for overdue invoices</h1>
    <p>Work out the late interest and fees on an unpaid invoice in seconds.</p>
  </div></div>
  <div class="tool-grid">
    <form class="card card-pad stack" method="get" action="/tools/late-fee-calculator">
      <div class="field">
        <label class="label" for="amount">Invoice amount</label>
        <div class="input-group">
          <select class="select" name="currency" aria-label="Currency">
            ${Object.keys(CURRENCIES).map((c) => html`<option value="${c}" ${c === values.currency ? 'selected' : ''}>${c}</option>`)}
          </select>
          <input class="input" id="amount" name="amount" inputmode="decimal" value="${values.amount}" placeholder="2400.00" maxlength="16">
        </div>
      </div>
      <div class="field">
        <label class="label" for="rate">Interest rate (%)</label>
        <div class="input-group input-group-end">
          <input class="input" id="rate" name="rate" inputmode="decimal" value="${values.rate}" placeholder="1.5" maxlength="8">
          <select class="select" name="period" aria-label="Rate period">
            <option value="month" ${values.period === 'month' ? 'selected' : ''}>per month</option>
            <option value="year" ${values.period === 'year' ? 'selected' : ''}>per year</option>
          </select>
        </div>
      </div>
      ${input({ name: 'days', label: 'Days overdue', value: values.days, placeholder: '30', maxlength: 5, attrs: html`inputmode="numeric"` })}
      ${input({ name: 'flat', label: 'Flat late fee', value: values.flat, placeholder: '25', maxlength: 12, optional: true })}
      <button class="btn btn-primary btn-block" type="submit">Calculate</button>
    </form>
    <div class="stack">
      ${result
        ? result.error
          ? html`<div class="alert alert-danger" role="alert">${result.error}</div>`
          : html`<div class="card card-pad stack-sm" aria-live="polite">
          <div class="stat-label">Total now owed</div>
          <div class="result-total">${result.total}</div>
          <p class="muted">Late fees: <strong>${result.fees}</strong> (interest ${result.interest}, flat fee ${result.flat})</p>
          <p class="small faint">${result.explanation}</p>
        </div>`
        : html`<div class="card card-pad"><h2 class="mt-0">Enter the details</h2><p class="muted">Your total appears here. Simple interest, calculated daily.</p></div>`}
      <div class="alert alert-info"><span>Only charge late fees that your contract or invoice terms allowed in advance, and check local rules: many places cap late fees and interest. This calculator is for information only, not legal or financial advice.</span></div>
      ${ctaCard()}
    </div>
  </div>
  <div class="spacer"></div>
  ${relatedLinks('')}
</div>`;
  return page(ctx, {
    title: 'Late Fee Calculator for Overdue Invoices (Free)',
    description: 'Free late fee calculator: work out interest and late fees on an overdue invoice by rate, days late and flat fee.',
    body,
    canonical: '/tools/late-fee-calculator',
  });
}
