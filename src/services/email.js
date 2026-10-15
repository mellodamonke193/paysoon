import { config } from '../config.js';
import { run } from '../db.js';

const displayName = (name) =>
  String(name)
    .replace(/["<>\\\r\n]/g, '')
    .trim()
    .slice(0, 70);

export function fromHeader(name) {
  const clean = displayName(name);
  const address = config.email.from || 'reminders@localhost';
  return clean ? `"${clean}" <${address}>` : address;
}

/**
 * Sends through Resend's HTTP API. Without an API key (local development) emails are printed
 * to the console and stored in email_log so you can click verification links.
 */
export async function deliver({ to, subject, html, text, replyTo, fromName, idempotencyKey, headers }) {
  if (!config.email.resendKey) {
    console.log(`\n✉️  [dev email] to=${to} subject="${subject}"\n${text}\n`);
    return { ok: true, id: null, status: 'logged' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.email.resendKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: fromHeader(fromName || config.appName),
        to: [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(headers ? { headers } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `${res.status} ${body?.message || body?.name || 'send failed'}`.slice(0, 300) };
    return { ok: true, id: body.id || null, status: 'sent' };
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 300) };
  }
}

// Account emails (verification, password reset, notifications). Never throws.
export async function sendSystemEmail({ userId, to, kind, message }) {
  const result = await deliver({ to, ...message, fromName: config.appName, replyTo: config.supportEmail || undefined });
  run(
    `INSERT INTO email_log (user_id, kind, to_email, subject, status, provider_id, error, body_text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId ?? null,
    kind,
    to,
    message.subject,
    result.ok ? result.status : 'failed',
    result.id ?? null,
    result.error ?? null,
    config.isProd ? null : message.text,
    Date.now(),
  );
  if (!result.ok) console.error(`[email] ${kind} to user ${userId} failed: ${result.error}`);
  return result;
}
