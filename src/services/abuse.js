import { config } from '../config.js';
import { get, run } from '../db.js';

// Recipients who asked a sender to stop (or said the invoice isn't theirs) never get reminders from that sender again.
export const isSuppressed = (userId, email) =>
  Boolean(get('SELECT 1 AS x FROM suppressions WHERE user_id = ? AND email = ?', userId, email));

export function suppress(userId, email, reason) {
  run('INSERT OR IGNORE INTO suppressions (user_id, email, reason, created_at) VALUES (?, ?, ?, ?)', userId, email, reason, Date.now());
}

/**
 * Records an "I don't recognize this invoice" report. Once enough *different* recipients report the same
 * sender, that account's sending is suspended automatically until an admin reviews it.
 * Returns true if this report caused (or continued) a suspension.
 */
export function recordAbuseReport(userId, invoiceId, recipient, reason) {
  const now = Date.now();
  run(
    'INSERT INTO abuse_reports (user_id, invoice_id, recipient, reason, created_at) VALUES (?, ?, ?, ?, ?)',
    userId,
    invoiceId,
    recipient,
    reason,
    now,
  );
  const { n } = get(`SELECT COUNT(DISTINCT recipient) AS n FROM abuse_reports WHERE user_id = ? AND reason = 'not_mine'`, userId);
  if (n < config.limits.reportsToSuspend) return false;
  run(
    `UPDATE users SET suspended_at = COALESCE(suspended_at, ?), suspended_reason = COALESCE(suspended_reason, ?), updated_at = ?
      WHERE id = ?`,
    now,
    `${n} different recipients said they don't recognize invoices from this account`,
    now,
    userId,
  );
  console.warn(`[abuse] user ${userId} suspended after ${n} unrecognized-invoice reports`);
  return true;
}

export function unsuspend(userId) {
  run('UPDATE users SET suspended_at = NULL, suspended_reason = NULL, updated_at = ? WHERE id = ?', Date.now(), userId);
  run('DELETE FROM abuse_reports WHERE user_id = ?', userId); // start the count fresh after a review
}
