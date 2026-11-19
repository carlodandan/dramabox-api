import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`===================================================`);
  console.log(` DramaBox REST API & Video Streaming Proxy Server `);
  console.log(`===================================================`);
  console.log(` Environment : ${config.isProduction ? 'production' : 'development'}`);
  console.log(` API Base    : http://localhost:${config.port}`);
  console.log(` API Health  : http://localhost:${config.port}/api/health`);
  console.log(` Language    : ${config.language}`);
  if (config.proxyUrl) {
    console.log(` Outbound Proxy : ${config.proxyUrl}`);
  }
  console.log(`===================================================`);
});
