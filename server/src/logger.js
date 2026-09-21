import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.env === 'test' ? 'silent' : config.logLevel,
  redact: ['req.headers.cookie', 'req.headers.authorization'],
});
