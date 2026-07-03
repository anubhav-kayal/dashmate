import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { config } from './config';
import { initSocket } from './socket';
import { initCronJobs } from './jobs';
import { initRedis } from './middleware/rateLimiter';
import { initVapidKeys } from './services/pushNotifications';
import { initSentry, sentryMiddleware, sentryErrorHandler } from './services/monitoring';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { protect, authorize } from './middleware/auth';
import { securityHeaders, preventNoSQLInjection, requestId } from './middleware/security';
import { logger } from './utils/logger';
import authRoutes from './routes/auth';
import studentRoutes from './routes/student';
import courierRoutes from './routes/courier';
import restaurantRoutes from './routes/restaurant';
import adminRoutes from './routes/admin';

initSentry();

const app = express();
const httpServer = createServer(app);

app.use(requestId);
app.use(sentryMiddleware);
app.use(securityHeaders);
app.use(preventNoSQLInjection);
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/student', protect, studentRoutes);
app.use('/api/v1/courier', protect, courierRoutes);
app.use('/api/v1/restaurant', protect, restaurantRoutes);
app.use('/api/v1/admin', protect, authorize('admin'), adminRoutes);

app.use(notFoundHandler);
app.use(sentryErrorHandler);
app.use(errorHandler);

async function startServer(): Promise<void> {
  try {
    await mongoose.connect(config.mongodbUri);
    logger.info('Connected to MongoDB');

    if (config.redis.url) {
      await initRedis(config.redis.url);
      logger.info('Connected to Redis');
    }

    const vapidKeys = initVapidKeys();
    if (vapidKeys) process.env.VAPID_PUBLIC_KEY = vapidKeys.publicKey;

    const io = initSocket(httpServer);
    (global as any).io = io;
    logger.info('Socket.io initialized');

    initCronJobs();

    httpServer.listen(config.port, () => {
      logger.info(`Server running on http://localhost:${config.port}`, {
        environment: config.nodeEnv,
        frontendUrl: config.frontendUrl,
      });
    });
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

startServer();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await mongoose.connection.close();
  httpServer.close(() => process.exit(0));
});