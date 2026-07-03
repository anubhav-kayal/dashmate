const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'PORT',
  'NODE_ENV',
  'FRONTEND_URL',
  'GOOGLE_MAPS_API_KEY',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

const optionalEnvVars = [
  'REDIS_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
];

export function validateEnv(): void {
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (process.env.JWT_SECRET!.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  if (process.env.NODE_ENV === 'production') {
    const prodRequired = ['REDIS_URL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
    const missingProd = prodRequired.filter(key => !process.env[key]);
    if (missingProd.length > 0) {
      console.warn(`Warning: Missing production environment variables: ${missingProd.join(', ')}`);
    }
  }

  console.log('Environment validation passed');
}

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI!,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  frontendUrl: process.env.FRONTEND_URL!,
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY!,
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID!,
    keySecret: process.env.RAZORPAY_KEY_SECRET!,
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    apiSecret: process.env.CLOUDINARY_API_SECRET!,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  sentry: {
    dsn: process.env.SENTRY_DSN || '',
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },
  credit: {
    expiryDays: 180,
    earnRate: 0.05,
    referralBonus: 100,
    firstOrderBonus: 200,
    dailyLoginBonus: 10,
    maxOrderPercentage: 0.5,
    minConversion: 100,
  },
  courier: {
    deliveryFee: 10,
    minPayout: 100,
    ratingPenalty: 0.5,
    cancellationPenalty: 10,
    abandonPenalty: 50,
  },
  restaurant: {
    platformCommission: 5,
    defaultDeliveryFee: 10,
    minOrderAmount: 0,
  },
  limits: {
    maxOrdersPerDay: 20,
    maxCreditsEarnedPerDay: 500,
    maxCancellationsPerWeek: 3,
    minOrderIntervalMs: 120000,
  },
};