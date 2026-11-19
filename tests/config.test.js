import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('loadConfig provides sensible defaults', () => {
  const config = loadConfig({});
  assert.equal(config.port, 3000);
  assert.equal(config.language, 'en');
  assert.equal(typeof config.timeout, 'number');
  assert.equal(config.maxRetries, 3);
  assert.equal(config.proxyUrl, null);
});

test('loadConfig parses custom environment overrides', () => {
  const config = loadConfig({
    PORT: '8080',
    DRAMABOX_LANGUAGE: 'en',
    DRAMABOX_TIMEOUT: '15000',
    DRAMABOX_MAX_RETRIES: '5',
    PROXY_URL: 'http://proxy.example.com:8080'
  });
  assert.equal(config.port, 8080);
  assert.equal(config.language, 'en');
  assert.equal(config.timeout, 15000);
  assert.equal(config.maxRetries, 5);
  assert.equal(config.proxyUrl, 'http://proxy.example.com:8080');
});
