export default () => ({
  port: parseInt(process.env.PORT || "3000", 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  wsPath: process.env.WS_PATH || '/ws',
  
  webrtc: {
    // Delivered to the browser with the call so the client can gather ICE
    // candidates. Without TURN configured, calls only work on the same LAN.
    stunServerUrl: process.env.STUN_SERVER_URL || 'stun:stun.l.google.com:19302',
    turnServerUrl: process.env.TURN_SERVER_URL || '',
    turnUsername: process.env.TURN_USERNAME || '',
    turnCredential: process.env.TURN_CREDENTIAL || '',
  },

  database: {
    url: process.env.DATABASE_URL,
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || "6379", 10) || 6379,
  },
  
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '30d',
  },
  
  argon2: {
    memoryCost: parseInt(process.env.ARGON2_MEMORY_COST || "65536", 10) || 65536,
    timeCost: parseInt(process.env.ARGON2_TIME_COST || "3", 10) || 3,
    parallelism: parseInt(process.env.ARGON2_PARALLELISM || "4", 10) || 4,
    pepper: process.env.PASSCODE_PEPPER || '',
  },
  
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    // What browsers use for presigned links; empty means the same as `endpoint`.
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT,
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    region: process.env.S3_REGION || 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    buckets: {
      avatars: process.env.S3_BUCKET_AVATARS || 'avatars',
      chatMedia: process.env.S3_BUCKET_MEDIA || 'chat-media',
      voice: process.env.S3_BUCKET_VOICE || 'voice',
      video: process.env.S3_BUCKET_VIDEO || 'video',
      stickers: process.env.S3_BUCKET_STICKERS || 'stickers',
      exports: process.env.S3_BUCKET_EXPORTS || 'exports',
      temp: process.env.S3_BUCKET_TEMP || 'temp',
    },
  },
  
  vapid: {
    subject: process.env.VAPID_SUBJECT || '',
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
  },
  
  turn: {
    url: process.env.TURN_SERVER_URL || '',
    username: process.env.TURN_USERNAME || '',
    credential: process.env.TURN_CREDENTIAL || '',
  },
  
  upload: {
    maxSizeMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB || "50", 10) || 50,
  },
});
