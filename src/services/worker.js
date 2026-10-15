import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../config.js';
import { db, get, all, run } from '../db.js';
import { CADENCES, planAfterSend, stageFor } from '../lib/schedule.js';
import { formatMoney } from '../lib/money.js';
import { daysBetween, localDate, localHour, weekday, DAY, HOUR, MINUTE } from '../lib/time.js';
import { deliver, sendSystemEmail } from './email.js';
import { reminderEmail, digestEmail, senderName } from './templates.js';
import { cycleOf, isPro, logEvent, clientLink, optOutLink, previewStage } from './invoices.js';
import { isSuppressed } from './abuse.js';

const BATCH = 50;
const MAX_FAILURES = 6;

const dailyCap = (user) => (isPro(user) ? config.limits.proDailyEmails : config.limits.freeDailyEmails);
const fromNameFor = (user) => (isPro(user) ? senderName(user) : `${senderName(user)} via ${config.appName}`);

export async function sendReminder(invoiceId, now = Date.now()) {
  // Re-read inside the send path: the user may have paid/paused/deleted since the queue was scanned.
  const invoice = get(`SELECT * FROM invoices WHERE id = ? AND status = 'active' AND next_send_at IS NOT NULL AND next_send_at <= ?`, invoiceId, now);
  if (!invoice) return 'skipped';
  const user = get('SELECT * FROM users WHERE id = ?', invoice.user_id);
  if (!user?.email_verified_at) return 'unverified';
  if (user.suspended_at) return 'suspended';

  if (isSuppressed(user.id, invoice.client_email)) {
    run(`UPDATE invoices SET status = 'paused', next_send_at = NULL, updated_at = ? WHERE id = ?`, now, invoice.id);
    logEvent(invoice.id, 'suppressed');
    return 'suppressed';
  }

  const offsets = CADENCES[invoice.cadence].offsets;
  const step = invoice.next_step;
  if (step >= offsets.length) {
    run('UPDATE invoices SET next_send_at = NULL WHERE id = ?', invoice.id);
    return 'done';
  }

  const sentToday = get(
    `SELECT COUNT(*) AS n FROM email_log WHERE user_id = ? AND kind = 'reminder' AND status IN ('sent','logged','sending') AND created_at > ?`,
    user.id,
    now - DAY,
  ).n;
  if (sentToday >= dailyCap(user)) {
    run('UPDATE invoices SET next_send_at = ? WHERE id = ?', now + HOUR, invoice.id);
    return 'capped';
  }

  const daysLate = daysBetween(invoice.due_date, localDate(now, user.timezone));
  const stage = stageFor(daysLate, step === offsets.length - 1);
  const message = reminderEmail({
    invoice,
    user,
    stage,
    daysLate,
    link: clientLink(invoice),
    optOutLink: optOutLink(invoice),
    branded: !isPro(user),
  });
  const dedupeKey = `reminder:${invoice.id}:${cycleOf(invoice)}:${step}`;

  // Claim the step before calling the provider so a crash or a second process can never double-send.
  let logId;
  try {
    logId = run(
      `INSERT INTO email_log (user_id, invoice_id, kind, dedupe_key, cycle, step, to_email, subject, status, body_text, created_at)
       VALUES (?, ?, 'reminder', ?, ?, ?, ?, ?, 'sending', ?, ?)`,
      user.id,
      invoice.id,
      dedupeKey,
      cycleOf(invoice),
      step,
      invoice.client_email,
      message.subject,
      config.isProd ? null : message.text,
      now,
    ).lastInsertRowid;
  } catch {
    const existing = get('SELECT status FROM email_log WHERE dedupe_key = ?', dedupeKey);
    if (existing?.status === 'sending' || existing?.status === 'failed') {
      // A previous attempt was interrupted. Leave it for the stuck-claim sweeper.
      run('UPDATE invoices SET next_send_at = ? WHERE id = ?', now + 15 * MINUTE, invoice.id);
      return 'pending';
    }
    const next = planAfterSend({ dueDate: invoice.due_date, cadence: invoice.cadence, tz: user.timezone, step, now });
    run('UPDATE invoices SET next_step = ?, next_send_at = ?, updated_at = ? WHERE id = ?', next.step, next.sendAt, now, invoice.id);
    return 'duplicate';
  }

  const result = await deliver({
    to: invoice.client_email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    headers: message.headers,
    replyTo: user.reply_to || user.email,
    fromName: fromNameFor(user),
    idempotencyKey: dedupeKey,
  });

  if (result.ok) {
    const next = planAfterSend({ dueDate: invoice.due_date, cadence: invoice.cadence, tz: user.timezone, step, now });
    db.exec('BEGIN');
    try {
      run('UPDATE email_log SET status = ?, provider_id = ? WHERE id = ?', result.status, result.id, logId);
      run(
        `UPDATE invoices SET reminders_sent = reminders_sent + 1, last_sent_at = ?, next_step = ?, next_send_at = ?,
                send_failures = 0, updated_at = ? WHERE id = ?`,
        now,
        next.step,
        next.sendAt,
        now,
        invoice.id,
      );
      logEvent(invoice.id, 'reminder_sent', message.subject);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return 'sent';
  }

  // Failed: release the claim and retry with exponential backoff; pause after repeated failures.
  const failures = invoice.send_failures + 1;
  run('DELETE FROM email_log WHERE id = ?', logId);
  if (failures >= MAX_FAILURES) {
    run(`UPDATE invoices SET status = 'paused', next_send_at = NULL, send_failures = ?, updated_at = ? WHERE id = ?`, failures, now, invoice.id);
    logEvent(invoice.id, 'send_failed', `Paused after ${failures} failed attempts: ${result.error}`);
  } else {
    run('UPDATE invoices SET send_failures = ?, next_send_at = ? WHERE id = ?', failures, now + 15 * MINUTE * 2 ** (failures - 1), invoice.id);
    logEvent(invoice.id, 'send_retry', result.error);
  }
  console.error(`[worker] invoice ${invoice.id} step ${step} failed: ${result.error}`);
  return 'failed';
}

/** Sends the next reminder to the user's own inbox, marked as a test. Nothing on the invoice changes. */
export async function sendTestEmail(invoice, user, now = Date.now()) {
  const { stage, daysLate } = previewStage(invoice, user);
  const message = reminderEmail({
    invoice,
    user,
    stage,
    daysLate,
    link: clientLink(invoice),
    optOutLink: optOutLink(invoice),
    branded: !isPro(user),
    test: true,
  });
  const result = await deliver({
    to: user.email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: user.reply_to || user.email,
    fromName: fromNameFor(user),
  });
  run(
    `INSERT INTO email_log (user_id, invoice_id, kind, to_email, subject, status, provider_id, error, body_text, created_at)
     VALUES (?, ?, 'test', ?, ?, ?, ?, ?, ?, ?)`,
    user.id,
    invoice.id,
    user.email,
    message.subject,
    result.ok ? result.status : 'failed',
    result.id ?? null,
    result.error ?? null,
    config.isProd ? null : message.text,
    now,
  );
  return result.ok;
}

export async function runQueue(now = Date.now()) {
  const due = all(
    `SELECT i.id FROM invoices i JOIN users u ON u.id = i.user_id
      WHERE i.status = 'active' AND i.next_send_at IS NOT NULL AND i.next_send_at <= ?
        AND u.email_verified_at IS NOT NULL AND u.suspended_at IS NULL
      ORDER BY i.next_send_at LIMIT ?`,
    now,
    BATCH,
  );
  const results = [];
  for (const { id } of due) {
    try {
      results.push(await sendReminder(id, now));
    } catch (err) {
      console.error(`[worker] invoice ${id}:`, err);
    }
  }
  return results;
}

const sumByCurrency = (rows) => rows.map((r) => formatMoney(r.total, r.currency)).join(' + ');

export function digestSummary(user, now = Date.now()) {
  const today = localDate(now, user.timezone);
  const overdue = all(
    `SELECT currency, COUNT(*) AS n, SUM(amount_minor) AS total FROM invoices
      WHERE user_id = ? AND status IN ('active','paused') AND due_date < ? GROUP BY currency`,
    user.id,
    today,
  );
  const paid = all(
    `SELECT currency, COUNT(*) AS n, SUM(amount_minor) AS total FROM invoices
      WHERE user_id = ? AND status = 'paid' AND paid_at >= ? GROUP BY currency`,
    user.id,
    now - 7 * DAY,
  );
  return {
    overdueCount: overdue.reduce((n, r) => n + r.n, 0),
    overdueTotal: sumByCurrency(overdue),
    paidCount: paid.reduce((n, r) => n + r.n, 0),
    paidTotal: sumByCurrency(paid),
    remindersSent: get(
      `SELECT COUNT(*) AS n FROM email_log WHERE user_id = ? AND kind = 'reminder' AND status IN ('sent','logged') AND created_at >= ?`,
      user.id,
      now - 7 * DAY,
    ).n,
    upcomingCount: get(
      `SELECT COUNT(*) AS n FROM invoices WHERE user_id = ? AND status = 'active' AND next_send_at IS NOT NULL AND next_send_at < ?`,
      user.id,
      now + 7 * DAY,
    ).n,
  };
}

/** Monday-morning summary (8 AM or later in each user's timezone), at most once every 6 days. */
export async function sendDigests(now = Date.now(), maxPerRun = 50) {
  const candidates = all(
    `SELECT * FROM users u
      WHERE u.weekly_digest = 1 AND u.email_verified_at IS NOT NULL AND u.suspended_at IS NULL
        AND (u.last_digest_at IS NULL OR u.last_digest_at < ?)
        AND EXISTS (SELECT 1 FROM invoices i WHERE i.user_id = u.id)`,
    now - 6 * DAY,
  );
  let sent = 0;
  for (const user of candidates) {
    if (sent >= maxPerRun) break;
    if (weekday(localDate(now, user.timezone)) !== 1 || localHour(now, user.timezone) < 8) continue;
    run('UPDATE users SET last_digest_at = ? WHERE id = ?', now, user.id); // claim first so it can never double-send
    await sendSystemEmail({
      userId: user.id,
      to: user.email,
      kind: 'digest',
      message: digestEmail({ summary: digestSummary(user, now), url: `${config.appUrl}/app`, settingsUrl: `${config.appUrl}/app/settings` }),
    });
    sent++;
  }
  return sent;
}

function sweepStuckClaims(now) {
  // A 'sending' row older than 30 minutes means the process died mid-send. Resend it is the safer side:
  // the provider-level idempotency key prevents an actual duplicate if the first attempt went through.
  run(`DELETE FROM email_log WHERE kind = 'reminder' AND status IN ('sending','failed') AND created_at < ?`, now - 30 * MINUTE);
}

const BACKUP_RE = /^backup-\d{4}-\d{2}-\d{2}\.db$/;

function backupDatabase(now) {
  if (!config.backupsEnabled || config.dbPath === ':memory:') return;
  const dir = join(dirname(config.dbPath), 'backups');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `backup-${new Date(now).toISOString().slice(0, 10)}.db`);
  if (existsSync(file)) return;
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const backups = readdirSync(dir).filter((f) => BACKUP_RE.test(f)).sort();
  for (const old of backups.slice(0, -14)) unlinkSync(join(dir, old));
  console.log(`[worker] backup written: ${file}`);
}

let lastMaintenance = 0;
function maintenance(now) {
  if (now - lastMaintenance < 6 * HOUR) return;
  lastMaintenance = now;
  run('DELETE FROM sessions WHERE expires_at < ?', now);
  run('DELETE FROM auth_tokens WHERE expires_at < ?', now - DAY);
  run(`DELETE FROM email_log WHERE kind != 'reminder' AND created_at < ?`, now - 90 * DAY);
  run('DELETE FROM stripe_events WHERE created_at < ?', now - 30 * DAY);
  try {
    backupDatabase(now);
  } catch (err) {
    console.error('[worker] backup failed:', err);
  }
}

let timer = null;
let running = false;
let lastDigestRun = 0;

async function tick() {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    sweepStuckClaims(now);
    await runQueue(now);
    if (now - lastDigestRun >= 15 * MINUTE) {
      lastDigestRun = now;
      await sendDigests(now);
    }
    maintenance(now);
  } catch (err) {
    console.error('[worker] tick failed:', err);
  } finally {
    running = false;
  }
}

export function startWorker() {
  if (!config.workerEnabled || timer) return;
  timer = setInterval(tick, config.workerIntervalMs);
  timer.unref();
  setTimeout(tick, 3000).unref();
}

export function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
