import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  email: string;
  role: 'Delegate' | 'Admin' | 'SuperAdmin';
  username?: string;
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'cps_access_fallback_secret_key_123';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'cps_refresh_fallback_secret_key_123';

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '24h' });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, ACCESS_SECRET) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, REFRESH_SECRET) as TokenPayload;
};
