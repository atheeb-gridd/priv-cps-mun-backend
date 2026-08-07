import multer from 'multer';

// Use Memory Storage for multer to buffer uploaded files in memory
const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB maximum file size limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common document and image formats
    if (
      file.mimetype.startsWith('image/') ||
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only images (JPG, PNG) and PDFs/Docs are allowed.'));
    }
  },
});
