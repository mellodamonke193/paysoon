import { randomBytes, createHash, createHmac, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from './http.js';

const scryptRaw = promisify(scryptCb);

// Password hashing is deliberately expensive. Cap how many run at once and how many may wait, so a flood of
// logins from many IPs turns into quick "try again" errors instead of exhausting CPU and memory.
const MAX_ACTIVE_HASHES = 4;
const MAX_QUEUED_HASHES = 64;
let activeHashes = 0;
const hashQueue = [];

async function scrypt(...args) {
  if (activeHashes < MAX_ACTIVE_HASHES) {
    activeHashes++;
  } else {
    if (hashQueue.length >= MAX_QUEUED_HASHES) throw new HttpError(503, "We're very busy right now. Please try again in a moment.");
    await new Promise((resolve) => hashQueue.push(resolve)); // the releasing caller hands its slot over
  }
  try {
    return await scryptRaw(...args);
  } finally {
    const next = hashQueue.shift();
    if (next) next();
    else activeHashes--;
  }
}

// scrypt with N=2^15, r=8 (~32 MB, ~100 ms per hash): memory-hard, built into Node, no native deps.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const KEY_LENGTH = 32;

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const hmac = (key, value) => createHmac('sha256', key).update(value).digest('base64url');

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64url');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return timingSafeEqual(key, expected);
}

// Spend the same time on unknown emails as on real ones so login timing can't reveal accounts.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword(randomToken());
  await verifyPassword(password, dummyHash);
  return false;
}

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', '1234567890', '12345678910',
  'qwertyuiop', 'qwerty1234', 'iloveyou12', 'letmein123', 'welcome123', 'admin12345', 'abc1234567',
  '1q2w3e4r5t', 'passw0rd123', 'trustno1234', 'football123', 'baseball123', 'changeme123',
]);

export function passwordProblem(password, email = '') {
  if (typeof password !== 'string' || password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 200) return 'Use 200 characters or fewer.';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(password)) return 'That password is too common. Pick something harder to guess.';
  if (email && lower.includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) {
    return "Don't include your email address in your password.";
  }
  return null;
}

// Sender names that could pass emails off as a famous brand, a government agency or a collection agency.
// Matching whole words avoids false positives like "Pineapple Studio" or "Purchase Co".
const BRAND_WORDS = new Set([
  'paypal', 'stripe', 'venmo', 'zelle', 'apple', 'amazon', 'google', 'microsoft', 'facebook', 'instagram', 'meta',
  'netflix', 'chase', 'citi', 'citibank', 'hsbc', 'barclays', 'santander', 'irs', 'hmrc', 'usps', 'fedex', 'dhl',
  'intuit', 'quickbooks', 'xero', 'freshbooks', 'docusign', 'coinbase', 'binance', 'visa', 'mastercard', 'amex',
]);
const BRAND_PHRASES = [
  'cashapp', 'wellsfargo', 'bankofamerica', 'americanexpress', 'internalrevenue', 'taxoffice', 'debtcollect',
  'collectionagency', 'collectionsagency', 'collectionsdepartment', 'debtrecovery', 'recoveryagency',
];

export function impersonationProblem(name, appName = '') {
  const words = String(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const compact = words.replace(/ /g, '');
  const app = String(appName).toLowerCase().replace(/[^a-z0-9]/g, '');
  const hit =
    words.split(' ').some((w) => BRAND_WORDS.has(w)) ||
    BRAND_PHRASES.some((p) => compact.includes(p)) ||
    (app.length >= 4 && compact.includes(app));
  return hit
    ? 'Please use your own business name. Names that look like another company, a bank, a government agency or a collection agency are not allowed.'
    : null;
}

// In-memory fixed-window rate limiter. The app runs as a single process (SQLite), so this is authoritative.
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    if (buckets.size > 200_000) buckets.clear();
    bucket = { count: 0, reset: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  return bucket.count <= max;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.reset <= now) buckets.delete(key);
}, 60_000).unref();
