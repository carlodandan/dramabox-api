import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRangeHeader, handleStreamEpisode } from '../src/controllers/streamController.js';

test('parseRangeHeader correctly parses start and end bytes', () => {
  const range = parseRangeHeader('bytes=100-200', 1000);
  assert.equal(range.start, 100);
  assert.equal(range.end, 200);
  assert.equal(range.chunkSize, 101);
});

test('parseRangeHeader handles open-ended range', () => {
  const range = parseRangeHeader('bytes=500-', 1000);
  assert.equal(range.start, 500);
  assert.equal(range.end, 999);
  assert.equal(range.chunkSize, 500);
});

test('parseRangeHeader handles suffix range (last N bytes)', () => {
  const range = parseRangeHeader('bytes=-200', 1000);
  assert.equal(range.start, 800);
  assert.equal(range.end, 999);
  assert.equal(range.chunkSize, 200);
});

test('parseRangeHeader returns null for invalid or unsatisfiable range', () => {
  assert.equal(parseRangeHeader('invalid-header', 1000), null);
  assert.equal(parseRangeHeader('bytes=1500-2000', 1000), null);
  assert.equal(parseRangeHeader('bytes=500-200', 1000), null);
});

test('handleStreamEpisode validates bookId and episode arguments', async () => {
  let statusCode = 0;
  let body = null;
  const mockRes = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      body = data;
      return this;
    }
  };

  await handleStreamEpisode({ params: { bookId: '', episode: '0' } }, mockRes);
  assert.equal(statusCode, 400);
  assert.equal(body.success, false);
});
