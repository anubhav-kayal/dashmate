import { Request, Response, NextFunction } from 'express';
import { ApiFailure, createFailure, ErrorCode } from '../types/api';
import { AppError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';
import mongoose from 'mongoose';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = req.headers['x-request-id'] as string || 
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  logger.error(`Error: ${err.message}`, err, {
    requestId,
    path: req.path,
    method: req.method,
    userId: (req as any).user?._id,
  });

  let response: ApiFailure;

  if (err instanceof AppError) {
    response = createFailure(err.code, err.message, requestId, err.details);
    res.status(err.statusCode).json(response);
    return;
  }

  if (err instanceof ZodError) {
    const details = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    response = createFailure('VALIDATION_ERROR', 'Validation failed', requestId, details);
    res.status(400).json(response);
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message,
    }));
    response = createFailure('VALIDATION_ERROR', 'Database validation failed', requestId, details);
    res.status(400).json(response);
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    response = createFailure('VALIDATION_ERROR', `Invalid ${err.path}: ${err.value}`, requestId, [{
      field: err.path,
      message: `Invalid ${err.kind}`,
    }]);
    res.status(400).json(response);
    return;
  }

  if (err.name === 'MongoServerError' && (err as any).code === 11000) {
    const field = Object.keys((err as any).keyValue)[0];
    response = createFailure('CONFLICT', `${field} already exists`, requestId, [{
      field,
      message: `${field} already exists`,
    }]);
    res.status(409).json(response);
    return;
  }

  if (err.name === 'JsonWebTokenError') {
    response = createFailure('TOKEN_INVALID', 'Invalid token', requestId);
    res.status(401).json(response);
    return;
  }

  if (err.name === 'TokenExpiredError') {
    response = createFailure('TOKEN_EXPIRED', 'Token expired', requestId);
    res.status(401).json(response);
    return;
  }

  response = createFailure('INTERNAL_ERROR', 'An unexpected error occurred', requestId);
  res.status(500).json(response);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const requestId = req.headers['x-request-id'] as string || 
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  const response = createFailure('NOT_FOUND', `Route ${req.method} ${req.path} not found`, requestId);
  res.status(404).json(response);
};