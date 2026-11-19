import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDramaboxService } from '../src/services/dramaboxService.js';

test('createDramaboxService exposes all required interface methods', () => {
  const service = createDramaboxService({ language: 'en' });
  
  assert.equal(typeof service.getHomepage, 'function');
  assert.equal(typeof service.getLatest, 'function');
  assert.equal(typeof service.getTrending, 'function');
  assert.equal(typeof service.getCategories, 'function');
  assert.equal(typeof service.getCategoryDramas, 'function');
  assert.equal(typeof service.search, 'function');
  assert.equal(typeof service.getDramaDetail, 'function');
  assert.equal(typeof service.getChapters, 'function');
  assert.equal(typeof service.getStreamUrl, 'function');
  assert.equal(typeof service.getToken, 'function');
  assert.equal(typeof service.ping, 'function');
});

test('createDramaboxService formats response envelopes consistently', async () => {
  const mockClient = {
    getCategories: async () => ({
      success: true,
      data: [{ typeTwoId: 123, typeTwoName: 'Romance' }]
    }),
    getDramaDetail: async () => ({
      success: false,
      message: 'Network timeout'
    })
  };

  const service = createDramaboxService({}, mockClient);
  
  const successRes = await service.getCategories(1, 10);
  assert.equal(successRes.success, true);
  assert.deepEqual(successRes.data, [{ typeTwoId: 123, typeTwoName: 'Romance', id: 123, name: 'Romance' }]);

  const failRes = await service.getDramaDetail('999999');
  assert.equal(failRes.success, false);
  assert.match(failRes.message, /Network timeout/);
});

test('getStreamUrl returns the exact zhadevv schema with video details', async () => {
  const service = createDramaboxService();
  const res = await service.getStreamUrl('42000033485', 1);
  assert.equal(res.success, true);
  assert.equal(res.creator, 'zhadevv');
  assert.equal(res.message, null);
  assert.deepEqual(res.metadata, {});
  assert.equal(res.data.status, 'success');
  assert.equal(res.data.apiBy, 'dramabox');
  assert.equal(String(res.data.data.bookId), '42000033485');
  assert.ok(res.data.data.allEps > 0);
  assert.equal(res.data.data.chapter.index, 1);
  assert.ok(res.data.data.chapter.id);
  assert.ok(res.data.data.chapter.video.mp4.includes('.mp4'));
  assert.ok(res.data.data.chapter.video.m3u8 === null || typeof res.data.data.chapter.video.m3u8 === 'string');
});
