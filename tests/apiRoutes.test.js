import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createApiRouter } from '../src/routes/api.js';

test('GET /api/health returns status and config info', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter());

  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'online');
});

test('GET /api/token returns token payload from service', async () => {
  const mockService = {
    getToken: async () => ({
      success: true,
      data: { token: 'mock-test-token-123' }
    })
  };

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter(mockService));

  const res = await request(app).get('/api/token');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.token, 'mock-test-token-123');
});

test('GET /api/categories delegates to service and returns category list', async () => {
  const mockService = {
    getCategories: async (page, size) => ({
      success: true,
      data: [{ typeTwoId: 1, typeTwoName: 'Action' }]
    })
  };

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter(mockService));

  const res = await request(app).get('/api/categories?page=1&pageSize=10');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, [{ typeTwoId: 1, typeTwoName: 'Action' }]);
});

test('GET /api/category/undefined gracefully falls back to latest dramas without 500 error', async () => {
  const mockService = {
    getLatest: async () => ({
      success: true,
      data: [{ bookId: '101', bookName: 'Fallback Drama' }]
    })
  };

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter(mockService));

  const res = await request(app).get('/api/category/undefined?page=1&pageSize=20');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, [{ bookId: '101', bookName: 'Fallback Drama' }]);
});

test('GET /api/drama/:bookId/episode/:episode includes proxy streamUrl', async () => {
  const mockService = {
    getEpisodeDetails: async (bookId, ep) => ({
      success: true,
      data: {
        bookId,
        chapterIndex: ep,
        title: `Episode ${ep}`
      }
    }),
    getStreamUrl: async () => ({
      success: true,
      data: 'https://cdn.example.com/video.mp4'
    })
  };

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter(mockService));

  const res = await request(app).get('/api/drama/42000000001/episode/1');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.match(res.body.data.streamUrl, /\/api\/stream\/42000000001\/1/);
});
