import { uploadBase64ToDrive, GOOGLE_DRIVE_FOLDER_ID } from '../services/driveService';

async function run() {
  console.log('Testing document upload to Google Drive folder:', GOOGLE_DRIVE_FOLDER_ID);
  
  // 1x1 pixel PNG image base64
  const sampleBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  
  try {
    const res = await uploadBase64ToDrive(sampleBase64, `TEST_DELEGATE_IMAGE_${Date.now()}.png`);
    console.log('🎉 REGISTRATION DOCUMENT DRIVE UPLOAD SUCCESSFUL!');
    console.log('File ID:', res.fileId);
    console.log('Web View Link:', res.webViewLink);
  } catch (err: any) {
    console.error('Drive upload test failed:', err);
  }
}

run();
