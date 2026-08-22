import { bootstrap, shutdown } from '@/bootstrap';
import logger from '@/utils/logger';

// ── OS Signal & Exception Handlers ─────────────────────────────────────────────
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, '[index] Unhandled Promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, '[index] Uncaught Exception — Bot process protected');
});

// ── Start Application ──────────────────────────────────────────────────────────
bootstrap().catch((err) => {
  logger.fatal({ err }, '[index] Fatal bootstrap error');
  process.exit(1);
});
