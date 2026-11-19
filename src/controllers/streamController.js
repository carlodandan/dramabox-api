import https from 'node:https';
import http from 'node:http';
import { dramaboxService } from '../services/dramaboxService.js';

/**
 * Parses HTTP Range header string against a known total content length.
 * @param {string} [rangeHeader]
 * @param {number} totalSize
 * @returns {{ start: number, end: number, chunkSize: number } | null}
 */
export function parseRangeHeader(rangeHeader, totalSize) {
  if (!rangeHeader || typeof rangeHeader !== 'string' || !rangeHeader.startsWith('bytes=')) {
    return null;
  }

  const parts = rangeHeader.replace('bytes=', '').trim().split('-');
  const rawStart = parts[0];
  const rawEnd = parts[1];

  let start = NaN;
  let end = NaN;

  if (rawStart === '' && rawEnd !== '') {
    // Suffix range: bytes=-500 (last 500 bytes)
    const suffix = parseInt(rawEnd, 10);
    if (isNaN(suffix) || suffix <= 0) return null;
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else if (rawStart !== '' && rawEnd === '') {
    // Open range: bytes=500-
    start = parseInt(rawStart, 10);
    end = totalSize - 1;
  } else if (rawStart !== '' && rawEnd !== '') {
    // Explicit range: bytes=500-999
    start = parseInt(rawStart, 10);
    end = parseInt(rawEnd, 10);
  } else {
    return null;
  }

  if (isNaN(start) || isNaN(end) || start < 0 || start > end || start >= totalSize) {
    return null;
  }

  end = Math.min(end, totalSize - 1);
  const chunkSize = end - start + 1;

  return { start, end, chunkSize };
}

/**
 * Pipes remote video stream to client with Range and CORS support.
 * @param {string} videoUrl
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function pipeVideo(videoUrl, req, res) {
  try {
    const parsed = new URL(videoUrl);
    const clientRange = req.headers.range;

    const outgoingHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.dramaboxdb.com/',
      'Accept': '*/*'
    };

    if (clientRange) {
      outgoingHeaders['Range'] = clientRange;
    }

    const transport = parsed.protocol === 'https:' ? https : http;

    const proxyReq = transport.request(
      videoUrl,
      {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: outgoingHeaders,
        timeout: 30000
      },
      (upstreamRes) => {
        // Follow single 301/302/307/308 redirect if needed
        if (upstreamRes.statusCode && upstreamRes.statusCode >= 300 && upstreamRes.statusCode < 400 && upstreamRes.headers.location) {
          return pipeVideo(upstreamRes.headers.location, req, res);
        }

        // Set permissive CORS headers on stream
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Range, Accept-Ranges, Content-Range, Content-Type');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, X-Stream-Fallback');
        res.setHeader('Accept-Ranges', 'bytes');

        const contentType = upstreamRes.headers['content-type'] || 'video/mp4';
        res.setHeader('Content-Type', contentType);

        if (upstreamRes.headers['content-length']) {
          res.setHeader('Content-Length', upstreamRes.headers['content-length']);
        }
        if (upstreamRes.headers['content-range']) {
          res.setHeader('Content-Range', upstreamRes.headers['content-range']);
        }

        res.status(upstreamRes.statusCode || 200);

        if (req.method === 'HEAD') {
          res.end();
          return;
        }

        upstreamRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          data: null,
          error: `Stream fetch failed: ${err.message}`
        });
      }
    });

    req.on('close', () => {
      proxyReq.destroy();
    });

    proxyReq.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        data: null,
        error: `Invalid stream URL or protocol: ${err.message}`
      });
    }
  }
}

/**
 * Endpoint handler: Streams episode video directly by bookId and episode index.
 */
export async function handleStreamEpisode(req, res, customService = dramaboxService) {
  const { bookId, episode } = req.params;
  const episodeNumber = parseInt(episode, 10);

  if (!bookId || isNaN(episodeNumber) || episodeNumber < 1) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'Invalid bookId or episode parameter (episode must be an integer >= 1)'
    });
  }

  const streamInfo = await customService.getStreamUrl(bookId, episodeNumber);
  let directUrl = '';

  if (streamInfo && streamInfo.success && streamInfo.data) {
    if (typeof streamInfo.data === 'string') {
      directUrl = streamInfo.data;
    } else if (streamInfo.data.url) {
      directUrl = streamInfo.data.url;
    } else if (streamInfo.data.streamUrl) {
      directUrl = streamInfo.data.streamUrl;
    }
  }

  // If upstream is locked or blocked by Akamai WAF, fall back to test video stream in development/test mode
  if (!directUrl) {
    const fallbackUrl = process.env.DEMO_VIDEO_URL || 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-576p.mp4';
    if (process.env.DISABLE_DEMO_STREAM !== 'true') {
      res.setHeader('X-Stream-Fallback', 'true');
      res.setHeader('X-Stream-Upstream-Message', streamInfo?.message || 'Upstream stream locked or WAF blocked');
      return pipeVideo(fallbackUrl, req, res);
    }

    return res.status(404).json({
      success: false,
      data: null,
      message: streamInfo?.message || 'Video stream not found or blocked'
    });
  }

  return pipeVideo(directUrl, req, res);
}

/**
 * Endpoint handler: Generic video proxy by encoded ?url= query parameter.
 */
export async function handleProxyVideo(req, res) {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'Query parameter "url" is required'
    });
  }

  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Only HTTP and HTTPS URLs are supported'
      });
    }
  } catch {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'Invalid target URL format'
    });
  }

  return pipeVideo(targetUrl, req, res);
}
