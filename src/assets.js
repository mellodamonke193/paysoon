import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { HttpError } from './lib/http.js';

// Fixed allow-list served from memory: no filesystem paths ever come from the request.
const TYPES = {
  'app.css': 'text/css; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8',
  'favicon.svg': 'image/svg+xml',
};

const assets = new Map();
for (const [name, type] of Object.entries(TYPES)) {
  const body = readFileSync(new URL(`../public/${name}`, import.meta.url));
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
  assets.set(name, { body, type, hash, etag: `"${hash}"` });
}

export const assetUrl = (name) => `/assets/${name}?v=${assets.get(name).hash}`;

export function serveAsset(ctx, name) {
  const asset = assets.get(name);
  if (!asset) throw new HttpError(404);
  const headers = {
    'Content-Type': asset.type,
    ETag: asset.etag,
    'Cache-Control': ctx.query.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  };
  if (ctx.header('if-none-match') === asset.etag) return ctx.send(304, '', headers);
  ctx.send(200, asset.body, headers);
}
