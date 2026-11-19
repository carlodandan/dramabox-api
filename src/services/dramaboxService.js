import { DramaboxClient, config as defaultSdkConfig } from '@zhadev/dramabox';
import { config } from '../config.js';

/**
 * Normalizes book entity across both sapi and webfic payloads.
 */
function normalizeBook(book) {
  if (!book) return null;
  return {
    id: book.bookId || book.id,
    bookId: book.bookId || book.id,
    bookName: book.bookName || book.title || '',
    cover: book.cover || book.coverWap || '',
    coverWap: book.coverWap || book.cover || '',
    introduction: book.introduction || book.description || '',
    chapterCount: book.chapterCount || book.totalEpisodes || 0,
    totalEpisodes: book.totalEpisodes || book.chapterCount || 0,
    playCount: book.playCount || book.viewCountDisplay || 0,
    tags: Array.isArray(book.tagV3s)
      ? book.tagV3s.map(t => (typeof t === 'string' ? t : t.tagName || t.name))
      : (book.typeTwoNames || book.tags || []),
    status: book.isEnd === 1 || book.status === 'completed' ? 'completed' : 'ongoing',
    language: book.language || config.language
  };
}

const nodeChapterCache = new Map();

async function fetchRealDramaChapters(bookId) {
  if (!bookId) return null;
  const cacheKey = String(bookId);
  const cached = nodeChapterCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < 300000)) {
    return cached.data;
  }

  try {
    const res = await fetch(`https://www.dramaboxdb.com/ep/${bookId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;

    const text = await res.text();
    const tag = '<script id="__NEXT_DATA__" type="application/json">';
    const idx = text.indexOf(tag);
    if (idx === -1) return null;

    const end = text.indexOf('</script>', idx);
    const data = JSON.parse(text.substring(idx + tag.length, end));
    const pageProps = data.props?.pageProps;
    const rawChapters = pageProps?.chapterList || [];

    const chapters = rawChapters.map((ch, i) => ({
      chapterId: ch.id,
      chapterIndex: ch.index !== undefined ? ch.index + 1 : i + 1,
      chapterName: ch.name || `Episode ${i + 1}`,
      title: ch.name || `Episode ${i + 1}`,
      cover: ch.cover || '',
      duration: ch.duration || 0,
      isLocked: !ch.unlock,
      mp4: ch.mp4 || null,
      m3u8Url: ch.m3u8Url || null,
      videoPath: ch.mp4 || `/api/stream/${bookId}/${i + 1}`
    }));

    const result = {
      bookInfo: pageProps?.bookInfo,
      totalEpisodes: chapters.length,
      chapters
    };
    nodeChapterCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  } catch {
    return null;
  }
}

export function formatStreamUrlPayload(bookId, allEps, chapterId, episodeIndex, mp4Url, m3u8Url = null) {
  return {
    success: true,
    creator: "zhadevv",
    data: {
      status: "success",
      apiBy: "dramabox",
      data: {
        bookId: String(bookId),
        allEps: Number(allEps),
        chapter: {
          id: String(chapterId),
          index: Number(episodeIndex),
          video: {
            mp4: mp4Url,
            m3u8: m3u8Url
          }
        }
      }
    },
    metadata: {},
    message: null
  };
}

/**
 * Standard API response envelope.
 */
function wrapResult(res) {
  if (!res) {
    return { success: false, data: null, message: 'No response from upstream service' };
  }
  return {
    success: res.success ?? true,
    data: res.data !== undefined ? res.data : null,
    message: res.message || (res.success ? 'Success' : 'Upstream error'),
    metadata: res.metadata || {}
  };
}

/**
 * Factory for Dramabox service layer with caching and fallback support.
 */
export function createDramaboxService(options = {}, injectedClient = null) {
  const serviceConfig = {
    language: options.language || config.language || 'en',
    timeout: options.timeout || config.timeout || 30000,
    maxRetries: options.maxRetries || config.maxRetries || 3,
    token: options.token || process.env.DRAMABOX_BEARER_TOKEN || null
  };

  const client = injectedClient || new DramaboxClient(serviceConfig);

  const service = {
    /**
     * Retrieves cached or generated token, with environment override fallback.
     */
    async getToken() {
      if (serviceConfig.token || process.env.DRAMABOX_BEARER_TOKEN) {
        return wrapResult({
          success: true,
          data: {
            token: serviceConfig.token || process.env.DRAMABOX_BEARER_TOKEN,
            source: 'environment_override'
          }
        });
      }

      try {
        const token = await client.getToken();
        return wrapResult({ success: true, data: token });
      } catch (err) {
        return wrapResult({
          success: false,
          data: null,
          message: err.message,
          metadata: {
            reason: 'sapi.dramaboxdb.com returned 403 Forbidden (Akamai EdgeSuite WAF). Non-mobile/datacenter IPs are blocked from bootstrapping tokens.',
            tip: 'You can provide DRAMABOX_BEARER_TOKEN in .env if you have an active session token, or use the unblocked catalog & webfic endpoints.'
          }
        });
      }
    },

    async ping() {
      try {
        const res = await client.ping();
        return wrapResult(res);
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    },

    async getCategories(page = 1, pageSize = 30) {
      try {
        let res = null;
        try {
          res = await client.getCategories(page, pageSize);
        } catch {
          // ignore sapi error
        }

        const hasValidCategory = res && res.success && Array.isArray(res.data) && res.data.length > 0 && (res.data[0]?.id !== undefined || res.data[0]?.typeTwoId !== undefined);

        // Fallback to webfic browse if categories list is empty or items have undefined IDs (known @zhadev/dramabox v0.0.2 issue)
        if (!hasValidCategory && typeof client.webficRequest === 'function') {
          const webficRes = await client.webficRequest('/webfic/home/browse', {
            typeTwoId: 0,
            pageNo: page,
            pageSize
          }, 'POST');

          if (webficRes && webficRes.data && Array.isArray(webficRes.data.types)) {
            const types = webficRes.data.types
              .filter(t => t && (t.id !== undefined || t.typeTwoId !== undefined))
              .map(t => ({
                id: t.id ?? t.typeTwoId,
                typeTwoId: t.id ?? t.typeTwoId,
                name: t.name || t.typeTwoName || t.typeName || '',
                typeTwoName: t.name || t.typeTwoName || t.typeName || '',
                typeName: t.name || t.typeTwoName || t.typeName || '',
                categoryName: t.name || t.typeTwoName || t.typeName || ''
              }));
            return wrapResult({ success: true, data: types });
          }
        }

        // Normalize ids if valid categories returned
        if (res && res.data && Array.isArray(res.data)) {
          res.data = res.data
            .filter(item => item && (item.id !== undefined || item.typeTwoId !== undefined))
            .map(item => ({
              ...item,
              id: item.id ?? item.typeTwoId,
              typeTwoId: item.id ?? item.typeTwoId,
              name: item.name || item.typeTwoName || item.typeName,
              typeTwoName: item.typeTwoName || item.typeName || item.name
            }));
        }

        return wrapResult(res);
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    },

    async getBooksByCategory(typeTwoId, page = 1, pageSize = 20) {
      try {
        let res = await client.getBooksByCategory(typeTwoId, page, pageSize);

        // Fallback to webfic/home/browse if sapi returns empty
        if ((!res || !res.success || !res.data || (Array.isArray(res.data) && res.data.length === 0)) && typeof client.webficRequest === 'function') {
          const webficRes = await client.webficRequest('/webfic/home/browse', {
            typeTwoId: Number(typeTwoId),
            pageNo: page,
            pageSize
          }, 'POST');

          if (webficRes && webficRes.data && Array.isArray(webficRes.data.bookList)) {
            const books = webficRes.data.bookList.map(normalizeBook);
            return wrapResult({ success: true, data: books });
          }
        }

        if (res && res.data) {
          if (Array.isArray(res.data)) {
            res.data = res.data.map(normalizeBook);
          } else if (Array.isArray(res.data.records)) {
            res.data.records = res.data.records.map(normalizeBook);
          }
        }
        return wrapResult(res);
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    },

    async getLatest(page = 1) {
      try {
        let res = null;
        try {
          res = await client.getLatest(page);
        } catch {
          // ignore sapi error
        }

        if (!res || !res.success || !res.data || (Array.isArray(res.data) && res.data.length === 0) || (res.data?.records && res.data.records.length === 0)) {
          // Fallback to general browse from web gateway
          return service.getBooksByCategory(0, page, 15);
        }

        if (res && res.data && Array.isArray(res.data.records)) {
          res.data.records = res.data.records.map(normalizeBook);
        }
        return wrapResult(res);
      } catch (err) {
        return service.getBooksByCategory(0, page, 15);
      }
    },

    async getTrending() {
      try {
        let res = null;
        try {
          res = await client.getTrending();
        } catch {
          // ignore sapi error
        }

        if (!res || !res.success || !res.data || (Array.isArray(res.data.records) && res.data.records.length === 0)) {
          // Fallback to top popular category
          return service.getBooksByCategory(534, 1, 15);
        }

        if (res && res.data && Array.isArray(res.data.records)) {
          res.data.records = res.data.records.map(normalizeBook);
        }
        return wrapResult(res);
      } catch (err) {
        return service.getBooksByCategory(534, 1, 15);
      }
    },

    async getVip() {
      try {
        const res = await client.getVip();
        return wrapResult(res);
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    },

    async getForYou(page = 1) {
      try {
        let res = null;
        try {
          res = await client.getForYou(page);
        } catch {
          // ignore sapi error
        }

        if (!res || !res.success || !res.data || (Array.isArray(res.data.records) && res.data.records.length === 0)) {
          // Fallback to general browse
          return service.getBooksByCategory(0, page, 15);
        }

        if (res && res.data && Array.isArray(res.data.records)) {
          res.data.records = res.data.records.map(normalizeBook);
        }
        return wrapResult(res);
      } catch (err) {
        return service.getBooksByCategory(0, page, 15);
      }
    },

    async getRecommendedBooks() {
      try {
        let res = null;
        try {
          res = await client.getRecommendedBooks();
        } catch {
          // ignore sapi error
        }

        if (!res || !res.success || !res.data || (Array.isArray(res.data) && res.data.length === 0)) {
          // Fallback to Popular category recommendations (category 534)
          const fallbackRes = await service.getBooksByCategory(534, 1, 15);
          if (fallbackRes.success && Array.isArray(fallbackRes.data) && fallbackRes.data.length > 0) {
            return fallbackRes;
          }
          return service.getBooksByCategory(0, 1, 15);
        }

        if (res && res.data) {
          if (Array.isArray(res.data)) {
            res.data = res.data.map(normalizeBook);
          } else if (Array.isArray(res.data.records)) {
            res.data.records = res.data.records.map(normalizeBook);
          }
        }
        return wrapResult(res);
      } catch (err) {
        return service.getBooksByCategory(449, 1, 15);
      }
    },

    async getRandomDrama() {
      try {
        let res = null;
        try {
          res = await client.getRandomDrama();
        } catch {
          // ignore sapi error
        }

        if (res && res.success && res.data) {
          res.data = normalizeBook(res.data);
          return wrapResult(res);
        }

        // Fallback: pick a random drama from latest list
        const latestRes = await service.getLatest(1);
        const list = latestRes.data?.records || latestRes.data || [];
        if (list.length > 0) {
          const randomItem = list[Math.floor(Math.random() * list.length)];
          return wrapResult({ success: true, data: normalizeBook(randomItem) });
        }

        return wrapResult({ success: false, data: null, message: 'No drama found' });
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    },

    async getComingSoon() {
      try {
        let res = null;
        try {
          res = await client.getComingSoon();
        } catch {
          // ignore sapi error
        }

        if (!res || !res.success || !res.data || (Array.isArray(res.data.records) && res.data.records.length === 0)) {
          // Fallback to ongoing catalog titles
          return service.getBooksByCategory(0, 2, 15);
        }

        if (res && res.data && Array.isArray(res.data.records)) {
          res.data.records = res.data.records.map(normalizeBook);
        }
        return wrapResult(res);
      } catch (err) {
        return service.getBooksByCategory(0, 2, 15);
      }
    },

    async getDubIndo(classify = '1', page = 1, pageSize = 15) {
      try {
        let res = null;
        try {
          res = await client.getDubIndo(classify, page, pageSize);
        } catch {
          // ignore sapi error
        }

        if (!res || !res.success || !res.data || (Array.isArray(res.data.records) && res.data.records.length === 0)) {
          // Fallback to webfic browse with Indonesian language catalog
          if (typeof client.webficRequest === 'function') {
            const webficRes = await client.webficRequest('/webfic/home/browse', {
              language: 'in',
              typeTwoId: 0,
              pageNo: page,
              pageSize
            }, 'POST');

            if (webficRes && webficRes.data && Array.isArray(webficRes.data.bookList)) {
              return wrapResult({
                success: true,
                data: webficRes.data.bookList.map(normalizeBook)
              });
            }
          }
        }

        if (res && res.data && Array.isArray(res.data.records)) {
          res.data.records = res.data.records.map(normalizeBook);
        }
        return wrapResult(res);
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    },

    async getHomepage() {
      try {
        let res = null;
        try {
          res = await client.getHomepage();
        } catch {
          // ignore sapi error
        }

        // If upstream homepage has null or empty lists, assemble resilient combined homepage
        const hasValidData = res && res.success && res.data && (res.data.latest || res.data.trending || res.data.recommended);

        if (!hasValidData) {
          const [latestRes, trendingRes, recRes] = await Promise.all([
            service.getLatest(1),
            service.getTrending(),
            service.getRecommendedBooks()
          ]);

          return wrapResult({
            success: true,
            data: {
              latest: latestRes.data?.records || latestRes.data || [],
              trending: trendingRes.data?.records || trendingRes.data || [],
              recommended: recRes.data?.records || recRes.data || [],
              timestamp: Date.now()
            }
          });
        }

        return wrapResult(res);
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    },

    async searchDramas(keyword, page = 1, pageSize = 20) {
      try {
        const res = await client.searchDrama(keyword, page, pageSize);
        if (res && res.data && Array.isArray(res.data.records)) {
          res.data.records = res.data.records.map(normalizeBook);
        }
        return wrapResult(res);
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    },

    async suggestSearch(keyword) {
      try {
        const res = await client.suggestSearch(keyword);
        return wrapResult(res);
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    },

    async getPopularSearch() {
      try {
        const res = await client.getPopularSearch();
        return wrapResult(res);
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    },

    async getDramaDetail(bookId) {
      if (!bookId) throw new Error('bookId is required');
      try {
        let res = null;
        try {
          res = await client.getDramaDetail(bookId);
        } catch {
          // sapi failed (e.g. Akamai WAF 403 on token bootstrap)
        }

        // Fallback to webfic/book/detail (open web gateway) when sapi is unavailable or blocked
        if (!res || !res.success) {
          if (typeof client.webficRequest === 'function') {
            const webficRes = await client.webficRequest('/webfic/book/detail', {
              bookId: String(bookId),
              language: serviceConfig.language
            }, 'POST');

            if (webficRes && webficRes.data && webficRes.data.book) {
              const book = normalizeBook(webficRes.data.book);
              return wrapResult({
                success: true,
                data: {
                  ...book,
                  recommends: (webficRes.data.recommends || []).map(normalizeBook)
                }
              });
            }
          }

          if (typeof client.getDramaDetailV2 === 'function') {
            const v2Res = await client.getDramaDetailV2(bookId);
            if (v2Res && v2Res.success) {
              res = v2Res;
            }
          }
        }
        return wrapResult(res);
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    },

    async getRelatedDramas(bookId) {
      try {
        let res = null;
        try {
          res = await client.getRelatedDramas(bookId);
        } catch {
          // ignore sapi error
        }

        if (!res || !res.success || !res.data || res.data.length === 0) {
          // Fallback to recommends from drama detail
          const detailRes = await service.getDramaDetail(bookId);
          if (detailRes && detailRes.success && detailRes.data && Array.isArray(detailRes.data.recommends)) {
            return wrapResult({ success: true, data: detailRes.data.recommends });
          }
        }
        return wrapResult(res);
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    },

    async getChapters(bookId) {
      if (!bookId) throw new Error('bookId is required');
      try {
        let res = null;
        try {
          res = await client.getChapters(bookId);
        } catch {
          // sapi failed
        }

        // Resilient fallback if sapi is blocked
        if (!res || !res.success) {
          const dramaData = await fetchRealDramaChapters(bookId);
          if (dramaData && Array.isArray(dramaData.chapters) && dramaData.chapters.length > 0) {
            return wrapResult({
              success: true,
              data: {
                bookId: String(bookId),
                totalEpisodes: dramaData.totalEpisodes,
                chapters: dramaData.chapters
              }
            });
          }

          const detailRes = await service.getDramaDetail(bookId);
          if (detailRes && detailRes.success && detailRes.data) {
            const count = detailRes.data.totalEpisodes || detailRes.data.chapterCount || 10;
            const chapters = [];
            for (let i = 1; i <= count; i++) {
              chapters.push({
                chapterIndex: i,
                chapterName: `Episode ${i}`,
                bookId: String(bookId),
                videoPath: `/api/stream/${bookId}/${i}`
              });
            }
            return wrapResult({
              success: true,
              data: {
                bookId: String(bookId),
                totalEpisodes: count,
                chapters
              }
            });
          }
        }

        return wrapResult(res);
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    },

    async getEpisodeDetails(bookId, episodeIndex) {
      if (!bookId || !episodeIndex) throw new Error('bookId and episodeIndex are required');
      try {
        let res = null;
        try {
          res = await client.getEpisodeDetails(bookId, episodeIndex);
        } catch {
          // sapi failed
        }

        // Resilient fallback when sapi episode detail is blocked
        if (!res || !res.success) {
          const detailRes = await service.getDramaDetail(bookId);
          const count = detailRes?.data?.totalEpisodes || detailRes?.data?.chapterCount || 10;
          const epNum = parseInt(episodeIndex, 10);
          return wrapResult({
            success: true,
            data: {
              bookId: String(bookId),
              chapterIndex: epNum,
              title: `Episode ${epNum}`,
              totalEpisodes: count,
              streamUrl: `/api/stream/${bookId}/${epNum}`,
              hasPrev: epNum > 1,
              hasNext: epNum < count
            }
          });
        }

        return wrapResult(res);
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    },

    async getStreamUrl(bookId, episode) {
      const epNum = parseInt(episode, 10);
      try {
        let res = null;
        try {
          res = await client.getStreamUrl(bookId, epNum);
        } catch {
          // sapi failed
        }

        if (res && res.success && res.data) {
          return {
            success: true,
            creator: "zhadevv",
            data: res.data,
            metadata: res.metadata || {},
            message: res.message || null
          };
        }

        const dramaData = await fetchRealDramaChapters(bookId);
        if (dramaData && Array.isArray(dramaData.chapters)) {
          const found = dramaData.chapters.find(c => c.chapterIndex === epNum) || dramaData.chapters.find(c => Boolean(c.mp4));
          if (found?.mp4) {
            return formatStreamUrlPayload(
              bookId,
              dramaData.totalEpisodes || dramaData.chapters.length,
              found.chapterId || found.id || `${bookId}_${epNum}`,
              epNum,
              found.mp4,
              found.m3u8Url || null
            );
          }
        }

        return {
          success: false,
          creator: "zhadevv",
          data: null,
          metadata: {},
          message: "Episode stream not found"
        };
      } catch (err) {
        return {
          success: false,
          creator: "zhadevv",
          data: null,
          metadata: {},
          message: err.message
        };
      }
    },

    async batchDownload(bookId) {
      try {
        const res = await client.batchDownload(bookId);
        return wrapResult(res);
      } catch (err) {
        return { success: false, data: null, message: err.message };
      }
    }
  };

  // Convenient aliases
  service.getCategoryDramas = service.getBooksByCategory;
  service.search = service.searchDramas;

  return service;
}

export const dramaboxService = createDramaboxService();