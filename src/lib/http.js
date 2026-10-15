import { config } from '../config.js';

export const STATUS_TEXT = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Page not found',
  405: 'Method not allowed',
  413: 'Request too large',
  415: 'Unsupported content type',
  422: 'Please check the form',
  429: 'Too many requests',
  500: 'Something went wrong',
  503: 'Service unavailable',
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message || STATUS_TEXT[status] || 'Error');
    this.status = status;
  }
}

export class Redirect extends Error {
  constructor(location) {
    super('redirect');
    this.location = location;
  }
}

export class Router {
  routes = [];

  add(method, path, handler, opts = {}) {
    const keys = [];
    const pattern = path.replace(/[.]/g, '\\.').replace(/:([a-zA-Z_]+)/g, (_, key) => {
      keys.push(key);
      return '([A-Za-z0-9_-]{1,128})';
    });
    this.routes.push({ method, re: new RegExp(`^${pattern}$`), keys, handler, opts });
  }

  get(path, handler, opts) {
    this.add('GET', path, handler, opts);
  }

  post(path, handler, opts) {
    this.add('POST', path, handler, opts);
  }

  match(method, pathname) {
    const wanted = method === 'HEAD' ? 'GET' : method;
    let pathMatched = false;
    for (const route of this.routes) {
      const hit = route.re.exec(pathname);
      if (!hit) continue;
      pathMatched = true;
      if (route.method !== wanted) continue;
      const params = {};
      route.keys.forEach((key, i) => (params[key] = hit[i + 1]));
      return { route, params };
    }
    return pathMatched ? 'method-not-allowed' : null;
  }
}

function parseCookies(header) {
  const out = Object.create(null);
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key && !(key in out)) out[key] = part.slice(eq + 1).trim();
  }
  return out;
}

function serializeCookie(name, value, { maxAge, httpOnly = true, sameSite = 'Lax' } = {}) {
  let cookie = `${name}=${value}; Path=/; SameSite=${sameSite}`;
  if (maxAge !== undefined) cookie += `; Max-Age=${Math.floor(maxAge)}`;
  if (httpOnly) cookie += '; HttpOnly';
  if (config.secure) cookie += '; Secure';
  return cookie;
}

function clientIp(req) {
  if (config.trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // The right-most entry is the one appended by our own (trusted) proxy.
    if (forwarded.length) return forwarded[forwarded.length - 1];
  }
  return req.socket.remoteAddress || 'unknown';
}

export class Context {
  constructor(req, res) {
    this.req = req;
    this.res = res;
    this.method = req.method;
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      url = new URL('http://localhost/__invalid__');
    }
    this.path = url.pathname;
    this.query = url.searchParams;
    this.cookies = parseCookies(String(req.headers.cookie || ''));
    this.ip = clientIp(req);
    this.params = {};
    this.user = null;
    this.sessionHash = null;
    this.outCookies = [];
    this._raw = null;
    this._form = null;
    this._csrf = null;
  }

  header(name) {
    const value = this.req.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }

  async rawBody(limit = 64 * 1024) {
    if (this._raw) return this._raw;
    if (Number(this.req.headers['content-length'] || 0) > limit) throw new HttpError(413);
    const chunks = [];
    let size = 0;
    for await (const chunk of this.req) {
      size += chunk.length;
      if (size > limit) throw new HttpError(413);
      chunks.push(chunk);
    }
    this._raw = Buffer.concat(chunks);
    return this._raw;
  }

  async form() {
    if (this._form) return this._form;
    const type = String(this.header('content-type') || '').toLowerCase();
    if (!type.startsWith('application/x-www-form-urlencoded')) throw new HttpError(415);
    const params = new URLSearchParams((await this.rawBody()).toString('utf8'));
    const out = Object.create(null);
    for (const [key, value] of params) if (!(key in out)) out[key] = value;
    this._form = out;
    return out;
  }

  setCookie(name, value, opts) {
    this.outCookies.push(serializeCookie(name, value, opts));
  }

  clearCookie(name) {
    this.outCookies.push(serializeCookie(name, '', { maxAge: 0 }));
  }

  send(status, body, headers = {}) {
    if (this.res.headersSent) return;
    if (this.outCookies.length) this.res.setHeader('Set-Cookie', this.outCookies);
    for (const [key, value] of Object.entries(headers)) this.res.setHeader(key, value);
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''));
    this.res.statusCode = status;
    this.res.setHeader('Content-Length', buffer.length);
    this.res.end(this.method === 'HEAD' ? undefined : buffer);
  }

  html(body, status = 200) {
    this.send(status, String(body), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  }

  text(body, status = 200, headers = {}) {
    this.send(status, body, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  }

  json(value, status = 200) {
    this.send(status, JSON.stringify(value), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  }

  redirect(location, status = 303) {
    this.send(status, '', { Location: location, 'Cache-Control': 'no-store' });
  }
}

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  ...(config.secure ? ['upgrade-insecure-requests'] : []),
].join('; ');

export function applySecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  if (config.secure) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
}
