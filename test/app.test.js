import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import http from 'node:http';

const dir = mkdtempSync(join(tmpdir(), 'paysoon-test-'));
Object.assign(process.env, {
  APP_NO_DOTENV: '1',
  DATABASE_PATH: join(dir, 'test.db'),
  WORKER_DISABLED: '1',
  BACKUPS_DISABLED: '1',
  APP_URL: 'http://localhost:3999',
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
  STRIPE_PRICE_PRO: 'price_dummy',
  TRUST_PROXY: '1',
});

const { createApp } = await import('../src/app.js');
const { get, run } = await import('../src/db.js');
const { runQueue, sendDigests } = await import('../src/services/worker.js');

let server;
let base;

before(async () => {
  server = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

let ipCounter = 0;

// Each simulated browser gets its own client IP (via the trusted proxy header) so per-IP rate limits behave realistically.
class Browser {
  cookies = new Map();
  ip = `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

  async request(method, path, { form, headers = {} } = {}) {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const init = { method, redirect: 'manual', headers: { 'x-forwarded-for': this.ip, ...(cookie ? { cookie } : {}), ...headers } };
    if (form) {
      init.headers['content-type'] = 'application/x-www-form-urlencoded';
      init.body = new URLSearchParams(form).toString();
    }
    const res = await fetch(base + path, init);
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      if (/Max-Age=0/.test(c)) this.cookies.delete(pair.slice(0, eq));
      else this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    return { status: res.status, location: res.headers.get('location'), text: await res.text(), headers: res.headers };
  }

  get(path) {
    return this.request('GET', path);
  }

  async token() {
    const page = await this.get('/forgot');
    return /name="_csrf" value="([^"]+)"/.exec(page.text)[1];
  }

  async post(path, form = {}, headers) {
    return this.request('POST', path, { form: { _csrf: await this.token(), ...form }, headers });
  }
}

let counter = 0;
async function signUp({ verify = true } = {}) {
  const b = new Browser();
  const email = `user${++counter}@example.com`;
  const res = await b.post('/signup', {
    business_name: `Studio ${counter}`,
    email,
    password: 'a-very-good-passphrase',
    timezone: 'UTC',
    agree: 'yes',
  });
  assert.equal(res.status, 303, res.text.slice(0, 500));
  const user = get('SELECT * FROM users WHERE email = ?', email);
  if (verify) run('UPDATE users SET email_verified_at = ? WHERE id = ?', Date.now(), user.id);
  return { b, user, email };
}

const isoDaysFromNow = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const invoiceForm = (overrides = {}) => ({
  client_name: 'Northwind Studio',
  client_email: 'accounts@northwind.example',
  number: 'INV-1042',
  amount: '2400.00',
  currency: 'USD',
  issue_date: '',
  due_date: isoDaysFromNow(10),
  payment_url: 'https://buy.stripe.com/test_123',
  note: '',
  message: '',
  cadence: 'standard',
  ...overrides,
});

async function createInvoice(b, overrides) {
  const res = await b.post('/app/invoices', invoiceForm(overrides));
  assert.equal(res.status, 303, res.text.slice(0, 800));
  return Number(/\/app\/invoices\/(\d+)/.exec(res.location)[1]);
}

const tokenOf = (id) => get('SELECT public_token FROM invoices WHERE id = ?', id).public_token;

test('public pages render with security headers', async () => {
  const b = new Browser();
  const pages = [
    '/', '/signup', '/login', '/tools/late-payment-email', '/tools/late-fee-calculator', '/templates',
    '/templates/friendly-payment-reminder', '/templates/final-payment-reminder', '/guides/how-to-ask-for-payment',
    '/terms', '/privacy', '/acceptable-use', '/dpa', '/sitemap.xml', '/robots.txt', '/.well-known/security.txt',
  ];
  for (const path of pages) {
    const res = await b.get(path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  }
  assert.equal((await b.get('/templates/nope')).status, 404);
  assert.equal((await b.get('/app')).status, 303);
  assert.equal((await b.get('/does-not-exist')).status, 404);
});

test('trailing-slash redirect can never become an open redirect', async () => {
  const { port } = server.address();
  const location = await new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: '/x/..//evil.com/' }, (res) => {
        res.resume();
        resolve(res.headers.location);
      })
      .on('error', reject);
  });
  assert.equal(location, '/evil.com');
});

test('late fee calculator does the math', async () => {
  const res = await new Browser().get('/tools/late-fee-calculator?amount=1000&currency=USD&rate=1.5&period=month&days=30&flat=');
  assert.match(res.text, /\$1,014\.79/);
});

test('signup creates a session and sends a working verification link', async () => {
  const { b, user, email } = await signUp({ verify: false });
  const dash = await b.get('/app');
  assert.equal(dash.status, 200);
  assert.match(dash.text, /Confirm your email/);
  assert.match(dash.text, /Getting started/);
  const row = get('SELECT terms_accepted_at, terms_version FROM users WHERE id = ?', user.id);
  assert.ok(row.terms_accepted_at && row.terms_version, 'terms acceptance is recorded');
  const mail = get(`SELECT body_text FROM email_log WHERE kind = 'verify' AND to_email = ? ORDER BY id DESC`, email);
  const token = /verify\?token=([A-Za-z0-9_-]+)/.exec(mail.body_text)[1];
  const res = await b.get(`/verify?token=${token}`);
  assert.equal(res.location, '/app?m=verified');
  assert.ok(get('SELECT email_verified_at FROM users WHERE id = ?', user.id).email_verified_at);
  assert.equal((await b.get(`/verify?token=${token}`)).status, 410, 'tokens are single-use');
});

test('signup requires agreeing to the terms and rejects impersonating sender names', async () => {
  const b = new Browser();
  const fields = { email: 'fresh@example.com', password: 'a-very-good-passphrase', timezone: 'UTC' };
  const noAgree = await b.post('/signup', { ...fields, business_name: 'Fresh Studio' });
  assert.equal(noAgree.status, 422);
  assert.match(noAgree.text, /Please confirm/);
  for (const name of ['PayPal Billing', 'IRS Payments', 'Wells Fargo Team', 'Acme Collection Agency', 'Paysoon Support']) {
    const res = await b.post('/signup', { ...fields, business_name: name, agree: 'yes' });
    assert.equal(res.status, 422, name);
    assert.match(res.text, /own business name/, name);
  }
  const ok = await b.post('/signup', { ...fields, business_name: 'Pineapple Purchase Studio', agree: 'yes' });
  assert.equal(ok.status, 303, 'no false positives for ordinary names');
});

test('duplicate signups and weak passwords are rejected', async () => {
  const { email } = await signUp();
  const b = new Browser();
  assert.equal((await b.post('/signup', { business_name: 'X', email, password: 'a-very-good-passphrase', agree: 'yes' })).status, 422);
  assert.equal((await b.post('/signup', { business_name: 'X', email: 'new@example.com', password: 'password123', agree: 'yes' })).status, 422);
});

test('login works, wrong passwords fail, and brute force is rate limited', async () => {
  const { email } = await signUp();
  const b = new Browser();
  assert.equal((await b.post('/login', { email, password: 'wrong-password!' })).status, 401);
  const ok = await b.post('/login', { email, password: 'a-very-good-passphrase' });
  assert.equal(ok.status, 303);
  assert.equal((await b.get('/app')).status, 200);
  const attacker = new Browser();
  let last;
  for (let i = 0; i < 12; i++) last = await attacker.post('/login', { email, password: `guess-${i}-xxxxxx` });
  assert.equal(last.status, 429);
});

test('CSRF: posts without a valid token or from another origin are refused', async () => {
  const { b } = await signUp();
  const noToken = await b.request('POST', '/app/invoices', { form: invoiceForm() });
  assert.equal(noToken.status, 403);
  const badToken = await b.request('POST', '/app/invoices', { form: { ...invoiceForm(), _csrf: 'forged' } });
  assert.equal(badToken.status, 403);
  const crossSite = await b.post('/app/invoices', invoiceForm(), { origin: 'https://evil.example' });
  assert.equal(crossSite.status, 403);
  const fetchMeta = await b.post('/app/invoices', invoiceForm(), { 'sec-fetch-site': 'cross-site' });
  assert.equal(fetchMeta.status, 403);
});

test('user input is escaped everywhere (no stored XSS)', async () => {
  const { b } = await signUp();
  const payload = `<script>alert(1)</script>"><img src=x onerror=alert(2)>`;
  const id = await createInvoice(b, { client_name: payload, number: 'X"><b>1', note: payload, message: payload });
  const detail = await b.get(`/app/invoices/${id}`);
  assert.equal(detail.status, 200);
  assert.ok(!detail.text.includes('<script>alert(1)'));
  assert.ok(!detail.text.includes('<img src=x'));
  assert.ok(detail.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  const client = await new Browser().get(`/i/${tokenOf(id)}`);
  assert.ok(!client.text.includes('<script>alert(1)'));
});

test('invoices are invisible and immutable to other accounts', async () => {
  const alice = await signUp();
  const mallory = await signUp();
  const id = await createInvoice(alice.b);
  assert.equal((await mallory.b.get(`/app/invoices/${id}`)).status, 404);
  assert.equal((await mallory.b.get(`/app/invoices/${id}/edit`)).status, 404);
  for (const action of ['paid', 'pause', 'delete', 'edit', 'test', 'send-now', 'resume', 'reopen']) {
    assert.equal((await mallory.b.post(`/app/invoices/${id}/${action}`, invoiceForm())).status, 404, action);
  }
  const prefill = await mallory.b.get(`/app/invoices/new?from=${id}`);
  assert.ok(!prefill.text.includes('accounts@northwind.example'), "can't prefill from someone else's invoice");
  assert.equal(get('SELECT status FROM invoices WHERE id = ?', id).status, 'active');
});

test('invalid invoice input is rejected with helpful errors', async () => {
  const { b } = await signUp();
  const res = await b.post('/app/invoices', invoiceForm({ client_email: 'nope', amount: 'abc', payment_url: 'javascript:alert(1)', cadence: 'persistent' }));
  assert.equal(res.status, 422);
  assert.match(res.text, /valid email/);
  assert.match(res.text, /https:\/\/ payment link/);
  assert.match(res.text, /Pro cadence/);
});

test('free plan is limited to 3 open invoices', async () => {
  const { b } = await signUp();
  for (let i = 0; i < 3; i++) await createInvoice(b, { number: `N-${i}` });
  const fourth = await b.post('/app/invoices', invoiceForm({ number: 'N-4' }));
  assert.equal(fourth.location, '/app/billing?m=limit');
  assert.equal((await b.get('/app/invoices/new')).location, '/app/billing?m=limit');
});

test('overdue invoice: reminder is sent once, then the next one is scheduled', async () => {
  const { b } = await signUp();
  const id = await createInvoice(b, { due_date: isoDaysFromNow(-10), message: 'Thanks again for the project!' });
  let invoice = get('SELECT * FROM invoices WHERE id = ?', id);
  assert.ok(invoice.next_send_at, 'catch-up reminder scheduled');
  const sendTime = invoice.next_send_at + 1000;

  const results = await runQueue(sendTime);
  assert.ok(results.includes('sent'));
  const log = get(`SELECT * FROM email_log WHERE invoice_id = ? AND kind = 'reminder'`, id);
  assert.equal(log.to_email, 'accounts@northwind.example');
  assert.match(log.subject, /overdue/);
  assert.match(log.body_text, new RegExp(`/i/${invoice.public_token}`));
  assert.match(log.body_text, new RegExp(`/u/${invoice.public_token}`), 'every reminder has an unsubscribe link');
  assert.match(log.body_text, /not a collection agency/);
  assert.match(log.body_text, /Thanks again for the project!/, 'personal message is included');
  assert.match(log.body_text, /Sent with Paysoon/, 'free plan emails are branded');

  invoice = get('SELECT * FROM invoices WHERE id = ?', id);
  assert.equal(invoice.reminders_sent, 1);
  assert.ok(invoice.next_send_at - sendTime >= 20 * 3600_000, 'next reminder respects the minimum gap');

  // Running the queue again at the same moment must not double-send.
  await runQueue(sendTime);
  assert.equal(get(`SELECT COUNT(*) AS n FROM email_log WHERE invoice_id = ? AND kind = 'reminder'`, id).n, 1);

  const detail = await b.get(`/app/invoices/${id}`);
  assert.match(detail.text, /Sent /);
});

test('email copy never threatens or misleads', async () => {
  const { reminderCopy, copyToText } = await import('../src/services/templates.js');
  for (const stage of ['upcoming', 'due', 'overdue', 'firm', 'final']) {
    const copy = reminderCopy({ clientName: 'Jo', number: '1', amount: '$1', dueDate: '2026-01-01', daysLate: 30, stage, sign: 'A' });
    const text = `${copy.subject}\n${copyToText(copy, 'L').join('\n')}`.toLowerCase();
    for (const banned of ['legal action', 'lawyer', 'attorney', 'court', 'collection agency', 'credit report', 'other channels', 'second notice']) {
      assert.ok(!text.includes(banned), `${stage} must not say "${banned}"`);
    }
  }
});

test('send now and send-me-a-test', async () => {
  const { b, user, email } = await signUp();
  const id = await createInvoice(b, { due_date: isoDaysFromNow(10) });

  const test1 = await b.post(`/app/invoices/${id}/test`);
  assert.match(test1.location, /m=test_sent/);
  const testMail = get(`SELECT * FROM email_log WHERE kind = 'test' AND user_id = ?`, user.id);
  assert.equal(testMail.to_email, email, 'test goes to the user, never the client');
  assert.match(testMail.subject, /^\[Test\]/);
  assert.equal(get('SELECT reminders_sent FROM invoices WHERE id = ?', id).reminders_sent, 0, 'a test changes nothing');

  const now1 = await b.post(`/app/invoices/${id}/send-now`);
  assert.match(now1.location, /m=sent_now/);
  assert.equal(get('SELECT reminders_sent FROM invoices WHERE id = ?', id).reminders_sent, 1);
  const now2 = await b.post(`/app/invoices/${id}/send-now`);
  assert.match(now2.location, /m=too_soon/, 'cannot spam the client');
});

test('unverified accounts never send reminders', async () => {
  const { b } = await signUp({ verify: false });
  const id = await createInvoice(b, { due_date: isoDaysFromNow(-5) });
  const invoice = get('SELECT * FROM invoices WHERE id = ?', id);
  await runQueue(invoice.next_send_at + 1000);
  assert.equal(get(`SELECT COUNT(*) AS n FROM email_log WHERE invoice_id = ?`, id).n, 0);
  assert.match((await b.post(`/app/invoices/${id}/test`)).location, /m=verify_first/);
});

test('marking paid stops reminders', async () => {
  const { b } = await signUp();
  const id = await createInvoice(b, { due_date: isoDaysFromNow(-5) });
  const before = get('SELECT * FROM invoices WHERE id = ?', id);
  assert.equal((await b.post(`/app/invoices/${id}/paid`)).status, 303);
  const after = get('SELECT * FROM invoices WHERE id = ?', id);
  assert.equal(after.status, 'paid');
  assert.equal(after.next_send_at, null);
  await runQueue(before.next_send_at + 1000);
  assert.equal(get(`SELECT COUNT(*) AS n FROM email_log WHERE invoice_id = ? AND kind = 'reminder'`, id).n, 0);
});

test('client page: view tracking and one-click "I\'ve paid" pauses reminders', async () => {
  const { b, user } = await signUp();
  const id = await createInvoice(b);
  const token = tokenOf(id);
  const client = new Browser();
  const page = await client.get(`/i/${token}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /\$2,400\.00/);
  assert.match(page.text, /noindex/);
  assert.equal(get('SELECT view_count FROM invoices WHERE id = ?', id).view_count, 1);
  const claim = await client.post(`/i/${token}/paid`);
  assert.equal(claim.status, 303);
  const invoice = get('SELECT * FROM invoices WHERE id = ?', id);
  assert.equal(invoice.status, 'paused');
  assert.ok(invoice.client_claimed_at);
  assert.ok(get(`SELECT 1 AS x FROM email_log WHERE kind = 'client_claimed' AND user_id = ?`, user.id));
  assert.equal((await client.get('/i/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).status, 404);
});

test('one-click unsubscribe (RFC 8058) stops all reminders to that address for good', async () => {
  const { b, user } = await signUp();
  const id = await createInvoice(b, { due_date: isoDaysFromNow(-3) });
  const token = tokenOf(id);
  assert.match((await new Browser().get(`/u/${token}`)).text, /Unsubscribe/);
  const res = await fetch(`${base}/u/${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click',
  });
  assert.equal(res.status, 200);
  assert.ok(get('SELECT 1 AS x FROM suppressions WHERE user_id = ? AND email = ?', user.id, 'accounts@northwind.example'));
  const invoice = get('SELECT * FROM invoices WHERE id = ?', id);
  assert.equal(invoice.status, 'paused');
  assert.match((await b.post(`/app/invoices/${id}/resume`)).location, /m=suppressed/, 'owner cannot resume after an opt-out');
  assert.ok(get(`SELECT 1 AS x FROM email_log WHERE kind = 'client_stop' AND user_id = ?`, user.id), 'owner is notified');
});

test('repeated "I don\'t recognize this invoice" reports auto-suspend the sender', async () => {
  const { b, user } = await signUp();
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push(await createInvoice(b, { number: `S-${i}`, client_email: `victim${i}@example.org`, due_date: isoDaysFromNow(-4) }));
  for (const id of ids) {
    const res = await new Browser().post(`/i/${tokenOf(id)}/report`, { reason: 'not_mine' });
    assert.match(res.location, /done=not_mine/);
  }
  assert.ok(get('SELECT suspended_at FROM users WHERE id = ?', user.id).suspended_at, 'account is suspended');
  // Even if an invoice were somehow active and due, a suspended account sends nothing.
  run(`UPDATE invoices SET status = 'active', next_send_at = ? WHERE id = ?`, Date.now() - 1000, ids[0]);
  await runQueue(Date.now());
  assert.equal(get(`SELECT COUNT(*) AS n FROM email_log WHERE invoice_id = ? AND kind = 'reminder'`, ids[0]).n, 0);
  assert.match((await b.get('/app')).text, /Sending is paused/);
});

test('client can flag a wrong invoice; reminders pause and the owner is told', async () => {
  const { b, user } = await signUp();
  const id = await createInvoice(b);
  const res = await new Browser().post(`/i/${tokenOf(id)}/report`, { reason: 'wrong' });
  assert.match(res.location, /done=wrong/);
  const invoice = get('SELECT * FROM invoices WHERE id = ?', id);
  assert.equal(invoice.status, 'paused');
  assert.ok(invoice.disputed_at);
  assert.ok(get(`SELECT 1 AS x FROM email_log WHERE kind = 'client_wrong' AND user_id = ?`, user.id));
  assert.equal((await new Browser().post(`/i/${tokenOf(id)}/report`, { reason: 'bogus' })).status, 400);
});

test('weekly digest goes out on Monday morning, once', async () => {
  const { b, user } = await signUp();
  await createInvoice(b, { due_date: isoDaysFromNow(-2) });
  const monday = new Date();
  monday.setUTCHours(9, 0, 0, 0);
  while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1);
  await sendDigests(monday.getTime(), 1000);
  assert.equal(get(`SELECT COUNT(*) AS n FROM email_log WHERE kind = 'digest' AND user_id = ?`, user.id).n, 1);
  await sendDigests(monday.getTime() + 60_000, 1000);
  assert.equal(get(`SELECT COUNT(*) AS n FROM email_log WHERE kind = 'digest' AND user_id = ?`, user.id).n, 1);
});

test('data export contains the account and invoices, never secrets', async () => {
  const { b, email } = await signUp();
  await createInvoice(b);
  const res = await b.get('/app/settings/export');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /attachment/);
  const data = JSON.parse(res.text);
  assert.equal(data.account.email, email);
  assert.equal(data.invoices.length, 1);
  assert.ok(!res.text.includes('password_hash'));
  assert.ok(!res.text.includes('scrypt$'));
});

function stripeRequest(event, secret = 'whsec_dummy') {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return fetch(`${base}/webhooks/stripe`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` }, body });
}

test('Stripe webhooks: signed events upgrade/downgrade, forged or replayed ones do nothing', async () => {
  const { user } = await signUp();
  const sub = (status, created, id) => ({
    id,
    type: status === 'canceled' ? 'customer.subscription.deleted' : 'customer.subscription.updated',
    created,
    data: { object: { id: 'sub_1', customer: 'cus_1', status, metadata: { user_id: String(user.id) }, current_period_end: created + 2592000 } },
  });

  const forged = await stripeRequest(sub('active', 1000, 'evt_forged'), 'whsec_wrong');
  assert.equal(forged.status, 400);
  assert.equal(get('SELECT plan FROM users WHERE id = ?', user.id).plan, 'free');

  assert.equal((await stripeRequest(sub('active', 1000, 'evt_a'))).status, 200);
  assert.equal(get('SELECT plan FROM users WHERE id = ?', user.id).plan, 'pro');

  assert.equal((await stripeRequest(sub('canceled', 2000, 'evt_b'))).status, 200);
  assert.equal(get('SELECT plan FROM users WHERE id = ?', user.id).plan, 'free');

  // An older event arriving late must not re-upgrade the account.
  assert.equal((await stripeRequest(sub('active', 1500, 'evt_c'))).status, 200);
  assert.equal(get('SELECT plan FROM users WHERE id = ?', user.id).plan, 'free');

  // Replaying an already-processed event id is a no-op.
  run(`UPDATE users SET plan = 'free', stripe_event_at = 0 WHERE id = ?`, user.id);
  assert.equal((await stripeRequest(sub('active', 1000, 'evt_a'))).status, 200);
  assert.equal(get('SELECT plan FROM users WHERE id = ?', user.id).plan, 'free');
});

test('settings: profile update, password change, account deletion', async () => {
  const { b, user, email } = await signUp();
  assert.equal(
    (await b.post('/app/settings', { business_name: 'Rivera Design', reply_to: 'billing@rivera.example', signature: 'Alex', timezone: 'Europe/London', weekly_digest: 'yes' })).status,
    303,
  );
  assert.equal(get('SELECT timezone FROM users WHERE id = ?', user.id).timezone, 'Europe/London');
  assert.equal((await b.post('/app/settings', { business_name: 'X', timezone: 'Mars/Base' })).status, 422);
  assert.equal((await b.post('/app/settings', { business_name: 'Stripe Payments', timezone: 'UTC' })).status, 422);
  assert.equal((await b.post('/app/settings', { business_name: 'Rivera Design', timezone: 'UTC' })).status, 303);
  assert.equal(get('SELECT weekly_digest FROM users WHERE id = ?', user.id).weekly_digest, 0, 'digest can be turned off');
  assert.equal((await b.post('/app/settings/password', { current_password: 'nope-nope-nope', new_password: 'another-good-passphrase' })).status, 422);
  assert.equal((await b.post('/app/settings/password', { current_password: 'a-very-good-passphrase', new_password: 'another-good-passphrase' })).status, 303);
  assert.equal((await b.get('/app')).status, 200, 'current session survives a password change');
  await createInvoice(b);
  assert.equal((await b.post('/app/settings/delete', { confirm_password: 'another-good-passphrase' })).status, 303);
  assert.equal(get('SELECT 1 AS x FROM users WHERE email = ?', email), undefined);
  assert.equal(get('SELECT COUNT(*) AS n FROM invoices WHERE user_id = ?', user.id).n, 0);
});

test('password reset flow', async () => {
  const { email } = await signUp();
  const b = new Browser();
  await b.post('/forgot', { email });
  const mail = get(`SELECT body_text FROM email_log WHERE kind = 'reset' AND to_email = ? ORDER BY id DESC`, email);
  const token = /reset\?token=([A-Za-z0-9_-]+)/.exec(mail.body_text)[1];
  assert.equal((await b.get(`/reset?token=${token}`)).status, 200);
  assert.equal((await b.post('/reset', { token, password: 'brand-new-passphrase' })).location, '/login?m=password_reset');
  assert.equal((await b.post('/reset', { token, password: 'brand-new-passphrase-2' })).status, 410, 'reset tokens are single-use');
  assert.equal((await b.post('/login', { email, password: 'brand-new-passphrase' })).status, 303);
});
