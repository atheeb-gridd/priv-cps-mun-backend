import { google } from 'googleapis';
import stream from 'stream';
import path from 'path';
import fs from 'fs';

// Target Google Drive Shared Folder ID
export const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1VHpXRf1DIfcr-WW2FCJRwYbhpH0wAlXn';

// Path to Google Service Account Credentials
const CREDENTIALS_PATH = path.join(__dirname, '../../config/google-service-account.json');

let driveClient: any = null;

function getDriveClient() {
  if (driveClient) return driveClient;

  try {
    const scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive',
    ];

    // Prefer credentials from env (required on Vercel, where the key file isn't deployed)
    let auth;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
        scopes,
      });
    } else if (fs.existsSync(CREDENTIALS_PATH)) {
      auth = new google.auth.GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes,
      });
    } else {
      console.error(
        `Google Drive credentials not found: set GOOGLE_SERVICE_ACCOUNT_JSON or provide ${CREDENTIALS_PATH}`
      );
      return null;
    }

    driveClient = google.drive({ version: 'v3', auth });
    return driveClient;
  } catch (error) {
    console.error('Failed to initialize Google Drive client:', error);
    return null;
  }
}

/**
 * Upload a file Buffer directly to Google Drive and return the shareable webViewLink
 */
export async function uploadFileToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string = 'image/jpeg',
  folderId: string = GOOGLE_DRIVE_FOLDER_ID
): Promise<{ fileId: string; webViewLink: string; webContentLink: string }> {
  const drive = getDriveClient();
  if (!drive) {
    throw new Error('Google Drive service is not configured.');
  }

  try {
    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileBuffer);

    // Upload file to Google Drive
    const response = await drive.files.create({
      supportsAllDrives: true,
      supportsTeamDrives: true,
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: mimeType || 'application/octet-stream',
        body: bufferStream,
      },
      fields: 'id, webViewLink, webContentLink',
    });

    const fileId = response.data.id;
    const webViewLink = response.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
    const webContentLink = response.data.webContentLink || `https://drive.google.com/uc?id=${fileId}&export=download`;

    // Make the file publicly viewable so links work seamlessly for admins
    if (fileId) {
      try {
        await drive.permissions.create({
          fileId: fileId,
          supportsAllDrives: true,
          supportsTeamDrives: true,
          requestBody: {
            role: 'reader',
            type: 'anyone',
          },
        });
      } catch (permErr: any) {
        console.warn(`Google Drive permission warning for file ${fileId}:`, permErr?.message || permErr);
      }
    }

    console.log(`✅ File "${fileName}" uploaded to Google Drive successfully. Link: ${webViewLink}`);
    return { fileId, webViewLink, webContentLink };
  } catch (driveErr: any) {
    console.warn(`⚠️ Google Drive upload failed (${driveErr?.message || driveErr}). Saving fallback to local storage.`);
    console.warn(`👉 IMPORTANT: Please ensure folder "1PHU91Vm_cXhpTWdBSYzOtGl__57yI2d6" is shared with Editor permission for: cps-prime-drive@cps-prime-mun-drive-api.iam.gserviceaccount.com`);

    const uploadsDir = process.env.VERCEL
      ? '/tmp/uploads'
      : path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const localFilePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(localFilePath, fileBuffer);
    const localUrl = `/uploads/${fileName}`;
    return { fileId: `local_${Date.now()}`, webViewLink: localUrl, webContentLink: localUrl };
  }
}

/**
 * Upload a Base64 Data URL or string to Google Drive
 */
export async function uploadBase64ToDrive(
  base64Data: string,
  fileName: string,
  folderId: string = GOOGLE_DRIVE_FOLDER_ID
): Promise<{ fileId: string; webViewLink: string; webContentLink: string }> {
  let mimeType = 'image/jpeg';
  let cleanBase64 = base64Data;

  if (base64Data.includes(';base64,')) {
    const parts = base64Data.split(';base64,');
    mimeType = parts[0].replace('data:', '');
    cleanBase64 = parts[1];
  } else if (base64Data.startsWith('data:')) {
    const matches = base64Data.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
    if (matches && matches[1]) {
      mimeType = matches[1];
    }
    cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  }

  const fileBuffer = Buffer.from(cleanBase64, 'base64');
  return uploadFileToDrive(fileBuffer, fileName, mimeType, folderId);
}

/**
 * Scan details object for base64 file documents and upload them to Google Drive automatically
 */
export async function processAndUploadBase64Documents(details: Record<string, any>, registrationId: string): Promise<Record<string, any>> {
  if (!details) return details;
  const regId = registrationId || 'REG';
  const name = details.fullName || details.name || 'Delegate';

  // 1. Student ID Card Document
  const studentIdData = details.docStudentIdFile?.data || details.docStudentIdFile || details.docStudentId || details.studentIdDoc;
  if (typeof studentIdData === 'string' && (studentIdData.startsWith('data:') || studentIdData.length > 500) && !details.docStudentIdDriveUrl) {
    try {
      const fileName = `${regId}_${name.replace(/[^a-zA-Z0-9]/g, '_')}_StudentID_${Date.now()}`;
      const res = await uploadBase64ToDrive(studentIdData, fileName);
      details.docStudentIdDriveUrl = res.webViewLink;
      details.docStudentId = res.webViewLink;
    } catch (err: any) {
      console.warn('Failed to upload Student ID to Google Drive:', err?.message || err);
    }
  }

  // 2. Photo / Aadhar Document
  const photoData = details.docPhotoFile?.data || details.docPhotoFile || details.docPhoto || details.docAadhar || details.aadharDoc;
  if (typeof photoData === 'string' && (photoData.startsWith('data:') || photoData.length > 500) && !details.docPhotoDriveUrl) {
    try {
      const fileName = `${regId}_${name.replace(/[^a-zA-Z0-9]/g, '_')}_Photo_Aadhar_${Date.now()}`;
      const res = await uploadBase64ToDrive(photoData, fileName);
      details.docPhotoDriveUrl = res.webViewLink;
      details.docAadharDriveUrl = res.webViewLink;
      details.docPhoto = res.webViewLink;
      details.docAadhar = res.webViewLink;
    } catch (err: any) {
      console.warn('Failed to upload Photo/Aadhar to Google Drive:', err?.message || err);
    }
  }

  // 3. School Letterhead Document
  const letterheadData = details.schoolAuthLetterFile?.data || details.schoolAuthLetterFile || details.schoolLetterheadFile?.data || details.schoolLetterheadFile || details.schoolAuthLetter || details.schoolLetterhead || details.docLetterhead || details.letterheadDoc || details.letterhead;
  if (typeof letterheadData === 'string' && (letterheadData.startsWith('data:') || letterheadData.length > 100) && (!details.docLetterheadDriveUrl && !details.schoolAuthLetterUrl)) {
    try {
      const fileName = `${regId}_${name.replace(/[^a-zA-Z0-9]/g, '_')}_SchoolLetterhead_${Date.now()}`;
      const res = await uploadBase64ToDrive(letterheadData, fileName);
      details.docLetterheadDriveUrl = res.webViewLink;
      details.schoolLetterheadDriveUrl = res.webViewLink;
      details.schoolAuthLetterDriveUrl = res.webViewLink;
      details.schoolAuthLetterUrl = res.webViewLink;
      details.docLetterhead = res.webViewLink;
      details.schoolLetterhead = res.webViewLink;
      details.schoolAuthLetter = res.webViewLink;
    } catch (err: any) {
      console.warn('Failed to upload School Letterhead to Google Drive:', err?.message || err);
    }
  }

  // 3. School Roster Delegates
  if (Array.isArray(details.delegates)) {
    for (let i = 0; i < details.delegates.length; i++) {
      const del = details.delegates[i];
      const delName = del.name || `Delegate_${i + 1}`;

      const delStudentId = del.docStudentIdFile?.data || del.docStudentIdFile || del.docStudentId;
      if (typeof delStudentId === 'string' && (delStudentId.startsWith('data:') || delStudentId.length > 500) && !del.docStudentIdDriveUrl) {
        try {
          const fileName = `${regId}_Del${i + 1}_${delName.replace(/[^a-zA-Z0-9]/g, '_')}_StudentID_${Date.now()}`;
          const res = await uploadBase64ToDrive(delStudentId, fileName);
          del.docStudentIdDriveUrl = res.webViewLink;
          del.docStudentId = res.webViewLink;
        } catch (err) {}
      }

      const delPhoto = del.docPhotoFile?.data || del.docPhotoFile || del.docPhoto || del.docAadhar;
      if (typeof delPhoto === 'string' && (delPhoto.startsWith('data:') || delPhoto.length > 500) && !del.docPhotoDriveUrl) {
        try {
          const fileName = `${regId}_Del${i + 1}_${delName.replace(/[^a-zA-Z0-9]/g, '_')}_Photo_${Date.now()}`;
          const res = await uploadBase64ToDrive(delPhoto, fileName);
          del.docPhotoDriveUrl = res.webViewLink;
          del.docAadharDriveUrl = res.webViewLink;
          del.docPhoto = res.webViewLink;
          del.docAadhar = res.webViewLink;
        } catch (err) {}
      }
    }
  }

  return details;
}
