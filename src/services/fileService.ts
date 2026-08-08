import fs from 'fs';
import path from 'path';

// On Vercel only /tmp is writable, so uploads land there (ephemeral — Drive is primary storage)
const uploadsDir = process.env.VERCEL
  ? '/tmp/uploads'
  : path.join(__dirname, '../../uploads');

function ensureUploadsDir() {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

function saveBase64File(fileObj: any, prefix: string): string | null {
  if (!fileObj) return null;
  if (!fileObj.data || typeof fileObj.data !== 'string') {
    return typeof fileObj === 'string' ? fileObj : (fileObj.name || null);
  }

  try {
    const rawData = fileObj.data;
    const base64Data = rawData.includes(',') ? rawData.split(',')[1] : rawData;
    const buffer = Buffer.from(base64Data, 'base64');
    
    ensureUploadsDir();
    const cleanName = (fileObj.name || 'document.png').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filename = `${Date.now()}_${prefix}_${cleanName}`;
    const filePath = path.join(uploadsDir, filename);

    fs.writeFileSync(filePath, buffer);
    return filename;
  } catch (err) {
    console.error(`Failed to save uploaded file ${prefix}:`, err);
    return fileObj.name || null;
  }
}

export async function processRegistrationFiles(
  details: any,
  registrationType: 'individual' | 'school'
): Promise<any> {
  const updatedDetails = { ...details };

  if (registrationType === 'individual') {
    if (updatedDetails.docStudentIdFile) {
      const savedName = saveBase64File(updatedDetails.docStudentIdFile, 'StudentID');
      if (savedName) {
        updatedDetails.docStudentId = savedName;
        updatedDetails.docStudentIdUrl = `/uploads/${savedName}`;
      }
    }

    if (updatedDetails.docPhotoFile) {
      const savedName = saveBase64File(updatedDetails.docPhotoFile, 'Photo');
      if (savedName) {
        updatedDetails.docPhoto = savedName;
        updatedDetails.docPhotoUrl = `/uploads/${savedName}`;
      }
    }
  } else if (registrationType === 'school') {
    if (updatedDetails.schoolAuthLetterFile) {
      const savedName = saveBase64File(updatedDetails.schoolAuthLetterFile, 'AuthLetter');
      if (savedName) {
        updatedDetails.schoolAuthLetter = savedName;
        updatedDetails.schoolAuthLetterUrl = `/uploads/${savedName}`;
      }
    }

    if (Array.isArray(updatedDetails.delegates)) {
      updatedDetails.delegates.forEach((del: any, idx: number) => {
        if (del.docStudentIdFile) {
          const savedName = saveBase64File(del.docStudentIdFile, `DelegateID_${idx + 1}`);
          if (savedName) {
            del.docStudentId = savedName;
            del.docStudentIdUrl = `/uploads/${savedName}`;
          }
        }
      });
    }
  }

  return updatedDetails;
}
