import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import EmailLog from '../models/EmailLog';
import { generateMasterExcel } from './excelService';

// Helper to convert signature files to Base64 Data URIs so email clients render them 100% reliably
const getSignatureDataUri = (filename: string): string => {
  try {
    const possiblePaths = [
      path.join(__dirname, '../../public/signatures', filename),
      path.join(__dirname, '../public/signatures', filename),
      path.join(process.cwd(), 'public/signatures', filename),
      path.join(process.cwd(), 'backend/public/signatures', filename),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const fileBuffer = fs.readFileSync(p);
        return `data:image/png;base64,${fileBuffer.toString('base64')}`;
      }
    }
  } catch (err) {
    console.error(`Error loading signature file ${filename}:`, err);
  }
  return '';
};

const getActiveFeeSetting = (): number => {
  try {
    const dbFile = path.join(__dirname, '../../db.json');
    if (fs.existsSync(dbFile)) {
      const data = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
      if (data.settings && Array.isArray(data.settings)) {
        const testModeSetting = data.settings.find((item: any) => item.key === 'testMode');
        const testMode = testModeSetting ? Boolean(testModeSetting.value) : false;
        if (testMode) return 1;

        const now = new Date();
        const aug15 = new Date('2026-08-15T00:00:00+05:30');
        return now < aug15 ? 750 : 800;
      }
    }
  } catch (e) {}
  return 750;
};

const getSignatureBlockHtml = (): string => {
  return `
    <div style="margin-top: 35px; padding: 20px 24px; background: linear-gradient(135deg, rgba(220, 168, 67, 0.07) 0%, rgba(18, 18, 24, 0.85) 100%); border: 1px solid rgba(220, 168, 67, 0.22); border-left: 4px solid #DCA843; border-radius: 8px; text-align: left; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);">
      <p style="font-size: 13px; font-style: italic; margin: 0 0 6px 0; color: #b0b0b0; font-family: 'Montserrat', Arial, sans-serif;">With Regards,</p>
      <p style="font-size: 15px; font-weight: 700; margin: 0; color: #DCA843; font-family: 'Cinzel', serif; letter-spacing: 1px; text-transform: uppercase;">Director of Registration</p>
      <p style="font-size: 12px; font-weight: 600; margin: 4px 0 0 0; color: #ffffff; font-family: 'Cinzel', 'Montserrat', Arial, sans-serif; letter-spacing: 2px; opacity: 0.9;">CPS PRIME MUN 5.O</p>
    </div>
  `;
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

const logSentEmail = async (emailType: string, recipient: string, status: string, messageId: string = '') => {
  try {
    const emailLog = new EmailLog({
      timestamp: new Date(),
      emailType,
      recipient,
      deliveryStatus: status,
      messageId: messageId || 'msg_' + Math.random().toString(36).substring(2, 9),
    });
    await emailLog.save();
    // Run Excel generation update in background
    generateMasterExcel().catch(err => console.error('Background Excel update error:', err));
  } catch (err) {
    console.error('Failed to log email in DB:', err);
  }
};
const COMMITTEE_WHATSAPP_LINKS: Record<string, string> = {
  UNGA: 'https://chat.whatsapp.com/ImNiYtw3W5t8xIHuPTYgWW',
  UNHRC: 'https://chat.whatsapp.com/ImNiYtw3W5t8xIHuPTYgWW',
  UNSC: 'https://chat.whatsapp.com/ImNiYtw3W5t8xIHuPTYgWW',
  LOK_SABHA: 'https://chat.whatsapp.com/ImNiYtw3W5t8xIHuPTYgWW',
  HCC: 'https://chat.whatsapp.com/ImNiYtw3W5t8xIHuPTYgWW',
  IPJ: 'https://chat.whatsapp.com/ImNiYtw3W5t8xIHuPTYgWW',
  IPP: 'https://chat.whatsapp.com/ImNiYtw3W5t8xIHuPTYgWW',
};

const getBgGuidesUrl = (): string => `${process.env.FRONTEND_URL || 'http://localhost:3000'}/backgroundguides`;

const getEmailWrapper = (title: string, subtitle: string, bodyContent: string): string => {
  return `
    <div style="background-color: #0c0d12; color: #ffffff; font-family: 'Cinzel', 'Montserrat', Arial, sans-serif; padding: 40px 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #09090b; border: 1px solid #DCA843; border-radius: 12px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        <h2 style="color: #DCA843; font-family: 'Cinzel', serif; letter-spacing: 2px; margin-bottom: 5px; font-size: 24px; text-align: center;">CPS PRIME MUN 5.O</h2>
        <p style="color: #DCA843; letter-spacing: 4px; font-size: 11px; margin-top: 0; margin-bottom: 20px; font-weight: bold; text-transform: uppercase; text-align: center;">${subtitle}</p>
        <h3 style="color: #ffffff; text-align: center; margin-bottom: 25px;">${title}</h3>
        <div style="border-bottom: 1px solid rgba(220, 168, 67, 0.2); margin-bottom: 30px;"></div>
        ${bodyContent}
        ${getSignatureBlockHtml()}
      </div>
    </div>
  `;
};

const getVerificationEmailTemplate = (otp: string, name: string): string => {
  return `
    <div style="background-color: #0c0d12; color: #ffffff; font-family: 'Cinzel', 'Montserrat', Arial, sans-serif; padding: 40px 20px; text-align: center;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #09090b; border: 1px solid #DCA843; border-radius: 12px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        
        <!-- Header Logo simulation/Title -->
        <h2 style="color: #DCA843; font-family: 'Cinzel', serif; letter-spacing: 2px; margin-bottom: 5px; font-size: 24px;">CPS PRIME MUN 5.O</h2>
        <p style="color: #DCA843; letter-spacing: 4px; font-size: 11px; margin-top: 0; margin-bottom: 30px; font-weight: bold; text-transform: uppercase;">Conquer From Within</p>
        
        <div style="border-bottom: 1px solid rgba(220, 168, 67, 0.2); margin-bottom: 30px;"></div>
        
        <p style="font-size: 14px; line-height: 1.6; text-align: left; color: #bababa;">Dear ${name},</p>
        <p style="font-size: 14px; line-height: 1.6; text-align: left; color: #bababa;">Welcome to CPS PRIME MUN 5.O. Thank you for creating your account.</p>
        <p style="font-size: 14px; line-height: 1.6; text-align: left; color: #bababa;">To continue with your registration, please verify your email address using the verification code below:</p>
        
        <!-- OTP Card -->
        <div style="background-color: rgba(220, 168, 67, 0.1); border: 1px dashed #DCA843; border-radius: 8px; padding: 20px; margin: 30px 0; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #DCA843;">
          ${otp}
        </div>
        
        <p style="font-size: 12px; color: #888888; margin-bottom: 30px; text-align: left;">This code is valid for 10 minutes. If you did not create this account, please ignore this email.</p>
        
        ${getSignatureBlockHtml()}
        
      </div>
    </div>
  `;
};

const getResetEmailTemplate = (otp: string, name: string): string => {
  return `
    <div style="background-color: #0c0d12; color: #ffffff; font-family: 'Cinzel', 'Montserrat', Arial, sans-serif; padding: 40px 20px; text-align: center;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #09090b; border: 1px solid #DCA843; border-radius: 12px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        
        <h2 style="color: #DCA843; font-family: 'Cinzel', serif; letter-spacing: 2px; margin-bottom: 5px; font-size: 24px;">CPS PRIME MUN 5.O</h2>
        <p style="color: #DCA843; letter-spacing: 4px; font-size: 11px; margin-top: 0; margin-bottom: 30px; font-weight: bold; text-transform: uppercase;">Conquer From Within</p>
        
        <div style="border-bottom: 1px solid rgba(220, 168, 67, 0.2); margin-bottom: 30px;"></div>
        
        <p style="font-size: 14px; line-height: 1.6; text-align: left; color: #bababa;">Dear ${name},</p>
        <p style="font-size: 14px; line-height: 1.6; text-align: left; color: #bababa;">We received a request to reset your CPS PRIME MUN 5.O account password.</p>
        <p style="font-size: 14px; line-height: 1.6; text-align: left; color: #bababa;">Please use the verification code below to complete your password reset:</p>
        
        <!-- OTP Card -->
        <div style="background-color: rgba(220, 168, 67, 0.1); border: 1px dashed #DCA843; border-radius: 8px; padding: 20px; margin: 30px 0; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #DCA843;">
          ${otp}
        </div>
        
        <p style="font-size: 12px; color: #888888; margin-bottom: 30px; text-align: left;">This code is valid for 10 minutes. If you did not request a password reset, please ignore this email and secure your account.</p>
        
        ${getSignatureBlockHtml()}
        
      </div>
    </div>
  `;
};

export const sendVerificationEmail = async (email: string, name: string, otp: string): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';
  const mailOptions = {
    from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
    to: email,
    subject: 'Verify Your Email – CPS PRIME MUN 5.O',
    html: getVerificationEmailTemplate(otp, name),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Verification email sent successfully to ${email}`);
    await logSentEmail('OTP (Verification)', email, 'Sent');
  } catch (error) {
    console.error(`Error sending verification email to ${email}:`, error);
    await logSentEmail('OTP (Verification)', email, 'Failed');
    console.log(`
======================================================
⚠️  SMTP DISPATCH FAILED
Email: ${email}
Verification Code (OTP): ${otp}
Please enter this code on the verification screen to proceed.
======================================================
    `);
  }
};

export const sendResetPasswordEmail = async (email: string, name: string, otp: string): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';
  const mailOptions = {
    from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
    to: email,
    subject: 'Reset Password Code – CPS PRIME MUN 5.O',
    html: getResetEmailTemplate(otp, name),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent successfully to ${email}`);
    await logSentEmail('OTP (Reset Password)', email, 'Sent');
  } catch (error) {
    console.error(`Error sending password reset email to ${email}:`, error);
    await logSentEmail('OTP (Reset Password)', email, 'Failed');
    console.log(`
======================================================
⚠️  SMTP DISPATCH FAILED
Email: ${email}
Password Reset Code: ${otp}
======================================================
    `);
  }
};

export const sendRegistrationConfirmationEmail = async (email: string, regData: any): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';
  
  const isIndividual = regData.registrationType === 'individual';
  const details = regData.details || regData.detailsList || {};
  
  let detailsHtml = '';
  if (isIndividual) {
    detailsHtml = `
      <h3 style="color: #DCA843; font-family: 'Cinzel', serif; border-bottom: 1px solid rgba(220,168,67,0.2); padding-bottom: 8px; margin-top: 30px; text-transform: uppercase; font-size: 14px;">Delegate Profile</h3>
      <table style="width:100%; border-collapse:collapse; color:#bababa; font-size:13px; margin-top:10px;">
        <tr><td style="padding:6px 0; font-weight:bold; width:35%;">Full Name</td><td style="color:#ffffff;">${details.fullName || ''}</td></tr>
        <tr><td style="padding:6px 0; font-weight:bold;">Gender</td><td style="color:#ffffff;">${details.gender || ''}</td></tr>
        <tr><td style="padding:6px 0; font-weight:bold;">Date of Birth</td><td style="color:#ffffff;">${details.dob || ''}</td></tr>
        <tr><td style="padding:6px 0; font-weight:bold;">Grade/Class & Section</td><td style="color:#ffffff;">Grade ${details.gradeClass || ''} - Section ${details.section || ''}</td></tr>
        <tr><td style="padding:6px 0; font-weight:bold;">School Name</td><td style="color:#ffffff;">${details.schoolName || ''} (${details.schoolCity || ''})</td></tr>
        <tr><td style="padding:6px 0; font-weight:bold;">Mobile Number</td><td style="color:#ffffff;">${details.mobile || ''}</td></tr>
      </table>

      <h3 style="color: #DCA843; font-family: 'Cinzel', serif; border-bottom: 1px solid rgba(220,168,67,0.2); padding-bottom: 8px; margin-top: 25px; text-transform: uppercase; font-size: 14px;">Parent/Guardian Info</h3>
      <table style="width:100%; border-collapse:collapse; color:#bababa; font-size:13px; margin-top:10px;">
        <tr><td style="padding:6px 0; font-weight:bold; width:35%;">Parent Name</td><td style="color:#ffffff;">${details.parentName || ''}</td></tr>
        <tr><td style="padding:6px 0; font-weight:bold;">Parent Mobile</td><td style="color:#ffffff;">${details.parentMobile || ''}</td></tr>
        <tr><td style="padding:6px 0; font-weight:bold;">Parent Email</td><td style="color:#ffffff;">${details.parentEmail || ''}</td></tr>
      </table>

      <h3 style="color: #DCA843; font-family: 'Cinzel', serif; border-bottom: 1px solid rgba(220,168,67,0.2); padding-bottom: 8px; margin-top: 25px; text-transform: uppercase; font-size: 14px;">MUN Profile</h3>
      <table style="width:100%; border-collapse:collapse; color:#bababa; font-size:13px; margin-top:10px;">
        <tr><td style="padding:6px 0; font-weight:bold; width:35%;">First MUN?</td><td style="color:#ffffff;">${details.isFirstMUN || ''}</td></tr>
        <tr><td style="padding:6px 0; font-weight:bold;">Prior MUNs Count</td><td style="color:#ffffff;">${details.numMUNs || '0'}</td></tr>
        <tr><td style="padding:6px 0; font-weight:bold;">Allocated Committee</td><td style="color:#ffffff;">${(() => {
          const comm = regData.allocatedCommittee || details.allocatedCommittee || details.committee || 'Pending';
          return comm;
        })()}</td></tr>
        <tr><td style="padding:6px 0; font-weight:bold;">Allocated Country</td><td style="color: #DCA843; font-weight:bold;">${(() => {
          const comm = regData.allocatedCommittee || details.allocatedCommittee || details.committee || '';
          if (/IPP|IPJ/i.test(comm)) return 'N/A';
          return regData.allocatedCountry || details.allocatedCountry ? `<span style="color:#ffffff;">${regData.allocatedCountry || details.allocatedCountry}</span>` : 'To be revealed on 8th August 2026';
        })()}</td></tr>
      </table>
    `;
  } else {
    const delegatesList = details.delegates || [];
    let rosterRows = '';
    delegatesList.forEach((del: any, idx: number) => {
      const delComm = del.allocatedCommittee || del.selectedCommittee || '';
      const isIPP_IPJ = delComm.includes('IPP') || delComm.includes('IPJ');
      const delCountry = isIPP_IPJ ? 'N/A' : (del.allocatedCountry || 'Pending');
      rosterRows += `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11px;">
          <td style="padding: 8px 5px; color:#ffffff;">${idx + 1}</td>
          <td style="padding: 8px 5px; color:#ffffff; font-weight:bold;">${del.name || del.fullName || 'Delegate'}</td>
          <td style="padding: 8px 5px;">${del.allocatedCommittee || del.selectedCommittee || ''}</td>
          <td style="padding: 8px 5px; color:#DCA843; font-weight:bold;">${delCountry}</td>
          <td style="padding: 8px 5px;">${del.email || ''}</td>
        </tr>
      `;
    });
    
    detailsHtml = `
      <h3 style="color: #DCA843; font-family: 'Cinzel', serif; border-bottom: 1px solid rgba(220,168,67,0.2); padding-bottom: 8px; margin-top: 30px; text-transform: uppercase; font-size: 14px;">Delegation Details</h3>
      <table style="width:100%; border-collapse:collapse; color:#bababa; font-size:13px; margin-top:10px;">
        <tr><td style="padding:6px 0; font-weight:bold; width:35%;">Institution Name</td><td style="color:#ffffff;">${details.schoolName || ''} (${details.schoolCity || ''})</td></tr>
        <tr><td style="padding:6px 0; font-weight:bold;">Teacher-in-Charge</td><td style="color:#ffffff;">${details.teacherName || ''}</td></tr>
        <tr><td style="padding:6px 0; font-weight:bold;">Teacher Email</td><td style="color:#ffffff;">${details.teacherEmail || ''}</td></tr>
        <tr><td style="padding:6px 0; font-weight:bold;">Teacher Mobile</td><td style="color:#ffffff;">${details.teacherMobile || ''}</td></tr>
        <tr><td style="padding:6px 0; font-weight:bold;">Delegates Roster Size</td><td style="color:#ffffff; font-weight:bold;">${delegatesList.length} Students</td></tr>
      </table>

      <h3 style="color: #DCA843; font-family: 'Cinzel', serif; margin-top: 30px; margin-bottom: 10px; text-transform: uppercase; font-size: 14px;">Delegates Roster</h3>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; color:#bababa; font-size:12px; text-align:left;">
          <thead>
            <tr style="border-bottom: 2px solid #DCA843; font-family:'Cinzel', serif; font-size:10px; color:#DCA843;">
              <th style="padding: 8px 5px;">S.No</th>
              <th style="padding: 8px 5px;">Name</th>
              <th style="padding: 8px 5px;">Committee</th>
              <th style="padding: 8px 5px;">Allocated Country</th>
              <th style="padding: 8px 5px;">Email</th>
            </tr>
          </thead>
          <tbody>
            ${rosterRows || '<tr><td colspan="5" style="text-align:center; padding: 20px;">No delegates registered.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  const html = `
    <div style="background-color: #0c0d12; color: #ffffff; font-family: 'Cinzel', 'Montserrat', Arial, sans-serif; padding: 40px 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #09090b; border: 2px solid #DCA843; border-radius: 12px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        
        <div style="text-align:center;">
          <h2 style="color: #DCA843; font-family: 'Cinzel', serif; letter-spacing: 2px; margin-bottom: 5px; font-size: 24px;">CPS PRIME MUN 5.O</h2>
          <p style="color: #DCA843; letter-spacing: 4px; font-size: 11px; margin-top: 0; margin-bottom: 30px; font-weight: bold; text-transform: uppercase;">Official Registration Confirmed</p>
        </div>

        <div style="border-bottom: 1px solid rgba(220, 168, 67, 0.2); margin-bottom: 30px;"></div>
        
        <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Dear Delegate/Advisor,</p>
        <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Congratulations! Your registration for <strong>CPS PRIME MUN 5.O</strong> has been successfully received, and payment has been verified.</p>
        
        <!-- Booking Card -->
        <div style="background-color: rgba(220, 168, 67, 0.05); border: 1px solid #DCA843; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <table style="width: 100%; font-size: 13px; color: #bababa;">
            <tr>
              <td style="padding: 4px 0; font-weight: bold; width: 40%;">REGISTRATION ID</td>
              <td style="padding: 4px 0; color: #DCA843; font-family: monospace; font-size: 14px; font-weight: bold;">${regData.registrationId}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; font-weight: bold;">PAYMENT ID</td>
              <td style="padding: 4px 0; color: #ffffff;">${regData.paymentId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; font-weight: bold;">REGISTRATION TYPE</td>
              <td style="padding: 4px 0; color: #ffffff; text-transform: capitalize;">${regData.registrationType}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; font-weight: bold;">AMOUNT PAID</td>
              <td style="padding: 4px 0; color: #DCA843; font-weight: bold;">₹${(() => {
                const feeRate = getActiveFeeSetting();
                const numDel = regData.registrationType === 'individual' ? 1 : (regData.details?.delegates?.length || regData.details?.numDelegates || 1);
                const defaultAmt = regData.registrationType === 'individual' ? feeRate : (numDel * feeRate);
                const finalAmt = parseFloat(regData.amountPaid) || defaultAmt;
                return finalAmt.toFixed(2);
              })()}</td>
            </tr>
          </table>
        </div>

        ${detailsHtml}

        <div style="border-top: 1px solid rgba(220, 168, 67, 0.2); padding-top: 25px; margin-top: 30px;">
          <p style="font-size: 12px; color: #888888; line-height: 1.6;">
            📅 <strong>Conference Dates:</strong> 28th & 29th August, 2026<br/>
            📍 <strong>Venue:</strong> Chennai Public School Campus
          </p>
        </div>

        ${getSignatureBlockHtml()}
        
      </div>
    </div>
  `;

  const mailOptions = {
    from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
    to: email,
    subject: `CPS PRIME MUN 5.O – Registration Confirmed [ID: ${regData.registrationId}]`,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Registration confirmation email sent successfully to', email);
    await logSentEmail('Registration Confirmation', email, 'Sent', info.messageId);
  } catch (error) {
    console.error('Error sending registration confirmation email:', error);
    await logSentEmail('Registration Confirmation', email, 'Failed');
  }
};

export const sendCountryAllocationEmail = async (
  email: string,
  regData: any,
  parentEmail?: string
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';
  const details = regData.details || {};
  const delegateName = details.fullName || 'Delegate';
  const committee = regData.allocatedCommittee || details.allocatedCommittee || details.committee || 'Your Committee';
  const country = regData.allocatedCountry || details.allocatedCountry || '';
  const isIPP_IPJ = committee.includes('IPP') || committee.includes('IPJ');

  const waLink = COMMITTEE_WHATSAPP_LINKS[committee] || 'https://chat.whatsapp.com/ImNiYtw3W5t8xIHuPTYgWW';
  const guideLink = getBgGuidesUrl();
  const dashboardLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Dear <strong style="color:#ffffff;">${delegateName}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">We are pleased to inform you that your automatic portfolio assignment has been completed by the Secretariat. Here are your details:</p>
    
    <div style="background: rgba(220, 168, 67, 0.08); border: 1px solid rgba(220, 168, 67, 0.35); border-radius: 10px; padding: 20px; margin: 25px 0; text-align:center;">
      <p style="margin: 0 0 4px 0; font-size: 11px; color: #BABABA; text-transform: uppercase; letter-spacing: 2px;">Committee</p>
      <p style="margin: 0; font-size: 18px; font-weight: bold; color: #DCA843; font-family: 'Cinzel', serif;">${committee}</p>
      ${isIPP_IPJ ? '' : `
      <div style="border-top: 1px solid rgba(220,168,67,0.2); margin: 12px 0;"></div>
      <p style="margin: 0 0 4px 0; font-size: 11px; color: #BABABA; text-transform: uppercase; letter-spacing: 2px;">Country / Portfolio</p>
      <p style="margin: 0; font-size: 22px; font-weight: bold; color: #ffffff; font-family: 'Cinzel', serif;">${country}</p>
      `}
    </div>

    <table style="width: 100%; border-collapse: collapse; margin: 25px 0;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-weight: bold; color: #bababa; font-size: 13px;">WhatsApp Group Link</td>
        <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: right;"><a href="${waLink}" style="color: #25d366; font-weight: bold; text-decoration: none;">Join WhatsApp Group</a></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-weight: bold; color: #bababa; font-size: 13px;">Study Guide Link</td>
        <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: right;"><a href="${guideLink}" style="color: #DCA843; font-weight: bold; text-decoration: none;">View BG Guides (Revealing 10th Aug)</a></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-weight: bold; color: #bababa; font-size: 13px;">Dashboard Access</td>
        <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: right;"><a href="${dashboardLink}" style="color: #ffffff; font-weight: bold; text-decoration: none;">Delegate Portal</a></td>
      </tr>
    </table>
  `;

  const html = getEmailWrapper(
    isIPP_IPJ ? 'Committee Allocation Confirmed' : 'Country Allocation Confirmed',
    'Conquer From Within',
    bodyHtml
  );

  const recipients = [email];
  const pEmail = parentEmail || details.parentEmail;
  if (pEmail && pEmail.trim()) {
    recipients.push(pEmail.trim());
  }

  const mailOptions = {
    from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
    to: recipients.join(', '),
    subject: `🎉 Your Portfolio Allocation – CPS PRIME MUN 5.O [ID: ${regData.registrationId}]`,
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
    for (const r of recipients) {
      await logSentEmail('Country Allocation', r, 'Sent');
    }
  } catch (error) {
    for (const r of recipients) {
      await logSentEmail('Country Allocation', r, 'Failed');
    }
  }
};

export const sendCommitteeChangedEmail = async (
  email: string,
  name: string,
  regId: string,
  prevCommittee: string,
  newCommittee: string,
  parentEmail?: string
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';
  const waLink = COMMITTEE_WHATSAPP_LINKS[newCommittee] || 'https://chat.whatsapp.com/ImNiYtw3W5t8xIHuPTYgWW';
  const guideLink = getBgGuidesUrl();

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Dear <strong style="color:#ffffff;">${name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Please be advised that the Secretariat has modified your committee assignment. Here are your updated allocation details:</p>
    
    <div style="background: rgba(220, 168, 67, 0.08); border: 1px solid rgba(220, 168, 67, 0.35); border-radius: 10px; padding: 20px; margin: 25px 0;">
      <table style="width: 100%; font-size: 13px; color: #bababa;">
        <tr><td style="padding: 4px 0; font-weight: bold; width: 45%;">PREVIOUS COMMITTEE</td><td style="padding: 4px 0; color: #ffffff; text-decoration: line-through;">${prevCommittee}</td></tr>
        <tr><td style="padding: 4px 0; font-weight: bold;">NEW COMMITTEE</td><td style="padding: 4px 0; color: #DCA843; font-weight: bold;">${newCommittee}</td></tr>
        <tr><td style="padding: 4px 0; font-weight: bold;">EFFECTIVE DATE</td><td style="padding: 4px 0; color: #ffffff;">${new Date().toLocaleDateString()}</td></tr>
      </table>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin: 25px 0;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-weight: bold; color: #bababa; font-size: 13px;">New WhatsApp Group Link</td>
        <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: right;"><a href="${waLink}" style="color: #25d366; font-weight: bold; text-decoration: none;">Join WhatsApp Group</a></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-weight: bold; color: #bababa; font-size: 13px;">Study Guide Link</td>
        <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: right;"><a href="${guideLink}" style="color: #DCA843; font-weight: bold; text-decoration: none;">View BG Guides (Revealing 10th Aug)</a></td>
      </tr>
    </table>
  `;

  const html = getEmailWrapper('Committee Assignment Updated', 'Allocation Modification', bodyHtml);
  const recipients = [email];
  if (parentEmail && parentEmail.trim()) recipients.push(parentEmail.trim());

  try {
    await transporter.sendMail({
      from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
      to: recipients.join(', '),
      subject: `⚠️ Committee Assignment Updated – CPS PRIME MUN 5.O [ID: ${regId}]`,
      html
    });
    for (const r of recipients) await logSentEmail('Committee Changed', r, 'Sent');
  } catch (error) {
    for (const r of recipients) await logSentEmail('Committee Changed', r, 'Failed');
  }
};

export const sendCountryChangedEmail = async (
  email: string,
  name: string,
  regId: string,
  prevCountry: string,
  newCountry: string,
  parentEmail?: string
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Dear <strong style="color:#ffffff;">${name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Please be advised that the Secretariat has modified your country/portfolio assignment. Here are your updated allocation details:</p>
    
    <div style="background: rgba(220, 168, 67, 0.08); border: 1px solid rgba(220, 168, 67, 0.35); border-radius: 10px; padding: 20px; margin: 25px 0;">
      <table style="width: 100%; font-size: 13px; color: #bababa;">
        <tr><td style="padding: 4px 0; font-weight: bold; width: 45%;">PREVIOUS PORTFOLIO</td><td style="padding: 4px 0; color: #ffffff; text-decoration: line-through;">${prevCountry || 'Unassigned'}</td></tr>
        <tr><td style="padding: 4px 0; font-weight: bold;">NEW PORTFOLIO</td><td style="padding: 4px 0; color: #DCA843; font-weight: bold;">${newCountry}</td></tr>
        <tr><td style="padding: 4px 0; font-weight: bold;">EFFECTIVE DATE</td><td style="padding: 4px 0; color: #ffffff;">${new Date().toLocaleDateString()}</td></tr>
      </table>
    </div>
  `;

  const html = getEmailWrapper('Country/Portfolio Assignment Updated', 'Allocation Modification', bodyHtml);
  const recipients = [email];
  if (parentEmail && parentEmail.trim()) recipients.push(parentEmail.trim());

  try {
    await transporter.sendMail({
      from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
      to: recipients.join(', '),
      subject: `⚠️ Country/Portfolio Updated – CPS PRIME MUN 5.O [ID: ${regId}]`,
      html
    });
    for (const r of recipients) await logSentEmail('Country Changed', r, 'Sent');
  } catch (error) {
    for (const r of recipients) await logSentEmail('Country Changed', r, 'Failed');
  }
};

export const sendRegistrationDetailsUpdatedEmail = async (
  email: string,
  name: string,
  regId: string,
  updatedFields: string[],
  parentEmail?: string
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Dear <strong style="color:#ffffff;">${name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">We are writing to confirm that your official delegate profile details for <strong style="color:#DCA843;">CPS PRIME MUN 5.O</strong> have been updated by the Secretariat.</p>
    
    <div style="background: rgba(220, 168, 67, 0.05); border: 1px solid rgba(220, 168, 67, 0.3); border-radius: 10px; padding: 20px; margin: 25px 0;">
      <h4 style="margin: 0 0 14px 0; font-size: 13px; color: #DCA843; font-family: 'Cinzel', serif; text-transform: uppercase; letter-spacing: 1px;">Updated Profile Summary</h4>
      <div style="font-size: 13px; color: #ffffff; line-height: 1.8;">
        ${updatedFields.map(f => `<div style="padding: 8px 12px; margin-bottom: 6px; background: rgba(255,255,255,0.03); border-left: 3px solid #DCA843; border-radius: 4px;">${f}</div>`).join('')}
      </div>
    </div>
    
    <p style="font-size: 13px; line-height: 1.6; color: #bababa;">If you have any questions or require further adjustments, please contact the Secretariat team at <a href="mailto:cpsprimemun@gmail.com" style="color:#DCA843; text-decoration:none;">cpsprimemun@gmail.com</a>.</p>
  `;

  const html = getEmailWrapper('Official Registration Update', 'Registration Confirmation & Updates', bodyHtml);
  const recipients = [email];
  if (parentEmail && parentEmail.trim()) recipients.push(parentEmail.trim());

  try {
    await transporter.sendMail({
      from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
      to: recipients.join(', '),
      subject: `✨ Registration Update Confirmation – CPS PRIME MUN 5.O [ID: ${regId}]`,
      html
    });
    for (const r of recipients) await logSentEmail('Details Updated', r, 'Sent');
  } catch (error) {
    for (const r of recipients) await logSentEmail('Details Updated', r, 'Failed');
  }
};

export const sendSeatConfirmedEmail = async (
  email: string,
  name: string,
  regId: string,
  committee: string,
  country: string,
  parentEmail?: string
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #e2e8f0;">Dear <strong style="color:#ffffff;">${name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #e2e8f0;">We are thrilled to inform you that your participation has been officially <strong style="color:#10b981;">CONFIRMED</strong> by the Secretariat. Here is your final seat status:</p>
    
    <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 10px; padding: 22px; margin: 25px 0; text-align:center;">
      <p style="margin: 0 0 6px 0; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">SEAT STATUS</p>
      <p style="margin: 0 0 18px 0; font-size: 22px; font-weight: 800; color: #10b981; font-family: 'Cinzel', serif; letter-spacing: 1px; white-space: nowrap; display: inline-block;">CONFIRMED</p>
      
      <div style="border-top: 1px solid rgba(255,255,255,0.08); margin: 12px 0;"></div>
      <p style="margin: 0 0 4px 0; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">COMMITTEE</p>
      <p style="margin: 0; font-size: 16px; font-weight: bold; color: #ffffff;">${committee}</p>
      
      <div style="border-top: 1px solid rgba(255,255,255,0.08); margin: 12px 0;"></div>
      <p style="margin: 0 0 4px 0; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">ALLOCATED COUNTRY</p>
      <p style="margin: 0; font-size: 18px; font-weight: bold; color: #DCA843;">${/IPP|IPJ/i.test(committee) ? 'N/A' : (country || 'Pending')}</p>
    </div>

    <p style="font-size: 13px; line-height: 1.7; color: #e2e8f0;"><strong style="color:#ffffff;">Final Instructions:</strong> Please ensure you report to the school campus by 08:00 AM on August 28th. Remember to carry your confirmation letter and a valid student identification card for security check-in.</p>
  `;

  const html = getEmailWrapper('Seat Confirmed & Attendance Approved', 'Admission Confirmation', bodyHtml);
  const recipients = [email];
  if (parentEmail && parentEmail.trim()) recipients.push(parentEmail.trim());

  try {
    await transporter.sendMail({
      from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
      to: recipients.join(', '),
      subject: `🎫 Seat Confirmed – CPS PRIME MUN 5.O [ID: ${regId}]`,
      html
    });
    for (const r of recipients) await logSentEmail('Seat Confirmed', r, 'Sent');
  } catch (error) {
    for (const r of recipients) await logSentEmail('Seat Confirmed', r, 'Failed');
  }
};

export const sendSeatCancelledEmail = async (
  email: string,
  name: string,
  regId: string,
  reason?: string,
  parentEmail?: string
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Dear <strong style="color:#ffffff;">${name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">This email serves as official confirmation that your seat/participation at <strong>CPS PRIME MUN 5.O</strong> has been cancelled.</p>
    
    <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 10px; padding: 20px; margin: 25px 0;">
      <table style="width: 100%; font-size: 13px; color: #bababa;">
        <tr><td style="padding: 4px 0; font-weight: bold; width: 45%;">SEAT STATUS</td><td style="padding: 4px 0; color: #ef4444; font-weight: bold;">CANCELLED</td></tr>
        <tr><td style="padding: 4px 0; font-weight: bold;">REGISTRATION ID</td><td style="padding: 4px 0; color: #ffffff;">${regId}</td></tr>
        <tr><td style="padding: 4px 0; font-weight: bold;">REASON</td><td style="padding: 4px 0; color: #ffffff;">${reason || 'Initiated by user/secretariat request'}</td></tr>
        <tr><td style="padding: 4px 0; font-weight: bold;">REFUND STATUS</td><td style="padding: 4px 0; color: #DCA843; font-weight: bold;">Refund (if applicable) is being processed within 7 business days.</td></tr>
      </table>
    </div>

    <p style="font-size: 13px; line-height: 1.6; color: #bababa;">If you believe this cancellation was made in error, please immediately contact the Secretariat desk at <a href="mailto:cpsprimemun@gmail.com" style="color:#DCA843;">cpsprimemun@gmail.com</a>.</p>
  `;

  const html = getEmailWrapper('Participation Seat Cancelled', 'Admission Cancellation', bodyHtml);
  const recipients = [email];
  if (parentEmail && parentEmail.trim()) recipients.push(parentEmail.trim());

  try {
    await transporter.sendMail({
      from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
      to: recipients.join(', '),
      subject: `❌ Seat Cancelled – CPS PRIME MUN 5.O [ID: ${regId}]`,
      html
    });
    for (const r of recipients) await logSentEmail('Seat Cancelled', r, 'Sent');
  } catch (error) {
    for (const r of recipients) await logSentEmail('Seat Cancelled', r, 'Failed');
  }
};

export const sendProfileLockedEmail = async (
  email: string,
  name: string,
  regId: string,
  reason?: string,
  parentEmail?: string
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Dear <strong style="color:#ffffff;">${name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">We are writing to notify you that your delegate credentials/profile for <strong>CPS PRIME MUN 5.O</strong> has been **LOCKED** by the Secretariat.</p>
    
    <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 10px; padding: 20px; margin: 25px 0;">
      <table style="width: 100%; font-size: 13px; color: #bababa;">
        <tr><td style="padding: 4px 0; font-weight: bold; width: 45%;">PROFILE STATUS</td><td style="padding: 4px 0; color: #f59e0b; font-weight: bold;">LOCKED</td></tr>
        <tr><td style="padding: 4px 0; font-weight: bold;">REASON FOR LOCK</td><td style="padding: 4px 0; color: #ffffff;">${reason || 'Pending database verification or administrative review.'}</td></tr>
      </table>
    </div>

    <p style="font-size: 13px; line-height: 1.6; color: #bababa;"><strong>Instructions:</strong> Please contact the Secretariat Support Desk to resolve this query and unlock your account. You will not be able to download study credentials or enter the portal while locked.</p>
  `;

  const html = getEmailWrapper('Delegate Account Locked', 'Security Notice', bodyHtml);
  const recipients = [email];
  if (parentEmail && parentEmail.trim()) recipients.push(parentEmail.trim());

  try {
    await transporter.sendMail({
      from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
      to: recipients.join(', '),
      subject: `🔒 Profile Locked – CPS PRIME MUN 5.O [ID: ${regId}]`,
      html
    });
    for (const r of recipients) await logSentEmail('Profile Locked', r, 'Sent');
  } catch (error) {
    for (const r of recipients) await logSentEmail('Profile Locked', r, 'Failed');
  }
};

export const sendProfileUnlockedEmail = async (
  email: string,
  name: string,
  regId: string,
  parentEmail?: string
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';
  const loginLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Dear <strong style="color:#ffffff;">${name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Great news! Your delegate profile has been successfully unlocked and verified by the Secretariat. Your account status is now **ACTIVE**.</p>
    
    <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 10px; padding: 20px; margin: 25px 0;">
      <table style="width: 100%; font-size: 13px; color: #bababa;">
        <tr><td style="padding: 4px 0; font-weight: bold; width: 45%;">PROFILE STATUS</td><td style="padding: 4px 0; color: #10b981; font-weight: bold;">ACTIVE</td></tr>
        <tr><td style="padding: 4px 0; font-weight: bold;">PORTAL LINK</td><td style="padding: 4px 0; color: #ffffff;"><a href="${loginLink}" style="color: #DCA843; font-weight: bold; text-decoration: none;">Login to Dashboard</a></td></tr>
      </table>
    </div>

    <p style="font-size: 13px; line-height: 1.6; color: #bababa;">You can now log in using your registered credentials to download background briefs, access allocations, and view information.</p>
  `;

  const html = getEmailWrapper('Delegate Account Restored', 'Security Notice', bodyHtml);
  const recipients = [email];
  if (parentEmail && parentEmail.trim()) recipients.push(parentEmail.trim());

  try {
    await transporter.sendMail({
      from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
      to: recipients.join(', '),
      subject: `🔓 Profile Unlocked – CPS PRIME MUN 5.O [ID: ${regId}]`,
      html
    });
    for (const r of recipients) await logSentEmail('Profile Unlocked', r, 'Sent');
  } catch (error) {
    for (const r of recipients) await logSentEmail('Profile Unlocked', r, 'Failed');
  }
};

export const sendRegistrationRemovedEmail = async (
  email: string,
  regId: string,
  reason?: string
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Dear Delegate / Faculty Advisor,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #ffffff;">This email serves as official confirmation that your registration for <strong>CPS PRIME MUN 5.O</strong> has been cancelled and permanently removed from our databases by the Secretariat.</p>
    
    <div style="background: rgba(239, 68, 68, 0.12); border-left: 4px solid #ef4444; border-radius: 8px; padding: 18px 20px; margin: 25px 0;">
      <p style="font-size: 15px; line-height: 1.6; color: #ef4444; font-weight: bold; margin: 0;">
        ⚠️ You are officially removed by the Secretariat and you cannot be a part of CPS PRIME MUN 5.O.
      </p>
    </div>

    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(220, 168, 67, 0.25); border-radius: 10px; padding: 20px; margin: 25px 0;">
      <table style="width: 100%; font-size: 13px; color: #bababa;">
        <tr><td style="padding: 6px 0; font-weight: bold; width: 45%;">REGISTRATION ID</td><td style="padding: 6px 0; color: #ffffff; font-weight: bold;">${regId}</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">SECRETARIAT ACTION</td><td style="padding: 6px 0; color: #ef4444; font-weight: bold;">OFFICIALLY REMOVED & CANCELLED</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">REASON / REMARK</td><td style="padding: 6px 0; color: #ffffff;">${reason || 'Official directive issued by the Secretariat.'}</td></tr>
      </table>
    </div>

    <p style="font-size: 13px; line-height: 1.6; color: #bababa;">If you require further clarification regarding this action, please contact the Secretariat Registration Desk at <a href="mailto:cpsprimemun@gmail.com" style="color: #DCA843;">cpsprimemun@gmail.com</a>.</p>
  `;

  const html = getEmailWrapper('Official Registration Removal Notice', 'Secretariat Directive', bodyHtml);

  try {
    await transporter.sendMail({
      from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
      to: email,
      subject: `⛔ Official Notice: Registration Removed – CPS PRIME MUN 5.O [ID: ${regId}]`,
      html
    });
    await logSentEmail('Registration Removed', email, 'Sent');
  } catch (error) {
    await logSentEmail('Registration Removed', email, 'Failed');
  }
};

export const sendSchoolBulkAllocationEmail = async (
  email: string,
  teacherName: string,
  schoolName: string,
  delegates: any[],
  regId: string
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';
  
  const rowsHtml = delegates.map((d: any, idx: number) => `
    <tr style="border-bottom: 1px solid rgba(220,168,67,0.15);">
      <td style="padding: 10px; color: #bababa; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.05);">${idx + 1}</td>
      <td style="padding: 10px; color: #ffffff; font-size: 13px; font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.05);">${d.name || d.fullName || 'N/A'}</td>
      <td style="padding: 10px; color: #DCA843; font-size: 13px; font-weight: bold; font-family: 'Cinzel', serif; border-bottom: 1px solid rgba(255,255,255,0.05);">${d.allocatedCommittee || d.selectedCommittee || 'Unassigned'}</td>
      <td style="padding: 10px; color: #ffffff; font-size: 13px; font-weight: bold; font-family: 'Cinzel', serif; border-bottom: 1px solid rgba(255,255,255,0.05);">${(() => {
        const comm = d.allocatedCommittee || d.selectedCommittee || '';
        if (comm.includes('IPP') || comm.includes('IPJ')) return 'N/A';
        return d.allocatedCountry || 'Pending';
      })()}</td>
      <td style="padding: 10px; color: #ffffff; font-size: 13px; font-family: monospace; border-bottom: 1px solid rgba(255,255,255,0.05);">${d.registrationId || regId}</td>
    </tr>
  `).join('');

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Dear Coordinator <strong style="color:#ffffff;">${teacherName}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">The automatic allocation of portfolios has been successfully completed for the registered delegation from <strong style="color:#DCA843;">${schoolName}</strong>. Here is the consolidated summary:</p>

    <div style="background: rgba(220, 168, 67, 0.04); border: 1px solid rgba(220, 168, 67, 0.25); border-radius: 10px; padding: 12px; margin: 28px 0; overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="border-bottom: 2px solid #DCA843;">
            <th style="padding: 10px; color: #DCA843; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">#</th>
            <th style="padding: 10px; color: #DCA843; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Delegate Name</th>
            <th style="padding: 10px; color: #DCA843; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Committee</th>
            <th style="padding: 10px; color: #DCA843; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Country / Portfolio</th>
            <th style="padding: 10px; color: #DCA843; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Reg ID</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;

  const html = getEmailWrapper('🏫 School Allocation Summary', 'Roster Allocations Complete', bodyHtml);

  try {
    await transporter.sendMail({
      from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
      to: email,
      subject: `🏫 Consolidated Delegation Allocations – CPS PRIME MUN 5.O [ID: ${regId}]`,
      html,
    });
    await logSentEmail('Bulk Allocation', email, 'Sent');
  } catch (error) {
    await logSentEmail('Bulk Allocation', email, 'Failed');
  }
};

export const sendSchoolDelegateAllocationEmail = async (
  email: string,
  delegateName: string,
  schoolName: string,
  committee: string,
  country: string,
  regId: string
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';
  const isIPP_IPJ = committee.includes('IPP') || committee.includes('IPJ');
  const waLink = COMMITTEE_WHATSAPP_LINKS[committee] || 'https://chat.whatsapp.com/ISziD5uOFDC2rwjuxqCWOR?s=cl&p=a&mlu=0&ilr=0';
  const guideLink = getBgGuidesUrl();

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Dear Delegate <strong style="color:#ffffff;">${delegateName}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Welcome to <strong>CPS PRIME MUN 5.O</strong> representing <strong style="color:#DCA843;">${schoolName || 'School Delegation'}</strong>! Your official committee & country portfolio allocation details have been assigned:</p>
    
    <div style="background: rgba(220, 168, 67, 0.08); border: 1px solid rgba(220, 168, 67, 0.35); border-radius: 10px; padding: 22px; margin: 25px 0; text-align:center;">
      <p style="margin: 0 0 4px 0; font-size: 11px; color: #BABABA; text-transform: uppercase; letter-spacing: 2px;">Allocated Committee</p>
      <p style="margin: 0; font-size: 18px; font-weight: bold; color: #DCA843; font-family: 'Cinzel', serif;">${committee || 'Unassigned'}</p>
      
      <div style="border-top: 1px solid rgba(220,168,67,0.2); margin: 14px 0;"></div>
      <p style="margin: 0 0 4px 0; font-size: 11px; color: #BABABA; text-transform: uppercase; letter-spacing: 2px;">Allocated Country</p>
      <p style="margin: 0; font-size: 22px; font-weight: bold; color: #ffffff; font-family: 'Cinzel', serif;">${/IPP|IPJ/i.test(committee) ? 'N/A' : (country && country !== 'Pending' ? country : 'To be assigned / revealed soon')}</p>
    </div>

    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(220, 168, 67, 0.2); border-radius: 8px; padding: 18px; margin: 25px 0;">
      <h4 style="margin: 0 0 12px 0; font-size: 12px; color: #DCA843; font-family: 'Cinzel', serif; text-transform: uppercase;">Conference Details</h4>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #bababa;">
        <tr>
          <td style="padding: 6px 0; font-weight: bold; width: 40%;">School Delegation</td>
          <td style="padding: 6px 0; color: #ffffff;">${schoolName || 'School Delegation'}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold;">Conference Dates</td>
          <td style="padding: 6px 0; color: #ffffff;">28th & 29th August, 2026</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold;">Venue Location</td>
          <td style="padding: 6px 0; color: #ffffff;">Chennai Public School Campus</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold;">Registration ID</td>
          <td style="padding: 6px 0; color: #DCA843; font-family: monospace;">${regId}</td>
        </tr>
      </table>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin: 25px 0;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-weight: bold; color: #bababa; font-size: 13px;">Committee WhatsApp Group</td>
        <td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: right;"><a href="${waLink}" style="color: #25d366; font-weight: bold; text-decoration: none;">Join WhatsApp Group</a></td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-weight: bold; color: #bababa; font-size: 13px;">Study Guides & Resources</td>
        <td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: right;"><a href="${guideLink}" style="color: #DCA843; font-weight: bold; text-decoration: none;">View Background Guides</a></td>
      </tr>
    </table>
  `;

  const html = getEmailWrapper(
    '🎉 Delegate Portfolio Allocation Details',
    'CPS PRIME MUN 5.O Delegate Notice',
    bodyHtml
  );

  const mailOptions = {
    from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
    to: email,
    subject: `📌 Portfolio Allocation Details – CPS PRIME MUN 5.O [${delegateName}]`,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Individual delegate allocation email sent to ${email} for ${delegateName}`);
    await logSentEmail('Delegate Allocation Detail', email, 'Sent', info.messageId);
  } catch (error) {
    console.error(`Error sending delegate allocation email to ${email}:`, error);
    await logSentEmail('Delegate Allocation Detail', email, 'Failed');
  }
};

const renderRosterChangeCard = (changeStr: string): string => {
  const match = changeStr.match(/^Delegate "(.*?)": (.*)$/);
  if (!match) {
    return `
      <div style="background: #141419; border: 1px solid rgba(220, 168, 67, 0.3); border-left: 4px solid #DCA843; border-radius: 8px; padding: 14px 18px; margin-bottom: 14px; font-size: 13px; color: #e2e8f0; line-height: 1.6;">
        ${changeStr}
      </div>
    `;
  }

  const delegateName = match[1];
  const changesRaw = match[2];
  const changes = changesRaw.split(', ').map(c => c.trim()).filter(Boolean);

  const formattedRows = changes.map(c => {
    if (c.includes(' ➜ ') || c.includes(' ➔ ')) {
      const parts = c.split(/ ➜ | ➔ /);
      const left = parts[0];
      const right = parts[1];

      const labelMatch = left.match(/^([A-Za-z\s]+)\s*"(.*)"$/);
      if (labelMatch) {
        const fieldLabel = labelMatch[1].trim();
        const oldVal = labelMatch[2];
        const newVal = right.replace(/^"(.*)"$/, '$1');

        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
            <td style="padding: 10px 12px; color: #94a3b8; font-weight: 600; width: 32%; vertical-align: middle; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${fieldLabel}</td>
            <td style="padding: 10px 12px; color: #e2e8f0; vertical-align: middle; font-size: 13px;">
              <span style="color: #ef4444; text-decoration: line-through; margin-right: 8px; font-weight: 500;">${oldVal || 'None'}</span>
              <span style="color: #DCA843; font-weight: bold; margin-right: 8px;">➔</span>
              <span style="color: #10b981; font-weight: 700; background: rgba(16, 185, 129, 0.12); padding: 4px 10px; border-radius: 5px; border: 1px solid rgba(16, 185, 129, 0.3); display: inline-block;">${newVal}</span>
            </td>
          </tr>
        `;
      }
    }
    return `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 10px 12px; color: #e2e8f0; font-size: 13px;" colspan="2">• ${c}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="background: #121216; border: 1px solid rgba(220, 168, 67, 0.35); border-left: 4px solid #DCA843; border-radius: 10px; padding: 16px 20px; margin-bottom: 18px; box-shadow: 0 4px 15px rgba(0,0,0,0.35);">
      <div style="font-size: 15px; font-weight: 700; color: #ffffff; font-family: 'Cinzel', serif; letter-spacing: 0.5px; margin-bottom: 12px; border-bottom: 1px solid rgba(220, 168, 67, 0.2); padding-bottom: 8px;">
        👤 Delegate: <span style="color: #DCA843;">${delegateName}</span>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; font-family: 'Montserrat', Arial, sans-serif;">
        <tbody>
          ${formattedRows}
        </tbody>
      </table>
    </div>
  `;
};

export const sendSchoolDelegationUpdatedEmail = async (
  email: string,
  teacherName: string,
  schoolName: string,
  regId: string,
  changesList: string[]
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';

  const cardsHtml = changesList.map(renderRosterChangeCard).join('');

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #e2e8f0;">Dear Coordinator <strong style="color:#ffffff;">${teacherName}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #e2e8f0;">We are writing to notify you that portfolio & roster allocations for delegates in the <strong style="color:#DCA843;">${schoolName}</strong> delegation have been updated by the Secretariat.</p>
    
    <div style="margin: 25px 0;">
      <h4 style="margin: 0 0 16px 0; font-size: 13px; color: #DCA843; font-family: 'Cinzel', serif; text-transform: uppercase; letter-spacing: 1px;">Updated Delegation Allocations</h4>
      ${cardsHtml}
    </div>
  `;

  const html = getEmailWrapper('School Delegation Allocations Updated', 'Roster Allocation Modifications', bodyHtml);

  try {
    await transporter.sendMail({
      from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
      to: email,
      subject: `🏫 School Delegation Updated – CPS PRIME MUN 5.O [ID: ${regId}]`,
      html
    });
    await logSentEmail('School Delegation Updated', email, 'Sent');
  } catch (error) {
    await logSentEmail('School Delegation Updated', email, 'Failed');
  }
};

export const sendSchoolSeatConfirmedEmail = async (
  email: string,
  teacherName: string,
  schoolName: string,
  regId: string,
  totalDelegates: number
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #e2e8f0;">Dear Coordinator <strong style="color:#ffffff;">${teacherName}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #e2e8f0;">We are thrilled to inform you that participation for the delegation of <strong style="color:#DCA843;">${schoolName}</strong> (total <strong style="color:#ffffff;">${totalDelegates} delegates</strong>) has been officially <strong style="color:#10b981;">CONFIRMED</strong> by the Secretariat. Here is your final seat status:</p>
    
    <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 10px; padding: 22px; margin: 25px 0; text-align:center;">
      <p style="margin: 0 0 6px 0; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">SEAT STATUS</p>
      <p style="margin: 0 0 18px 0; font-size: 22px; font-weight: 800; color: #10b981; font-family: 'Cinzel', serif; letter-spacing: 1px; white-space: nowrap; display: inline-block;">CONFIRMED</p>
      
      <div style="border-top: 1px solid rgba(255,255,255,0.08); margin: 12px 0;"></div>
      <p style="margin: 0 0 4px 0; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">SCHOOL / INSTITUTION</p>
      <p style="margin: 0; font-size: 16px; font-weight: bold; color: #ffffff;">${schoolName}</p>

      <div style="border-top: 1px solid rgba(255,255,255,0.08); margin: 12px 0;"></div>
      <p style="margin: 0 0 4px 0; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">ROSTER SIZE</p>
      <p style="margin: 0; font-size: 18px; font-weight: bold; color: #DCA843;">${totalDelegates} Delegates</p>
    </div>

    <p style="font-size: 13px; line-height: 1.7; color: #e2e8f0;"><strong style="color:#ffffff;">Final Instructions:</strong> Please instruct your students to report to the school campus by 08:00 AM on August 28th. Remember to carry your delegation confirmation letter and valid student identification cards for security check-in.</p>
  `;

  const html = getEmailWrapper('School Delegation Confirmed', 'Admission Confirmation', bodyHtml);

  try {
    await transporter.sendMail({
      from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
      to: email,
      subject: `🏫 School Delegation Confirmed – CPS PRIME MUN 5.O [ID: ${regId}]`,
      html
    });
    await logSentEmail('School Confirmed', email, 'Sent');
  } catch (error) {
    await logSentEmail('School Confirmed', email, 'Failed');
  }
};

export const sendSeatReservationEmail = async (
  email: string,
  name: string,
  committee: string,
  country: string,
  regId: string,
  parentEmail?: string
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Dear <strong style="color:#ffffff;">${name}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Your seat reservation is confirmed at the conference. Below are your allocation details:</p>
    
    <div style="background: rgba(220, 168, 67, 0.08); border: 1px solid rgba(220, 168, 67, 0.35); border-radius: 10px; padding: 24px; margin: 25px 0; text-align:center;">
      <p style="margin: 0 0 6px 0; font-size: 11px; color: #BABABA; text-transform: uppercase; letter-spacing: 2px;">Committee</p>
      <p style="margin: 0; font-size: 20px; font-weight: bold; color: #DCA843; font-family: 'Cinzel', serif; margin-bottom: 12px;">${committee}</p>
      <div style="border-top: 1px solid rgba(220,168,67,0.2); margin: 16px 0;"></div>
      <p style="margin: 0 0 6px 0; font-size: 11px; color: #BABABA; text-transform: uppercase; letter-spacing: 2px;">Allocated Country</p>
      <p style="margin: 0; font-size: 26px; font-weight: bold; color: #ffffff; font-family: 'Cinzel', serif;">${/IPP|IPJ/i.test(committee) ? 'N/A' : (country || 'Pending')}</p>
    </div>
  `;

  const html = getEmailWrapper('Seat Reservation Confirmed', 'Admission Reservation', bodyHtml);
  const recipients = [email];
  if (parentEmail && parentEmail.trim()) {
    recipients.push(parentEmail.trim());
  }

  try {
    await transporter.sendMail({
      from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
      to: recipients.join(', '),
      subject: `🎟️ Seat Reserved – CPS PRIME MUN 5.O [ID: ${regId}]`,
      html
    });
    for (const r of recipients) {
      await logSentEmail('Seat Reservation', r, 'Sent');
    }
  } catch (error) {
    for (const r of recipients) {
      await logSentEmail('Seat Reservation', r, 'Failed');
    }
  }
};

export const sendGeneralNotificationEmail = async (to: string, subject: string, htmlBody: string): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';
  const mailOptions = {
    from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
    to,
    subject,
    html: htmlBody,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`General notification email sent successfully to ${to}`);
    await logSentEmail('Bulk Notification', to, 'Sent', info.messageId);
  } catch (error) {
    console.error(`Error sending general notification email to ${to}:`, error);
    await logSentEmail('Bulk Notification', to, 'Failed');
    throw error;
  }
};

export const sendWaitlistedEmail = async (
  email: string,
  regData: any,
  parentEmail?: string
): Promise<void> => {
  const fromEmail = process.env.SMTP_FROM || 'cpsprimemun@gmail.com';
  const details = regData.details || {};
  const delegateName = details.fullName || 'Delegate';
  const committee = regData.allocatedCommittee || details.committee || details.selectedCommittee || 'Your Committee';

  const bodyHtml = `
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Dear <strong style="color:#ffffff;">${delegateName}</strong>,</p>
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">Thank you for your registration and successful payment for <strong>CPS PRIME MUN 5.O</strong>.</p>
    <p style="font-size: 14px; line-height: 1.6; color: #bababa;">The committee you selected (<strong>${committee}</strong>) is currently full. We have placed you on the official <strong>Waiting List</strong> for this committee.</p>
    
    <div style="background: rgba(220, 168, 67, 0.08); border: 1px solid rgba(220, 168, 67, 0.35); border-radius: 10px; padding: 20px; margin: 25px 0; text-align:center;">
      <p style="margin: 0 0 4px 0; font-size: 11px; color: #BABABA; text-transform: uppercase; letter-spacing: 2px;">Allocation Status</p>
      <p style="margin: 0; font-size: 18px; font-weight: bold; color: #ef4444; font-family: 'Cinzel', serif;">WAITING LIST</p>
      <div style="border-top: 1px solid rgba(220,168,67,0.2); margin: 12px 0;"></div>
      <p style="margin: 0; font-size: 12px; color: #bababa;">If a seat opens up or a new delegation portfolio is created, you will be automatically allocated a seat and notified immediately.</p>
    </div>

    <p style="font-size: 13px; line-height: 1.6; color: #bababa;">If you wish to change your committee selection to a committee with open seats instead of waiting, please contact the Secretariat desk at <a href="mailto:cpsprimemun@gmail.com" style="color:#DCA843;">cpsprimemun@gmail.com</a>.</p>
  `;

  const html = getEmailWrapper(
    'Committee Waiting List Confirmation',
    'Conquer From Within',
    bodyHtml
  );

  const recipients = [email];
  const pEmail = parentEmail || details.parentEmail;
  if (pEmail && pEmail.trim()) {
    recipients.push(pEmail.trim());
  }

  try {
    await transporter.sendMail({
      from: `"CPS PRIME MUN 5.O" <${fromEmail}>`,
      to: recipients.join(', '),
      subject: `⏳ Waiting List Confirmation – CPS PRIME MUN 5.O [ID: ${regData.registrationId}]`,
      html
    });
    for (const r of recipients) {
      await logSentEmail('Seat Waitlisted', r, 'Sent');
    }
  } catch (error) {
    for (const r of recipients) {
      await logSentEmail('Seat Waitlisted', r, 'Failed');
    }
  }
};
