// JWT secret: required in production, insecure fallback only for local development.
const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev_only_insecure_secret');
if (!secret) throw new Error('JWT_SECRET must be set in production');
module.exports = secret;
