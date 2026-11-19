import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('deployment configurations exist and are valid for API deployment', () => {
  // Root deployment configs
  assert.ok(fs.existsSync('vercel.json'), 'vercel.json must exist');
  assert.ok(fs.existsSync('wrangler.toml'), 'wrangler.toml must exist');
  assert.ok(fs.existsSync('_worker.js'), '_worker.js must exist');
  assert.ok(fs.existsSync('api/index.js'), 'api/index.js must exist');

  // Vercel config verification
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.ok(Array.isArray(vercel.rewrites), 'vercel.json must have rewrites');
  assert.equal(vercel.rewrites[0].destination, '/api/index.js');

  // Wrangler config verification
  const wranglerToml = fs.readFileSync('wrangler.toml', 'utf8');
  assert.ok(wranglerToml.includes('main = "_worker.js"'), 'wrangler.toml must specify _worker.js');
  assert.ok(!wranglerToml.includes('[assets]'), 'wrangler.toml must not have web assets binding');
});
