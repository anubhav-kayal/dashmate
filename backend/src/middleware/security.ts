import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import { Request, Response, NextFunction } from 'express';

export const securityHeaders = helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https://maps.googleapis.com'],
      connectSrc: ["'self'", 'https://api.razorpay.com', 'https://maps.googleapis.com'],
      frameSrc: ["'self'", 'https://checkout.razorpay.com'],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

export const preventNoSQLInjection = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }: { req: Request; key: string }) => {
    console.warn(`NoSQL injection attempt blocked on key: ${key}`);
  },
});

export const requestId = (req: Request, _res: Response, next: NextFunction): void => {
  req.headers['x-request-id'] = req.headers['x-request-id'] ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  next();
};
