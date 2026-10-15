import { config, operatorName } from '../config.js';
import { html, raw } from '../lib/html.js';
import { formatMoney } from '../lib/money.js';
import { formatDate, plural } from '../lib/time.js';

const firstName = (name) => {
  const first = String(name).trim().split(/\s+/)[0] || 'there';
  // Company names ("Acme Inc") read better in full.
  return /\b(inc|llc|ltd|gmbh|co|corp|company|studio|agency|group)\b\.?$/i.test(name) ? name : first;
};

export const senderName = (user) => user.business_name || user.email.split('@')[0];
export const signoff = (user) => (user.signature?.trim() ? user.signature.trim() : senderName(user));
const withoutTrailingDot = (s) => String(s).replace(/\.$/, '');

/**
 * The copy for every reminder stage — used by the scheduler, the in-app preview and the free public
 * generator so they always match. A { cta } entry marks where the payment link goes; { note } is the
 * sender's optional personal message.
 *
 * Wording rules (keep them when editing): state facts only, never threaten consequences, never imply a
 * third party (lawyer, agency, court) is involved, and always offer a way to say "already paid" or reply.
 */
export function reminderCopy({ clientName, number, amount, dueDate, daysLate, stage, sign, message = '' }) {
  const hi = `Hi ${firstName(clientName)},`;
  const due = formatDate(dueDate, 'long');
  const late = plural(daysLate, 'day');
  const ref = `invoice ${number}`;
  const note = message ? [{ note: message }] : [];
  switch (stage) {
    case 'upcoming':
      return {
        subject: `Friendly reminder: invoice ${number} is due ${formatDate(dueDate, 'short')}`,
        paragraphs: [
          hi,
          `Just a quick heads-up that ${ref} for ${amount} is due on ${due}.`,
          ...note,
          { cta: 'You can view and pay it here' },
          `If it's already on its way, thank you, and please ignore this note.`,
        ],
        closing: `Best,\n${sign}`,
      };
    case 'due':
      return {
        subject: `Invoice ${number} is due today`,
        paragraphs: [
          hi,
          `A quick reminder that ${ref} for ${amount} is due today.`,
          ...note,
          { cta: 'View and pay' },
          `Thanks so much!`,
        ],
        closing: `Best,\n${sign}`,
      };
    case 'overdue':
      return {
        subject: `Invoice ${number} is ${late} overdue`,
        paragraphs: [
          hi,
          `I'm following up on ${ref} for ${amount}, which was due on ${due} and is now ${late} past due.`,
          ...note,
          `Could you take a moment to settle it?`,
          { cta: 'View and pay' },
          `If you've already sent payment, you can let me know in one click from the link above. And if there's a problem with the invoice, just reply to this email.`,
        ],
        closing: `Thanks,\n${sign}`,
      };
    case 'firm':
      return {
        subject: `Payment reminder: invoice ${number} (${amount}) is ${late} overdue`,
        paragraphs: [
          hi,
          `${ref.charAt(0).toUpperCase() + ref.slice(1)} for ${amount} is now ${late} overdue, and I haven't been able to confirm payment yet.`,
          ...note,
          { cta: 'Please arrange payment as soon as you can' },
          `If something is holding this up, reply and let me know. I'm happy to help sort it out.`,
        ],
        closing: `Regards,\n${sign}`,
      };
    default:
      return {
        subject: `Last reminder: invoice ${number} is ${late} overdue`,
        paragraphs: [
          hi,
          `This is my last automated reminder about ${ref} for ${amount}, which is still unpaid ${late} after its due date of ${due}.`,
          ...note,
          { cta: 'You can pay it here' },
          `If you've already paid, please let me know using the link above so I can update my records. If there's a reason for the delay, just reply and we can work something out.`,
        ],
        closing: `Regards,\n${sign}`,
      };
  }
}

export const copyToText = (copy, link) =>
  copy.paragraphs.map((p) => (typeof p === 'string' ? p : p.note !== undefined ? p.note : `${p.cta}: ${link}`));

const BRAND = '#0d7a5f';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function emailShell({ preheader, content, footer }) {
  return html`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title></title></head>
<body style="margin:0;padding:0;background:#f4f4f1;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f1;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e6e6e0;">
<tr><td style="padding:32px 32px 28px;font-family:${raw(FONT)};font-size:15px;line-height:1.6;color:#1b1d22;">
${content}
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:16px 32px;font-family:${raw(FONT)};font-size:12px;line-height:1.6;color:#6b7079;text-align:center;">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body></html>`.toString();
}

const button = (label, url) => html`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:10px;background:${raw(BRAND)};">
<a href="${url}" style="display:inline-block;padding:13px 22px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
</td></tr></table>`;

const paragraph = (text) => html`<p style="margin:0 0 14px;">${text}</p>`;
const noteBlock = (text) => html`<p style="margin:0 0 14px;padding:12px 14px;background:#f7f7f4;border-left:3px solid ${raw(BRAND)};border-radius:6px;white-space:pre-line;">${text}</p>`;
const closing = (text) => html`<p style="margin:18px 0 0;white-space:pre-line;">${text}</p>`;
const footerLink = (url, label) => html`<a href="${url}" style="color:#5f6470;">${label}</a>`;

const operatorLine = () =>
  config.company.address ? `${operatorName()} · ${config.company.address}` : operatorName();

export function reminderEmail({ invoice, user, stage, daysLate, link, optOutLink, branded, test = false }) {
  const amount = formatMoney(invoice.amount_minor, invoice.currency);
  const sender = senderName(user);
  const copy = reminderCopy({
    clientName: invoice.client_name,
    number: invoice.number,
    amount,
    dueDate: invoice.due_date,
    daysLate,
    stage,
    sign: signoff(user),
    message: invoice.message || '',
  });

  const buttonLabel = stage === 'upcoming' || stage === 'due' ? 'View & pay invoice' : 'Pay invoice now';
  const blocks = copy.paragraphs.map((p) =>
    typeof p === 'string' ? paragraph(p) : p.note !== undefined ? noteBlock(p.note) : button(buttonLabel, link),
  );

  const testBanner = test
    ? html`<p style="margin:0 0 20px;padding:10px 14px;background:#fff4dc;color:#7a4b00;border-radius:8px;font-size:13px;"><strong>Test email.</strong> This is exactly what ${invoice.client_name} will receive. Links work but nothing changes on the real invoice.</p>`
    : '';

  const summary = html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:#f7f7f4;border-radius:10px;">
<tr><td style="padding:14px 16px;font-size:13px;color:#5f6470;">Invoice <strong style="color:#1b1d22;">${invoice.number}</strong> from ${sender}</td>
<td style="padding:14px 16px;text-align:right;font-size:17px;font-weight:700;color:#1b1d22;white-space:nowrap;">${amount}</td></tr>
<tr><td colspan="2" style="padding:0 16px 14px;font-size:13px;color:#5f6470;">Due ${formatDate(invoice.due_date, 'long')}</td></tr>
</table>`;

  const footer = html`Sent on behalf of ${withoutTrailingDot(sender)}. Reply to this email to reach them directly.<br>
Already paid, or is something wrong? ${footerLink(link, `Let ${withoutTrailingDot(sender)} know`)}. · ${footerLink(optOutLink, 'Unsubscribe')}<br>
${config.appName} is an invoice reminder service used by ${withoutTrailingDot(sender)}. It is not a collection agency.<br>
${operatorLine()}
${branded ? html`<br><br><a href="${config.appUrl}/?ref=email" style="color:#8a8f98;text-decoration:none;">Sent with ${config.appName}: invoice reminders on autopilot</a>` : ''}`;

  const text = [
    ...(test ? [`[TEST EMAIL: this is exactly what ${invoice.client_name} will receive.]`] : []),
    ...copyToText(copy, link),
    copy.closing,
    '',
    '---',
    `Invoice ${invoice.number} · ${amount} · due ${formatDate(invoice.due_date, 'long')}`,
    `Already paid, or is something wrong? Let ${withoutTrailingDot(sender)} know: ${link}`,
    `Unsubscribe from these reminders: ${optOutLink}`,
    `${config.appName} is an invoice reminder service used by ${withoutTrailingDot(sender)}. It is not a collection agency. ${operatorLine()}`,
    ...(branded ? [`Sent with ${config.appName} · ${config.appUrl}`] : []),
  ].join('\n\n');

  return {
    subject: test ? `[Test] ${copy.subject}` : copy.subject,
    text,
    html: emailShell({
      preheader: `${amount} · invoice ${invoice.number}`,
      content: html`${testBanner}${summary}${blocks}${closing(copy.closing)}`,
      footer,
    }),
    // RFC 8058 one-click unsubscribe: Gmail/Yahoo show an "Unsubscribe" button instead of "Report spam".
    headers: test ? undefined : { 'List-Unsubscribe': `<${optOutLink}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

function systemEmail({ subject, intro, details = [], action, url, outro, footerExtra }) {
  return {
    subject,
    text: [intro, ...details, `${action}: ${url}`, outro, `— ${config.appName}`, footerExtra].filter(Boolean).join('\n\n'),
    html: emailShell({
      preheader: intro,
      content: html`<p style="margin:0 0 18px;font-size:18px;font-weight:700;">${config.appName}</p>
${paragraph(intro)}${details.map((d) => paragraph(d))}${button(action, url)}${outro ? paragraph(outro) : ''}`,
      footer: html`You're receiving this because of activity on your ${config.appName} account.${footerExtra ? html`<br>${footerExtra}` : ''}<br>${operatorLine()}`,
    }),
  };
}

export const verifyEmail = (url) =>
  systemEmail({
    subject: `Confirm your email for ${config.appName}`,
    intro: 'Confirm your email address to start sending automatic reminders to your clients.',
    action: 'Confirm email',
    url,
    outro: "This link expires in 48 hours. If you didn't sign up, you can ignore this email.",
  });

export const resetEmail = (url) =>
  systemEmail({
    subject: `Reset your ${config.appName} password`,
    intro: 'Someone (hopefully you) asked to reset your password.',
    action: 'Choose a new password',
    url,
    outro: "This link expires in 1 hour. If you didn't ask for this, you can safely ignore this email; your password won't change.",
  });

const RESPONSE_COPY = {
  claimed: (i) => ({
    subject: `${i.client_name} says invoice ${i.number} is paid`,
    intro: `${i.client_name} told us they've paid invoice ${i.number}. Reminders are paused. Once the money arrives, mark it paid. If it doesn't arrive, you can resume reminders with one click.`,
  }),
  wrong: (i) => ({
    subject: `${i.client_name} flagged a problem with invoice ${i.number}`,
    intro: `${i.client_name} says something about invoice ${i.number} is wrong (amount or details). Reminders are paused so you can check it with them. Edit the invoice and resume when it's sorted.`,
  }),
  not_mine: (i) => ({
    subject: `Invoice ${i.number}: the recipient doesn't recognize it`,
    intro: `The person at ${i.client_email} says they don't recognize invoice ${i.number}. We've stopped all reminders to that address. Please double-check the client's email address.`,
  }),
  stop: (i) => ({
    subject: `${i.client_name} unsubscribed from reminders for invoice ${i.number}`,
    intro: `${i.client_name} (${i.client_email}) asked not to receive automated reminders from you. We've stopped them for that address. You can still contact them directly about the invoice.`,
  }),
};

export function clientResponseEmail({ invoice, kind, url }) {
  const copy = (RESPONSE_COPY[kind] || RESPONSE_COPY.claimed)(invoice);
  return systemEmail({
    subject: copy.subject,
    intro: copy.intro,
    details: [`Invoice ${invoice.number} · ${formatMoney(invoice.amount_minor, invoice.currency)} · due ${formatDate(invoice.due_date, 'long')}`],
    action: 'Review invoice',
    url,
  });
}

export function digestEmail({ summary, url, settingsUrl }) {
  const lines = [
    summary.overdueCount
      ? `${plural(summary.overdueCount, 'invoice')} overdue, totalling ${summary.overdueTotal}.`
      : 'Nothing is overdue right now. Nice.',
    summary.paidCount ? `${plural(summary.paidCount, 'invoice')} paid in the last 7 days (${summary.paidTotal}).` : null,
    `${plural(summary.remindersSent, 'reminder')} sent for you in the last 7 days.`,
    summary.upcomingCount ? `${plural(summary.upcomingCount, 'reminder')} scheduled for the coming week.` : null,
  ].filter(Boolean);
  return systemEmail({
    subject: summary.overdueCount
      ? `Your week: ${summary.overdueTotal} overdue across ${plural(summary.overdueCount, 'invoice')}`
      : `Your week with ${config.appName}: all caught up`,
    intro: 'Here is your weekly summary.',
    details: lines,
    action: 'Open dashboard',
    url,
    footerExtra: `Don't want weekly summaries? Turn them off in Settings: ${settingsUrl}`,
  });
}
