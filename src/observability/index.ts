import pino, { type Logger } from 'pino';

export interface LoggerOptions {
  level: string;
  service: string;
  environment: string;
}

export function createLogger(options: LoggerOptions): Logger {
  return pino({
    base: {
      environment: options.environment,
      service: options.service,
    },
    level: options.level,
    messageKey: 'message',
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
