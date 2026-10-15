import { config } from '../config.js';
import { get, run } from '../db.js';
import { HttpError, Redirect } from './http.js';
import { randomToken, sha256, hmac, safeEqual } from './security.js';
import { DAY } from './time.js';

const SESSION_TTL = 30 * DAY;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function createSession(ctx, userId) {
  const token = randomToken(32);
  const now = Date.now();
  run('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', sha256(token), userId, now, now + SESSION_TTL);
  ctx.setCookie(config.cookies.session, token, { maxAge: SESSION_TTL / 1000 });
}

export function destroySession(ctx) {
  const token = ctx.cookies[config.cookies.session];
  if (token && TOKEN_RE.test(token)) run('DELETE FROM sessions WHERE id_hash = ?', sha256(token));
  ctx.clearCookie(config.cookies.session);
}

export function loadSession(ctx) {
  const token = ctx.cookies[config.cookies.session];
  if (!token || !TOKEN_RE.test(token)) return;
  const idHash = sha256(token);
  const row = get(
    `SELECT u.*, s.expires_at AS session_expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id_hash = ?`,
    idHash,
  );
  const now = Date.now();
  if (!row || row.session_expires_at <= now) return;
  // Sliding expiry: active users stay signed in.
  if (row.session_expires_at - now < SESSION_TTL / 2) {
    run('UPDATE sessions SET expires_at = ? WHERE id_hash = ?', now + SESSION_TTL, idHash);
    ctx.setCookie(config.cookies.session, token, { maxAge: SESSION_TTL / 1000 });
  }
  delete row.password_hash;
  delete row.session_expires_at;
  ctx.user = row;
  ctx.sessionHash = idHash;
}

export function requireUser(ctx) {
  if (!ctx.user) {
    const next = ctx.method === 'GET' ? `?next=${encodeURIComponent(ctx.path)}` : '';
    throw new Redirect(`/login${next}`);
  }
  return ctx.user;
}

export const isAdmin = (user) =>
  Boolean(user && config.adminEmail && user.email_verified_at && user.email.toLowerCase() === config.adminEmail);

// CSRF: signed double-submit token bound to a random per-browser cookie, plus Origin / Fetch-Metadata checks.
export function csrfToken(ctx) {
  if (ctx._csrf) return ctx._csrf;
  let seed = ctx.cookies[config.cookies.csrf];
  if (!seed || !TOKEN_RE.test(seed)) {
    seed = randomToken(32);
    ctx.cookies[config.cookies.csrf] = seed;
    ctx.setCookie(config.cookies.csrf, seed, { maxAge: 365 * 24 * 3600 });
  }
  ctx._csrf = hmac(config.secretKey, `csrf:${seed}`);
  return ctx._csrf;
}

export async function verifyCsrf(ctx) {
  const site = ctx.header('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'Cross-site request blocked.');
  const origin = ctx.header('origin');
  if (origin && origin !== config.appOrigin) throw new HttpError(403, 'Cross-site request blocked.');
  const seed = ctx.cookies[config.cookies.csrf];
  const form = await ctx.form();
  const expected = seed && TOKEN_RE.test(seed) ? hmac(config.secretKey, `csrf:${seed}`) : null;
  if (!expected || typeof form._csrf !== 'string' || !safeEqual(form._csrf, expected)) {
    throw new HttpError(403, 'This form expired. Go back, refresh the page and try again.');
  }
}

// One-time tokens for email verification and password resets. Only hashes are stored.
export function issueToken(userId, kind, ttlMs) {
  const token = randomToken(32);
  const now = Date.now();
  run(
    'INSERT INTO auth_tokens (hash, user_id, kind, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    sha256(token),
    userId,
    kind,
    now + ttlMs,
    now,
  );
  return token;
}

export function peekToken(token, kind) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const row = get('SELECT * FROM auth_tokens WHERE hash = ? AND kind = ?', sha256(token), kind);
  if (!row || row.used_at || row.expires_at <= Date.now()) return null;
  return row;
}

export function consumeToken(token, kind) {
  const row = peekToken(token, kind);
  if (!row) return null;
  const { changes } = run('UPDATE auth_tokens SET used_at = ? WHERE hash = ? AND used_at IS NULL', Date.now(), row.hash);
  return changes ? row : null;
}
