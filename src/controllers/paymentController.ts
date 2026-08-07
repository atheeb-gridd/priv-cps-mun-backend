import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Registration from '../models/Registration';
import { processAndUploadBase64Documents } from '../services/driveService';
import RegistrationDraft from '../models/RegistrationDraft';
import User from '../models/User';
import ActivityLog from '../models/ActivityLog';
import { sendRegistrationConfirmationEmail } from '../services/emailService';
import { generateMasterExcel } from '../services/excelService';

/**
 * AES-128-CBC Encryption for HDFC CCAvenue Payload
 */
function encryptCCAvenue(plainText: string, workingKey: string): string {
  try {
    const key = crypto.createHash('md5').update(workingKey).digest(); // 16-byte key
    const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    let encoded = cipher.update(plainText, 'utf8', 'hex');
    encoded += cipher.final('hex');
    return encoded;
  } catch (err) {
    console.error('Encryption Error:', err);
    return plainText;
  }
}

/**
 * AES-128-CBC Decryption for HDFC Response
 */
function decryptCCAvenue(encText: string, workingKey: string): string {
  try {
    const key = crypto.createHash('md5').update(workingKey).digest();
    const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    let decoded = decipher.update(encText, 'hex', 'utf8');
    decoded += decipher.final('utf8');
    return decoded;
  } catch (err) {
    console.error('Decryption Error:', err);
    return encText;
  }
}

/**
 * Initiate HDFC Payment Request
 */
export const initiateHdfcPayment = async (req: Request, res: Response) => {
  try {
    const merchantCode = process.env.HDFC_MERCHANT_CODE || '1937011';
    const secretKey = process.env.HDFC_SECRET_KEY || '1C0ADDFB26AAF9CAF9276C30ABD20478';
    const accessCode = process.env.HDFC_ACCESS_CODE || 'AVLB96KA44AZ66BLZA';
    const clientId = process.env.HDFC_CLIENT_ID || '55872';
    const envMode = process.env.HDFC_ENV || 'production';

    const gatewayUrl = envMode === 'production'
      ? 'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction'
      : 'https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction';

    const { registrationId, amount, customerName, customerEmail, customerMobile, schoolName, regType, details, formData } = req.body;

    if (!registrationId || !amount) {
      return res.status(400).json({ message: 'Registration ID and amount are required.' });
    }

    // ── Payment Bypass: test accounts skip the HDFC gateway entirely ──────
    const bypassEmails = [
      'counsellor.ann@chennaipublicschool.com',
      'reena@cpsglobalschool.com',
      'omarm@cpsglobalschool.com'
    ];
    const checkEmail = (customerEmail || '').toLowerCase().trim();
    const isEmailBypass = bypassEmails.includes(checkEmail);
    const dbBypassUser = checkEmail ? await User.findOne({ email: checkEmail, paymentBypass: true }) : null;

    if (isEmailBypass || dbBypassUser) {
      // Save or update the registration record as paid
      const derivedType = (registrationId && registrationId.includes('SCH')) || regType === 'school' ? 'school' : 'individual';
      const payloadDetails = details || formData || {};
      const bypassPayId = `BYPASS-${Date.now().toString(36).toUpperCase()}`;

      let existingReg = await Registration.findOne({
        $or: [{ registrationId }, { registeredByUser: checkEmail }, { 'details.email': checkEmail }]
      });

      const combinedDetails = {
        ...(existingReg?.details || {}),
        ...payloadDetails,
        paymentStatus: 'Verified',
        paymentId: bypassPayId,
        paymentMethod: 'Test Account Bypass',
        paymentTimestamp: new Date().toISOString(),
        status: 'Submitted'
      };

      if (!existingReg) {
        existingReg = new Registration({
          registrationId,
          registrationType: derivedType,
          registeredByUser: checkEmail,
          registeredAt: new Date(),
          status: 'Submitted',
          isSubmitted: true,
          paymentId: bypassPayId,
          paymentStatus: 'Verified',
          amountPaid: 0,
          details: combinedDetails
        });
        await existingReg.save();
      } else {
        existingReg.details = combinedDetails;
        existingReg.paymentId = bypassPayId;
        existingReg.paymentStatus = 'Verified';
        existingReg.status = 'Submitted';
        existingReg.isSubmitted = true;
        await existingReg.save();
      }

      // Trigger Excel update in background
      generateMasterExcel().catch(() => {});

      console.log(`[BYPASS] Payment bypassed for test account: ${checkEmail}, RegID: ${registrationId}`);
      return res.status(200).json({
        success: true,
        bypass: true,
        paymentId: bypassPayId,
        message: 'Test account – payment bypassed.'
      });
    }
    // ─────────────────────────────────────────────────────────────────────

    const derivedRegType = (registrationId && registrationId.includes('SCH')) || regType === 'school' ? 'school' : 'individual';
    const numDelCount = parseInt(req.body.numDelegates, 10) || 1;
    const payloadDetails = details || formData || {};

    // Clean details for HDFC CCAvenue compatibility & merchant parameters 1-5 mapping
    const cleanCustomerName = (customerName || payloadDetails.fullName || payloadDetails.name || 'Delegate').replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 50) || 'Delegate';
    const cleanMobile = (customerMobile || payloadDetails.mobile || payloadDetails.phone || '9876543210').replace(/\D/g, '').slice(-10) || '9876543210';
    const cleanEmail = (customerEmail || payloadDetails.email || 'cpsprimemun@gmail.com').trim();
    const cleanSchoolName = (schoolName || payloadDetails.schoolName || 'School Delegation').trim();
    
    // Ensure billing address is at least 15 characters long to satisfy Bank & Netbanking gateway compliance
    let rawAddress = (schoolName || payloadDetails.schoolName || 'Chennai Public School Campus').replace(/[^a-zA-Z0-9\s]/g, '').trim();
    if (rawAddress.length < 10) {
      rawAddress = `${rawAddress} Main Campus Chennai`;
    }
    const cleanAddress = rawAddress.substring(0, 100);
    const nonRefundableDisclaimer = 'NOTE REGISTRATION PAYMENT WILL NOT BE REFUNDED';

    // Pre-create or update Registration document in DB with correct registrationType and full details
    const isObjectId = typeof registrationId === 'string' && /^[0-9a-fA-F]{24}$/.test(registrationId);
    let existingReg = await Registration.findOne({
      $or: [
        { registrationId }, 
        ...(isObjectId ? [{ _id: registrationId }] : []),
        { registeredByUser: cleanEmail.toLowerCase() },
        { 'details.email': cleanEmail.toLowerCase() }
      ]
    });

    const combinedDetails = {
      ...(existingReg?.details || {}),
      ...payloadDetails,
      schoolName: cleanSchoolName || payloadDetails.schoolName || existingReg?.details?.schoolName || '',
      teacherName: cleanCustomerName,
      teacherEmail: cleanEmail,
      teacherMobile: cleanMobile,
      fullName: cleanCustomerName,
      email: cleanEmail,
      mobile: cleanMobile,
      gender: payloadDetails.gender || existingReg?.details?.gender || '',
      dob: payloadDetails.dob || existingReg?.details?.dob || '',
      gradeClass: payloadDetails.gradeClass || payloadDetails.grade || existingReg?.details?.gradeClass || existingReg?.details?.grade || '',
      section: payloadDetails.section || existingReg?.details?.section || '',
      schoolCity: payloadDetails.schoolCity || payloadDetails.city || existingReg?.details?.schoolCity || existingReg?.details?.city || '',
      parentName: payloadDetails.parentName || payloadDetails.guardianName || existingReg?.details?.parentName || existingReg?.details?.guardianName || '',
      parentMobile: payloadDetails.parentMobile || payloadDetails.guardianMobile || existingReg?.details?.parentMobile || existingReg?.details?.guardianMobile || '',
      parentEmail: payloadDetails.parentEmail || payloadDetails.guardianEmail || existingReg?.details?.parentEmail || existingReg?.details?.guardianEmail || '',
      isFirstMUN: payloadDetails.isFirstMUN || payloadDetails.firstTimeMUN || existingReg?.details?.isFirstMUN || existingReg?.details?.firstTimeMUN || 'No',
      numMUNs: (payloadDetails.numMUNs !== undefined && payloadDetails.numMUNs !== null && payloadDetails.numMUNs !== '') ? String(payloadDetails.numMUNs) : (existingReg?.details?.numMUNs ? String(existingReg.details.numMUNs) : ((payloadDetails.isFirstMUN === 'No' || existingReg?.details?.isFirstMUN === 'No') ? '1' : '0')),
      medicalConditions: payloadDetails.medicalConditions || payloadDetails.medical || existingReg?.details?.medicalConditions || existingReg?.details?.medical || '',
      gadgetsList: payloadDetails.gadgetsList || payloadDetails.gadgets || existingReg?.details?.gadgetsList || existingReg?.details?.gadgets || '',
      emergencyName: payloadDetails.emergencyName || payloadDetails.emergencyContactName || payloadDetails.emergencyContact || existingReg?.details?.emergencyName || existingReg?.details?.emergencyContactName || existingReg?.details?.emergencyContact || payloadDetails.parentName || existingReg?.details?.parentName || '',
      emergencyNumber: payloadDetails.emergencyNumber || payloadDetails.emergencyContactNumber || payloadDetails.emergencyMobile || existingReg?.details?.emergencyNumber || existingReg?.details?.emergencyContactNumber || existingReg?.details?.emergencyMobile || payloadDetails.parentMobile || existingReg?.details?.parentMobile || '',
      docStudentId: payloadDetails.docStudentId || payloadDetails.studentIdDoc || payloadDetails.docStudentIdFile?.name || existingReg?.details?.docStudentId || existingReg?.details?.studentIdDoc || existingReg?.details?.docStudentIdFile?.name || '',
      docPhoto: payloadDetails.docPhoto || payloadDetails.aadharDoc || payloadDetails.docAadhar || payloadDetails.docPhotoFile?.name || existingReg?.details?.docPhoto || existingReg?.details?.aadharDoc || existingReg?.details?.docAadhar || existingReg?.details?.docPhotoFile?.name || '',
      docStudentIdFile: payloadDetails.docStudentIdFile || existingReg?.details?.docStudentIdFile || null,
      docPhotoFile: payloadDetails.docPhotoFile || existingReg?.details?.docPhotoFile || null,
      selectedCommittee: payloadDetails.selectedCommittee || payloadDetails.committee || existingReg?.details?.selectedCommittee || existingReg?.details?.committee || '',
      delegatesCount: derivedRegType === 'school' ? numDelCount : 1,
      paymentStatus: existingReg?.details?.paymentStatus || 'Pending',
      status: existingReg?.details?.status || 'Draft'
    };

    // Save/update the registration record in the database immediately (fast)
    if (!existingReg) {
      existingReg = new Registration({
        registrationId,
        registrationType: derivedRegType,
        registeredByUser: cleanEmail.toLowerCase(),
        registeredAt: new Date(),
        status: 'Draft',
        isSubmitted: false,
        paymentId: 'HDFC_PENDING',
        paymentStatus: 'Pending',
        allocatedCommittee: combinedDetails.selectedCommittee || '',
        allocatedCountry: '',
        details: combinedDetails,
        amountPaid: 0
      });
      await existingReg.save();
    } else {
      existingReg.registrationType = derivedRegType;
      existingReg.details = combinedDetails;
      if (existingReg.paymentStatus !== 'Verified') {
        existingReg.amountPaid = 0;
      }
      if (combinedDetails.selectedCommittee && !existingReg.allocatedCommittee) {
        existingReg.allocatedCommittee = combinedDetails.selectedCommittee;
      }
      await existingReg.save();
    }

    // Trigger Google Drive upload asynchronously in the background so it doesn't block HDFC checkout redirect
    processAndUploadBase64Documents(combinedDetails, registrationId)
      .then(async (updatedDetails) => {
        try {
          await Registration.updateOne({ registrationId }, { $set: { details: updatedDetails } });
          console.log(`[Background] Google Drive documents uploaded successfully for ${registrationId}`);
        } catch (updateErr) {
          console.error('[Background] Failed to update Drive URLs in registration:', updateErr);
        }
      })
      .catch((driveErr) => {
        console.warn('[Background] Google Drive document processing warning:', driveErr?.message || driveErr);
      });

    const dbFile = path.join(__dirname, '../../db.json');
    let settings: any[] = [];
    if (fs.existsSync(dbFile)) {
      try {
        const dbData = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
        if (dbData.settings && Array.isArray(dbData.settings)) {
          settings = dbData.settings;
        }
      } catch (e) {}
    }

    const testModeSetting = settings.find((s: any) => s.key === 'testMode');
    const testMode = testModeSetting ? Boolean(testModeSetting.value) : false;

    const now = new Date();
    const aug15 = new Date('2026-08-15T00:00:00+05:30');
    const aug25Deadline = new Date('2026-08-25T23:59:59+05:30');

    if (now > aug25Deadline) {
      return res.status(400).json({ message: 'Registrations for CPS PRIME MUN 5.0 closed on August 25, 2026 at 11:59 PM IST.' });
    }

    let activeDelegateFee = 750;
    if (testMode) {
      activeDelegateFee = 1;
    } else if (now < aug15) {
      activeDelegateFee = 750;
    } else {
      activeDelegateFee = 800;
    }

    const finalTxnFee = (derivedRegType === 'individual' ? 1 : numDelCount) * activeDelegateFee;
    const txnAmount = finalTxnFee.toFixed(2);

    const orderId = `HDFC_${registrationId}_${Date.now()}`;

    // Dynamically derive HTTPS base URL from incoming request headers
    const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5001';
    const protoHeader = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'https');
    const baseUrl = process.env.BACKEND_URL || `${protoHeader}://${hostHeader}`;

    const redirectUrl = `${baseUrl}/api/payment/hdfc/callback`;
    const cancelUrl = `${baseUrl}/api/payment/hdfc/callback`;

    // Merchant Param 1: Transaction ID / Reg ID
    // Merchant Param 2: Student / Delegate Name
    // Merchant Param 3: Contact Number
    // Merchant Param 4: Email Address
    // Merchant Param 5: School Name
    const merchantData = `merchant_id=${merchantCode}&order_id=${orderId}&amount=${txnAmount}&currency=INR&redirect_url=${redirectUrl}&cancel_url=${cancelUrl}&language=EN&billing_name=${encodeURIComponent(cleanCustomerName)}&billing_email=${encodeURIComponent(cleanEmail)}&billing_tel=${cleanMobile}&billing_address=${encodeURIComponent(cleanAddress)}&billing_city=Chennai&billing_state=Tamil Nadu&billing_zip=600001&billing_country=India&merchant_param1=${encodeURIComponent(registrationId)}&merchant_param2=${encodeURIComponent(cleanCustomerName)}&merchant_param3=${encodeURIComponent(cleanMobile)}&merchant_param4=${encodeURIComponent(cleanEmail)}&merchant_param5=${encodeURIComponent(cleanAddress)}&order_notes=${encodeURIComponent(nonRefundableDisclaimer)}`;

    // Encrypt payload using HDFC Secret Working Key
    const encRequest = encryptCCAvenue(merchantData, secretKey);

    console.log(`Initiating HDFC Payment [Merchant: ${merchantCode}, AccessCode: ${accessCode}, Env: ${envMode}] for RegID: ${registrationId}, OrderID: ${orderId}`);
    console.log(`Redirect Callback URL: ${redirectUrl}`);

    return res.status(200).json({
      success: true,
      mode: envMode,
      gatewayUrl,
      accessCode,
      encRequest,
      merchantCode,
      clientId,
      orderId,
      amount: txnAmount,
      currency: 'INR'
    });

  } catch (error: any) {
    console.error('HDFC Payment Initiation Error:', error);
    return res.status(500).json({ message: error.message || 'Failed to initiate HDFC payment.' });
  }
};

/**
 * Handle HDFC Response Callback
 */
export const handleHdfcCallback = async (req: Request, res: Response) => {
  try {
    const secretKey = process.env.HDFC_SECRET_KEY || '1C0ADDFB26AAF9CAF9276C30ABD20478';
    const encResponse = req.body.encResp || req.query.encResp;
    let responseObj: Record<string, string> = {};

    if (encResponse) {
      const decryptedStr = decryptCCAvenue(encResponse, secretKey);
      const params = new URLSearchParams(decryptedStr);
      params.forEach((value, key) => {
        responseObj[key] = value;
      });
    } else {
      responseObj = req.method === 'POST' ? req.body : req.query;
    }

    console.log('HDFC Decrypted Callback Response:', responseObj);

    const orderId = responseObj.order_id || responseObj.orderId || req.body.orderId || req.query.orderId;
    const orderStatus = (responseObj.order_status || responseObj.txn_status || responseObj.status || '').toUpperCase();
    const trackingId = responseObj.tracking_id || responseObj.transaction_id || `HDFC-${Date.now()}`;
    const regIdParam = responseObj.merchant_param1 || responseObj.registrationId;

    let regId = regIdParam;
    if (!regId && orderId && orderId.includes('_')) {
      const parts = orderId.split('_');
      if (parts.length >= 2) {
        regId = parts[1];
      }
    }

    const isSuccess = orderStatus === 'SUCCESS' 
      || orderStatus === 'SUCCESSFUL'
      || orderStatus === 'PAID'
      || orderStatus === 'APPROVED'
      || orderStatus === 'COMPLETED'
      || orderStatus === '0'
      || orderStatus === '0000'
      || responseObj.response_code === '0'
      || responseObj.response_code === '0000'
      || (responseObj.status && responseObj.status.toUpperCase() === 'SUCCESS');

    const isSchoolReg = (regId && regId.includes('SCH')) || (responseObj.merchant_param1 && responseObj.merchant_param1.includes('SCH'));
    const regTypeParam = isSchoolReg ? 'school' : 'individual';
    const billingEmail = (responseObj.billing_email || responseObj.merchant_param4 || '').toLowerCase().trim();

    if (isSuccess) {
      const queryOr: any[] = [];
      if (regId) {
        queryOr.push({ registrationId: regId });
        if (/^[0-9a-fA-F]{24}$/.test(regId)) {
          queryOr.push({ _id: regId });
        }
      }
      if (billingEmail) {
        queryOr.push({ registeredByUser: billingEmail });
        queryOr.push({ 'details.email': billingEmail });
        queryOr.push({ 'details.teacherEmail': billingEmail });
      }

      let matchingRegs = await Registration.find({ $or: queryOr });

      if (!matchingRegs || matchingRegs.length === 0) {
        const newReg = new Registration({
          registrationId: regId || `CPS-REG-${Date.now()}`,
          registrationType: regTypeParam,
          registeredByUser: (billingEmail || 'delegate@cpsmun.org').toLowerCase(),
          registeredAt: new Date(),
          status: 'Draft',
          isSubmitted: false,
          allocatedCommittee: '',
          allocatedCountry: '',
          paymentId: trackingId,
          paymentStatus: 'Verified',
          details: {
            schoolName: (responseObj.merchant_param5 || responseObj.billing_address || 'School Delegation').replace(/\s*Main Campus Chennai\s*/gi, '').trim(),
            teacherName: responseObj.billing_name || responseObj.merchant_param2 || 'Faculty Advisor',
            teacherEmail: billingEmail,
            teacherMobile: responseObj.billing_tel || responseObj.merchant_param3 || '',
            fullName: responseObj.billing_name || 'Delegate',
            email: billingEmail,
            mobile: responseObj.billing_tel || '',
            delegatesCount: isSchoolReg ? 5 : 1,
            paymentStatus: 'Verified',
            paymentId: trackingId,
            paymentMethod: 'HDFC SmartGateway',
            paymentTimestamp: new Date(),
            amountPaid: responseObj.amount || '1.00',
            status: 'Draft'
          }
        });
        await newReg.save();
      } else {
        for (const registration of matchingRegs) {
          registration.paymentId = trackingId;
          registration.paymentStatus = 'Verified';
          registration.details = {
            ...(registration.details || {}),
            paymentStatus: 'Verified',
            paymentId: trackingId,
            paymentMethod: 'HDFC SmartGateway',
            paymentTimestamp: new Date(),
            amountPaid: responseObj.amount || registration.details?.amountPaid || '1.00',
            status: registration.details?.status || 'Draft'
          };
          await registration.save();
        }
      }

      // Log successful transaction
      const activity = new ActivityLog({
        registrationId: regId || 'HDFC-PAYMENT',
        delegateName: responseObj.billing_name || 'Delegate',
        action: 'HDFC Payment Verified',
        description: `Payment of ₹${responseObj.amount || '1.00'} verified via HDFC SmartGateway. Tracking ID: ${trackingId}.`,
        user: billingEmail || 'HDFC Gateway',
        ipAddress: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1')
      });
      await activity.save();

      // Update master Excel in background after every successful payment
      generateMasterExcel().catch(err => console.error('Excel update after payment error:', err));
    }

    // Dynamically derive HTTPS frontend URL from incoming request headers
    const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5001';
    const protoHeader = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'https');
    const frontendBaseUrl = process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')
      ? process.env.FRONTEND_URL
      : `${protoHeader}://${hostHeader}`;

    const targetStep = isSchoolReg ? 3 : 4;
    const redirectUrl = `${frontendBaseUrl}/register?payment_status=${isSuccess ? 'success' : 'failed'}&txn_id=${trackingId}&reg_id=${regId || ''}&amount=${responseObj.amount || ''}&reg_type=${regTypeParam}&step=${targetStep}`;
    return res.redirect(redirectUrl);

  } catch (error: any) {
    console.error('HDFC Callback Processing Error:', error);
    return res.status(500).send('HDFC Callback Error');
  }
};

/**
 * Check HDFC Payment Status
 */
export const getHdfcPaymentStatus = async (req: Request, res: Response) => {
  try {
    const { registrationId } = req.params;
    const email = req.query.email || req.query.user;
    const userEmail = (email ? String(email) : '').toLowerCase().trim();

    // ── Payment Bypass: test accounts skip the gateway entirely ──────────────
    if (userEmail) {
      const bypassUser = await User.findOne({ email: userEmail, paymentBypass: true });
      if (bypassUser) {
        return res.status(200).json({
          registrationId: registrationId || '',
          isPaid: true,
          paymentId: 'BYPASS-TEST-ACCOUNT',
          paymentMethod: 'Test Account Bypass',
          paymentTimestamp: new Date().toISOString(),
        });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const queryOr: any[] = [];
    if (registrationId && registrationId !== 'CPS-PAY' && registrationId !== 'REG-PAY') {
      queryOr.push({ registrationId });
      if (/^[0-9a-fA-F]{24}$/.test(registrationId)) {
        queryOr.push({ _id: registrationId });
      }
    }
    if (userEmail) {
      queryOr.push({ registeredByUser: userEmail });
      queryOr.push({ 'details.email': userEmail });
      queryOr.push({ 'details.teacherEmail': userEmail });
    }

    const registration = await Registration.findOne({ $or: queryOr, 'details.paymentStatus': 'Verified' })
      || await Registration.findOne({ $or: queryOr, paymentStatus: 'Verified' })
      || (queryOr.length > 0 ? await Registration.findOne({ $or: queryOr }) : null);

    if (!registration) {
      return res.status(200).json({ isPaid: false });
    }

    const isPaid = registration.details?.paymentStatus === 'Verified' ||
      registration.paymentStatus === 'Verified';

    const txnId = registration.details?.paymentId || registration.paymentId;
    const activeTxnId = (isPaid && txnId && txnId !== 'HDFC_PENDING') ? txnId : '';

    return res.status(200).json({
      registrationId: registration.registrationId,
      isPaid,
      paymentId: activeTxnId,
      paymentMethod: registration.details?.paymentMethod || 'HDFC SmartGateway',
      paymentTimestamp: registration.details?.paymentTimestamp || null
    });
  } catch (error: any) {
    console.error('HDFC Payment Status Error:', error);
    return res.status(500).json({ message: error.message || 'Error checking payment status.' });
  }
};

export const clearAllPayments = async (req: Request, res: Response) => {
  try {
    // 1. Delete Mongoose / Mock DB registrations
    try {
      if (Registration && typeof (Registration as any).deleteMany === 'function') {
        await (Registration as any).deleteMany({});
      }
    } catch (e) {}

    // 2. Delete Mongoose / Mock DB registration drafts
    try {
      if (RegistrationDraft && typeof (RegistrationDraft as any).deleteMany === 'function') {
        await (RegistrationDraft as any).deleteMany({});
      }
    } catch (e) {}

    // 3. Reset User registrationCompleted flags
    try {
      if (User && typeof (User as any).updateMany === 'function') {
        await (User as any).updateMany(
          { role: { $nin: ['Admin', 'SuperAdmin'] } },
          { $set: { registrationCompleted: false } }
        );
      }
    } catch (e) {}

    // 4. Purge db.json directly if present (primary source of truth for mock mode)
    const dbFile = path.join(__dirname, '../../db.json');
    if (fs.existsSync(dbFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
        data.registrations = [];
        data.registrationdrafts = [];
        data.registrationDrafts = [];
        if (Array.isArray(data.users)) {
          data.users.forEach((u: any) => {
            if (u.role !== 'Admin' && u.role !== 'SuperAdmin') {
              u.registrationCompleted = false;
            }
          });
        }
        fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
      } catch (e) {}
    }

    return res.status(200).json({ success: true, message: 'All payment & registration records cleared successfully.' });
  } catch (error: any) {
    console.error('Clear All Payments Error:', error);
    return res.status(500).json({ message: error.message || 'Failed to clear payment records.' });
  }
};
