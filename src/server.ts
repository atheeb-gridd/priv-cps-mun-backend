import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import connectDB from './config/db';
import authRoutes from './routes/authRoutes';
import registrationRoutes from './routes/registrationRoutes';
import paymentRoutes from './routes/paymentRoutes';

import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5001;

// Connect to MongoDB Database
connectDB();

// Global Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Static file serving (for signature images, uploads, etc.)
// On Vercel the filesystem is read-only except /tmp, so runtime uploads land there
const uploadsDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, '../uploads');
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(uploadsDir));

// Serve React production build
const buildPath = path.join(__dirname, '../../build');
app.use(express.static(buildPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/registration', registrationRoutes);
app.use('/api/payment', paymentRoutes);

// Health Check Route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'CPS PRIME MUN Backend is running.' });
});

// React SPA Routing fallback (serve index.html for non-API routes)
app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/uploads')) {
    return next();
  }
  const indexPath = path.join(buildPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err && !res.headersSent) {
      console.error('Error serving index.html:', err);
      res.status(404).send('Page not found');
    }
  });
});

// Global Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ message: 'An unhandled server error occurred.' });
});

// Start Express Server (Vercel's Express runtime provides PORT and expects the app to listen)
app.listen(Number(PORT), () => {
  console.log(`CPS PRIME MUN Server listening on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
