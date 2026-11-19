import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../_worker.js';

const mockEnv = {
  DRAMABOX_LANGUAGE: 'en'
};

test('Edge Worker: GET / returns API root metadata JSON', async () => {
  const req = new Request('http://localhost/');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/json');
  const json = await res.json();
  assert.equal(json.name, 'dramabox-api');
  assert.equal(json.status, 'online');
  assert.ok(json.endpoints);
  assert.equal(json.endpoints.health, '/api/health');
});

test('Edge Worker: GET /api/categories returns category list', async () => {
  const req = new Request('http://localhost/api/categories');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
  assert.ok(json.data.length > 0);
  assert.ok(json.data[0].id !== undefined);
});

test('Edge Worker: GET /api/category/undefined gracefully falls back to default browse', async () => {
  const req = new Request('http://localhost/api/category/undefined');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
});

test('Edge Worker: GET /api/trending returns drama records', async () => {
  const req = new Request('http://localhost/api/trending');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
  assert.ok(json.data.length > 0);
});

test('Edge Worker: GET /api/recommended returns drama records', async () => {
  const req = new Request('http://localhost/api/recommended');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
});

test('Edge Worker: GET /api/for-you returns drama records', async () => {
  const req = new Request('http://localhost/api/for-you');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
});

test('Edge Worker: GET /api/random returns a drama object', async () => {
  const req = new Request('http://localhost/api/random');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(json.data);
  assert.ok(json.data.bookId || json.data.id);
});

test('Edge Worker: GET /api/coming-soon returns upcoming dramas', async () => {
  const req = new Request('http://localhost/api/coming-soon');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
});

test('Edge Worker: GET /api/dub-indo returns dubbed dramas', async () => {
  const req = new Request('http://localhost/api/dub-indo');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
});

test('Edge Worker: GET /api/homepage returns combined sections', async () => {
  const req = new Request('http://localhost/api/homepage');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(json.data);
  assert.ok('trending' in json.data);
  assert.ok('recommended' in json.data);
  assert.ok('latest' in json.data);
});

test('Edge Worker: GET /api/search with keyword returns results', async () => {
  const req = new Request('http://localhost/api/search?keyword=cinta');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
});

test('Edge Worker: GET /api/drama/:bookId returns drama details', async () => {
  const req = new Request('http://localhost/api/drama/42000033485');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(json.data);
  assert.equal(String(json.data.bookId || json.data.id), '42000033485');
});

test('Edge Worker: GET /api/drama/:bookId/related returns related dramas', async () => {
  const req = new Request('http://localhost/api/drama/42000033485/related');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
});

test('Edge Worker: GET /api/stream/:bookId/:episode handles Range request with real video', async () => {
  const req = new Request('http://localhost/api/stream/42000033485/1', {
    headers: { Range: 'bytes=0-1023' }
  });
  const res = await worker.fetch(req, mockEnv);
  assert.ok(res.status === 206 || res.status === 200);
  assert.equal(res.headers.get('Accept-Ranges'), 'bytes');
  assert.ok(res.headers.get('Content-Type')?.includes('video/mp4'));
  assert.equal(res.headers.get('X-Real-Video'), 'true');
});

test('Edge Worker: GET /api/drama/:bookId/stream-url/:episode returns exact zhadevv stream schema', async () => {
  const req = new Request('http://localhost/api/drama/42000033485/stream-url/1');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.creator, 'zhadevv');
  assert.equal(json.data.status, 'success');
  assert.equal(json.data.apiBy, 'dramabox');
  assert.equal(String(json.data.data.bookId), '42000033485');
  assert.ok(json.data.data.allEps > 0);
  assert.equal(json.data.data.chapter.index, 1);
  assert.ok(json.data.data.chapter.id);
  assert.ok(json.data.data.chapter.video.mp4.includes('.mp4'));
  assert.ok(json.data.data.chapter.video.m3u8 === null || typeof json.data.data.chapter.video.m3u8 === 'string');
});

test('Edge Worker: returns 404 JSON for unknown routes', async () => {
  const req = new Request('http://localhost/unknown/route');
  const res = await worker.fetch(req, mockEnv);
  assert.equal(res.status, 404);
  const json = await res.json();
  assert.equal(json.success, false);
});
