import { Router } from 'express';
import { createDramaController } from '../controllers/dramaController.js';
import { handleStreamEpisode, handleProxyVideo } from '../controllers/streamController.js';
import { dramaboxService as defaultService } from '../services/dramaboxService.js';

export function createApiRouter(service = defaultService) {
  const router = Router();
  const controller = createDramaController(service);

  // Health and Diagnostic
  router.get('/health', controller.getHealth);
  router.get('/ping', controller.getPing);
  router.get('/token', controller.getToken);

  // Discovery & Feeds
  router.get('/homepage', controller.getHomepage);
  router.get('/latest', controller.getLatest);
  router.get('/trending', controller.getTrending);
  router.get('/recommended', controller.getRecommendedBooks);
  router.get('/vip', controller.getVip);
  router.get('/for-you', controller.getForYou);
  router.get('/random', controller.getRandomDrama);
  router.get('/coming-soon', controller.getComingSoon);
  router.get('/dub-indo', controller.getDubIndo);

  // Categories
  router.get('/categories', controller.getCategories);
  router.get('/category/:id', controller.getCategoryDramas);

  // Search
  router.get('/search', controller.searchDramas);
  router.get('/search/suggest', controller.getSearchSuggestions);
  router.get('/search/popular', controller.getPopularSearch);

  // Drama Details & Episodes
  router.get('/drama/:bookId', controller.getDramaDetail);
  router.get('/drama/:bookId/related', controller.getRelatedDramas);
  router.get('/drama/:bookId/chapters', controller.getChapters);
  router.get('/drama/:bookId/episode/:episode', controller.getEpisodeDetails);
  router.get('/drama/:bookId/stream-url/:episode', controller.getStreamUrl);
  router.get('/drama/:bookId/batch-download', controller.batchDownload);

  // Video Streaming Proxy (Range, CORS, piped playback)
  router.get('/stream/:bookId/:episode', (req, res) => handleStreamEpisode(req, res, service));
  router.get('/proxy/video', handleProxyVideo);

  return router;
}

export const apiRouter = createApiRouter();
