import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.APP_NO_DOTENV = '1';
process.env.DATABASE_PATH = ':memory:';

const { html, raw, safeUrl } = await import('../src/lib/html.js');
const { parseAmount, formatMoney } = await import('../src/lib/money.js');
const { zonedToUtc, localDate, addDays, daysBetween } = await import('../src/lib/time.js');
const { planSchedule, planAfterSend, stepSendAt, stageFor, MIN_GAP_MS } = await import('../src/lib/schedule.js');
const { line, isEmail, isHttpsUrl, safeNext } = await import('../src/lib/validate.js');
const { verifyStripeSignature } = await import('../src/services/billing.js');
const { hashPassword, verifyPassword, passwordProblem, impersonationProblem } = await import('../src/lib/security.js');
const { calculateLateFee } = await import('../src/views/content.js');
const { createHmac } = await import('node:crypto');

test('sender names cannot impersonate brands, agencies or the app itself', () => {
  for (const bad of ['PayPal', 'Stripe Billing Dept', 'The IRS', 'Bank of America', 'cash app support', 'Global Debt Collectors', 'Paysoon']) {
    assert.ok(impersonationProblem(bad, 'Paysoon'), bad);
  }
  for (const ok of ['Rivera Design Co.', 'Pineapple Studio', 'Purchase Street Bakery', 'Metallic Works', 'Visage Photography']) {
    assert.equal(impersonationProblem(ok, 'Paysoon'), null, ok);
  }
});

test('late fee calculator', () => {
  const result = calculateLateFee({ amount: '1000', currency: 'USD', rate: '1.5', period: 'month', days: '30', flat: '25' });
  assert.equal(result.total, '$1,039.79');
  assert.equal(result.fees, '$39.79');
  assert.ok(calculateLateFee({ amount: 'x', currency: 'USD', rate: '1', period: 'month', days: '3', flat: '' }).error);
  assert.ok(calculateLateFee({ amount: '10', currency: 'USD', rate: '99', period: 'month', days: '3', flat: '' }).error);
});

test('html`` escapes every interpolation unless explicitly marked safe', () => {
  const evil = `<script>alert("x")</script><img src=x onerror='y'>`;
  const out = String(html`<p title="${evil}">${evil}</p>`);
  assert.ok(!out.includes('<script>'));
  assert.ok(!out.includes('<img'));
  assert.ok(out.includes('&lt;script&gt;'));
  assert.equal(String(html`${raw('<b>ok</b>')}`), '<b>ok</b>');
  assert.equal(String(html`${[html`<i>${'<'}</i>`, '&']}`), '<i>&lt;</i>&amp;');
});

test('safeUrl only allows https links', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '#');
  assert.equal(safeUrl('http://example.com'), '#');
  assert.equal(safeUrl('https://user:pw@example.com'), '#');
  assert.equal(safeUrl('https://buy.stripe.com/abc'), 'https://buy.stripe.com/abc');
});

test('amounts parse to integer minor units', () => {
  assert.equal(parseAmount('1,250.50', 'USD'), 125050);
  assert.equal(parseAmount('$99', 'USD'), 9900);
  assert.equal(parseAmount('0.5', 'EUR'), 50);
  assert.equal(parseAmount('25000', 'JPY'), 25000);
  assert.equal(parseAmount('25.5', 'JPY'), null);
  assert.equal(parseAmount('-5', 'USD'), null);
  assert.equal(parseAmount('0', 'USD'), null);
  assert.equal(parseAmount('1e5', 'USD'), null);
  assert.equal(parseAmount('12.345', 'USD'), null);
  assert.equal(formatMoney(125050, 'USD'), '$1,250.50');
});

test('timezone conversion is DST-safe', () => {
  // 9:00 in New York on a summer date = 13:00 UTC, on a winter date = 14:00 UTC.
  assert.equal(new Date(zonedToUtc('2026-07-01', 9, 0, 'America/New_York')).toISOString(), '2026-07-01T13:00:00.000Z');
  assert.equal(new Date(zonedToUtc('2026-12-01', 9, 0, 'America/New_York')).toISOString(), '2026-12-01T14:00:00.000Z');
  assert.equal(new Date(zonedToUtc('2026-07-01', 9, 0, 'Asia/Kolkata')).toISOString(), '2026-07-01T03:30:00.000Z');
  assert.equal(localDate(Date.parse('2026-07-01T23:30:00Z'), 'Asia/Tokyo'), '2026-07-02');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(daysBetween('2026-01-01', '2026-01-31'), 30);
});

test('reminders never land on weekends', () => {
  // 2026-10-17 is a Saturday -> moves to Monday 2026-10-19.
  assert.equal(new Date(stepSendAt('2026-10-17', 0, 'UTC')).toISOString(), '2026-10-19T09:00:00.000Z');
  assert.equal(new Date(stepSendAt('2026-10-21', -3, 'UTC')).toISOString(), '2026-10-19T09:00:00.000Z');
});

test('a brand-new future invoice starts at the first reminder', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  const plan = planSchedule({ dueDate: '2026-10-30', cadence: 'standard', tz: 'UTC', now });
  assert.equal(plan.step, 0);
  assert.equal(new Date(plan.sendAt).toISOString(), '2026-10-27T09:00:00.000Z');
});

test('an already-overdue invoice gets one catch-up reminder soon, not a burst', () => {
  const now = Date.parse('2026-10-14T12:00:00Z'); // Wednesday, noon UTC
  const plan = planSchedule({ dueDate: '2026-10-01', cadence: 'standard', tz: 'UTC', now });
  // Steps: -3, 0, 3, 7 are in the past; the latest (+7) is sent as a catch-up in a few minutes.
  assert.equal(plan.step, 3);
  assert.ok(plan.sendAt > now && plan.sendAt - now <= 10 * 60_000);
  const next = planAfterSend({ dueDate: '2026-10-01', cadence: 'standard', tz: 'UTC', step: 3, now: plan.sendAt });
  assert.equal(next.step, 4);
  assert.ok(next.sendAt - plan.sendAt >= MIN_GAP_MS);
});

test('catch-up is skipped when that reminder was already sent', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const plan = planSchedule({ dueDate: '2026-10-01', cadence: 'standard', tz: 'UTC', now, sentSteps: new Set([3]) });
  assert.equal(plan.step, 4);
  assert.equal(new Date(plan.sendAt).toISOString(), '2026-10-15T09:00:00.000Z');
});

test('a finished sequence schedules nothing', () => {
  const now = Date.parse('2026-12-31T12:00:00Z');
  const plan = planSchedule({ dueDate: '2026-10-01', cadence: 'gentle', tz: 'UTC', now, sentSteps: new Set([3]) });
  assert.equal(plan.sendAt, null);
});

test('tone escalates with lateness', () => {
  assert.equal(stageFor(-3, false), 'upcoming');
  assert.equal(stageFor(0, false), 'due');
  assert.equal(stageFor(3, false), 'overdue');
  assert.equal(stageFor(14, false), 'firm');
  assert.equal(stageFor(30, true), 'final');
});

test('input validation', () => {
  assert.equal(line('a\r\nBcc: x@y.com'), 'a Bcc: x@y.com');
  assert.ok(isEmail('accounts@northwind.co.uk'));
  assert.ok(!isEmail('a@b'));
  assert.ok(!isEmail('a@b.com\nbcc:x@y.com'));
  assert.ok(isHttpsUrl('https://paypal.me/alex'));
  assert.ok(!isHttpsUrl('javascript:alert(1)'));
  assert.ok(!isHttpsUrl('http://paypal.me/alex'));
  assert.equal(safeNext('/app/invoices/4'), '/app/invoices/4');
  assert.equal(safeNext('//evil.com'), null);
  assert.equal(safeNext('/app/../../evil'), null);
  assert.equal(safeNext('https://evil.com'), null);
});

test('passwords are hashed with scrypt and verified', async () => {
  const hash = await hashPassword('correct horse battery');
  assert.match(hash, /^scrypt\$32768\$8\$1\$/);
  assert.ok(await verifyPassword('correct horse battery', hash));
  assert.ok(!(await verifyPassword('wrong horse battery', hash)));
  assert.ok(passwordProblem('short'));
  assert.ok(passwordProblem('password123'));
  assert.equal(passwordProblem('a-long-unique-passphrase'), null);
});

test('Stripe webhook signatures are verified with replay protection', () => {
  const secret = 'whsec_test';
  const body = Buffer.from('{"id":"evt_1"}');
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  assert.ok(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret));
  const tampered = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
  assert.ok(!verifyStripeSignature(body, `t=${t},v1=${tampered}`, secret));
  assert.ok(!verifyStripeSignature(Buffer.from('{"id":"evt_2"}'), `t=${t},v1=${sig}`, secret));
  assert.ok(!verifyStripeSignature(body, `t=${t - 3600},v1=${createHmac('sha256', secret).update(`${t - 3600}.${body}`).digest('hex')}`, secret));
  assert.ok(!verifyStripeSignature(body, '', secret));
});
