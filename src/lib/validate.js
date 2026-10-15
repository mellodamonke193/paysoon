// Single-line text: strips control characters (incl. CR/LF, so nothing can smuggle email headers) and collapses whitespace.
export function line(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Multi-line text: keeps newlines, strips other control characters, normalises line endings.
export function multiline(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F\u2028\u2029]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const EMAIL_RE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value) && !value.includes('..');
}

export function isHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.hostname.includes('.');
  } catch {
    return false;
  }
}

export const isId = (value) => typeof value === 'string' && /^\d{1,12}$/.test(value);

// Only same-site app paths are allowed as post-login redirects (no open redirects).
export function safeNext(value) {
  return typeof value === 'string' && /^\/(app|admin)(\/[A-Za-z0-9_-]+)*$/.test(value) ? value : null;
}
