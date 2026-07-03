import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';

export function initSentry(): void {
  if (!config.sentry.dsn) {
    logger.warn('Sentry DSN not configured, skipping Sentry initialization');
    return;
  }

  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.nodeEnv,
    integrations: [
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: config.nodeEnv === 'production' ? 0.1 : 0,
    profilesSampleRate: config.nodeEnv === 'production' ? 0.1 : 0,
    enabled: config.nodeEnv === 'production' || config.nodeEnv === 'staging',
    beforeSend(event) {
      if (config.nodeEnv === 'development') return null;
      return event;
    },
  });

  logger.info('Sentry initialized', {
    environment: config.nodeEnv,
  });
}

export function captureError(error: Error, context?: Record<string, unknown>): void {
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    Sentry.captureException(error);
  });
}

export function sentryRequestHandler(req: Request, _res: Response, next: NextFunction): void {
  Sentry.setUser({
    id: (req as any).user?._id?.toString(),
    ip: req.ip,
  });
  Sentry.setExtra('path', req.path);
  Sentry.setExtra('method', req.method);
  next();
}
