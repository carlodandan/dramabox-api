/**
 * Unified Cloudflare Edge Worker for DramaBox REST API & Video Streaming
 * Handles all REST API routes and video Range proxy streaming with zero web dependencies.
 */

const UPSTREAM_URL = 'https://www.webfic.com';
const DEMO_STREAM_URL = 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-576p.mp4';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    }
  });
}

function jsonEnvelope(data, status = 200, message = 'Success', metadata = {}) {
  const isSuccess = status >= 200 && status < 400;
  return jsonResponse({
    success: isSuccess,
    data: data !== undefined ? data : null,
    message: message || (isSuccess ? 'Success' : 'Error'),
    metadata: metadata || {}
  }, status);
}

function normalizeBook(book, lang = 'in') {
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
    language: book.language || lang
  };
}

async function webficPost(path, body = {}, lang = 'in') {
  try {
    const res = await fetch(`${UPSTREAM_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'pline': 'DRAMABOX',
        'language': lang
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new Error(`Webfic API error: ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message, data: null };
  }
}

async function fetchBrowseBooks(typeTwoId = 0, pageNo = 1, pageSize = 20, lang = 'in') {
  const json = await webficPost('/webfic/home/browse', { typeTwoId, pageNo, pageSize }, lang);
  const rawList = json?.data?.bookList || [];
  return rawList.map(b => normalizeBook(b, lang));
}

async function fetchCategoriesList(lang = 'in') {
  const json = await webficPost('/webfic/home/browse', { typeTwoId: 0, pageNo: 1, pageSize: 30 }, lang);
  const types = json?.data?.types || [];
  return types
    .filter(t => t && (t.id !== undefined || t.typeTwoId !== undefined))
    .map(t => ({
      id: t.id ?? t.typeTwoId,
      typeTwoId: t.id ?? t.typeTwoId,
      name: t.name || t.typeTwoName || t.typeName || '',
      typeTwoName: t.name || t.typeTwoName || t.typeName || '',
      typeName: t.name || t.typeTwoName || t.typeName || '',
      categoryName: t.name || t.typeTwoName || t.typeName || ''
    }));
}

function formatStreamUrlPayload(bookId, allEps, chapterId, episodeIndex, mp4Url, m3u8Url = null) {
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

const dramaChapterCache = new Map();

/**
 * Fetches real drama chapter and episode video information from DramaBox edge.
 */
async function fetchRealDramaChapters(bookId) {
  if (!bookId) return null;
  const cacheKey = String(bookId);
  const cached = dramaChapterCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < 300000)) {
    return cached.data;
  }

  try {
    const res = await fetch(`https://www.dramaboxdb.com/ep/${bookId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!res.ok) {
      return null;
    }

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
      title: ch.name || `Episode ${i + 1}`,
      cover: ch.cover || '',
      duration: ch.duration || 0,
      isLocked: !ch.unlock,
      mp4: ch.mp4 || null,
      m3u8Url: ch.m3u8Url || null
    }));

    const result = {
      bookInfo: pageProps?.bookInfo,
      totalEpisodes: chapters.length,
      chapters
    };

    dramaChapterCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  } catch (err) {
    console.warn(`Failed to fetch chapters for drama ${bookId}:`, err.message);
    return null;
  }
}

/**
 * Handles HTTP Range streaming for video playback with real DramaBox video streams
 */
async function handleStreamProxy(request, bookId, episodeIndex) {
  const epNum = parseInt(episodeIndex, 10);
  let targetUrl = '';
  let isRealVideo = false;

  // Retrieve real drama chapter list and video URLs
  const dramaData = await fetchRealDramaChapters(bookId);
  if (dramaData && Array.isArray(dramaData.chapters)) {
    const targetEp = dramaData.chapters.find(c => c.chapterIndex === epNum);
    if (targetEp?.mp4) {
      targetUrl = targetEp.mp4;
      isRealVideo = true;
    } else {
      const fallbackEp = dramaData.chapters.find(c => Boolean(c.mp4));
      if (fallbackEp?.mp4) {
        targetUrl = fallbackEp.mp4;
        isRealVideo = true;
      }
    }
  }

  // Fallback to demo stream only if upstream has zero playable episodes
  if (!targetUrl) {
    targetUrl = DEMO_STREAM_URL;
  }

  const rangeHeader = request.headers.get('Range');
  const upstreamHeaders = {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'https://www.dramaboxdb.com/'
  };
  if (rangeHeader) {
    upstreamHeaders['Range'] = rangeHeader;
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: upstreamHeaders
    });

    if (upstreamRes.status === 403 || upstreamRes.status === 401) {
      // Upstream CDN blocked datacenter proxy IP; redirect browser directly to signed CDN URL
      return new Response(null, {
        status: 307,
        headers: {
          'Location': targetUrl,
          'Access-Control-Allow-Origin': '*',
          'X-Real-Video': isRealVideo ? 'true' : 'false'
        }
      });
    }

    const responseHeaders = new Headers(upstreamRes.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Accept-Ranges', 'bytes');
    if (!responseHeaders.has('Content-Type')) {
      responseHeaders.set('Content-Type', 'video/mp4');
    }
    responseHeaders.set('X-Real-Video', isRealVideo ? 'true' : 'false');

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders
    });
  } catch (err) {
    return jsonEnvelope(null, 500, `Streaming error: ${err.message}`);
  }
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const lang = env.DRAMABOX_LANGUAGE || 'en';

    // Handle OPTIONS CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Root route: API Information & Endpoints Catalog
    if (url.pathname === '/' || url.pathname === '') {
      return jsonResponse({
        name: 'dramabox-api',
        version: '1.0.0',
        status: 'online',
        description: 'DramaBox REST API & Video Streaming Service',
        runtime: 'Cloudflare Edge Worker',
        endpoints: {
          health: '/api/health',
          ping: '/api/ping',
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
          dramaDetail: '/api/drama/:bookId',
          related: '/api/drama/:bookId/related',
          chapters: '/api/drama/:bookId/chapters',
          episode: '/api/drama/:bookId/episode/:episode',
          streamUrl: '/api/drama/:bookId/stream-url/:episode',
          stream: '/api/stream/:bookId/:episode'
        }
      });
    }

    // ==========================================
    // API ROUTING (/api/*)
    // ==========================================
    if (url.pathname.startsWith('/api/')) {
      // Health check & ping
      if (url.pathname === '/api/health' || url.pathname === '/api/ping') {
        return jsonResponse({
          success: true,
          status: 'ok',
          service: 'DramaBox Streaming Edge Worker',
          language: lang,
          timestamp: Date.now()
        });
      }

      // 1. Discovery: Categories & Category Drama List
      if (url.pathname === '/api/categories') {
        const categories = await fetchCategoriesList(lang);
        return jsonEnvelope(categories);
      }

      if (url.pathname.startsWith('/api/category/')) {
        const rawId = url.pathname.replace('/api/category/', '').split('/')[0];
        const typeTwoId = (rawId === 'undefined' || isNaN(Number(rawId))) ? 0 : Number(rawId);
        const page = Number(url.searchParams.get('page') || 1);
        const pageSize = Number(url.searchParams.get('pageSize') || 20);
        const books = await fetchBrowseBooks(typeTwoId, page, pageSize, lang);
        return jsonEnvelope(books);
      }

      // 2. Discovery: Trending, Recommended, For-You, Random, Coming Soon, Dub Indo
      if (url.pathname === '/api/trending') {
        const books = await fetchBrowseBooks(534, 1, 15, lang);
        return jsonEnvelope(books.length > 0 ? books : await fetchBrowseBooks(0, 1, 15, lang));
      }

      if (url.pathname === '/api/recommended') {
        const books = await fetchBrowseBooks(0, 1, 15, lang);
        return jsonEnvelope(books);
      }

      if (url.pathname === '/api/for-you') {
        const page = Number(url.searchParams.get('page') || 1);
        const books = await fetchBrowseBooks(0, page, 15, lang);
        return jsonEnvelope(books);
      }

      if (url.pathname === '/api/random') {
        const books = await fetchBrowseBooks(0, 1, 30, lang);
        if (books.length === 0) {
          return jsonEnvelope(null, 404, 'No dramas found');
        }
        const randomPick = books[Math.floor(Math.random() * books.length)];
        return jsonEnvelope(randomPick);
      }

      if (url.pathname === '/api/coming-soon') {
        const books = await fetchBrowseBooks(0, 1, 12, lang);
        return jsonEnvelope(books);
      }

      if (url.pathname === '/api/dub-indo') {
        const page = Number(url.searchParams.get('page') || 1);
        const pageSize = Number(url.searchParams.get('pageSize') || 15);
        const books = await fetchBrowseBooks(0, page, pageSize, 'in');
        return jsonEnvelope(books);
      }

      // 3. Discovery: Combined Homepage
      if (url.pathname === '/api/homepage') {
        const [trending, recommended, latest] = await Promise.all([
          fetchBrowseBooks(534, 1, 12, lang),
          fetchBrowseBooks(0, 1, 12, lang),
          fetchBrowseBooks(0, 2, 12, lang)
        ]);
        return jsonEnvelope({
          trending: trending.length > 0 ? trending : recommended,
          recommended,
          latest: latest.length > 0 ? latest : recommended,
          timestamp: Date.now()
        });
      }

      if (url.pathname === '/api/latest') {
        const page = Number(url.searchParams.get('page') || 1);
        const pageSize = Number(url.searchParams.get('pageSize') || 20);
        const books = await fetchBrowseBooks(0, page, pageSize, lang);
        return jsonEnvelope(books);
      }

      // 4. Search
      if (url.pathname === '/api/search') {
        const keyword = (url.searchParams.get('keyword') || url.searchParams.get('q') || '').trim();
        if (!keyword) {
          return jsonEnvelope([]);
        }
        const json = await webficPost('/webfic/home/search', {
          keyword,
          pageNo: Number(url.searchParams.get('page') || 1),
          pageSize: Number(url.searchParams.get('pageSize') || 20)
        }, lang);

        const list = (json?.data?.bookList || json?.data?.records || []).map(b => normalizeBook(b, lang));
        return jsonEnvelope(list);
      }

      // 5. Stream URL metadata (exact zhadevv schema)
      const streamUrlMatch = url.pathname.match(/\/(?:api\/drama\/([^/]+)\/stream-url\/([^/]+)|api\/stream-url\/([^/]+)\/([^/]+))/);
      if (streamUrlMatch) {
        const bookId = streamUrlMatch[1] || streamUrlMatch[3];
        const episode = streamUrlMatch[2] || streamUrlMatch[4];
        const epNum = parseInt(episode, 10);
        const dramaData = await fetchRealDramaChapters(bookId);
        if (dramaData && Array.isArray(dramaData.chapters)) {
          const found = dramaData.chapters.find(c => c.chapterIndex === epNum) || dramaData.chapters.find(c => Boolean(c.mp4));
          if (found?.mp4) {
            return jsonResponse(formatStreamUrlPayload(
              bookId,
              dramaData.totalEpisodes || dramaData.chapters.length,
              found.chapterId || found.id || `${bookId}_${epNum}`,
              epNum,
              found.mp4,
              found.m3u8Url || null
            ));
          }
        }
        return jsonResponse({
          success: false,
          creator: "zhadevv",
          data: null,
          metadata: {},
          message: "Episode stream not found"
        }, 404);
      }

      // 6. Video Stream Proxy with Range support
      const streamMatch = url.pathname.match(/\/api\/stream\/([^/]+)\/([^/]+)/);
      if (streamMatch) {
        const bookId = streamMatch[1];
        const episode = streamMatch[2];
        return handleStreamProxy(request, bookId, episode);
      }

      // 7. Drama Detail, Episodes, and Related
      const dramaMatch = url.pathname.match(/\/api\/drama\/([^/]+)(.*)/);
      if (dramaMatch) {
        const bookId = dramaMatch[1];
        const subPath = dramaMatch[2];

        // Related dramas
        if (subPath === '/related') {
          const related = await fetchBrowseBooks(0, 1, 8, lang);
          return jsonEnvelope(related);
        }

        // Chapters/Episodes list
        if (subPath === '/episodes' || subPath === '/chapters') {
          const dramaData = await fetchRealDramaChapters(bookId);
          if (dramaData && Array.isArray(dramaData.chapters) && dramaData.chapters.length > 0) {
            return jsonEnvelope(dramaData.chapters);
          }
          const detailJson = await webficPost('/webfic/book/detail', { bookId: Number(bookId) }, lang);
          const total = detailJson?.data?.book?.chapterCount || 30;
          const chapters = Array.from({ length: total }, (_, i) => ({
            chapterId: i + 1,
            chapterIndex: i + 1,
            title: `Episode ${i + 1}`,
            isLocked: i > 7
          }));
          return jsonEnvelope(chapters);
        }

        // Single Episode Detail
        const epMatch = subPath.match(/\/episode\/(\d+)/);
        if (epMatch) {
          const epIndex = parseInt(epMatch[1], 10);
          const dramaData = await fetchRealDramaChapters(bookId);
          const found = dramaData?.chapters?.find(c => c.chapterIndex === epIndex);
          return jsonEnvelope({
            bookId,
            episodeIndex: epIndex,
            title: found?.title || `Episode ${epIndex}`,
            streamUrl: `/api/stream/${bookId}/${epIndex}`,
            isLocked: found ? found.isLocked : epIndex > 8,
            duration: found?.duration || 0,
            nextEpisode: epIndex + 1,
            prevEpisode: epIndex > 1 ? epIndex - 1 : null
          });
        }

        // Base Drama Details:
        // 1. First attempt Webfic book detail to get rich data + recommends (exact match with Node.js service)
        const detailJson = await webficPost('/webfic/book/detail', { bookId: Number(bookId) }, lang);
        if (detailJson?.data?.book) {
          const book = normalizeBook(detailJson.data.book, lang);
          const recommends = Array.isArray(detailJson.data.recommends)
            ? detailJson.data.recommends.map(b => normalizeBook(b, lang))
            : [];
          return jsonEnvelope({
            ...book,
            recommends
          });
        }

        // 2. Fallback to dramaboxdb.com Next.js page props
        const dramaData = await fetchRealDramaChapters(bookId);
        if (dramaData && dramaData.bookInfo) {
          return jsonEnvelope(normalizeBook(dramaData.bookInfo, lang));
        }

        // 3. Fallback detail lookup by browsing
        const browseList = await fetchBrowseBooks(0, 1, 30, lang);
        const found = browseList.find(b => String(b.bookId) === String(bookId));
        if (found) {
          return jsonEnvelope(found);
        }

        return jsonEnvelope({
          id: bookId,
          bookId,
          bookName: `Drama ${bookId}`,
          cover: '',
          coverWap: '',
          introduction: 'Drama details loading from edge catalog...',
          chapterCount: 30,
          totalEpisodes: 30,
          tags: ['Drama', 'Trending'],
          status: 'ongoing',
          language: lang
        });
      }

      return jsonEnvelope(null, 404, `Endpoint ${url.pathname} not found`);
    }

    return jsonEnvelope(null, 404, `Endpoint ${url.pathname} not found`);
  }
};
