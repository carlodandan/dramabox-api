import dotenv from 'dotenv';

dotenv.config();

/**
 * Loads configuration from environment variables with safe defaults.
 * @param {Record<string, string | undefined>} [env=process.env]
 * @returns {{
 *   port: number,
 *   language: string,
 *   timeout: number,
 *   maxRetries: number,
 *   requestDelay: number,
 *   proxyUrl: string | null,
 *   isProduction: boolean
 * }}
 */
export function loadConfig(env = process.env) {
  return {
    port: parseInt(env.PORT || '3000', 10),
    language: env.DRAMABOX_LANGUAGE || 'en',
    timeout: parseInt(env.DRAMABOX_TIMEOUT || '30000', 10),
    maxRetries: parseInt(env.DRAMABOX_MAX_RETRIES || '3', 10),
    requestDelay: parseInt(env.DRAMABOX_REQUEST_DELAY || '1000', 10),
    proxyUrl: env.PROXY_URL || env.HTTPS_PROXY || env.HTTP_PROXY || null,
    isProduction: env.NODE_ENV === 'production'
  };
}

export const config = loadConfig();
