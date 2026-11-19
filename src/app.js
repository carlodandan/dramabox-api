import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/api.js';

export function createApp() {
  const app = express();

  // Permissive CORS middleware for cross-origin API consumers
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'Accept-Ranges'],
    exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges', 'X-Stream-Fallback']
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Root route provides API metadata and available endpoints
  app.get('/', (req, res) => {
    res.json({
      name: 'dramabox-api',
      version: '1.0.0',
      status: 'online',
      description: 'DramaBox REST API & Video Streaming Service',
      documentation: 'https://github.com/carlodandan/ai-drama-mstream',
      endpoints: {
        health: '/api/health',
        ping: '/api/ping',
        token: '/api/token',
        homepage: '/api/homepage',
        latest: '/api/latest',
        trending: '/api/trending',
        recommended: '/api/recommended',
        forYou: '/api/for-you',
        random: '/api/random',
        comingSoon: '/api/coming-soon',
        dubIndo: '/api/dub-indo',
        categories: '/api/categories',
        category: '/api/category/:id',
        search: '/api/search?q=:query',
        searchSuggestions: '/api/search/suggest?q=:query',
        popularSearch: '/api/search/popular',
        dramaDetail: '/api/drama/:bookId',
        related: '/api/drama/:bookId/related',
        chapters: '/api/drama/:bookId/chapters',
        episode: '/api/drama/:bookId/episode/:episode',
        streamUrl: '/api/drama/:bookId/stream-url/:episode',
        stream: '/api/stream/:bookId/:episode'
      }
    });
  });

  // Mount API endpoints
  app.use('/api', apiRouter);

  // 404 handler for all unmatched routes
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      data: null,
      message: `Endpoint ${req.method} ${req.originalUrl} not found`
    });
  });

  // Global Error Handler
  app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err);
    res.status(500).json({
      success: false,
      data: null,
      message: `Internal Server Error: ${err.message}`
    });
  });

  return app;
}
