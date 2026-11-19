# Deployment Guide: DramaBox REST API

This guide provides step-by-step instructions for deploying the **DramaBox REST API** as a public, serverless API service on **Cloudflare Workers** and **Vercel**, as well as standalone Node.js hosts.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Deploying to Cloudflare Workers](#deploying-to-cloudflare-workers)
   - [Method A: Deploy via Wrangler CLI (Recommended)](#method-a-deploy-via-wrangler-cli-recommended)
   - [Method B: Deploy via Cloudflare Dashboard (Git Integration)](#method-b-deploy-via-cloudflare-dashboard-git-integration)
   - [Custom Domain Configuration](#custom-domain-configuration)
4. [Deploying to Vercel](#deploying-to-vercel)
   - [Method A: Deploy via GitHub Integration (Recommended)](#method-a-deploy-via-github-integration-recommended)
   - [Method B: Deploy via Vercel CLI](#method-b-deploy-via-vercel-cli)
5. [Environment Variables Reference](#environment-variables-reference)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Troubleshooting & FAQ](#troubleshooting--faq)

---

## Architecture Overview

The codebase is engineered with a **pure API dual-runtime**:

| Platform | Entry Point | Runtime | Key Advantages |
| :--- | :--- | :--- | :--- |
| **Cloudflare Workers** | `_worker.js` | Edge V8 Engine | Zero cold start (<5ms), global edge caching, 100k free requests/day |
| **Vercel** | `api/index.js` (`src/app.js`) | Node.js Serverless | Express.js middleware, seamless Git integration, generous hobby tier |
| **Node.js Standalone** | `src/server.js` | Node.js v18+ | Self-hosted VPS, Docker, Railway, Render, Fly.io |

---

## Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Git**: Installed and configured
- A [GitHub](https://github.com/) account
- A [Cloudflare](https://dash.cloudflare.com/) account (for Cloudflare Workers)
- A [Vercel](https://vercel.com/) account (for Vercel deployment)

Clone the repository and install dependencies locally:

```bash
git clone https://github.com/<your-username>/ai-drama-api.git
cd ai-drama-api
npm install
```

---

## Deploying to Cloudflare Workers

Cloudflare Workers runs `_worker.js` globally at the edge without needing containers or virtual machines.

### Method A: Deploy via Wrangler CLI (Recommended)

1. **Authenticate Wrangler with Cloudflare**:
   ```bash
   npx wrangler login
   ```
   This opens your browser to authorize Wrangler with your Cloudflare account.

2. **Test locally with Wrangler Dev**:
   ```bash
   npm run dev:worker
   ```
   Your worker will start locally at `http://localhost:8787`.

3. **Deploy to Cloudflare Workers**:
   ```bash
   npm run deploy:worker
   ```
   Wrangler packages `_worker.js` and deploys it to your Cloudflare account. Upon completion, Wrangler outputs your live URL:
   ```
   Uploaded dramabox-api (1.23 sec)
   Deployed dramabox-api triggers (0.45 sec)
     https://dramabox-api.<your-subdomain>.workers.dev
   ```

### Method B: Deploy via Cloudflare Dashboard (Git Integration)

1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "feat: initial dramabox api release"
   git push origin main
   ```
2. Open the **[Cloudflare Dashboard](https://dash.cloudflare.com/)**.
3. Navigate to **Compute (Workers) > Workers & Pages > Create Application**.
4. Select the **Workers** tab and choose **Connect to Git**.
5. Select your repository `ai-drama-api`.
6. Configure the build settings:
   - **Framework Preset**: None
   - **Build command**: *(leave empty)*
   - **Deploy command**: `npx wrangler deploy`
7. Under **Environment Variables**, optionally set:
   - `DRAMABOX_LANGUAGE` = `en` (or `in`, `zh`, etc.)
8. Click **Save and Deploy**. Any subsequent push to `main` will automatically deploy.

### Custom Domain Configuration

To route requests from your custom domain (e.g., `api.example.com`):
1. In Cloudflare Dashboard, open your Worker (`dramabox-api`).
2. Go to **Settings > Domains & Routes > Add > Custom Domain**.
3. Enter your domain (e.g. `api.yourdomain.com`).
4. Cloudflare automatically sets up DNS routing and provisions an SSL/TLS certificate.

---

## Deploying to Vercel

Vercel deploys the API as a serverless Node.js function using `api/index.js` and the Express application in `src/app.js`. Routing is preconfigured in `vercel.json`.

### Method A: Deploy via GitHub Integration (Recommended)

1. Push your repository to GitHub:
   ```bash
   git push origin main
   ```
2. Log in to [Vercel](https://vercel.com/) and click **Add New... > Project**.
3. Import your `ai-drama-api` repository.
4. In the Project Configuration:
   - **Framework Preset**: Other
   - **Root Directory**: `./`
   - **Build Command**: *(leave empty)*
   - **Output Directory**: *(leave empty)*
5. Expand **Environment Variables** and add any desired variables (e.g. `DRAMABOX_LANGUAGE=en`).
6. Click **Deploy**.

Vercel will detect `api/index.js` and `vercel.json`, deploy your serverless endpoint, and provide a URL such as:
`https://ai-drama-api.vercel.app`

### Method B: Deploy via Vercel CLI

1. Install Vercel CLI globally:
   ```bash
   npm install -g vercel
   ```
2. Authenticate:
   ```bash
   vercel login
   ```
3. Deploy to production:
   ```bash
   vercel --prod
   ```
4. Follow the interactive prompts (accepting default directory settings). Your live URL will be printed in the terminal.

---

## Environment Variables Reference

Configure these variables in your `.env` file for local development, in Cloudflare Worker `[vars]` / secrets, or in the Vercel dashboard:

| Variable | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `PORT` | Number | `3000` | Port for local Node.js Express server (`src/server.js`) |
| `DRAMABOX_LANGUAGE` | String | `en` | Language code for upstream titles (`en`, `in`, `zh`, etc.) |
| `DRAMABOX_TIMEOUT` | Number | `30000` | Upstream request timeout in milliseconds |
| `DRAMABOX_MAX_RETRIES`| Number | `3` | Maximum automatic retries for transient upstream failures |
| `DRAMABOX_REQUEST_DELAY`| Number | `1000` | Rate-limit delay (ms) between batch operations |
| `DRAMABOX_BEARER_TOKEN`| String | *(optional)* | Custom bearer token for DramaBox mobile API authentication |
| `PROXY_URL` | String | *(optional)* | Outbound HTTP/HTTPS proxy URL (`http://user:pass@host:port`) |

### Adding Secrets in Cloudflare Workers

For sensitive values such as tokens or proxies:
```bash
npx wrangler secret put DRAMABOX_BEARER_TOKEN
```

---

## Post-Deployment Verification

After deploying to either platform, verify that all endpoints respond correctly:

### 1. Check API Welcome & Index
```bash
curl https://<YOUR_DEPLOYED_URL>/
```
Expected response:
```json
{
  "name": "dramabox-api",
  "version": "1.0.0",
  "status": "online",
  "description": "DramaBox REST API & Video Streaming Service",
  "endpoints": { ... }
}
```

### 2. Check Health
```bash
curl https://<YOUR_DEPLOYED_URL>/api/health
```

### 3. Check Trending Feeds
```bash
curl https://<YOUR_DEPLOYED_URL>/api/trending
```

### 4. Test Stream Proxy (Byte Range)
```bash
curl -I -H "Range: bytes=0-1023" https://<YOUR_DEPLOYED_URL>/api/stream/42000033485/1
```
Expected response headers:
```http
HTTP/2 206 Partial Content
accept-ranges: bytes
content-range: bytes 0-1023/...
content-type: video/mp4
access-control-allow-origin: *
```

---

## Troubleshooting & FAQ

### 1. Video streaming returns HTTP 307
**Answer**: Upstream CDNs occasionally protect their bandwidth by rejecting datacenter IP proxies with 403 Forbidden. The DramaBox API automatically intercepts this and issues an HTTP `307 Temporary Redirect` directly to the authenticated upstream CDN URL. HTML5 players like Plyr and Video.js automatically follow 307 redirects transparently.

### 2. Upstream returns 403 Forbidden on `/api/token`
**Answer**: DramaBox's mobile gateway (`sapi.dramaboxdb.com`) uses Akamai WAF protection that blocks datacenter IP ranges from generating initial session tokens. You can supply a pre-authenticated session token via `DRAMABOX_BEARER_TOKEN` in your environment, or use the unblocked catalog endpoints (`/api/homepage`, `/api/trending`, `/api/drama/:bookId`, etc.) which bypass the Akamai gate completely.

### 3. Cross-Origin Resource Sharing (CORS) Errors
**Answer**: Both `_worker.js` and `src/app.js` include permissive CORS headers (`Access-Control-Allow-Origin: *`, `Range`, `Accept-Ranges`, `Content-Range`) enabled by default so your frontend client apps or mobile wrappers can call the API without proxy blockers.
