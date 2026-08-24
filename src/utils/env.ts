import path from 'path';
import ffmpegPath from 'ffmpeg-static';

import config from '@/config';

import logger from '@/utils/logger';

/**
 * Validate that required environment variables are set and setup runtime PATH.
 */
export const validateRequiredEnv = (): void => {
  // Ensure FFmpeg static binary from node_modules is discoverable via PATH
  if (ffmpegPath) {
    const ffmpegDir = path.dirname(ffmpegPath);
    process.env.PATH = `${ffmpegDir}${path.delimiter}${process.env.PATH || ''}`;
  }

  const missing: string[] = [];

  if (!process.env['REDIS_URL']) {
    missing.push('REDIS_URL');
  }

  if (config.pairing.usePairingCode && !process.env['PAIRING_NUMBER']) {
    missing.push('PAIRING_NUMBER (required when USE_PAIRING_CODE=true)');
  }

  if (missing.length > 0) {
    logger.error(
      `\n[config] ❌ Missing required environment variables:\n  • ${missing.join('\n  • ')}\n\nPlease check and update your .env file.\n`
    );
    process.exit(1);
  }
};
