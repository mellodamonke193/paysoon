// Auto-escaping HTML templates. Every interpolated value is escaped unless it is
// explicitly marked safe (the result of another html`` call, or raw() on trusted markup).

const ESCAPE_RE = /[&<>"'`=]/g;
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '=': '&#61;' };

export class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export const escapeHtml = (value) => String(value).replace(ESCAPE_RE, (c) => ESCAPES[c]);
export const raw = (value) => new SafeHtml(String(value));

function render(value) {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

// Only https links ever make it into an href built from user input.
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '#';
  } catch {
    return '#';
  }
}
