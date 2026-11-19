# DramaBox REST API & Video Streaming Service

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Runtime](https://img.shields.io/badge/Runtime-Node.js%20%7C%20Cloudflare%20Edge-f38020)](https://workers.cloudflare.com/)
[![Deployment](https://img.shields.io/badge/Deploy-Cloudflare%20%7C%20Vercel-black)](DEPLOYMENT.md)
[![Tests](https://img.shields.io/badge/Tests-Passing-4ade80)](#automated-tests)

High-performance, edge-ready REST API and video streaming proxy service for vertical short dramas and mini-series. Built purely as a backend API service with zero frontend bloat, ready to integrate into your own mobile apps, web applications, or media aggregators.

---

## Features

- ⚡ **Dual-Runtime Architecture**: Deploy anywhere—native **Cloudflare Workers** edge runtime (`_worker.js`) or **Vercel / Node.js** Express server (`src/app.js` via `api/index.js`).
- 🎬 **Rich Drama Discovery**: Feeds for *Trending*, *Recommended*, *For-You*, *Latest Releases*, *Coming Soon*, and *Indonesian Dubbed* short dramas.
- 🔍 **Real-Time Search**: Fast keyword search, typeahead suggestions, and popular search queries.
- 📂 **Genre Taxonomy**: Dynamic category lists with paginated drama browsing by category ID.
- 📺 **HTTP 206 Byte-Range Video Proxy**: Seamless MP4 video streaming with seeking, custom headers, and automatic 307 CDN redirect fallback.
- 🌐 **CORS Permissive**: Pre-configured with open CORS headers (`*`) for cross-origin web apps and mobile wrappers.
- 📦 **API Only**: 100% decoupled from any specific frontend UI—pure JSON payloads and video streams.

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- [npm](https://www.npmjs.com/) v9.0.0 or higher

### 1. Installation

```bash
git clone https://github.com/<your-username>/ai-drama-api.git
cd ai-drama-api
npm install
```

### 2. Local Development

Start the local Express server:
```bash
npm run dev
```
The API server starts at `http://localhost:3000`:
- **API Index**: [http://localhost:3000/](http://localhost:3000/)
- **Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

Or test the Cloudflare Worker locally:
```bash
npm run dev:worker
```
The Worker starts locally at `http://localhost:8787`.

### 3. Automated Tests

Run the test suite:
```bash
npm test
```

---

## API Reference

All endpoints return standardized JSON envelopes (`{ success: true, data: ... }`) except video streaming endpoints (`/api/stream/*`), which return binary media chunks or 307 redirects.

### Discovery & Feeds

| Endpoint | Method | Query Parameters | Description |
| :--- | :---: | :--- | :--- |
| `/` | `GET` | — | API status and endpoint directory |
| `/api/health` | `GET` | — | Service uptime and configuration |
| `/api/ping` | `GET` | — | Upstream latency check |
| `/api/homepage` | `GET` | — | Aggregated sections (Trending, Recommended, Latest) |
| `/api/trending` | `GET` | — | Top trending short dramas |
| `/api/recommended`| `GET` | — | Recommended drama titles |
| `/api/for-you` | `GET` | `page=1` | Personalized paginated discovery |
| `/api/latest` | `GET` | `page=1`, `pageSize=20` | Chronological releases |
| `/api/random` | `GET` | — | Random drama object for spotlighting |
| `/api/coming-soon`| `GET` | — | Unreleased and upcoming titles |
| `/api/dub-indo` | `GET` | `page=1`, `pageSize=15` | Indonesian dubbed collection |
| `/api/categories` | `GET` | `page=1`, `pageSize=20` | List of available drama genres |
| `/api/category/:id` | `GET` | `page=1`, `pageSize=20` | Dramas in a specific category |

### Search

| Endpoint | Method | Query Parameters | Description |
| :--- | :---: | :--- | :--- |
| `/api/search` | `GET` | `q=:query` or `keyword=:query` | Search dramas by title or keyword |
| `/api/search/suggest` | `GET` | `q=:query` | Typeahead search query suggestions |
| `/api/search/popular` | `GET` | — | Popular search terms |

### Drama Metadata & Playback

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/api/drama/:bookId` | `GET` | Drama metadata, synopsis, tags, and episode count |
| `/api/drama/:bookId/related` | `GET` | Related dramas ("More Like This") |
| `/api/drama/:bookId/chapters` | `GET` | Complete episode/chapter list with lock status |
| `/api/drama/:bookId/episode/:episode` | `GET` | Episode details with proxy `streamUrl` |
| `/api/drama/:bookId/stream-url/:episode` | `GET` | Direct stream URL object formatted with zhadevv schema |
| `/api/stream/:bookId/:episode` | `GET` | Video streaming proxy with HTTP 206 Range support |

---

## Example Requests

### 1. Root API Discovery
```bash
curl https://your-domain.com/
```
```json
{
  "name": "dramabox-api",
  "version": "1.0.0",
  "status": "online",
  "description": "DramaBox REST API & Video Streaming Service",
  "endpoints": {
    "health": "/api/health",
    "trending": "/api/trending",
    "stream": "/api/stream/:bookId/:episode"
  }
}
```

### 2. Search Titles
```bash
curl "https://your-domain.com/api/search?q=billionaire"
```

### 3. Get Stream URL Payload
```bash
curl "https://your-domain.com/api/drama/41000107296/stream-url/1"
```
```json
{
  "success": true,
  "creator": "zhadevv",
  "data": {
    "status": "success",
    "apiBy": "dramabox",
    "data": {
      "bookId": "41000107296",
      "allEps": 76,
      "chapter": {
        "id": "581861139",
        "index": 1,
        "video": {
          "mp4": "https://hwztakavideo.dramaboxdb.com/...",
          "m3u8": null
        }
      }
    }
  }
}
```

### 4. HTML5 Video Stream Proxy
Simply point any HTML5 `<video>` element or mobile player directly to:
```html
<video controls src="https://your-domain.com/api/stream/41000107296/1"></video>
```

---

## Deployment

Detailed instructions for deploying to **Cloudflare Workers** and **Vercel** are provided in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

### Quick Deploy: Cloudflare Workers
```bash
npm run deploy:worker
```

### Quick Deploy: Vercel
Connect your GitHub repository directly to [Vercel](https://vercel.com/) or run:
```bash
npx vercel --prod
```

---

## Environment Variables

| Variable | Default | Description |
| :--- | :---: | :--- |
| `PORT` | `3000` | Local server port |
| `DRAMABOX_LANGUAGE` | `en` | Language code for titles (`en`, `in`, `zh`, etc.) |
| `DRAMABOX_TIMEOUT` | `30000` | Request timeout in ms |
| `DRAMABOX_MAX_RETRIES`| `3` | Maximum upstream retries |
| `DRAMABOX_BEARER_TOKEN`| *(none)* | Optional session token override |
| `PROXY_URL` | *(none)* | Optional outbound proxy for datacenter IPs |

---

## License

This project is licensed under the [MIT License](LICENSE).
