import { dramaboxService as defaultService } from '../services/dramaboxService.js';
import { config } from '../config.js';

export function createDramaController(service = defaultService) {
  return {
    async getHealth(req, res) {
      res.json({
        success: true,
        data: {
          status: 'online',
          package: '@zhadev/dramabox',
          packageVersion: '0.0.2',
          language: config.language,
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        }
      });
    },

    async getPing(req, res) {
      const result = await service.ping();
      res.status(result.success ? 200 : 502).json(result);
    },

    async getToken(req, res) {
      const result = await service.getToken();
      res.status(result.success ? 200 : (result.metadata?.reason ? 403 : 502)).json(result);
    },

    async getHomepage(req, res) {
      const result = await service.getHomepage();
      res.status(result.success ? 200 : 502).json(result);
    },

    async getLatest(req, res) {
      const page = parseInt(req.query.page || '1', 10);
      const result = await service.getLatest(page);
      res.status(result.success ? 200 : 502).json(result);
    },

    async getTrending(req, res) {
      const result = await service.getTrending();
      res.status(result.success ? 200 : 502).json(result);
    },

    async getVip(req, res) {
      const result = await service.getVip();
      res.status(result.success ? 200 : 502).json(result);
    },

    async getForYou(req, res) {
      const page = parseInt(req.query.page || '1', 10);
      const result = await service.getForYou(page);
      res.status(result.success ? 200 : 502).json(result);
    },

    async getRandomDrama(req, res) {
      const result = await service.getRandomDrama();
      res.status(result.success ? 200 : 502).json(result);
    },

    async getComingSoon(req, res) {
      const result = await service.getComingSoon();
      res.status(result.success ? 200 : 502).json(result);
    },

    async getRecommendedBooks(req, res) {
      const result = await service.getRecommendedBooks();
      res.status(result.success ? 200 : 502).json(result);
    },

    async getDubIndo(req, res) {
      const classify = req.query.classify || '1';
      const page = parseInt(req.query.page || '1', 10);
      const pageSize = parseInt(req.query.pageSize || '15', 10);
      const result = await service.getDubIndo(classify, page, pageSize);
      res.status(result.success ? 200 : 502).json(result);
    },

    async getCategories(req, res) {
      const page = parseInt(req.query.page || '1', 10);
      const pageSize = parseInt(req.query.pageSize || '20', 10);
      const result = await service.getCategories(page, pageSize);
      res.status(result.success ? 200 : 502).json(result);
    },

    async getCategoryDramas(req, res) {
      const rawId = req.params.id;
      const page = parseInt(req.query.page || '1', 10);
      const pageSize = parseInt(req.query.pageSize || '10', 10);

      // Handle unselected / undefined category gracefully by returning latest
      if (!rawId || rawId === 'undefined' || rawId === 'null' || rawId === '0') {
        const result = await service.getLatest(page);
        return res.json(result);
      }

      const typeTwoId = parseInt(rawId, 10);
      if (isNaN(typeTwoId)) {
        return res.status(400).json({ success: false, data: [], message: 'Invalid category ID: must be a number' });
      }

      const result = await service.getCategoryDramas(typeTwoId, page, pageSize);
      res.status(result.success ? 200 : 502).json(result);
    },

    async searchDramas(req, res) {
      const query = req.query.q || req.query.keyword;
      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ success: false, data: null, message: 'Search query parameter "q" is required' });
      }
      const page = parseInt(req.query.page || '1', 10);
      const pageSize = parseInt(req.query.pageSize || '10', 10);
      const result = await service.search(query.trim(), page, pageSize);
      res.status(result.success ? 200 : 502).json(result);
    },

    async getSearchSuggestions(req, res) {
      const query = req.query.q || req.query.keyword || '';
      const result = await service.getSearchSuggestions(query);
      res.status(result.success ? 200 : 502).json(result);
    },

    async getPopularSearch(req, res) {
      const result = await service.getPopularSearch();
      res.status(result.success ? 200 : 502).json(result);
    },

    async getDramaDetail(req, res) {
      const { bookId } = req.params;
      if (!bookId) {
        return res.status(400).json({ success: false, data: null, message: 'bookId is required' });
      }
      const result = await service.getDramaDetail(bookId);
      res.status(result.success ? 200 : 404).json(result);
    },

    async getRelatedDramas(req, res) {
      const { bookId } = req.params;
      const result = await service.getRelatedDramas(bookId);
      res.status(result.success ? 200 : 502).json(result);
    },

    async getChapters(req, res) {
      const { bookId } = req.params;
      const result = await service.getChapters(bookId);
      res.status(result.success ? 200 : 502).json(result);
    },

    async getEpisodeDetails(req, res) {
      const { bookId, episode } = req.params;
      const episodeIndex = parseInt(episode, 10);
      if (!bookId || isNaN(episodeIndex) || episodeIndex < 1) {
        return res.status(400).json({ success: false, data: null, message: 'Invalid bookId or episode index' });
      }

      const result = await service.getEpisodeDetails(bookId, episodeIndex);
      if (result.success && result.data) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        result.data.streamUrl = `${baseUrl}/api/stream/${bookId}/${episodeIndex}`;
      }
      res.status(result.success ? 200 : 404).json(result);
    },

    async getStreamUrl(req, res) {
      const { bookId, episode } = req.params;
      const episodeIndex = parseInt(episode, 10);
      if (!bookId || isNaN(episodeIndex) || episodeIndex < 1) {
        return res.status(400).json({ success: false, data: null, message: 'Invalid bookId or episode index' });
      }

      const result = await service.getStreamUrl(bookId, episodeIndex);
      res.status(result.success ? 200 : 404).json(result);
    },

    async batchDownload(req, res) {
      const { bookId } = req.params;
      const result = await service.batchDownload(bookId);
      res.status(result.success ? 200 : 502).json(result);
    }
  };
}
