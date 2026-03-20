const {loadEnvFile} = require('process')
loadEnvFile()

exports.config = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    accessSecret: process.env.ACCESS_TOKEN_SECRET,
    refreshSecret: process.env.REFRESH_TOKEN_SECRET,
    accessExpiresIn: process.env.ACCESS_TOKEN_EXPIRATION || '15m',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRATION || '7d',
  },
  r2: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    endpoint: process.env.R2_ENDPOINT?.trim(),
    bucketName: process.env.R2_BUCKET_NAME,
    region: process.env.R2_REGION || "auto",
    publicUrl: process.env.R2_PUBLIC_URL?.trim(),
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: process.env.CORS_METHODS || 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: process.env.CORS_ALLOWED_HEADERS || 'Content-Type,Authorization',
  },  
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    botUser: process.env.TELEGRAM_BOT_USER,
  },
  bakong: {
    apiUrl: process.env.BAKONG_BASE_API_URL,
    accountId: process.env.BAKONG_ACCOUNT_ID || process.env.BAKONG_ACCOUNT_USERNAME,
    secret: process.env.BAKONG_SECRET || process.env.BAKONG_ACCESS_SECRET,
    accessToken: process.env.BAKONG_ACCESS_TOKEN,
    storeLabel: process.env.BAKONG_STORE_LABEL || process.env.BAKONG_MERCHANT_STORE_LABEL,
    merchantName: process.env.BAKONG_MERCHANT_NAME,
    merchantCity: process.env.BAKONG_MERCHANT_CITY,
  },
  clientUrl: process.env.CLIENT_URL
}
