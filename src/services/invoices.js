import { config } from '../config.js';
import { get, all, run } from '../db.js';
import { CADENCES, STAGES, planSchedule, stepTimes, stageFor, nominalStage } from '../lib/schedule.js';
import { CURRENCIES, parseAmount } from '../lib/money.js';
import { daysBetween, isValidDateStr, localDate, DAY } from '../lib/time.js';
import { line, multiline, isEmail, isHttpsUrl } from '../lib/validate.js';

export const isPro = (user) => user.plan === 'pro';

// The client's invoice page, and the one-click unsubscribe endpoint used in reminder emails.
export const clientLink = (invoice) => `${config.appUrl}/i/${invoice.public_token}`;
export const optOutLink = (invoice) => `${config.appUrl}/u/${invoice.public_token}`;

export function openInvoiceCount(userId) {
  return get(`SELECT COUNT(*) AS n FROM invoices WHERE user_id = ? AND status IN ('active', 'paused')`, userId).n;
}

export const canOpenAnother = (user) => isPro(user) || openInvoiceCount(user.id) < config.limits.freeActiveInvoices;

export function findInvoice(userId, id) {
  return get('SELECT * FROM invoices WHERE id = ? AND user_id = ?', Number(id), userId);
}

export function logEvent(invoiceId, kind, detail = '') {
  run('INSERT INTO invoice_events (invoice_id, kind, detail, created_at) VALUES (?, ?, ?, ?)', invoiceId, kind, detail, Date.now());
}

// A "cycle" is one due date + cadence. Changing either starts a fresh reminder sequence.
export const cycleOf = (invoice) => `${invoice.due_date}|${invoice.cadence}`;

export function sentSteps(invoice) {
  return all(
    `SELECT step, created_at FROM email_log
      WHERE invoice_id = ? AND kind = 'reminder' AND cycle = ? AND status IN ('sent', 'logged')`,
    invoice.id,
    cycleOf(invoice),
  );
}

export function reschedule(invoice, user, now = Date.now()) {
  const plan = planSchedule({
    dueDate: invoice.due_date,
    cadence: invoice.cadence,
    tz: user.timezone,
    now,
    sentSteps: new Set(sentSteps(invoice).map((r) => r.step)),
    lastSentAt: invoice.last_sent_at,
  });
  run(
    'UPDATE invoices SET next_step = ?, next_send_at = ?, send_failures = 0, updated_at = ? WHERE id = ?',
    plan.step,
    plan.sendAt,
    now,
    invoice.id,
  );
  return plan;
}

export function parseInvoiceForm(form, user) {
  const values = {
    client_name: line(form.client_name),
    client_email: line(form.client_email).toLowerCase(),
    number: line(form.number),
    amount: line(form.amount),
    currency: line(form.currency).toUpperCase(),
    issue_date: line(form.issue_date),
    due_date: line(form.due_date),
    payment_url: line(form.payment_url),
    note: multiline(form.note),
    message: multiline(form.message),
    cadence: line(form.cadence),
  };
  const errors = {};
  if (!values.client_name || values.client_name.length > 120) errors.client_name = 'Enter the client name (up to 120 characters).';
  if (!isEmail(values.client_email)) errors.client_email = 'Enter a valid email address.';
  if (!values.number || values.number.length > 40) errors.number = 'Enter an invoice number (up to 40 characters).';
  if (!(values.currency in CURRENCIES)) errors.currency = 'Choose a currency.';
  const amountMinor = errors.currency ? null : parseAmount(values.amount, values.currency);
  if (amountMinor === null) errors.amount = values.currency === 'JPY' ? 'Enter a whole amount, like 25000.' : 'Enter an amount like 1250 or 1250.00.';
  if (!isValidDateStr(values.due_date)) {
    errors.due_date = 'Choose a due date.';
  } else {
    const diff = daysBetween(localDate(Date.now(), user.timezone), values.due_date);
    if (diff < -365 || diff > 730) errors.due_date = 'The due date must be within the last year or the next two years.';
  }
  if (values.issue_date && !isValidDateStr(values.issue_date)) errors.issue_date = 'Enter a valid date or leave it blank.';
  if (values.payment_url && !isHttpsUrl(values.payment_url)) {
    errors.payment_url = 'Paste a full https:// payment link (Stripe, PayPal, Wise, Square…).';
  }
  if (!values.payment_url && !values.note && !errors.payment_url) {
    errors.payment_url = 'Add a payment link, or put your payment instructions in the note, so your client knows how to pay.';
  }
  if (values.note.length > 1500) errors.note = 'Keep the note under 1,500 characters.';
  if (values.message.length > 500) errors.message = 'Keep the personal message under 500 characters.';
  if (!CADENCES[values.cadence]) errors.cadence = 'Choose a reminder cadence.';
  else if (CADENCES[values.cadence].pro && !isPro(user)) errors.cadence = 'Persistent is a Pro cadence. Upgrade, or pick Gentle or Standard.';

  return {
    values,
    errors,
    data: {
      client_name: values.client_name,
      client_email: values.client_email,
      number: values.number,
      amount_minor: amountMinor,
      currency: values.currency,
      issue_date: values.issue_date || null,
      due_date: values.due_date,
      payment_url: values.payment_url,
      note: values.note,
      message: values.message,
      cadence: values.cadence,
    },
  };
}

export function invoiceState(invoice, today) {
  if (invoice.status === 'paid') return { key: 'paid', label: 'Paid', tone: 'success' };
  if (invoice.status === 'paused') {
    if (invoice.disputed_at) return { key: 'disputed', label: 'Client flagged an issue', tone: 'warn' };
    return invoice.client_claimed_at
      ? { key: 'claimed', label: 'Client says paid', tone: 'info' }
      : { key: 'paused', label: 'Paused', tone: 'neutral' };
  }
  const days = daysBetween(invoice.due_date, today);
  if (days > 0) return { key: 'overdue', label: `${days}d overdue`, tone: days >= 14 ? 'danger' : 'warn' };
  if (days === 0) return { key: 'due', label: 'Due today', tone: 'warn' };
  return { key: 'upcoming', label: `Due in ${-days}d`, tone: 'neutral' };
}

export function dashboardData(user, filter) {
  const now = Date.now();
  const today = localDate(now, user.timezone);
  const totals = all(
    `SELECT currency,
            COALESCE(SUM(CASE WHEN status IN ('active','paused') THEN amount_minor ELSE 0 END), 0) AS outstanding,
            COALESCE(SUM(CASE WHEN status IN ('active','paused') AND due_date < ? THEN amount_minor ELSE 0 END), 0) AS overdue,
            COALESCE(SUM(CASE WHEN status = 'paid' AND paid_at >= ? THEN amount_minor ELSE 0 END), 0) AS collected
       FROM invoices WHERE user_id = ? GROUP BY currency ORDER BY COUNT(*) DESC`,
    today,
    now - 30 * DAY,
    user.id,
  );
  const counts = get(
    `SELECT COUNT(*) AS all_count,
            COALESCE(SUM(CASE WHEN status IN ('active','paused') AND due_date < ? THEN 1 ELSE 0 END), 0) AS overdue,
            COALESCE(SUM(CASE WHEN status IN ('active','paused') AND due_date >= ? THEN 1 ELSE 0 END), 0) AS upcoming,
            COALESCE(SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END), 0) AS paused,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0) AS paid,
            COALESCE(SUM(CASE WHEN status = 'paid' AND paid_at >= ? AND reminders_sent > 0 THEN 1 ELSE 0 END), 0) AS recovered
       FROM invoices WHERE user_id = ?`,
    today,
    today,
    now - 30 * DAY,
    user.id,
  );
  const remindersSent = get(
    `SELECT COUNT(*) AS n FROM email_log WHERE user_id = ? AND kind = 'reminder' AND status IN ('sent','logged') AND created_at >= ?`,
    user.id,
    now - 30 * DAY,
  ).n;

  const filters = {
    all: ['1 = 1', []],
    overdue: [`status IN ('active','paused') AND due_date < ?`, [today]],
    upcoming: [`status IN ('active','paused') AND due_date >= ?`, [today]],
    paused: [`status = 'paused'`, []],
    paid: [`status = 'paid'`, []],
  };
  const [where, params] = filters[filter] || filters.all;
  const invoices = all(
    `SELECT * FROM invoices WHERE user_id = ? AND ${where}
      ORDER BY CASE status WHEN 'paid' THEN 1 ELSE 0 END, CASE WHEN status = 'paid' THEN -paid_at ELSE 0 END, due_date ASC, id DESC
      LIMIT 500`,
    user.id,
    ...params,
  );
  const testSent = Boolean(get(`SELECT 1 AS x FROM email_log WHERE user_id = ? AND kind = 'test' LIMIT 1`, user.id));
  return { today, totals, counts, remindersSent, invoices, testSent };
}

// Merges the planned cadence with what actually happened, for the invoice detail page.
export function buildTimeline(invoice, user) {
  const offsets = CADENCES[invoice.cadence].offsets;
  const times = stepTimes(invoice.due_date, invoice.cadence, user.timezone);
  const sent = new Map(sentSteps(invoice).map((r) => [r.step, r.created_at]));
  return offsets.map((offset, step) => {
    const isLast = step === offsets.length - 1;
    const entry = { step, offset, stage: STAGES[nominalStage(offset, isLast)], at: times[step], state: 'scheduled' };
    if (sent.has(step)) return { ...entry, state: 'sent', at: sent.get(step) };
    if (invoice.status === 'paid') return { ...entry, state: 'cancelled' };
    if (step < invoice.next_step) return { ...entry, state: 'skipped' };
    if (invoice.status === 'paused') return { ...entry, state: 'paused' };
    if (step === invoice.next_step && invoice.next_send_at) return { ...entry, state: 'next', at: invoice.next_send_at };
    return entry;
  });
}

export function previewStage(invoice, user) {
  const offsets = CADENCES[invoice.cadence].offsets;
  const step = Math.min(invoice.next_step, offsets.length - 1);
  const at = invoice.next_send_at || Date.now();
  const daysLate = daysBetween(invoice.due_date, localDate(at, user.timezone));
  return { daysLate, stage: stageFor(daysLate, step === offsets.length - 1) };
}
