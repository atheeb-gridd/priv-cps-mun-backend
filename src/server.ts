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
    origin: true, // Reflect request origin to satisfy credentials requirement
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

import fs from 'fs';
import Registration from './models/Registration';

// Static file serving (for signature images, uploads, etc.)
// On Vercel the filesystem is read-only except /tmp, so runtime uploads land there
const uploadsDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, '../uploads');
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(uploadsDir));

// Dynamic Uploads / Document Serving Fallback for Vercel Serverless
app.get('/uploads/:filename', async (req: Request, res: Response) => {
  const filename = req.params.filename || '';
  const decodedFilename = decodeURIComponent(filename).trim();

  // 1. If file exists in local temporary directory, serve it directly
  const localFilePath = path.join(uploadsDir, decodedFilename);
  if (fs.existsSync(localFilePath)) {
    return res.sendFile(localFilePath);
  }

  // 2. Query MongoDB for registration document containing this file
  try {
    await connectDB();
    const reg = await Registration.findOne({
      $or: [
        { 'details.docPhoto': decodedFilename },
        { 'details.docStudentId': decodedFilename },
        { 'details.docAadhar': decodedFilename },
        { 'details.schoolAuthLetter': decodedFilename },
        { 'details.schoolLetterhead': decodedFilename },
        { 'details.docPhotoFile.name': decodedFilename },
        { 'details.docStudentIdFile.name': decodedFilename },
        { 'details.docAadharFile.name': decodedFilename },
        { 'details.schoolAuthLetterFile.name': decodedFilename },
        { 'details.delegates.docStudentId': decodedFilename },
        { 'details.delegates.docStudentIdFile.name': decodedFilename },
        { 'details.delegatesList.docStudentId': decodedFilename },
        { 'details.delegatesList.docStudentIdFile.name': decodedFilename }
      ]
    });

    if (reg && reg.details) {
      const extractBase64 = (obj: any): string | null => {
        if (!obj) return null;
        if (typeof obj === 'string' && obj.startsWith('data:')) return obj;
        if (obj.data && typeof obj.data === 'string' && obj.data.startsWith('data:')) return obj.data;
        return null;
      };

      let base64Str = extractBase64(reg.details.docPhotoFile)
        || extractBase64(reg.details.docPhoto)
        || extractBase64(reg.details.docStudentIdFile)
        || extractBase64(reg.details.docStudentId)
        || extractBase64(reg.details.docAadharFile)
        || extractBase64(reg.details.docAadhar)
        || extractBase64(reg.details.schoolAuthLetterFile)
        || extractBase64(reg.details.schoolAuthLetter);

      if (!base64Str && Array.isArray(reg.details.delegates)) {
        for (const del of reg.details.delegates) {
          base64Str = extractBase64(del.docStudentIdFile)
            || extractBase64(del.docStudentId)
            || extractBase64(del.docPhotoFile)
            || extractBase64(del.docPhoto);
          if (base64Str) break;
        }
      }

      if (base64Str) {
        let mimeType = 'image/jpeg';
        if (decodedFilename.endsWith('.png')) mimeType = 'image/png';
        else if (decodedFilename.endsWith('.pdf')) mimeType = 'application/pdf';
        else if (decodedFilename.endsWith('.webp')) mimeType = 'image/webp';

        if (base64Str.includes(';base64,')) {
          const parts = base64Str.split(';base64,');
          mimeType = parts[0].replace('data:', '') || mimeType;
          const buf = Buffer.from(parts[1], 'base64');
          res.setHeader('Content-Type', mimeType);
          res.setHeader('Content-Disposition', `inline; filename="${decodedFilename}"`);
          return res.send(buf);
        } else if (base64Str.startsWith('data:')) {
          const clean = base64Str.replace(/^data:[^;]+;base64,/, '');
          const buf = Buffer.from(clean, 'base64');
          res.setHeader('Content-Type', mimeType);
          res.setHeader('Content-Disposition', `inline; filename="${decodedFilename}"`);
          return res.send(buf);
        }
      }

      // If a Google Drive URL is stored, redirect to it
      const driveUrl = reg.details.docPhotoDriveUrl || reg.details.docStudentIdDriveUrl || reg.details.schoolAuthLetterDriveUrl;
      if (driveUrl && driveUrl.startsWith('http')) {
        return res.redirect(driveUrl);
      }
    }
  } catch (dbErr) {
    console.error('Error fetching document from database:', dbErr);
  }

  return res.status(404).send('Document not found in server or database.');
});

// Serve React production build
const buildPath = path.join(__dirname, '../../build');
app.use(express.static(buildPath));

// Middleware to ensure DB connection attempt is initiated before handling API requests
// and disable stale 304 Caching for live API responses
app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    await connectDB();
  } catch (dbErr: any) {
    console.warn('MongoDB connection notice on API request:', dbErr?.message || dbErr);
  }
  next();
});

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
  res.status(500).json({ message: err.message || 'An unhandled server error occurred.' });
});

// Start Express Server only when NOT running on Vercel.
// On Vercel, the serverless runtime injects requests directly into the exported app —
// calling app.listen() would crash the function.
if (!process.env.VERCEL) {
  app.listen(Number(PORT), () => {
    console.log(`CPS PRIME MUN Server listening on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

export default app;
