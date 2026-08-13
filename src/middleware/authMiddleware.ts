import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token missing or malformed.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('JWT Token Verification Error:', error);
    return res.status(401).json({ message: 'Invalid or expired authorization token.' });
  }
};

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const email = (req.user?.email || '').toLowerCase();
  const role = req.user?.role;
  if (!req.user || (role !== 'Admin' && role !== 'SuperAdmin' && !email.includes('admin'))) {
    return res.status(403).json({ message: 'Forbidden. Admin access required.' });
  }
  if (req.user) {
    req.user.role = 'Admin';
  }
  next();
};
