import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import Registration from '../models/Registration';
import RegistrationDraft from '../models/RegistrationDraft';
import User from '../models/User';
import ActivityLog from '../models/ActivityLog';
import { uploadFileToDrive, uploadBase64ToDrive, processAndUploadBase64Documents, GOOGLE_DRIVE_FOLDER_ID } from '../services/driveService';
import AdminLog from '../models/AdminLog';
import EmailLog from '../models/EmailLog';
import LoginLog from '../models/LoginLog';
import OTPLog from '../models/OTPLog';
import OTP from '../models/OTP';
import PendingUser from '../models/PendingUser';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import {
  sendRegistrationConfirmationEmail,
  sendCountryAllocationEmail,
  sendSeatReservationEmail,
  sendSchoolBulkAllocationEmail,
  sendGeneralNotificationEmail,
  sendCommitteeChangedEmail,
  sendCountryChangedEmail,
  sendRegistrationDetailsUpdatedEmail,
  sendSeatConfirmedEmail,
  sendSeatCancelledEmail,
  sendProfileLockedEmail,
  sendProfileUnlockedEmail,
  sendRegistrationRemovedEmail,
  sendSchoolDelegationUpdatedEmail,
  sendSchoolSeatConfirmedEmail,
  sendWaitlistedEmail,
  sendSchoolDelegateAllocationEmail
} from '../services/emailService';
import { generateMasterExcel } from '../services/excelService';
import { processRegistrationFiles } from '../services/fileService';
import { allocateCountry, allocateCountriesForRoster, normalise, COMMITTEE_COUNTRY_POOL } from '../services/countryAllocationService';

export const submitRegistration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    // Check if registration status is set to offline or past Aug 25 deadline
    const dbFile = path.join(__dirname, '../../db.json');
    let settings: any[] = [];
    if (fs.existsSync(dbFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
        if (data.settings && Array.isArray(data.settings)) {
          settings = data.settings;
        }
      } catch (e) {}
    }
    const statusInfo = deriveMasterFeeAndStatus(settings);
    if (statusInfo.status === 'offline' && req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin') {
      return res.status(400).json({ message: statusInfo.isPastDeadline ? 'Registrations for CPS PRIME MUN 5.0 closed on August 25, 2026 at 11:59 PM IST.' : 'Registrations are currently offline/closed. Please contact the Secretariat for assistance.' });
    }

    const { registrationId, paymentId, registrationType, amountPaid, allocatedCommittee, allocatedCountry, details } = req.body;

    if (!registrationId || !paymentId || !registrationType || amountPaid === undefined || !details) {
      return res.status(400).json({ message: 'Missing required registration fields.' });
    }

    // Find the user
    const dbUser = await User.findOne({ userId: req.user.userId });
    if (!dbUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Ensure all emails in details payload are lowercased
    if (details.email) details.email = details.email.trim().toLowerCase();
    if (details.parentEmail) details.parentEmail = details.parentEmail.trim().toLowerCase();
    if (details.teacherEmail) details.teacherEmail = details.teacherEmail.trim().toLowerCase();
    if (details.delegates && Array.isArray(details.delegates)) {
      details.delegates.forEach((d: any) => {
        if (d.email) d.email = d.email.trim().toLowerCase();
        if (d.parentEmail) d.parentEmail = d.parentEmail.trim().toLowerCase();
      });
    }

    // Check if user already registered
    // Check for duplicate registrations by other users using email or mobile number
    const emailToCheck = registrationType === 'individual' ? details.email : details.teacherEmail;
    const mobileToCheck = registrationType === 'individual' ? details.mobile : details.teacherMobile;

    if (emailToCheck) {
      const duplicateEmailReg = await Registration.findOne({
        user: { $ne: dbUser._id },
        registeredByUser: { $ne: dbUser.email.toLowerCase() },
        $or: [
          { 'details.email': { $regex: new RegExp(`^${emailToCheck.trim()}$`, 'i') } },
          { 'details.teacherEmail': { $regex: new RegExp(`^${emailToCheck.trim()}$`, 'i') } }
        ]
      });
      if (duplicateEmailReg && duplicateEmailReg.status !== 'Draft') {
        return res.status(400).json({ message: 'An account already exists with this email. Please sign in.' });
      }
    }

    if (mobileToCheck) {
      const duplicateMobileReg = await Registration.findOne({
        user: { $ne: dbUser._id },
        registeredByUser: { $ne: dbUser.email.toLowerCase() },
        $or: [
          { 'details.mobile': mobileToCheck.trim() },
          { 'details.teacherMobile': mobileToCheck.trim() }
        ]
      });
      if (duplicateMobileReg && duplicateMobileReg.status !== 'Draft') {
        return res.status(400).json({ message: 'An account already exists with this mobile number. Please sign in.' });
      }
    }

    // ── Auto-allocate country / portfolio with seat checking & waitlist ──────
    let finalAllocatedCountry = allocatedCountry || '';
    let finalAllocatedCommittee = allocatedCommittee || details.committee || details.selectedCommittee || '';

    // Preserve existing allocated country if registration already exists in database
    let existingRegRecord = await Registration.findOne({
      $or: [
        { user: String(dbUser._id) },
        { user: dbUser._id },
        { registeredByUser: dbUser.email.toLowerCase() },
        { 'details.email': dbUser.email.toLowerCase() }
      ]
    });

    if (existingRegRecord) {
      if (registrationType === 'individual' && existingRegRecord.allocatedCountry && existingRegRecord.allocatedCountry.trim() !== '' && !existingRegRecord.allocatedCountry.toLowerCase().includes('pending')) {
        finalAllocatedCountry = existingRegRecord.allocatedCountry;
      }
      if (registrationType === 'school' && details.delegates && Array.isArray(details.delegates) && existingRegRecord.details?.delegates) {
        const existingDelegates = existingRegRecord.details.delegates;
        details.delegates.forEach((d: any, idx: number) => {
          const prevD = existingDelegates.find((pd: any) => (pd.email && pd.email === d.email) || (pd.name && pd.name === d.name)) || existingDelegates[idx];
          if (prevD && prevD.allocatedCountry && prevD.allocatedCountry.trim() !== '' && !prevD.allocatedCountry.toLowerCase().includes('pending')) {
            d.allocatedCountry = prevD.allocatedCountry;
          }
        });
      }
    }

    if (registrationType === 'individual') {
      if (finalAllocatedCommittee && !finalAllocatedCountry) {
        const normalizedCommittee = normalise(finalAllocatedCommittee);
        const pool = COMMITTEE_COUNTRY_POOL[normalizedCommittee];
        if (pool) {
          // Count currently filled seats across all registrations
          const registrations = await Registration.find({}, { registrationType: 1, allocatedCommittee: 1, details: 1 });
          let filledCount = 0;
          registrations.forEach((r: any) => {
            if (r.details?.seatStatus === 'Cancelled') return;
            if (r.registrationType === 'individual') {
              const rawC = r.allocatedCommittee || r.details?.committee || r.details?.selectedCommittee;
              if (rawC && normalise(rawC) === normalizedCommittee) {
                filledCount++;
              }
            } else if (r.registrationType === 'school') {
              const delegates = r.details?.delegates || r.details?.delegatesList || [];
              delegates.forEach((d: any) => {
                if (d.seatStatus === 'Cancelled') return;
                const rawC = d.allocatedCommittee || d.selectedCommittee;
                if (rawC && normalise(rawC) === normalizedCommittee) {
                  filledCount++;
                }
              });
            }
          });

          const isDoubleDelegation = normalizedCommittee.toLowerCase().includes('unsc') || normalizedCommittee.toLowerCase().includes('security council');
          const limit = isDoubleDelegation ? pool.length * 2 : pool.length;

          if (filledCount >= limit) {
            return res.status(400).json({ error: "COMMITTEE_FULL", message: `Registrations are FULL for ${finalAllocatedCommittee}. Please select a committee with available seats.` });
          } else {
            // Seats are available -> reserve & allocate automatically
            const autoCountry = await allocateCountry(finalAllocatedCommittee);
            if (autoCountry) {
              finalAllocatedCountry = autoCountry;
            } else {
              return res.status(400).json({ error: "COMMITTEE_FULL", message: `Registrations are FULL for ${finalAllocatedCommittee}. Please select a committee with available seats.` });
            }
          }
        }
      }
    } else if (registrationType === 'school' && details.delegates && Array.isArray(details.delegates)) {
      await allocateCountriesForRoster(details.delegates);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Ensure seatStatus defaults to Pending & registrationId is consistently assigned to all school roster delegates
    details.seatStatus = details.seatStatus || 'Pending';
    if (registrationType === 'school' && details.delegates && Array.isArray(details.delegates)) {
      details.delegates.forEach((d: any, idx: number) => {
        d.seatStatus = d.seatStatus || 'Pending';
        d.registrationId = `${registrationId}-${idx + 1}`;
      });
    }

    // Process file uploads (Google Drive / Local uploads)
    const processedDetails = await processRegistrationFiles(details, registrationType);
    // Check for existing registration document for this user to avoid duplicates
    let registration = await Registration.findOne({
      $or: [
        { user: String(dbUser._id) },
        { user: dbUser._id },
        { registeredByUser: dbUser.email.toLowerCase() },
        { 'details.email': dbUser.email.toLowerCase() }
      ]
    });

    const isBypass = paymentId && (paymentId.startsWith('BYPASS') || paymentId.startsWith('PAY-HOST-BYPASS'));

    if (registration) {
      registration.registrationType = registrationType;
      registration.amountPaid = amountPaid || registration.amountPaid;
      if (paymentId) registration.paymentId = paymentId;
      registration.allocatedCommittee = finalAllocatedCommittee;
      registration.allocatedCountry = finalAllocatedCountry;
      
      const mergedDetails = {
        ...(registration.details || {}),
        ...processedDetails,
        status: 'Submitted',
        isSubmitted: true
      };

      if (isBypass) {
        registration.paymentStatus = 'Verified';
        mergedDetails.paymentStatus = 'Verified';
        mergedDetails.paymentId = paymentId;
        mergedDetails.paymentMethod = 'Test Account Bypass';
        mergedDetails.paymentTimestamp = new Date().toISOString();
      }

      registration.details = mergedDetails;
      await registration.save();
    } else {
      const finalDetails = {
        ...processedDetails,
        status: 'Submitted',
        isSubmitted: true
      };

      let initialPaymentStatus = 'Pending';
      if (isBypass) {
        initialPaymentStatus = 'Verified';
        finalDetails.paymentStatus = 'Verified';
        finalDetails.paymentId = paymentId;
        finalDetails.paymentMethod = 'Test Account Bypass';
        finalDetails.paymentTimestamp = new Date().toISOString();
      }

      registration = new Registration({
        registrationId,
        user: dbUser._id,
        paymentId,
        paymentStatus: initialPaymentStatus,
        registrationType,
        registeredByUser: dbUser.email,
        amountPaid,
        allocatedCommittee: finalAllocatedCommittee,
        allocatedCountry: finalAllocatedCountry,
        details: finalDetails
      });
      await registration.save();
    }

    // Update User registrationCompleted flag to true
    dbUser.registrationCompleted = true;
    await dbUser.save();

    // Log registration submission
    try {
      const activity = new ActivityLog({
        registrationId: registration.registrationId || registrationId,
        delegateName: details.fullName || dbUser.fullName,
        action: 'Payment Successful',
        description: `Successfully submitted registration and processed payment of ₹${amountPaid} for type: ${registrationType}.`,
        user: dbUser.email,
        ipAddress: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1')
      });
      await activity.save();

      // Trigger excel generation
      generateMasterExcel().catch(err => console.error('Excel update error:', err));
    } catch (logErr) {
      console.error('Failed to log registration submission:', logErr);
    }

    // Dispatch confirmation emails asynchronously from backend
    try {
      // 1. Send to the delegate's login email
      sendRegistrationConfirmationEmail(dbUser.email, registration);
      
      // 2. If parent email exists and is different, send copy to parent
      if (details.parentEmail && details.parentEmail.toLowerCase() !== dbUser.email.toLowerCase()) {
        sendRegistrationConfirmationEmail(details.parentEmail, registration);
      }
      
      // 3. If school registration, send confirmation to teacher and individual allocation email to each delegate in the roster
      if (registrationType === 'school') {
        if (details.teacherEmail && details.teacherEmail.toLowerCase() !== dbUser.email.toLowerCase()) {
          sendRegistrationConfirmationEmail(details.teacherEmail, registration);
        }
        const delegatesList = details.delegates || details.delegatesList || [];
        const schoolName = details.schoolName || 'School Delegation';
        for (let idx = 0; idx < delegatesList.length; idx++) {
          const del = delegatesList[idx];
          const delEmail = del.email || del.delegateEmail;
          if (delEmail && delEmail.trim()) {
            const delName = del.name || del.fullName || 'Delegate';
            const delComm = del.allocatedCommittee || del.selectedCommittee || del.committee || '';
            const delCountry = del.allocatedCountry || del.country || 'Pending';
            const delRegId = del.registrationId || `${registrationId}-${idx + 1}`;
            del.registrationId = delRegId;
            sendSchoolDelegateAllocationEmail(
              delEmail.trim(),
              delName,
              schoolName,
              delComm,
              delCountry,
              delRegId
            ).catch((err: Error) => console.error(`Error sending delegate allocation email to ${delEmail}:`, err));
          }
        }
      }

      // 4. If waitlisted or a country was auto-allocated, send dedicated email
      if (finalAllocatedCountry === 'Waiting List') {
        sendWaitlistedEmail(dbUser.email, registration).catch((err: Error) =>
          console.error('Waitlist email error:', err)
        );
      } else if (finalAllocatedCountry) {
        sendCountryAllocationEmail(dbUser.email, registration).catch((err: Error) =>
          console.error('Country allocation email error:', err)
        );
      }
    } catch (mailErr) {
      console.error('Registration email dispatch trigger failed:', mailErr);
    }

    invalidateSeatCountsCache();

    // Clean up registration draft upon successful submission
    try {
      await RegistrationDraft.deleteMany({
        $or: [{ userId: dbUser.userId }, { userEmail: dbUser.email.toLowerCase() }]
      });
    } catch (draftErr) {
      console.error('Draft cleanup error:', draftErr);
    }

    return res.status(201).json({
      message: 'Registration submitted successfully.',
      registration,
    });
  } catch (error: any) {
    console.error('Submit registration error:', error);
    return res.status(500).json({ message: error.message || 'An internal server error occurred.' });
  }
};

export const getMyRegistration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    const dbUser = await User.findOne({ 
      $or: [
        { userId: req.user.userId },
        { email: req.user.email.toLowerCase() }
      ]
    });
    if (!dbUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const userEmail = (dbUser.email || '').toLowerCase().trim();
    if (!userEmail) {
      return res.status(200).json({ registration: null });
    }

    const allRegs = await Registration.find({
      $or: [
        { user: String(dbUser._id) },
        { registeredByUser: userEmail },
        { 'details.email': userEmail },
        { 'details.schoolTeacherEmail': userEmail }
      ]
    });

    const registration = (allRegs && allRegs.length > 0)
      ? (allRegs.find((r: any) => r.status !== 'Draft' && r.details?.status !== 'Draft') || allRegs[allRegs.length - 1])
      : null;

    if (registration && !dbUser.registrationCompleted) {
      dbUser.registrationCompleted = true;
      await dbUser.save();
    }

    return res.status(200).json({ registration });
  } catch (error) {
    console.error('Get my registration error:', error);
    return res.status(500).json({ message: 'An internal server error occurred.' });
  }
};

export const getAllRegistrations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    const registrations = await Registration.find().lean();
    return res.status(200).json({ registrations });
  } catch (error) {
    console.error('Get all registrations error:', error);
    return res.status(500).json({ message: 'An internal server error occurred.' });
  }
};

export const updateRegistration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    const { id } = req.params;
    const { allocatedCommittee, allocatedCountry, details } = req.body;

    const registration = await Registration.findById(id);
    if (!registration) {
      return res.status(404).json({ message: 'Registration record not found.' });
    }

    // Record previous values for log comparison
    const prevCommittee = registration.allocatedCommittee;
    const prevCountry = registration.allocatedCountry;
    const prevDetails = { ...registration.details };

    if (allocatedCommittee !== undefined) registration.allocatedCommittee = allocatedCommittee;
    if (allocatedCountry !== undefined) registration.allocatedCountry = allocatedCountry;
    if (registration.allocatedCommittee?.includes('IPP') || registration.allocatedCommittee?.includes('IPJ')) {
      registration.allocatedCountry = 'N/A';
    }
    if (details !== undefined) {
      if (Array.isArray(details.delegates)) {
        details.delegates.forEach((d: any, idx: number) => {
          const comm = d.allocatedCommittee || d.selectedCommittee;
          if (comm?.includes('IPP') || comm?.includes('IPJ')) {
            d.allocatedCountry = 'N/A';
          }
          d.registrationId = `${registration.registrationId}-${idx + 1}`;
        });
      }
      registration.details = details;
    }

    await registration.save();

    // Log admin modifications
    try {
      const adminName = req.user?.username || req.user?.email || 'Admin';
      const changes: string[] = [];

      if (allocatedCommittee !== undefined && allocatedCommittee !== prevCommittee) {
        changes.push(`Allocated Committee: "${prevCommittee || 'None'}" ➜ "${allocatedCommittee}"`);
      }
      if (allocatedCountry !== undefined && allocatedCountry !== prevCountry) {
        changes.push(`Allocated Country: "${prevCountry || 'None'}" ➜ "${allocatedCountry}"`);
      }

      // Check specific details sub-fields
      const checkFields = ['seatStatus', 'paymentStatus', 'attendanceStatus', 'remarks'];
      checkFields.forEach((field) => {
        const prevVal = prevDetails[field];
        const newVal = details?.[field];
        if (newVal !== undefined && newVal !== prevVal) {
          changes.push(`${field}: "${prevVal || 'None'}" ➜ "${newVal}"`);
        }
      });

      const changeStr = changes.join(', ') || 'Updated other details';

      const adminLog = new AdminLog({
        adminName,
        timestamp: new Date(),
        action: 'UPDATE_REGISTRATION',
        editedRecord: registration.registrationId,
        previousValue: `Committee: ${prevCommittee}, Country: ${prevCountry}, SeatStatus: ${prevDetails.seatStatus || 'Pending'}`,
        newValue: `Committee: ${registration.allocatedCommittee}, Country: ${registration.allocatedCountry}, SeatStatus: ${registration.details?.seatStatus || 'Pending'}`
      });
      await adminLog.save();

      const activity = new ActivityLog({
        registrationId: registration.registrationId,
        delegateName: registration.details?.fullName || 'School Delegation',
        action: 'Profile Updated',
        description: `Admin updated registration: ${changeStr}`,
        user: req.user?.email || 'admin',
        ipAddress: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1')
      });
      await activity.save();

      // Trigger background Master Excel compilation
      generateMasterExcel().catch(err => console.error('Excel update error:', err));

      // Fetch user (for individual registration check)
      let delegateUser: any = null;
      if (registration.registrationType === 'individual' && registration.user) {
        delegateUser = await User.findById(registration.user);
      }
      const toEmail = registration.registrationType === 'individual'
        ? (registration.details?.email || (delegateUser ? delegateUser.email : ''))
        : (registration.details?.teacherEmail || '');
      const parentEmail = registration.details?.parentEmail;
      const delegateName = registration.details?.fullName || 'Delegate';

      // Profile Locked / Unlocked
      const prevLocked = prevDetails.isLocked || false;
      const newLocked = registration.details?.isLocked || false;
      if (newLocked !== prevLocked) {
        if (newLocked) {
          if (registration.registrationType === 'individual' && toEmail) {
            sendProfileLockedEmail(toEmail, delegateName, registration.registrationId, registration.details?.remarks, parentEmail)
              .catch(err => console.error('Error sending profile locked email:', err));
          }
        } else {
          if (registration.registrationType === 'individual' && toEmail) {
            sendProfileUnlockedEmail(toEmail, delegateName, registration.registrationId, parentEmail)
              .catch(err => console.error('Error sending profile unlocked email:', err));
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // AUTOMATIC TARGETED EMAIL DISPATCHES ON ADMIN MODIFICATIONS
      // ─────────────────────────────────────────────────────────────────────────
      if (registration.registrationType === 'individual') {
        const committeeChanged = allocatedCommittee !== undefined && allocatedCommittee !== prevCommittee;
        const countryChanged = allocatedCountry !== undefined && allocatedCountry !== prevCountry;
        const prevSeatStatus = prevDetails?.seatStatus || 'Pending';
        const newSeatStatus = details?.seatStatus || registration.details?.seatStatus || 'Pending';
        const seatStatusChanged = newSeatStatus !== prevSeatStatus;

        if (committeeChanged && toEmail) {
          sendCommitteeChangedEmail(toEmail, delegateName, registration.registrationId, prevCommittee || 'None', allocatedCommittee, parentEmail)
            .catch(err => console.error('Error sending committee changed email:', err));
        }
        if (countryChanged && toEmail) {
          sendCountryChangedEmail(toEmail, delegateName, registration.registrationId, prevCountry || 'None', allocatedCountry, parentEmail)
            .catch(err => console.error('Error sending country changed email:', err));
        }
        if (seatStatusChanged && toEmail) {
          if (newSeatStatus === 'Confirmed') {
            sendSeatConfirmedEmail(toEmail, delegateName, registration.registrationId, registration.allocatedCommittee || 'UNGA', registration.allocatedCountry || 'Pending', parentEmail)
              .catch(err => console.error('Error sending seat confirmed email:', err));
          } else if (newSeatStatus === 'Cancelled') {
            sendSeatCancelledEmail(toEmail, delegateName, registration.registrationId, registration.details?.remarks || 'Cancelled by Secretariat', parentEmail)
              .catch(err => console.error('Error sending seat cancelled email:', err));
          } else if (newSeatStatus === 'Reserved') {
            sendSeatReservationEmail(toEmail, delegateName, registration.allocatedCommittee || 'UNGA', registration.allocatedCountry || 'Pending', registration.registrationId, parentEmail)
              .catch(err => console.error('Error sending seat reservation email:', err));
          }
        }

        // Details Updated (Name, School, Grade, Email, Mobile)
        const fieldLabels: Record<string, string> = {
          fullName: 'Full Name',
          name: 'Full Name',
          schoolName: 'School / Institution',
          gradeClass: 'Grade & Section',
          email: 'Email Address',
          mobile: 'Mobile Number',
          gender: 'Gender',
          dob: 'Date of Birth'
        };
        const updatedFields: string[] = [];
        Object.keys(fieldLabels).forEach((field) => {
          const prevVal = prevDetails[field];
          const newVal = details?.[field];
          if (newVal !== undefined && newVal !== prevVal && String(newVal).trim() !== String(prevVal || '').trim()) {
            updatedFields.push(`<strong>${fieldLabels[field]}:</strong> <span style="color:#ffffff;">${newVal}</span>`);
          }
        });
        if (updatedFields.length > 0 && toEmail) {
          sendRegistrationDetailsUpdatedEmail(toEmail, delegateName, registration.registrationId, updatedFields, parentEmail)
            .catch(err => console.error('Error sending details updated email:', err));
        }
      } else if (registration.registrationType === 'school' && details?.delegates) {
        const prevDelegates = prevDetails.delegates || prevDetails.delegatesList || [];
        const newDelegates = details.delegates;
        const schoolRosterChanges: string[] = [];

        const prevSchoolSeatStatus = prevDetails?.seatStatus || 'Pending';
        const newSchoolSeatStatus = details?.seatStatus || registration.details?.seatStatus || 'Pending';
        const schoolSeatChanged = newSchoolSeatStatus !== prevSchoolSeatStatus;

        for (let i = 0; i < newDelegates.length; i++) {
          const newDel = newDelegates[i];
          const prevDel = prevDelegates.find((d: any) => (d.email && d.email === newDel.email) || (d.name && d.name === newDel.name)) || prevDelegates[i] || {};
          
          if (schoolSeatChanged && (!newDel.seatStatus || newDel.seatStatus === prevSchoolSeatStatus || newDel.seatStatus === 'Pending')) {
            newDel.seatStatus = newSchoolSeatStatus;
          } else if (!newDel.seatStatus || newDel.seatStatus === 'Pending') {
            newDel.seatStatus = newSchoolSeatStatus;
          }

          const delEmail = newDel.email;
          const delParentEmail = newDel.parentEmail;
          const delName = newDel.name || `Delegate #${i + 1}`;

          const prevCommVal = prevDel.allocatedCommittee || prevDel.selectedCommittee || '';
          const newCommVal = newDel.allocatedCommittee || newDel.selectedCommittee || '';
          const commChanged = newCommVal && newCommVal !== prevCommVal;

          const prevCountryVal = prevDel.allocatedCountry || '';
          const newCountryVal = (newDel.allocatedCountry && newDel.allocatedCountry.trim() !== '') ? newDel.allocatedCountry : prevCountryVal;
          newDel.allocatedCountry = newCountryVal;
          const countryChanged = newCountryVal && newCountryVal !== prevCountryVal;

          const prevSeatVal = prevDel.seatStatus || 'Pending';
          const newSeatVal = newDel.seatStatus || 'Pending';
          const seatChanged = newSeatVal !== prevSeatVal;

          const prevLockVal = prevDel.isLocked || false;
          const newLockVal = newDel.isLocked || false;
          const lockChanged = newLockVal !== prevLockVal;

          // Track changes for teacher audit email
          if (commChanged || countryChanged || seatChanged || lockChanged) {
            const changeDesc: string[] = [];
            if (commChanged) changeDesc.push(`Committee "${prevCommVal || 'None'}" ➜ "${newCommVal}"`);
            if (countryChanged) changeDesc.push(`Country "${prevCountryVal || 'None'}" ➜ "${newCountryVal}"`);
            if (seatChanged) changeDesc.push(`Seat Status "${prevSeatVal}" ➜ "${newSeatVal}"`);
            if (lockChanged) changeDesc.push(`Lock Status "${prevLockVal ? 'Locked' : 'Unlocked'}" ➜ "${newLockVal ? 'Locked' : 'Unlocked'}"`);
            schoolRosterChanges.push(`Delegate "${delName}": ${changeDesc.join(', ')}`);
          }

          const delRegId = newDel.registrationId || `${registration.registrationId}-${i + 1}`;
          newDel.registrationId = delRegId;

          // TARGETED DISPATCH ONLY TO THIS PARTICULAR DELEGATE
          if (delEmail) {
            if (commChanged || countryChanged) {
              const isFirstAllocation = !prevCommVal || prevCommVal === 'None';
              if (isFirstAllocation) {
                // Send primary welcome allocation email
                sendCountryAllocationEmail(delEmail, { allocatedCommittee: newCommVal, allocatedCountry: newCountryVal, registrationId: delRegId, details: { fullName: delName } }, delParentEmail)
                  .catch(err => console.error('Error sending school delegate country allocation email:', err));
              } else {
                // Send change alert emails
                if (commChanged) {
                  sendCommitteeChangedEmail(delEmail, delName, delRegId, prevCommVal || 'None', newCommVal, delParentEmail)
                    .catch(err => console.error('Error sending school delegate committee change email:', err));
                }
                if (countryChanged) {
                  sendCountryChangedEmail(delEmail, delName, delRegId, prevCountryVal || 'None', newCountryVal, delParentEmail)
                    .catch(err => console.error('Error sending school delegate country change email:', err));
                }
              }
            }
            if (seatChanged) {
              if (newSeatVal === 'Confirmed') {
                sendSeatConfirmedEmail(delEmail, delName, delRegId, newCommVal || 'UNGA', newCountryVal || 'Pending', delParentEmail)
                  .catch(err => console.error('Error sending school delegate seat confirmed email:', err));
              } else if (newSeatVal === 'Cancelled') {
                sendSeatCancelledEmail(delEmail, delName, delRegId, registration.details?.remarks || 'Cancelled by Secretariat', delParentEmail)
                  .catch(err => console.error('Error sending school delegate seat cancelled email:', err));
              } else if (newSeatVal === 'Reserved') {
                sendSeatReservationEmail(delEmail, delName, newCommVal || 'UNGA', newCountryVal || 'Pending', delRegId, delParentEmail)
                  .catch(err => console.error('Error sending school delegate seat reservation email:', err));
              }
            }
            if (lockChanged) {
              if (newLockVal) {
                sendProfileLockedEmail(delEmail, delName, delRegId, registration.details?.remarks, delParentEmail)
                  .catch(err => console.error('Error sending school delegate profile locked email:', err));
              } else {
                sendProfileUnlockedEmail(delEmail, delName, delRegId, delParentEmail)
                  .catch(err => console.error('Error sending school delegate profile unlocked email:', err));
              }
            }

            // Delegate details changed
            const delFieldLabels: Record<string, string> = {
              name: 'Full Name',
              fullName: 'Full Name',
              schoolName: 'School / Institution',
              gradeClass: 'Grade & Section',
              email: 'Email Address',
              mobile: 'Mobile Number',
              gender: 'Gender',
              dob: 'Date of Birth'
            };
            const updatedDelFields: string[] = [];
            Object.keys(delFieldLabels).forEach((field) => {
              const prevV = prevDel[field];
              const newV = newDel[field];
              if (newV !== undefined && newV !== prevV && String(newV).trim() !== String(prevV || '').trim()) {
                updatedDelFields.push(`<strong>${delFieldLabels[field]}:</strong> <span style="color:#ffffff;">${newV}</span>`);
              }
            });
            if (updatedDelFields.length > 0) {
              sendRegistrationDetailsUpdatedEmail(delEmail, delName, delRegId, updatedDelFields, delParentEmail)
                .catch(err => console.error('Error sending school delegate details updated email:', err));
            }
          }
        }

        // Notify School Teacher/Coordinator of all roster updates
        if (schoolRosterChanges.length > 0 && toEmail) {
          sendSchoolDelegationUpdatedEmail(
            toEmail,
            registration.details.teacherName || 'Coordinator',
            registration.details.schoolName || 'Your School',
            registration.registrationId,
            schoolRosterChanges
          ).catch((err: Error) => console.error('School delegation update email error:', err));
        }
      }
    } catch (logErr) {
      console.error('Failed to log admin update action:', logErr);
    }

    invalidateSeatCountsCache();

    return res.status(200).json({
      message: 'Registration record updated successfully.',
      registration,
    });
  } catch (error) {
    console.error('Update registration error:', error);
    return res.status(500).json({ message: 'An internal server error occurred.' });
  }
};

let seatCountsCache: { counts: Record<string, number>; timestamp: number } | null = null;
const CACHE_TTL_MS = 20000; // 20 seconds cache TTL

export const invalidateSeatCountsCache = () => {
  seatCountsCache = null;
};

export const getSeatCounts = async (req: any, res: Response) => {
  try {
    const now = Date.now();
    if (seatCountsCache && (now - seatCountsCache.timestamp < CACHE_TTL_MS)) {
      return res.status(200).json({ counts: seatCountsCache.counts, cached: true });
    }

    const registrations = await Registration.find({}, { registrationType: 1, allocatedCommittee: 1, details: 1 }).lean();
    const counts: Record<string, number> = {};

    const increment = (rawComm: string) => {
      if (!rawComm) return;
      const comm = normalise(rawComm);
      counts[comm] = (counts[comm] || 0) + 1;
      const match = comm.match(/\(([^)]+)\)/);
      if (match && match[1]) {
        const short = match[1];
        counts[short] = (counts[short] || 0) + 1;
      }
    };

    registrations.forEach((r: any) => {
      if (r.details?.seatStatus === 'Cancelled') return;

      if (r.registrationType === 'individual') {
        const rawComm = r.allocatedCommittee || r.details?.allocatedCommittee || r.details?.committee || r.details?.selectedCommittee;
        if (rawComm) {
          increment(rawComm);
        }
      } else if (r.registrationType === 'school') {
        const delegates = r.details?.delegates || r.details?.delegatesList || [];
        delegates.forEach((d: any) => {
          if (d.seatStatus === 'Cancelled') return;
          const rawComm = d.allocatedCommittee || d.selectedCommittee;
          if (rawComm) {
            increment(rawComm);
          }
        });
      }
    });

    seatCountsCache = { counts, timestamp: now };
    return res.status(200).json({ counts });
  } catch (error) {
    console.error('Get seat counts error:', error);
    return res.status(500).json({ message: 'An internal server error occurred.' });
  }
};

export const getCommitteeAllocations = async (req: any, res: Response) => {
  try {
    const registrations = await Registration.find(
      {},
      {
        registrationType: 1,
        allocatedCommittee: 1,
        allocatedCountry: 1,
        details: 1
      }
    );

    const allocations: Array<{
      committee: string;
      country: string;
      delegateName: string;
      schoolName: string;
      registrationType: string;
    }> = [];

    registrations.forEach((r: any) => {
      const isIndiv = r.registrationType === 'individual';
      const schoolName = isIndiv ? 'Individual' : (r.details?.schoolName || 'School');

      if (isIndiv) {
        if (r.allocatedCommittee && r.allocatedCountry) {
          allocations.push({
            committee: r.allocatedCommittee,
            country: r.allocatedCountry,
            delegateName: r.details?.fullName || 'Individual Delegate',
            schoolName,
            registrationType: 'Individual'
          });
        }
      } else {
        const delegates = r.details?.delegates || r.details?.delegatesList || [];
        delegates.forEach((d: any) => {
          if (d.allocatedCommittee && d.allocatedCountry) {
            allocations.push({
              committee: d.allocatedCommittee,
              country: d.allocatedCountry,
              delegateName: d.name || 'Delegate',
              schoolName,
              registrationType: 'Delegate'
            });
          }
        });
      }
    });

    return res.status(200).json({ allocations });
  } catch (error) {
    console.error('Get committee allocations error:', error);
    return res.status(500).json({ message: 'An internal server error occurred.' });
  }
};


export const clearAllData = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    // Emails of permanent test accounts that must never be deleted
    const BYPASS_EMAILS = [
      'counsellor.ann@chennaipublicschool.com',
      'reena@cpsglobalschool.com',
      'omarm@cpsglobalschool.com',
    ];

    // Delete all registrations from database
    await Registration.deleteMany({});
    await ActivityLog.deleteMany({});
    await AdminLog.deleteMany({});
    await EmailLog.deleteMany({});
    await LoginLog.deleteMany({});
    await OTPLog.deleteMany({});
    await OTP.deleteMany({});
    await PendingUser.deleteMany({});

    // Delete all non-admin users EXCEPT the permanent test/bypass accounts
    await User.deleteMany({
      role: { $nin: ['Admin', 'SuperAdmin'] },
      email: { $nin: BYPASS_EMAILS },
    });

    // Reset registrationCompleted flag for bypass accounts (their data was cleared above)
    await User.updateMany(
      { email: { $in: BYPASS_EMAILS } },
      { $set: { registrationCompleted: false, refreshToken: undefined } }
    );

    // Delete the master Excel file from disk if it exists
    const EXCEL_FILE_PATH = path.join(__dirname, '../../data/master_registration.xlsx');
    if (fs.existsSync(EXCEL_FILE_PATH)) {
      fs.unlinkSync(EXCEL_FILE_PATH);
    }

    console.log('⚠️ ADMIN: All data cleared by', req.user.email, '| Test accounts preserved.');

    return res.status(200).json({
      message: 'All data cleared successfully. Admin & test accounts preserved.',
    });
  } catch (error) {
    console.error('Clear all data error:', error);
    return res.status(500).json({ message: 'Failed to clear all data.' });
  }
};


export const downloadAdminExcel = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    // Force regeneration to make sure it is 100% fresh
    let filePath: string;
    try {
      filePath = await generateMasterExcel();
    } catch (genErr: any) {
      console.error('Excel generation error:', genErr);
      return res.status(500).json({ message: 'Excel generation failed: ' + (genErr.message || 'Unknown error') });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Master Excel sheet not generated yet. The file was not found on disk.' });
    }

    // Record download action in logs
    try {
      const adminLog = new AdminLog({
        adminName: req.user.username || req.user.email || 'Admin',
        timestamp: new Date(),
        action: 'DOWNLOAD_EXCEL',
        editedRecord: 'Master Workbook',
        previousValue: '',
        newValue: 'Excel Downloaded'
      });
      await adminLog.save();

      const activity = new ActivityLog({
        action: 'Excel Exported',
        description: `Admin ${req.user.username || req.user.email} exported the Master Excel Workbook.`,
        user: req.user.email,
        ipAddress: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1')
      });
      await activity.save();
    } catch (logErr) {
      console.error('Failed to log Excel download action:', logErr);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=master_registration.xlsx');

    // Read file and send as buffer (more reliable on serverless than res.download)
    try {
      const fileBuffer = fs.readFileSync(filePath);
      return res.send(fileBuffer);
    } catch (readErr) {
      console.error('Failed to read Excel file, falling back to res.download:', readErr);
      return res.download(filePath, 'master_registration.xlsx');
    }
  } catch (error: any) {
    console.error('Download Excel error:', error);
    return res.status(500).json({ message: 'Failed to download the master Excel sheet: ' + (error.message || 'Unknown server error') });
  }
};

export const getAdminAuditLogs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    const logs = await AdminLog.find().sort({ timestamp: -1 }).limit(100);
    return res.status(200).json({ logs });
  } catch (error) {
    console.error('Get admin audit logs error:', error);
    return res.status(500).json({ message: 'Failed to fetch audit logs.' });
  }
};

export const assignDelegatePortfolio = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    const { registrationId, delegateIndex, allocatedCommittee, allocatedCountry } = req.body;

    const registration = await Registration.findOne({ registrationId });
    if (!registration) {
      return res.status(404).json({ message: 'Registration record not found.' });
    }

    const committee = normalise(allocatedCommittee);
    const country = (allocatedCountry || '').trim();

    // 1. Prevent duplicate allocations if country is specified
    if (country) {
      const isDoubleDelegation = committee.toLowerCase().includes('unsc') || committee.toLowerCase().includes('security council');
      const maxSeatsPerCountry = isDoubleDelegation ? 2 : 1;

      // Count allocations for this country across all registrations
      let count = 0;

      // Individual registrations
      const otherIndivs = await Registration.find({
        registrationType: 'individual',
        allocatedCommittee: { $regex: new RegExp(`^${committee}$`, 'i') },
        allocatedCountry: { $regex: new RegExp(`^${country}$`, 'i') },
        registrationId: { $ne: registrationId }, // exclude this registration
        'details.seatStatus': { $ne: 'Cancelled' }
      }).lean();
      count += otherIndivs.length;

      // School registrations
      const otherSchools = await Registration.find({
        registrationType: 'school',
        'details.seatStatus': { $ne: 'Cancelled' }
      }).lean();

      otherSchools.forEach((r: any) => {
        const roster = r.details?.delegates || r.details?.delegatesList || [];
        roster.forEach((del: any, delIdx: number) => {
          if (del.seatStatus === 'Cancelled') return;
          const delComm = normalise(del.allocatedCommittee || del.selectedCommittee || '');
          if (
            delComm.toLowerCase() === committee.toLowerCase() &&
            del.allocatedCountry &&
            del.allocatedCountry.toLowerCase() === country.toLowerCase()
          ) {
            // Exclude current delegate if editing the same school registration
            if (r.registrationId === registrationId && delegateIndex !== null && delegateIndex === delIdx) {
              return;
            }
            count++;
          }
        });
      });

      if (count >= maxSeatsPerCountry) {
        return res.status(400).json({
          message: `The country/portfolio "${country}" is already fully allocated to ${count} delegate(s) in "${committee}".`
        });
      }
    }

    const adminUser = req.user.username || req.user.email || 'Admin';

    // 2. Perform the update
    if (delegateIndex === null || delegateIndex === undefined) {
      // Individual registration
      const prevComm = registration.allocatedCommittee || 'None';
      const prevCountry = registration.allocatedCountry || 'None';

      registration.allocatedCommittee = committee;
      registration.allocatedCountry = country;
      if (!registration.details) registration.details = {};
      registration.details.allocatedCommittee = committee;
      registration.details.allocatedCountry = country;
      registration.markModified('details');
      await registration.save();

      // Log action
      const adminLog = new AdminLog({
        adminName: adminUser,
        timestamp: new Date(),
        action: 'MANUAL_ALLOCATION',
        editedRecord: `Individual: ${registrationId} (${registration.details?.fullName || 'Delegate'})`,
        previousValue: `Comm: ${prevComm}, Country: ${prevCountry}`,
        newValue: `Comm: ${committee}, Country: ${country}`
      });
      await adminLog.save();

      const activity = new ActivityLog({
        action: 'Portfolio Allocated',
        description: `Admin ${adminUser} allocated ${committee} (${country}) to individual registration ${registrationId}.`,
        user: req.user.email,
        ipAddress: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1')
      });
      await activity.save();

      // Automatically send Country/Portfolio Allocation Email to Individual Delegate
      const toEmail = registration.details?.email;
      const parentEmail = registration.details?.parentEmail;
      const delegateName = registration.details?.fullName || 'Delegate';
      if (toEmail && (prevComm !== committee || prevCountry !== country)) {
        sendCountryAllocationEmail(toEmail, { allocatedCommittee: committee, allocatedCountry: country, registrationId: registration.registrationId, details: { fullName: delegateName } }, parentEmail)
          .catch(err => console.error('Error sending auto portfolio allocation email:', err));
      }

    } else {
      // School registration delegate roster row
      const roster = registration.details?.delegates || registration.details?.delegatesList || [];
      if (!roster[delegateIndex]) {
        return res.status(400).json({ message: 'Invalid delegate index in roster.' });
      }

      const prevComm = roster[delegateIndex].allocatedCommittee || 'None';
      const prevCountry = roster[delegateIndex].allocatedCountry || 'None';
      const delName = roster[delegateIndex].name || `Delegate #${delegateIndex + 1}`;
      const delEmail = roster[delegateIndex].email;
      const delParentEmail = roster[delegateIndex].parentEmail;

      roster[delegateIndex].allocatedCommittee = committee;
      roster[delegateIndex].allocatedCountry = country;

      registration.details.delegates = roster;
      registration.details.delegatesList = roster;
      registration.markModified('details');
      await registration.save();

      // Log action
      const adminLog = new AdminLog({
        adminName: adminUser,
        timestamp: new Date(),
        action: 'MANUAL_ALLOCATION',
        editedRecord: `School: ${registrationId} -> Delegate: ${delName}`,
        previousValue: `Comm: ${prevComm}, Country: ${prevCountry}`,
        newValue: `Comm: ${committee}, Country: ${country}`
      });
      await adminLog.save();

      const activity = new ActivityLog({
        action: 'Portfolio Allocated',
        description: `Admin ${adminUser} allocated ${committee} (${country}) to delegate ${delName} inside school registration ${registrationId}.`,
        user: req.user.email,
        ipAddress: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1')
      });
      await activity.save();

      // Automatically send Country/Portfolio Allocation Email to School Delegate
      if (delEmail && (prevComm !== committee || prevCountry !== country)) {
        const delRegId = roster[delegateIndex].registrationId || `${registration.registrationId}-${delegateIndex + 1}`;
        roster[delegateIndex].registrationId = delRegId;
        sendCountryAllocationEmail(delEmail, { allocatedCommittee: committee, allocatedCountry: country, registrationId: delRegId, details: { fullName: delName } }, delParentEmail)
          .catch(err => console.error('Error sending auto portfolio allocation email to school delegate:', err));
      }
    }

    return res.status(200).json({ registration });
  } catch (error) {
    console.error('Assign delegate portfolio error:', error);
    return res.status(500).json({ message: 'Failed to assign portfolio.' });
  }
};

export const swapDelegatePortfolios = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    const { delegateA, delegateB } = req.body;

    const regA = await Registration.findOne({ registrationId: delegateA.registrationId });
    const regB = delegateA.registrationId === delegateB.registrationId
      ? regA
      : await Registration.findOne({ registrationId: delegateB.registrationId });

    if (!regA || !regB) {
      return res.status(404).json({ message: 'One or both registration records not found.' });
    }

    let commA = '', countryA = '', nameA = '';
    let commB = '', countryB = '', nameB = '';

    // Get A allocation values
    if (delegateA.delegateIndex === null || delegateA.delegateIndex === undefined) {
      commA = regA.allocatedCommittee || regA.details?.allocatedCommittee || regA.details?.committee || regA.details?.selectedCommittee || '';
      countryA = regA.allocatedCountry || regA.details?.allocatedCountry || regA.details?.selectedCountry || regA.details?.portfolio || regA.details?.country || '';
      nameA = regA.details?.fullName || 'Delegate A';
    } else {
      const rosterA = regA.details?.delegates || regA.details?.delegatesList || [];
      const delA = rosterA[delegateA.delegateIndex];
      if (!delA) return res.status(400).json({ message: 'Invalid delegate A index.' });
      commA = delA.allocatedCommittee || delA.selectedCommittee || delA.committee || '';
      countryA = delA.allocatedCountry || delA.selectedCountry || delA.portfolio || delA.country || '';
      nameA = delA.name || delA.fullName || `Delegate A #${delegateA.delegateIndex + 1}`;
    }

    // Get B allocation values
    if (delegateB.delegateIndex === null || delegateB.delegateIndex === undefined) {
      commB = regB.allocatedCommittee || regB.details?.allocatedCommittee || regB.details?.committee || regB.details?.selectedCommittee || '';
      countryB = regB.allocatedCountry || regB.details?.allocatedCountry || regB.details?.selectedCountry || regB.details?.portfolio || regB.details?.country || '';
      nameB = regB.details?.fullName || 'Delegate B';
    } else {
      const rosterB = regB.details?.delegates || regB.details?.delegatesList || [];
      const delB = rosterB[delegateB.delegateIndex];
      if (!delB) return res.status(400).json({ message: 'Invalid delegate B index.' });
      commB = delB.allocatedCommittee || delB.selectedCommittee || delB.committee || '';
      countryB = delB.allocatedCountry || delB.selectedCountry || delB.portfolio || delB.country || '';
      nameB = delB.name || delB.fullName || `Delegate B #${delegateB.delegateIndex + 1}`;
    }

    // Set A to B's previous values
    if (delegateA.delegateIndex === null || delegateA.delegateIndex === undefined) {
      regA.allocatedCommittee = commB;
      regA.allocatedCountry = countryB;
      if (!regA.details) regA.details = {};
      regA.details.allocatedCommittee = commB;
      regA.details.allocatedCountry = countryB;
      regA.details.selectedCommittee = commB;
      regA.details.selectedCountry = countryB;
      regA.details.portfolio = countryB;
      regA.details.country = countryB;
      if (typeof regA.markModified === 'function') regA.markModified('details');
    } else {
      const rosterA = regA.details?.delegates || regA.details?.delegatesList || [];
      rosterA[delegateA.delegateIndex].allocatedCommittee = commB;
      rosterA[delegateA.delegateIndex].allocatedCountry = countryB;
      rosterA[delegateA.delegateIndex].selectedCommittee = commB;
      rosterA[delegateA.delegateIndex].selectedCountry = countryB;
      rosterA[delegateA.delegateIndex].portfolio = countryB;
      rosterA[delegateA.delegateIndex].country = countryB;
      regA.details.delegates = rosterA;
      regA.details.delegatesList = rosterA;
      if (typeof regA.markModified === 'function') regA.markModified('details');
    }

    // Set B to A's previous values
    if (delegateB.delegateIndex === null || delegateB.delegateIndex === undefined) {
      regB.allocatedCommittee = commA;
      regB.allocatedCountry = countryA;
      if (!regB.details) regB.details = {};
      regB.details.allocatedCommittee = commA;
      regB.details.allocatedCountry = countryA;
      regB.details.selectedCommittee = commA;
      regB.details.selectedCountry = countryA;
      regB.details.portfolio = countryA;
      regB.details.country = countryA;
      if (typeof regB.markModified === 'function') regB.markModified('details');
    } else {
      const rosterB = regB.details?.delegates || regB.details?.delegatesList || [];
      rosterB[delegateB.delegateIndex].allocatedCommittee = commA;
      rosterB[delegateB.delegateIndex].allocatedCountry = countryA;
      rosterB[delegateB.delegateIndex].selectedCommittee = commA;
      rosterB[delegateB.delegateIndex].selectedCountry = countryA;
      rosterB[delegateB.delegateIndex].portfolio = countryA;
      rosterB[delegateB.delegateIndex].country = countryA;
      regB.details.delegates = rosterB;
      regB.details.delegatesList = rosterB;
      if (typeof regB.markModified === 'function') regB.markModified('details');
    }

    await regA.save();
    if (regA.registrationId !== regB.registrationId) {
      await regB.save();
    }

    // Regenerate Master Excel so Excel sheet immediately reflects the swapped countries
    await generateMasterExcel().catch(err => console.error('Excel generation after swap error:', err));

    const adminUser = req.user.username || req.user.email || 'Admin';

    // Log A swap
    const adminLogA = new AdminLog({
      adminName: adminUser,
      timestamp: new Date(),
      action: 'SWAP_ALLOCATION',
      editedRecord: `Delegate A: ${nameA} (${delegateA.registrationId})`,
      previousValue: `Comm: ${commA}, Country: ${countryA}`,
      newValue: `Comm: ${commB}, Country: ${countryB}`
    });
    await adminLogA.save();

    // Log B swap
    const adminLogB = new AdminLog({
      adminName: adminUser,
      timestamp: new Date(),
      action: 'SWAP_ALLOCATION',
      editedRecord: `Delegate B: ${nameB} (${delegateB.registrationId})`,
      previousValue: `Comm: ${commB}, Country: ${countryB}`,
      newValue: `Comm: ${commA}, Country: ${countryA}`
    });
    await adminLogB.save();

    const activity = new ActivityLog({
      action: 'Portfolios Swapped',
      description: `Admin ${adminUser} swapped portfolios between ${nameA} and ${nameB}.`,
      user: req.user.email,
      ipAddress: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1')
    });
    await activity.save();

    // Automatically send allocation emails to both swapped delegates
    const emailA = delegateA.delegateIndex === null || delegateA.delegateIndex === undefined
      ? regA.details?.email
      : regA.details?.delegates?.[delegateA.delegateIndex]?.email;
    const parentA = delegateA.delegateIndex === null || delegateA.delegateIndex === undefined
      ? regA.details?.parentEmail
      : regA.details?.delegates?.[delegateA.delegateIndex]?.parentEmail;

    const emailB = delegateB.delegateIndex === null || delegateB.delegateIndex === undefined
      ? regB.details?.email
      : regB.details?.delegates?.[delegateB.delegateIndex]?.email;
    const parentB = delegateB.delegateIndex === null || delegateB.delegateIndex === undefined
      ? regB.details?.parentEmail
      : regB.details?.delegates?.[delegateB.delegateIndex]?.parentEmail;

    if (emailA) {
      sendCountryAllocationEmail(emailA, { allocatedCommittee: commB, allocatedCountry: countryB, registrationId: regA.registrationId, details: { fullName: nameA } }, parentA)
        .catch(err => console.error('Error sending auto swap allocation email to Delegate A:', err));
    }
    if (emailB) {
      sendCountryAllocationEmail(emailB, { allocatedCommittee: commA, allocatedCountry: countryA, registrationId: regB.registrationId, details: { fullName: nameB } }, parentB)
        .catch(err => console.error('Error sending auto swap allocation email to Delegate B:', err));
    }

    return res.status(200).json({ regA, regB });
  } catch (error) {
    console.error('Swap delegate portfolios error:', error);
    return res.status(500).json({ message: 'Failed to swap portfolios.' });
  }
};

export const sendAdminNotificationEmail = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    const { to, subject, body } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ message: 'Missing recipient, subject, or body.' });
    }

    await sendGeneralNotificationEmail(to, subject, body);
    return res.status(200).json({ message: 'Email dispatched successfully.' });
  } catch (error: any) {
    console.error('Error dispatching admin notification email:', error);
    return res.status(500).json({ message: error.message || 'Failed to dispatch email.' });
  }
};

export const deleteRegistration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    const { id } = req.params;
    let registration = await Registration.findById(id);
    if (!registration) {
      registration = await Registration.findOne({ registrationId: id });
    }
    if (!registration) {
      return res.status(404).json({ message: 'Registration record not found.' });
    }

    const registrationId = registration.registrationId;
    const delegateEmail = registration.details?.email || registration.registeredByUser;
    const registrationType = registration.registrationType;

    // Send Email 11 (Registration Removed) to the delegate before deletion!
    if (registrationType === 'individual' && delegateEmail) {
      await sendRegistrationRemovedEmail(delegateEmail, registrationId).catch(err => console.error(err));
    } else if (registrationType === 'school') {
      const teacherEmail = registration.details?.teacherEmail;
      if (teacherEmail) {
        await sendRegistrationRemovedEmail(teacherEmail, registrationId).catch(err => console.error(err));
      }
      const delegates = registration.details?.delegates || [];
      for (const del of delegates) {
        if (del.email) {
          await sendRegistrationRemovedEmail(del.email, registrationId).catch(err => console.error(err));
        }
      }
    }

    // Delete associated User account
    if (registration.user) {
      await User.deleteOne({ _id: registration.user }).catch(() => {});
    }
    if (delegateEmail) {
      await User.deleteMany({ email: delegateEmail.toLowerCase(), role: { $nin: ['Admin', 'SuperAdmin'] } }).catch(() => {});
    }

    // Delete the Registration document
    await Registration.deleteOne({ _id: registration._id });

    // Trigger background Master Excel compilation
    generateMasterExcel().catch(err => console.error('Excel update error:', err));

    return res.status(200).json({ message: 'Registration record removed successfully.' });
  } catch (error: any) {
    console.error('Delete registration error:', error);
    return res.status(500).json({ message: error.message || 'Failed to remove registration.' });
  }
};

export const getAdminEmailLogs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }
    const logs = await EmailLog.find().sort({ timestamp: -1 });
    return res.status(200).json({ logs });
  } catch (error) {
    console.error('Fetch email logs error:', error);
    return res.status(500).json({ message: 'Failed to retrieve email logs.' });
  }
};

export const resendNotificationEmail = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    const { id, recipient, emailType, delegateIndex } = req.body;

    let reg: any = null;
    if (id) {
      reg = await Registration.findById(id);
    } else if (recipient) {
      reg = await Registration.findOne({
        $or: [
          { 'details.email': recipient },
          { 'details.teacherEmail': recipient },
          { registeredByUser: recipient }
        ]
      });
    }

    if (!reg) {
      return res.status(404).json({ message: 'Registration record not found matching query.' });
    }

    let delegateUser: any = null;
    if (reg.registrationType === 'individual' && reg.user) {
      delegateUser = await User.findById(reg.user);
    }

    let toEmail = reg.registrationType === 'individual'
      ? (reg.details?.email || (delegateUser ? delegateUser.email : ''))
      : (reg.details?.teacherEmail || '');
    let parentEmail = reg.details?.parentEmail;
    let name = reg.details?.fullName || reg.details?.teacherName || 'Delegate';
    let committee = reg.allocatedCommittee || reg.details?.committee || 'UNGA';
    let country = reg.allocatedCountry || 'Pending';

    // If delegateIndex is provided for school delegation, target that particular delegate
    if (reg.registrationType === 'school' && delegateIndex !== undefined && delegateIndex !== null) {
      const roster = reg.details?.delegates || reg.details?.delegatesList || [];
      const del = roster[delegateIndex];
      if (del) {
        toEmail = del.email || toEmail;
        parentEmail = del.parentEmail || parentEmail;
        name = del.name || name;
        committee = del.allocatedCommittee || del.selectedCommittee || committee;
        country = del.allocatedCountry || country;
      }
    }

    if (recipient) {
      toEmail = recipient;
    }

    if (!toEmail) {
      return res.status(400).json({ message: 'No valid recipient email found for this record.' });
    }

    switch (emailType) {
      case 'Registration Confirmation':
        await sendRegistrationConfirmationEmail(toEmail, reg);
        break;
      case 'Country Allocation':
      case 'Delegate Allocation':
        if (reg.registrationType === 'individual' || delegateIndex !== undefined) {
          const roster = reg.details?.delegates || reg.details?.delegatesList || [];
          const del = (delegateIndex !== undefined) ? roster[delegateIndex] : null;
          const delRegId = del?.registrationId || (delegateIndex !== undefined ? `${reg.registrationId}-${delegateIndex + 1}` : reg.registrationId);
          await sendSchoolDelegateAllocationEmail(toEmail, name, reg.details?.schoolName || 'Individual Delegate', committee, country, delRegId);
        } else {
          const delegates = reg.details?.delegates || reg.details?.delegatesList || [];
          const schoolName = reg.details?.schoolName || 'Your School';
          await sendSchoolBulkAllocationEmail(toEmail, name, schoolName, delegates, reg.registrationId);
          for (let idx = 0; idx < delegates.length; idx++) {
            const d = delegates[idx];
            const dEmail = d.email || d.delegateEmail;
            if (dEmail && dEmail.trim()) {
              const delRegId = d.registrationId || `${reg.registrationId}-${idx + 1}`;
              await sendSchoolDelegateAllocationEmail(
                dEmail.trim(),
                d.name || d.fullName || 'Delegate',
                schoolName,
                d.allocatedCommittee || d.selectedCommittee || 'Unassigned',
                d.allocatedCountry || d.country || 'Pending',
                reg.registrationId
              ).catch(err => console.error('Error sending individual delegate email:', err));
            }
          }
        }
        break;
      case 'Committee Changed':
        await sendCommitteeChangedEmail(toEmail, name, reg.registrationId, 'Previous Committee', committee, parentEmail);
        break;
      case 'Country Changed':
        await sendCountryChangedEmail(toEmail, name, reg.registrationId, 'Previous Country', country, parentEmail);
        break;
      case 'Details Updated':
        await sendRegistrationDetailsUpdatedEmail(toEmail, name, reg.registrationId, ['Resent database record summary by Administrator'], parentEmail);
        break;
      case 'Seat Confirmed':
        await sendSeatConfirmedEmail(toEmail, name, reg.registrationId, committee, country, parentEmail);
        break;
      case 'Seat Cancelled':
        await sendSeatCancelledEmail(toEmail, name, reg.registrationId, reg.details?.remarks || 'Resent cancellation notification', parentEmail);
        break;
      case 'Profile Locked':
        await sendProfileLockedEmail(toEmail, name, reg.registrationId, reg.details?.remarks, parentEmail);
        break;
      case 'Profile Unlocked':
        await sendProfileUnlockedEmail(toEmail, name, reg.registrationId, parentEmail);
        break;
      case 'Registration Removed':
        await sendRegistrationRemovedEmail(toEmail, reg.registrationId, 'Resent deletion notice');
        break;
      case 'Seat Reservation':
        await sendSeatReservationEmail(toEmail, name, committee, country, reg.registrationId, parentEmail);
        break;
      default:
        return res.status(400).json({ message: `Unsupported email type: ${emailType}` });
    }

    return res.status(200).json({ message: `Successfully resent '${emailType}' email.` });
  } catch (error: any) {
    console.error('Error resending email:', error);
    return res.status(500).json({ message: error.message || 'Failed to resend email.' });
  }
};

export const checkDuplicate = async (req: Request, res: Response) => {
  try {
    const { email, mobile, schoolId, registrationType } = req.body;
    const orConditions: any[] = [];
    if (email) {
      const trimmedEmail = email.trim();
      orConditions.push({ 'details.email': { $regex: new RegExp(`^${trimmedEmail}$`, 'i') } });
      orConditions.push({ 'details.teacherEmail': { $regex: new RegExp(`^${trimmedEmail}$`, 'i') } });
    }
    if (mobile) {
      const trimmedMobile = mobile.trim();
      orConditions.push({ 'details.mobile': trimmedMobile });
      orConditions.push({ 'details.teacherMobile': trimmedMobile });
    }
    if (registrationType === 'school' && schoolId) {
      const trimmedSchoolId = schoolId.trim();
      orConditions.push({ 'details.schoolId': trimmedSchoolId });
      orConditions.push({ 'details.schoolID': trimmedSchoolId });
    }
    if (orConditions.length === 0) {
      return res.status(400).json({ message: 'No identification fields provided.' });
    }
    const duplicate = await Registration.findOne({ $or: orConditions });
    if (duplicate) {
      return res.status(409).json({ message: 'An account already exists with this email. Please sign in.' });
    }
    return res.status(200).json({ message: 'No duplicate found.' });
  } catch (error) {
    console.error('Duplicate check error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getUserCredentials = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    const rawUsers = await User.find().select('_id fullName email plainPassword role status createdAt updatedAt').sort({ createdAt: -1 }).lean();
    const rawRegistrations = await Registration.find().sort({ createdAt: -1 }).lean();

    const seenEmails = new Set<string>();
    const users: any[] = [];

    // 1. User Account records
    for (const u of rawUsers) {
      const emailLower = (u.email || '').toLowerCase();
      if (!emailLower || seenEmails.has(emailLower)) continue;
      seenEmails.add(emailLower);

      const plainPassword = u.plainPassword || '(Set by User)';
      users.push({
        _id: u._id,
        fullName: u.fullName,
        email: u.email,
        plainPassword,
        role: u.role || 'Delegate',
        status: u.status || 'Active',
        createdAt: u.createdAt,
        updatedAt: u.updatedAt
      });
    }

    // 2. Individual Registration Delegates (if user account not separately indexed)
    for (const r of rawRegistrations) {
      if (r.registrationType === 'individual') {
        const email = r.details?.email || r.registeredByUser;
        const emailLower = (email || '').toLowerCase();
        if (emailLower && !seenEmails.has(emailLower)) {
          seenEmails.add(emailLower);
          users.push({
            _id: r._id,
            fullName: r.details?.fullName || 'Individual Delegate',
            email: email,
            plainPassword: '(Registered Candidate)',
            role: 'Delegate',
            status: r.details?.seatStatus || 'Active',
            createdAt: r.createdAt,
            updatedAt: r.updatedAt
          });
        }
      }
    }

    return res.status(200).json({ users });
  } catch (error: any) {
    console.error('Get user credentials error:', error);
    return res.status(500).json({ message: error.message || 'Failed to fetch user credentials.' });
  }
};

export const updateUserPasswordAdmin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({ message: 'Email and new password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'User account not found.' });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    user.passwordHash = passwordHash;
    user.plainPassword = newPassword;
    await user.save();

    return res.status(200).json({ message: `Password updated successfully for ${user.email}.` });
  } catch (error: any) {
    console.error('Update user password error:', error);
    return res.status(500).json({ message: error.message || 'Failed to update user password.' });
  }
};


export const deleteUserCredentialAdmin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'User ID or Email is required.' });
    }

    const targetParam = decodeURIComponent(id).trim();

    // 1. Find target user by ID or Email
    let userObj = await User.findById(targetParam).catch(() => null);
    if (!userObj) {
      userObj = await User.findOne({
        $or: [
          { userId: targetParam },
          { email: new RegExp(`^${targetParam.replace(/[^a-zA-Z0-9@._-]/g, '')}$`, 'i') }
        ]
      });
    }

    let targetEmail = '';
    if (userObj) {
      if (userObj.role === 'Admin' || userObj.role === 'SuperAdmin') {
        return res.status(400).json({ message: 'Cannot delete Admin or SuperAdmin credentials.' });
      }
      targetEmail = userObj.email;
    } else {
      targetEmail = targetParam;
    }

    if (targetEmail) {
      const emailLower = targetEmail.toLowerCase();

      // 2. Find and delete all Registration records associated with this email
      const matchingRegs = await Registration.find({
        $or: [
          { registeredByUser: emailLower },
          { 'details.email': new RegExp(`^${emailLower}$`, 'i') },
          { 'details.teacherEmail': new RegExp(`^${emailLower}$`, 'i') }
        ]
      });

      for (const reg of matchingRegs) {
        if (reg.registrationType === 'individual' && reg.details?.email) {
          await sendRegistrationRemovedEmail(reg.details.email, reg.registrationId).catch(err => console.error(err));
        } else if (reg.registrationType === 'school') {
          if (reg.details?.teacherEmail) {
            await sendRegistrationRemovedEmail(reg.details.teacherEmail, reg.registrationId).catch(err => console.error(err));
          }
        }
        await Registration.deleteOne({ _id: reg._id });
      }

      // 3. Delete from Mongoose models
      await User.deleteMany({
        $or: [
          { _id: targetParam },
          { userId: targetParam },
          { email: emailLower }
        ],
        role: { $nin: ['Admin', 'SuperAdmin'] }
      }).catch(() => {});

      await RegistrationDraft.deleteMany({
        $or: [
          { userEmail: emailLower },
          { userId: targetParam }
        ]
      }).catch(() => {});

      await PendingUser.deleteMany({ email: emailLower }).catch(() => {});
      await OTP.deleteMany({ email: emailLower }).catch(() => {});
      await OTPLog.deleteMany({ recipient: emailLower }).catch(() => {});
      await EmailLog.deleteMany({ recipient: emailLower }).catch(() => {});
      await ActivityLog.deleteMany({ userEmail: emailLower }).catch(() => {});
      await LoginLog.deleteMany({ email: emailLower }).catch(() => {});

      // 4. Exhaustively purge all arrays in db.json (mock DB file)
      const dbFile = path.join(__dirname, '../../db.json');
      if (fs.existsSync(dbFile)) {
        try {
          const dbData = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
          let modified = false;

          // Purge users array
          if (Array.isArray(dbData.users)) {
            const bLen = dbData.users.length;
            dbData.users = dbData.users.filter((u: any) => {
              if (u.role === 'Admin' || u.role === 'SuperAdmin') return true;
              const uEmail = (u.email || '').toLowerCase();
              const uId = u._id || u.id || u.userId;
              return uEmail !== emailLower && uId !== targetParam;
            });
            if (dbData.users.length !== bLen) modified = true;
          }

          // Purge registrations array
          if (Array.isArray(dbData.registrations)) {
            const bLen = dbData.registrations.length;
            dbData.registrations = dbData.registrations.filter((r: any) => {
              const regUser = (r.registeredByUser || '').toLowerCase();
              const teacherE = (r.details?.teacherEmail || '').toLowerCase();
              const indivE = (r.details?.email || '').toLowerCase();
              const regUserId = r.user;
              return regUser !== emailLower && teacherE !== emailLower && indivE !== emailLower && regUserId !== targetParam;
            });
            if (dbData.registrations.length !== bLen) modified = true;
          }

          // Purge drafts
          ['drafts', 'registrationdrafts', 'registrationDrafts'].forEach(key => {
            if (Array.isArray(dbData[key])) {
              const bLen = dbData[key].length;
              dbData[key] = dbData[key].filter((d: any) => (d.userEmail || '').toLowerCase() !== emailLower && d.userId !== targetParam);
              if (dbData[key].length !== bLen) modified = true;
            }
          });

          // Purge pending users
          ['pendingusers', 'pendingUsers'].forEach(key => {
            if (Array.isArray(dbData[key])) {
              const bLen = dbData[key].length;
              dbData[key] = dbData[key].filter((p: any) => (p.email || '').toLowerCase() !== emailLower);
              if (dbData[key].length !== bLen) modified = true;
            }
          });

          // Purge otps
          if (Array.isArray(dbData.otps)) {
            const bLen = dbData.otps.length;
            dbData.otps = dbData.otps.filter((o: any) => (o.email || '').toLowerCase() !== emailLower);
            if (dbData.otps.length !== bLen) modified = true;
          }

          // Purge emaillogs
          if (Array.isArray(dbData.emaillogs)) {
            const bLen = dbData.emaillogs.length;
            dbData.emaillogs = dbData.emaillogs.filter((e: any) => (e.recipient || '').toLowerCase() !== emailLower);
            if (dbData.emaillogs.length !== bLen) modified = true;
          }

          // Purge activitylogs
          if (Array.isArray(dbData.activitylogs)) {
            const bLen = dbData.activitylogs.length;
            dbData.activitylogs = dbData.activitylogs.filter((a: any) => (a.userEmail || '').toLowerCase() !== emailLower);
            if (dbData.activitylogs.length !== bLen) modified = true;
          }

          if (modified) {
            fs.writeFileSync(dbFile, JSON.stringify(dbData, null, 2));
          }
        } catch (err) {
          console.error('Error purging db.json during credential deletion:', err);
        }
      }

      // 5. Re-generate master Excel spreadsheet
      await generateMasterExcel().catch(() => {});
    }

    return res.status(200).json({ success: true, message: 'User credential and associated registration records deleted successfully.' });
  } catch (error: any) {
    console.error('Error deleting user credential:', error);
    return res.status(500).json({ message: error.message || 'Failed to delete user credential.' });
  }
};

export const deriveMasterFeeAndStatus = (settings: any[] = []) => {
  const testModeSetting = settings.find((s: any) => s.key === 'testMode');
  const testMode = testModeSetting ? Boolean(testModeSetting.value) : false;

  const regStatusSetting = settings.find((s: any) => s.key === 'registrationStatus');
  let manualStatus = regStatusSetting ? regStatusSetting.value : 'live';

  const now = new Date();
  const aug15 = new Date('2026-08-15T00:00:00+05:30');
  const aug25Deadline = new Date('2026-08-25T23:59:59+05:30');

  const isPastDeadline = now > aug25Deadline;
  const status = isPastDeadline ? 'offline' : manualStatus;

  let fee = 750;
  let feeTier = 'Early Bird (₹750)';

  if (testMode) {
    fee = 1;
    feeTier = 'Test Mode (₹1)';
  } else if (now < aug15) {
    fee = 750;
    feeTier = 'Early Bird (₹750)';
  } else {
    fee = 800;
    feeTier = 'Standard Rate (₹800)';
  }

  return {
    testMode,
    fee,
    feeTier,
    status,
    isPastDeadline,
    closureDate: 'August 25, 2026 at 11:59 PM IST'
  };
};

export const getRegistrationStatus = async (req: Request, res: Response) => {
  try {
    const dbFile = path.join(__dirname, '../../db.json');
    let settings: any[] = [];
    if (fs.existsSync(dbFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
        if (data.settings && Array.isArray(data.settings)) {
          settings = data.settings;
        }
      } catch (e) {}
    }
    const info = deriveMasterFeeAndStatus(settings);
    return res.status(200).json({ status: info.status, isPastDeadline: info.isPastDeadline, closureDate: info.closureDate });
  } catch (error: any) {
    return res.status(200).json({ status: 'live', isPastDeadline: false });
  }
};

export const updateRegistrationStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
      return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }

    const { status } = req.body;
    if (status !== 'live' && status !== 'offline') {
      return res.status(400).json({ message: 'Invalid status value. Must be "live" or "offline".' });
    }

    const dbFile = path.join(__dirname, '../../db.json');
    let data: any = { users: [], registrations: [], pendingusers: [], otps: [], settings: [] };
    if (fs.existsSync(dbFile)) {
      try {
        data = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
      } catch (e) {}
    }
    if (!data.settings) data.settings = [];
    const index = data.settings.findIndex((s: any) => s.key === 'registrationStatus');
    if (index !== -1) {
      data.settings[index].value = status;
      data.settings[index].updatedAt = new Date().toISOString();
    } else {
      data.settings.push({ key: 'registrationStatus', value: status, updatedAt: new Date().toISOString() });
    }

    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf-8');

    try {
      await AdminLog.create({
        adminUser: req.user.email,
        action: 'UPDATE_REGISTRATION_STATUS',
        details: `Updated registration mode status to ${status.toUpperCase()}`,
        timestamp: new Date()
      });
    } catch (e) {}

    return res.status(200).json({ success: true, status, message: `Registration status updated to ${status.toUpperCase()}.` });
  } catch (error: any) {
    console.error('Update registration status error:', error);
    return res.status(500).json({ message: error.message || 'Failed to update registration status.' });
  }
};

export const getFeeSetting = async (req: Request, res: Response) => {
  try {
    const dbFile = path.join(__dirname, '../../db.json');
    let settings: any[] = [];
    if (fs.existsSync(dbFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
        if (data.settings && Array.isArray(data.settings)) {
          settings = data.settings;
        }
      } catch (e) {}
    }
    const info = deriveMasterFeeAndStatus(settings);
    return res.status(200).json({ success: true, ...info });
  } catch (error: any) {
    return res.status(200).json({
      success: true,
      testMode: false,
      fee: 750,
      feeTier: 'Early Bird (₹750)',
      status: 'live',
      isPastDeadline: false,
      closureDate: 'August 25, 2026 at 11:59 PM IST'
    });
  }
};

export const updateFeeSetting = async (req: Request, res: Response) => {
  try {
    const { testMode, fee } = req.body;

    const dbFile = path.join(__dirname, '../../db.json');
    let data: any = { users: [], registrations: [], pendingusers: [], otps: [], settings: [] };
    if (fs.existsSync(dbFile)) {
      try {
        data = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
      } catch (e) {}
    }
    if (!data.settings) data.settings = [];

    let newTestMode = false;
    if (testMode !== undefined) {
      newTestMode = Boolean(testMode);
    } else if (fee !== undefined) {
      newTestMode = parseInt(fee, 10) === 1;
    }

    const testIndex = data.settings.findIndex((s: any) => s.key === 'testMode');
    if (testIndex !== -1) {
      data.settings[testIndex].value = newTestMode;
      data.settings[testIndex].updatedAt = new Date().toISOString();
    } else {
      data.settings.push({ key: 'testMode', value: newTestMode, updatedAt: new Date().toISOString() });
    }

    const info = deriveMasterFeeAndStatus(data.settings);

    const feeIndex = data.settings.findIndex((s: any) => s.key === 'delegateFee');
    if (feeIndex !== -1) {
      data.settings[feeIndex].value = info.fee;
      data.settings[feeIndex].updatedAt = new Date().toISOString();
    } else {
      data.settings.push({ key: 'delegateFee', value: info.fee, updatedAt: new Date().toISOString() });
    }

    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf-8');
    return res.status(200).json({
      success: true,
      ...info,
      message: newTestMode ? 'Test Mode ENABLED (₹1 Gateway Fee Active).' : `Test Mode DISABLED (${info.feeTier} Active).`
    });
  } catch (error: any) {
    console.error('Update fee status error:', error);
    return res.status(500).json({ message: error.message || 'Failed to update test mode setting.' });
  }
};

/**
 * Automatically upload delegate document (Student ID Card / Photo / Aadhar ID) to Google Drive
 * POST /api/registration/upload-docs
 */
export const uploadDelegateDocument = async (req: Request, res: Response) => {
  try {
    const { registrationId, delegateName, docType } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[];
    let fileBuffer: Buffer | null = null;
    let fileName = '';
    let mimeType = 'image/jpeg';

    if (req.file) {
      fileBuffer = req.file.buffer;
      fileName = req.file.originalname;
      mimeType = req.file.mimetype;
    } else if (Array.isArray(files) && files.length > 0) {
      fileBuffer = files[0].buffer;
      fileName = files[0].originalname;
      mimeType = files[0].mimetype;
    } else if (typeof files === 'object' && files !== null) {
      const firstKey = Object.keys(files)[0];
      if (firstKey && (files as any)[firstKey]?.[0]) {
        const fileObj = (files as any)[firstKey][0];
        fileBuffer = fileObj.buffer;
        fileName = fileObj.originalname;
        mimeType = fileObj.mimetype;
      }
    }

    // Handle base64 fallback payload
    if (!fileBuffer && req.body.base64Data) {
      const driveRes = await uploadBase64ToDrive(
        req.body.base64Data,
        `${registrationId || 'CPS-REG'}_${(delegateName || 'Delegate').replace(/[^a-zA-Z0-9]/g, '_')}_${docType || 'Document'}_${Date.now()}`
      );
      return res.status(200).json({
        success: true,
        message: 'Document uploaded to Google Drive successfully.',
        fileId: driveRes.fileId,
        webViewLink: driveRes.webViewLink,
        webContentLink: driveRes.webContentLink,
        driveFolderUrl: `https://drive.google.com/drive/folders/${GOOGLE_DRIVE_FOLDER_ID}`
      });
    }

    if (!fileBuffer) {
      return res.status(400).json({ message: 'No file buffer or document data provided.' });
    }

    const cleanRegId = (registrationId || 'CPS-REG').replace(/[^a-zA-Z0-9-]/g, '');
    const cleanName = (delegateName || 'Delegate').replace(/[^a-zA-Z0-9]/g, '_');
    const cleanDocType = (docType || 'Document').replace(/[^a-zA-Z0-9]/g, '_');
    const ext = path.extname(fileName) || '.jpg';
    const driveFileName = `${cleanRegId}_${cleanName}_${cleanDocType}${ext}`;

    const driveResult = await uploadFileToDrive(fileBuffer, driveFileName, mimeType);

    // Update DB record if registrationId is available
    if (cleanRegId) {
      try {
        const reg = await Registration.findOne({ registrationId: cleanRegId });
        if (reg) {
          if (!reg.details) reg.details = {};
          if (docType === 'studentId' || docType === 'docStudentId') {
            reg.details.docStudentIdDriveUrl = driveResult.webViewLink;
            reg.details.docStudentId = driveResult.webViewLink;
          } else if (docType === 'letterhead' || docType === 'schoolLetterhead' || docType === 'docLetterhead') {
            reg.details.docLetterheadDriveUrl = driveResult.webViewLink;
            reg.details.schoolLetterheadDriveUrl = driveResult.webViewLink;
            reg.details.docLetterhead = driveResult.webViewLink;
            reg.details.schoolLetterhead = driveResult.webViewLink;
          } else {
            reg.details.docPhotoDriveUrl = driveResult.webViewLink;
            reg.details.docPhoto = driveResult.webViewLink;
            reg.details.docAadharDriveUrl = driveResult.webViewLink;
          }
          await reg.save();
        }
      } catch (dbErr) {}
    }

    return res.status(200).json({
      success: true,
      message: 'Document uploaded to Google Drive successfully.',
      fileId: driveResult.fileId,
      webViewLink: driveResult.webViewLink,
      webContentLink: driveResult.webContentLink,
      driveFolderUrl: `https://drive.google.com/drive/folders/${GOOGLE_DRIVE_FOLDER_ID}`
    });
  } catch (error: any) {
    console.error('Google Drive Document Upload Error:', error);
    return res.status(500).json({ message: error.message || 'Failed to upload document to Google Drive.' });
  }
};

