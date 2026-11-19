import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

test('App includes CORS headers and mounts /api routes', async () => {
  const app = createApp();

  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], '*');
  assert.equal(res.body.success, true);
});

test('App returns 404 JSON for unknown API routes', async () => {
  const app = createApp();

  const res = await request(app).get('/api/non-existent-route');
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
});

test('App returns API root metadata JSON on GET /', async () => {
  const app = createApp();

  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'dramabox-api');
  assert.equal(res.body.status, 'online');
  assert.ok(res.body.endpoints);
  assert.equal(res.body.endpoints.health, '/api/health');
});
