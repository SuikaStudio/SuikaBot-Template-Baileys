import pino from 'pino';

const isTest = process.env['NODE_ENV'] === 'test' || Boolean(process.env['BUN_TEST']);
const isDev = process.env['NODE_ENV'] === 'development';

const defaultLevel = isTest ? 'silent' : isDev ? 'debug' : 'info';
const logLevel = process.env['LOG_LEVEL'] ?? defaultLevel;

const logger = pino(
  {
    level: logLevel,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  },
  isDev
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
      })
    : pino.destination(1) // stdout in production & test
);

export default logger;
