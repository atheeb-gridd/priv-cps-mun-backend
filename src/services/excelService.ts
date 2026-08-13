import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import User from '../models/User';
import Registration from '../models/Registration';
import LoginLog from '../models/LoginLog';
import ActivityLog from '../models/ActivityLog';
import EmailLog from '../models/EmailLog';
import AdminLog from '../models/AdminLog';
import OTPLog from '../models/OTPLog';

const EXCEL_FILE_PATH = process.env.VERCEL
  ? '/tmp/data/master_registration.xlsx'
  : path.join(__dirname, '../../data/master_registration.xlsx');

/**
 * Helper to format a date to standard locale format in the configured timezone.
 * Defaults to 'Asia/Kolkata' (IST) to ensure consistency across exports.
 */
const formatDateTime = (date: any): string => {
  if (!date) return '-';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('en-IN', {
      timeZone: process.env.TZ || 'Asia/Kolkata',
      hour12: true
    });
  } catch (error) {
    return '-';
  }
};


// Core committees list for seat availability calculations (matches official capacity sheet)
const COMMITTEES = [
  'UN Human Rights Council (UNHRC)',
  'UN General Assembly (UNGA)',
  'UN Security Council (UNSC) (Double delegation)',
  'Economic and Social Council (ECOSOC)',
  'International Labour Organization (ILO)',
  'Social, Humanitarian and Cultural Committee (SOCHUM)',
  'UN Environment Programme (UNEP)',
  'International Press Plenary (IPP)',
  'International Press Journalism (IPJ)',
  'United States Senate (US SENATE)',
  'Lok Sabha',
  'Crisis Committee',
];
const COMMITTEE_SEATS: Record<string, number> = {
  'UN Human Rights Council (UNHRC)': 40,
  'UN General Assembly (UNGA)': 60,
  'UN Security Council (UNSC) (Double delegation)': 40,
  'Economic and Social Council (ECOSOC)': 40,
  'International Labour Organization (ILO)': 30,
  'Social, Humanitarian and Cultural Committee (SOCHUM)': 40,
  'UN Environment Programme (UNEP)': 40,
  'International Press Plenary (IPP)': 30,
  'International Press Journalism (IPJ)': 30,
  'United States Senate (US SENATE)': 40,
  'Lok Sabha': 40,
  'Crisis Committee': 30,
};

/**
 * Auto-fits columns in an excel sheet based on content length
 */
const autoFitColumns = (worksheet: ExcelJS.Worksheet, minWidth = 12) => {
  if (!worksheet.columns) return;
  worksheet.columns.forEach((column) => {
    if (!column) return;
    let maxLength = minWidth;
    if (column.eachCell) {
      column.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.value) {
          const text = cell.value.toString();
          if (text.length > maxLength) {
            maxLength = text.length;
          }
        }
      });
    }
    column.width = Math.min(maxLength + 3, 50); // Cap column width at 50
  });
};

/**
 * Applies a premium navy/gold styling to sheet headers, freezes panes, and sets filters
 */
const styleTableHeaders = (worksheet: ExcelJS.Worksheet, headerRowNumber = 1) => {
  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0A192F' }, // Deep Navy
    };
    cell.font = {
      name: 'Segoe UI',
      size: 11,
      bold: true,
      color: { argb: 'FFDCA843' }, // Premium Gold
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FFDCA843' } },
    };
  });

  // Enable Auto Filter
  const columnsCount = worksheet.columns.length;
  if (columnsCount > 0) {
    const lastColLetter = String.fromCharCode(64 + columnsCount);
    worksheet.autoFilter = `A${headerRowNumber}:${lastColLetter}${headerRowNumber}`;
  }

  // Freeze panes below the headers
  worksheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];
};

/**
 * Applies alternate row shading
 */
const styleDataRows = (worksheet: ExcelJS.Worksheet, startRow = 2) => {
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < startRow) return;

    row.height = 20;
    const isEven = rowNumber % 2 === 0;
    const rowColor = isEven ? 'FFF4F7FC' : 'FFFFFFFF'; // Sleek alternate shading

    row.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowColor },
      };
      cell.font = {
        name: 'Segoe UI',
        size: 10,
      };
      cell.alignment = {
        vertical: 'middle',
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
    });
  });
};

/**
 * Generates the master Excel registration workbook
 */
export const generateMasterExcel = async (): Promise<string> => {
  try {
    // Create direct storage directory if it doesn't exist
    const dir = path.dirname(EXCEL_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Query databases in parallel for maximum speed
    let allUsers: any[] = [];
    let allRegistrations: any[] = [];
    let logins: any[] = [];
    let activities: any[] = [];
    let emailLogs: any[] = [];
    let adminLogs: any[] = [];
    let otpLogs: any[] = [];

    try {
      const results = await Promise.all([
        User.find({}),
        Registration.find({}),
        LoginLog.find({}),
        ActivityLog.find({}),
        EmailLog.find({}),
        AdminLog.find({}),
        OTPLog.find({})
      ]);
      allUsers = results[0] || [];
      allRegistrations = results[1] || [];
      logins = results[2] || [];
      activities = results[3] || [];
      emailLogs = results[4] || [];
      adminLogs = results[5] || [];
      otpLogs = results[6] || [];
    } catch (queryErr: any) {
      console.warn('Excel DB query notice:', queryErr?.message || queryErr);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CPS PRIME MUN Secretariat';
    workbook.lastModifiedBy = 'Admin System';
    workbook.created = new Date();

    // ----------------------------------------------------
    // FLAT DELEGATE LIST EXTRACTION
    // Extract both individual delegates and school roster delegates
    // ----------------------------------------------------
    const delegatesFlat: any[] = [];
    allRegistrations.forEach((reg: any) => {
      const type = reg.registrationType;
      const isPaid = reg.details?.paymentStatus === 'Verified' || reg.details?.paymentStatus === 'Paid' || reg.paymentStatus === 'Verified';
      const regDate = reg.registeredAt || reg.createdAt;
      const seatStatus = reg.details?.seatStatus || 'Pending';

      // Find submitting user account details
      const submittingUser = allUsers.find((u: any) => u._id.toString() === reg.user?.toString());
      const subUsername = submittingUser ? submittingUser.username : 'N/A';
      const subEmail = submittingUser ? submittingUser.email : 'N/A';

      if (type === 'individual') {
        const matchedUser = allUsers.find((u: any) => 
          (reg.details?.email && u.email.toLowerCase() === reg.details.email.toLowerCase()) ||
          u._id.toString() === reg.user?.toString()
        );
        delegatesFlat.push({
          isSchoolDelegation: false,
          registrationId: reg.registrationId,
          fullName: reg.details?.fullName || 'N/A',
          email: reg.details?.email || 'N/A',
          mobile: reg.details?.mobile || 'N/A',
          whatsapp: reg.details?.whatsapp || reg.details?.mobile || 'N/A',
          gender: reg.details?.gender || 'N/A',
          dob: reg.details?.dob || 'N/A',
          school: reg.details?.schoolName || 'N/A',
          schoolAddress: reg.details?.schoolAddress || 'N/A',
          teacherName: 'N/A (Individual)',
          teacherContact: 'N/A',
          gradeSection: `Grade ${reg.details?.gradeClass || 'N/A'} ${reg.details?.section || ''}`,
          cityState: `${reg.details?.city || 'Chennai'}, ${reg.details?.state || 'Tamil Nadu'}`,
          selectedCommittee: reg.details?.selectedCommittee || 'N/A',
          preferences: `1: ${reg.details?.pref1 || 'N/A'} | 2: ${reg.details?.pref2 || 'N/A'} | 3: ${reg.details?.pref3 || 'N/A'}`,
          committee: reg.allocatedCommittee || reg.details?.selectedCommittee || 'Unassigned',
          countryAllocation: (() => {
            const comm = reg.allocatedCommittee || reg.details?.selectedCommittee || '';
            if (comm.includes('IPP') || comm.includes('IPJ')) return 'N/A';
            return reg.allocatedCountry || 'Pending Allocation';
          })(),
          isFirstMUN: reg.details?.isFirstMUN || 'Yes',
          numMUNs: reg.details?.numMUNs || '0',
          previousMUNs: reg.details?.previousMUNs || 'None',
          medicalConditions: reg.details?.medicalConditions || 'None',
          gadgetsList: reg.details?.gadgetsList || 'None',
          docAadhar: reg.details?.docPhotoDriveUrl || reg.details?.docAadharDriveUrl || reg.details?.docAadhar || reg.details?.docPhoto || 'N/A',
          studentId: reg.details?.docStudentIdDriveUrl || reg.details?.docStudentId || 'N/A',
          parentName: reg.details?.parentName || 'N/A',
          parentPhone: reg.details?.parentMobile || 'N/A',
          parentEmail: reg.details?.parentEmail || 'N/A',
          emergencyContact: `${reg.details?.emergencyName || 'N/A'} (${reg.details?.emergencyNumber || 'N/A'})`,
          delegateType: 'Individual Delegate',
          date: formatDateTime(regDate),
          amountPaid: reg.amountPaid || 0,
          paymentId: reg.paymentId || 'N/A',
          paymentStatus: reg.paymentStatus || reg.details?.paymentStatus || 'Pending',
          seatStatus: seatStatus,
          attendanceStatus: reg.attendanceStatus || reg.details?.attendanceStatus || 'Absent',
          certificateStatus: reg.certificateStatus || reg.details?.certificateStatus || 'Not Generated',
          isLocked: reg.isLocked ? 'Locked' : 'Unlocked',
          accountUsername: matchedUser ? matchedUser.username : subUsername,
          accountEmail: matchedUser ? matchedUser.email : subEmail,
          remarks: reg.details?.remarks || '',
        });
      } else {
        // School Roster
        const delegatesList = reg.details?.delegates || reg.details?.delegatesList || [];
        delegatesList.forEach((del: any, idx: number) => {
          const matchedUser = allUsers.find((u: any) => 
            del.email && u.email.toLowerCase() === del.email.toLowerCase()
          );
          delegatesFlat.push({
            isSchoolDelegation: true,
            registrationId: `${reg.registrationId}-S${idx + 1}`,
            fullName: del.name || 'N/A',
            email: del.email || 'N/A',
            mobile: del.mobile || 'N/A',
            whatsapp: del.parentMobile || 'N/A',
            gender: del.gender || 'N/A',
            dob: del.dob || 'N/A',
            school: reg.details?.schoolName || 'N/A',
            schoolAddress: reg.details?.schoolAddress || 'N/A',
            teacherName: reg.details?.schoolTeacherName || reg.details?.teacherName || 'N/A',
            teacherContact: `${reg.details?.schoolTeacherMobile || reg.details?.teacherMobile || 'N/A'} (${reg.details?.schoolTeacherEmail || reg.details?.teacherEmail || 'N/A'})`,
            gradeSection: `Grade ${del.gradeClass || 'N/A'} ${del.section || ''}`,
            cityState: `${reg.details?.city || 'Chennai'}, ${reg.details?.state || 'Tamil Nadu'}`,
            selectedCommittee: del.selectedCommittee || 'N/A',
            preferences: `Selected: ${del.selectedCommittee || 'N/A'}`,
            committee: del.allocatedCommittee || del.selectedCommittee || 'Unassigned',
            countryAllocation: (() => {
              const comm = del.allocatedCommittee || del.selectedCommittee || '';
              if (comm.includes('IPP') || comm.includes('IPJ')) return 'N/A';
              return del.allocatedCountry || 'Pending Allocation';
            })(),
            isFirstMUN: del.isFirstMUN || 'Yes',
            numMUNs: del.numMUNs || '0',
            previousMUNs: del.previousMUNs || 'None',
            medicalConditions: del.medicalConditions || 'None',
            gadgetsList: del.gadgetsList || 'None',
            docAadhar: del.docPhotoDriveUrl || del.docAadharDriveUrl || del.docAadhar || del.docPhoto || 'N/A',
            studentId: del.docStudentIdDriveUrl || del.docStudentId || 'N/A',
            parentName: del.parentName || 'N/A',
            parentPhone: del.parentMobile || 'N/A',
            parentEmail: del.parentEmail || 'N/A',
            emergencyContact: `${reg.details?.schoolTeacherName || del.emergencyName || 'N/A'} (${reg.details?.schoolTeacherMobile || del.emergencyNumber || 'N/A'})`,
            delegateType: `School Delegation (${reg.details?.schoolName || 'School'})`,
            date: formatDateTime(regDate),
            amountPaid: (reg.amountPaid || 0) / (delegatesList.length || 1),
            paymentId: reg.paymentId || 'N/A',
            paymentStatus: reg.paymentStatus || reg.details?.paymentStatus || 'Pending',
            seatStatus: del.seatStatus || seatStatus,
            attendanceStatus: del.attendanceStatus || 'Absent',
            certificateStatus: del.certificateStatus || 'Not Generated',
            isLocked: reg.isLocked ? 'Locked' : 'Unlocked',
            accountUsername: matchedUser ? matchedUser.username : `${subUsername} (School)`,
            accountEmail: matchedUser ? matchedUser.email : subEmail,
            remarks: del.remarks || '',
          });
        });
      }
    });

    // ----------------------------------------------------
    // SHEET 1: DASHBOARD
    // ----------------------------------------------------
    const wsDashboard = workbook.addWorksheet('Dashboard');
    wsDashboard.views = [{ showGridLines: true }];

    // Dashboard Banner
    wsDashboard.mergeCells('A1:D2');
    const bannerCell = wsDashboard.getCell('A1');
    bannerCell.value = 'CPS PRIME MUN 5.O — SECRETARIAT MASTER DASHBOARD';
    bannerCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFDCA843' } };
    bannerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A192F' } };
    bannerCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // KPI Cards Generation
    const totalRegsCount = allRegistrations.length;
    const totalDelegatesCount = delegatesFlat.length;
    const verifiedUsersCount = allUsers.filter((u: any) => u.emailVerified).length;
    const pendingOtpCount = allUsers.filter((u: any) => !u.emailVerified).length;
    const paidRegsCount = allRegistrations.filter((r: any) => r.details?.paymentStatus === 'Verified' || r.details?.paymentStatus === 'Paid' || r.paymentStatus === 'Verified').length;
    const paidDelegatesCount = delegatesFlat.filter((d: any) => d.paymentStatus === 'Verified' || d.paymentStatus === 'Paid').length;
    const pendingPaymentCount = totalRegsCount - paidRegsCount;
    
    // Revenue calculations
    const totalRevenue = allRegistrations
      .filter((r: any) => r.details?.paymentStatus === 'Verified' || r.details?.paymentStatus === 'Paid' || r.paymentStatus === 'Verified')
      .reduce((sum: number, r: any) => sum + (r.amountPaid || 0), 0);

    const seatConfirmedCount = delegatesFlat.filter((d: any) => d.seatStatus === 'Confirmed').length;
    const totalSeatCapacity = Object.values(COMMITTEE_SEATS).reduce((a: number, b: number) => a + b, 0); // 460 total
    const availableSeatsCount = Math.max(totalSeatCapacity - seatConfirmedCount, 0);

    const totalSchools = new Set(allRegistrations.map((r: any) => r.details?.schoolName).filter(Boolean)).size;

    // Output stats blocks in card format
    const kpiMetrics = [
      { label: 'TOTAL SYSTEM REGISTRATIONS', val: totalRegsCount },
      { label: 'TOTAL FLAT DELEGATES REGISTERED', val: totalDelegatesCount },
      { label: 'EMAIL VERIFIED ACCOUNTS', val: verifiedUsersCount },
      { label: 'PENDING OTP VERIFICATION', val: pendingOtpCount },
      { label: 'CONFIRMED PARTICIPATING SEATS', val: seatConfirmedCount },
      { label: 'AVAILABLE OPEN SEATS', val: availableSeatsCount },
      { label: 'PAID DELEGATES', val: paidDelegatesCount },
      { label: 'TOTAL REVENUE GENERATED', val: `₹${totalRevenue.toLocaleString('en-IN')}` },
      { label: 'TOTAL PARTICIPATING SCHOOLS', val: totalSchools },
      { label: 'TOTAL COMMITTEES ACTIVE', val: COMMITTEES.length },
    ];

    // Write KPIs as simple table rows
    wsDashboard.getCell('A4').value = 'METRIC DESCRIPTION';
    wsDashboard.getCell('B4').value = 'METRIC VALUE';
    wsDashboard.getRow(4).font = { name: 'Segoe UI', bold: true, color: { argb: 'FF0A192F' } };
    wsDashboard.getRow(4).border = { bottom: { style: 'thin' } };

    kpiMetrics.forEach((m, idx) => {
      const row = wsDashboard.getRow(5 + idx);
      row.getCell(1).value = m.label;
      row.getCell(2).value = m.val;
      row.getCell(1).font = { name: 'Segoe UI', size: 10, bold: true };
      row.getCell(2).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB8860B' } };
      row.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
    });

    // Write Live Seat Status Table next to it
    wsDashboard.getCell('D4').value = 'COMMITTEE NAME';
    wsDashboard.getCell('E4').value = 'CAPACITY';
    wsDashboard.getCell('F4').value = 'FILLED SEATS';
    wsDashboard.getCell('G4').value = 'AVAILABLE SEATS';
    wsDashboard.getRow(4).eachCell((cell, colNumber) => {
      if (colNumber >= 4) cell.font = { name: 'Segoe UI', bold: true, color: { argb: 'FF0A192F' } };
    });

    COMMITTEES.forEach((comm, idx) => {
      const row = wsDashboard.getRow(5 + idx);
      const cap = COMMITTEE_SEATS[comm] || 0;
      const filled = delegatesFlat.filter((d: any) => d.committee === comm && d.seatStatus === 'Confirmed').length;
      const av = Math.max(cap - filled, 0);

      row.getCell(4).value = comm;
      row.getCell(5).value = cap;
      row.getCell(6).value = filled;
      row.getCell(7).value = av;
      row.getCell(4).font = { name: 'Segoe UI', size: 10 };
      row.getCell(5).font = { name: 'Segoe UI', size: 10 };
      row.getCell(6).font = { name: 'Segoe UI', size: 10 };
      row.getCell(7).font = { name: 'Segoe UI', size: 10, bold: true };
    });

    autoFitColumns(wsDashboard, 15);

    // ----------------------------------------------------
    // HELPER: DELEGATE SHEET BUILDER
    // ----------------------------------------------------
    const buildDelegateSheet = (sheetName: string, delegatesList: any[]) => {
      const sheet = workbook.addWorksheet(sheetName);
      sheet.addRow([
        'Registration ID',
        'Delegate Full Name',
        'Email Address',
        'Mobile Number',
        'Gender',
        'Date of Birth',
        'School Name',
        'School Address',
        'Teacher Name',
        'Teacher Contact',
        'Grade / Section',
        'City / State',
        'Selected Committee',
        'Committee Preferences',
        'Allocated Committee',
        'Allocated Country / Portfolio',
        'First MUN? (Yes/No)',
        'Total MUNs',
        'Previous MUN Details',
        'Medical Conditions',
        'Gadgets & Electronics List',
        'Aadhar Card Doc Link',
        'Student ID Doc Link',
        'Parent Name',
        'Parent Phone Number',
        'Parent Email',
        'Emergency Contact (Name & Phone)',
        'Registration Type',
        'Registration Timestamp',
        'Amount Paid (₹)',
        'Payment ID / Tracking ID',
        'Payment Verification Status',
        'Seat Status',
        'Attendance Status',
        'Certificate Status',
        'Entry Lock Status',
        'Account Username',
        'Account Email',
        'Admin Remarks'
      ]);

      delegatesList.forEach((d) => {
        sheet.addRow([
          d.registrationId,
          d.fullName,
          d.email,
          d.mobile,
          d.gender,
          d.dob,
          d.school,
          d.schoolAddress,
          d.teacherName,
          d.teacherContact,
          d.gradeSection,
          d.cityState,
          d.selectedCommittee,
          d.preferences,
          d.committee,
          d.countryAllocation,
          d.isFirstMUN,
          d.numMUNs,
          d.previousMUNs,
          d.medicalConditions,
          d.gadgetsList,
          d.docAadhar,
          d.studentId,
          d.parentName,
          d.parentPhone,
          d.parentEmail,
          d.emergencyContact,
          d.delegateType,
          d.date,
          d.amountPaid,
          d.paymentId,
          d.paymentStatus,
          d.seatStatus,
          d.attendanceStatus,
          d.certificateStatus,
          d.isLocked,
          d.accountUsername,
          d.accountEmail,
          d.remarks
        ]);
      });
      styleTableHeaders(sheet);
      styleDataRows(sheet);
      autoFitColumns(sheet);
    };

    // ----------------------------------------------------
    // SHEET 2: ALL DELEGATES (MASTER)
    // ----------------------------------------------------
    buildDelegateSheet('All Delegates (Master)', delegatesFlat);

    // ----------------------------------------------------
    // SHEET 3: INDIVIDUAL DELEGATES (ONLY INDIVIDUAL)
    // ----------------------------------------------------
    buildDelegateSheet('Individual Delegates', delegatesFlat.filter((d: any) => !d.isSchoolDelegation));

    // ----------------------------------------------------
    // SHEET 4: SCHOOL DELEGATION ROSTERS (ONLY SCHOOL)
    // ----------------------------------------------------
    buildDelegateSheet('School Delegation Rosters', delegatesFlat.filter((d: any) => d.isSchoolDelegation));

    // ----------------------------------------------------
    // SHEET 5: COMMITTEE ALLOCATION
    // ----------------------------------------------------
    const wsCommAlloc = workbook.addWorksheet('Committee Allocation');
    wsCommAlloc.addRow([
      'Committee Name',
      'Total Seats Capacity',
      'Filled Seats',
      'Remaining Seats',
      'Delegate Name',
      'Country Allocation',
      'School Name',
      'Registration ID',
      'Seat Status'
    ]);

    COMMITTEES.forEach((comm) => {
      const cap = COMMITTEE_SEATS[comm] || 0;
      const commDels = delegatesFlat.filter(d => d.committee === comm);
      const filled = commDels.filter(d => d.seatStatus === 'Confirmed').length;
      const av = Math.max(cap - filled, 0);

      if (commDels.length === 0) {
        wsCommAlloc.addRow([comm, cap, filled, av, 'No Allocations Yet', '-', '-', '-', '-']);
      } else {
        commDels.forEach((d) => {
          wsCommAlloc.addRow([
            comm,
            cap,
            filled,
            av,
            d.fullName,
            d.countryAllocation,
            d.school,
            d.registrationId,
            d.seatStatus
          ]);
        });
      }
    });
    styleTableHeaders(wsCommAlloc);
    styleDataRows(wsCommAlloc);
    autoFitColumns(wsCommAlloc);

    // ----------------------------------------------------
    // SHEET 6: COUNTRY ALLOCATION
    // ----------------------------------------------------
    const wsCountryAlloc = workbook.addWorksheet('Country Allocation');
    wsCountryAlloc.addRow([
      'Allocated Country',
      'Committee',
      'Delegate Name',
      'School Name',
      'Registration ID',
      'Allocation Status'
    ]);

    delegatesFlat.forEach((d) => {
      if (d.countryAllocation && d.countryAllocation !== 'Pending Allocation') {
        wsCountryAlloc.addRow([
          d.countryAllocation,
          d.committee,
          d.fullName,
          d.school,
          d.registrationId,
          'Allocated'
        ]);
      }
    });
    styleTableHeaders(wsCountryAlloc);
    styleDataRows(wsCountryAlloc);
    autoFitColumns(wsCountryAlloc);

    // ----------------------------------------------------
    // SHEET 7: PAYMENT RECORDS (HDFC SmartHub Gateway)
    // ----------------------------------------------------
    const wsPayments = workbook.addWorksheet('Payment Records');
    wsPayments.addRow([
      'Registration ID',
      'Delegate / School Name',
      'Registered Email',
      'Payment Gateway',
      'Transaction / Tracking ID',
      'HDFC Payment ID',
      'HDFC Order ID',
      'Amount Paid (₹)',
      'Currency',
      'Payment Status',
      'Payment Date & Time',
      'Refund Status'
    ]);

    allRegistrations.forEach((reg: any) => {
      const pStatus = reg.details?.paymentStatus || reg.paymentStatus || 'Pending';
      const regDate = reg.registeredAt || reg.createdAt;
      const name = reg.registrationType === 'individual' 
        ? (reg.details?.fullName || 'N/A') 
        : `School Delegation (${reg.details?.schoolName || 'N/A'})`;

      wsPayments.addRow([
        reg.registrationId,
        name,
        reg.registeredByUser,
        'HDFC SmartHub / CCAvenue Payment Gateway',
        reg.paymentId || 'N/A',
        reg.paymentId || 'N/A',
        reg.details?.razorpayOrderId || reg.registrationId || 'N/A',
        reg.amountPaid || 0,
        'INR',
        pStatus,
        formatDateTime(regDate),
        'None'
      ]);
    });
    styleTableHeaders(wsPayments);
    styleDataRows(wsPayments);
    autoFitColumns(wsPayments);

    // ----------------------------------------------------
    // SHEET 8: OTP VERIFICATION
    // ----------------------------------------------------
    const wsOtps = workbook.addWorksheet('OTP Verification');
    wsOtps.addRow([
      'Registration ID',
      'Account Email',
      'User Full Name',
      'OTP Generated Timestamp',
      'OTP Verified Timestamp',
      'Verification Status',
      'Expired OTP',
      'Failed Attempts'
    ]);

    const processedOtpEmails = new Set();
    otpLogs.forEach((log: any) => {
      processedOtpEmails.add(log.email?.toLowerCase());
      const matchedUser = allUsers.find((u: any) => u.email?.toLowerCase() === log.email?.toLowerCase());
      wsOtps.addRow([
        log.registrationId || matchedUser?.userId || '-',
        log.email,
        matchedUser?.fullName || 'N/A',
        formatDateTime(log.otpGeneratedTime),
        formatDateTime(log.otpVerifiedTime),
        log.verificationStatus || (matchedUser?.emailVerified ? 'Verified' : 'Pending'),
        log.expiredOtp ? 'Yes' : 'No',
        log.failedAttempts || 0
      ]);
    });

    allUsers.forEach((u: any) => {
      if (!processedOtpEmails.has(u.email?.toLowerCase())) {
        wsOtps.addRow([
          u.userId || '-',
          u.email,
          u.fullName || 'N/A',
          formatDateTime(u.createdAt),
          u.emailVerified ? (u.updatedAt ? formatDateTime(u.updatedAt) : 'Verified') : 'Pending',
          u.emailVerified ? 'Verified' : 'Pending Verification',
          'No',
          0
        ]);
      }
    });

    styleTableHeaders(wsOtps);
    styleDataRows(wsOtps);
    autoFitColumns(wsOtps);

    // ----------------------------------------------------
    // SHEET 7: LOGIN ACTIVITY
    // ----------------------------------------------------
    const wsLogins = workbook.addWorksheet('Login Activity');
    wsLogins.addRow([
      'User ID',
      'Registration ID',
      'Email',
      'Login Time',
      'Logout Time',
      'Session Duration (Sec)',
      'Browser',
      'Device',
      'Operating System',
      'IP Address',
      'Country',
      'Login Status'
    ]);

    logins.forEach((log: any) => {
      wsLogins.addRow([
        log.userId || '-',
        log.registrationId || '-',
        log.email,
        formatDateTime(log.loginTime),
        formatDateTime(log.logoutTime),
        log.sessionDuration || '-',
        log.browser || '-',
        log.device || '-',
        log.os || '-',
        log.ipAddress || '-',
        log.country || '-',
        log.status || 'Success'
      ]);
    });
    styleTableHeaders(wsLogins);
    styleDataRows(wsLogins);
    autoFitColumns(wsLogins);

    // ----------------------------------------------------
    // SHEET 8: REGISTRATION ACTIVITY LOG
    // ----------------------------------------------------
    const wsActivity = workbook.addWorksheet('Activity Log');
    wsActivity.addRow([
      'Timestamp',
      'Registration ID',
      'Delegate Name',
      'Action',
      'Description',
      'IP Address',
      'Browser',
      'User Triggered'
    ]);

    activities.forEach((log: any) => {
      wsActivity.addRow([
        formatDateTime(log.timestamp),
        log.registrationId || '-',
        log.delegateName || '-',
        log.action,
        log.description,
        log.ipAddress || '-',
        log.browser || '-',
        log.user
      ]);
    });
    styleTableHeaders(wsActivity);
    styleDataRows(wsActivity);
    autoFitColumns(wsActivity);

    // ----------------------------------------------------
    // SHEET 9: COMMITTEE SEAT SUMMARY (With Occupancy Color Highlights)
    // ----------------------------------------------------
    const wsSeatSummary = workbook.addWorksheet('Committee Seat Summary');
    wsSeatSummary.addRow([
      'Committee Name',
      'Maximum Seats',
      'Filled Seats',
      'Remaining Seats',
      'Occupancy Percentage'
    ]);

    COMMITTEES.forEach((comm) => {
      const cap = COMMITTEE_SEATS[comm] || 0;
      const filled = delegatesFlat.filter(d => d.committee === comm && d.seatStatus === 'Confirmed').length;
      const av = Math.max(cap - filled, 0);
      const occPercent = cap > 0 ? (filled / cap) : 0;

      wsSeatSummary.addRow([comm, cap, filled, av, occPercent]);
    });

    styleTableHeaders(wsSeatSummary);
    wsSeatSummary.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber < 2) return;
      row.height = 20;

      // Color coding the occupancy percentage column
      const cellPercent = row.getCell(5);
      const val = cellPercent.value as number;
      cellPercent.numFmt = '0.0%';

      let fillColor = 'FFFFFFFF'; // default white
      let fontColor = 'FF000000'; // black

      if (val >= 0.9) {
        fillColor = 'FFFFD2D2'; // light red
        fontColor = 'FF9C0006'; // dark red text
      } else if (val >= 0.7) {
        fillColor = 'FFFFEB9C'; // light orange/yellow
        fontColor = 'FF9C6500'; // dark gold text
      } else {
        fillColor = 'FFC6EFCE'; // light green
        fontColor = 'FF006100'; // dark green text
      }

      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 10 };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } };
        if (colNumber === 5) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: fontColor } };
        }
      });
    });
    autoFitColumns(wsSeatSummary);

    // ----------------------------------------------------
    // SHEET 10: SCHOOL-WISE DELEGATES
    // ----------------------------------------------------
    const wsSchoolWise = workbook.addWorksheet('School-wise Delegates');
    wsSchoolWise.addRow([
      'School Name',
      'Delegate Count',
      'Delegate Names',
      'Allocated Committees',
      'Allocated Countries'
    ]);

    // Grouping by school
    const schoolGroups: Record<string, any[]> = {};
    delegatesFlat.forEach((d) => {
      const sch = d.school || 'Individual/Unspecified';
      if (!schoolGroups[sch]) schoolGroups[sch] = [];
      schoolGroups[sch].push(d);
    });

    Object.entries(schoolGroups).forEach(([school, dels]) => {
      const count = dels.length;
      const names = dels.map(d => d.fullName).join(', ');
      const committees = Array.from(new Set(dels.map(d => d.committee).filter(Boolean))).join(', ');
      const countries = Array.from(new Set(dels.map(d => d.countryAllocation).filter(Boolean))).join(', ');

      wsSchoolWise.addRow([school, count, names, committees, countries]);
    });
    styleTableHeaders(wsSchoolWise);
    styleDataRows(wsSchoolWise);
    autoFitColumns(wsSchoolWise);

    // ----------------------------------------------------
    // SHEET 11: EMAIL LOG
    // ----------------------------------------------------
    const wsEmailLog = workbook.addWorksheet('Email Log');
    wsEmailLog.addRow([
      'Timestamp',
      'Email Type',
      'Recipient',
      'Delivery Status',
      'Message ID'
    ]);

    emailLogs.forEach((log: any) => {
      wsEmailLog.addRow([
        formatDateTime(log.timestamp),
        log.emailType,
        log.recipient,
        log.deliveryStatus,
        log.messageId || '-'
      ]);
    });
    styleTableHeaders(wsEmailLog);
    styleDataRows(wsEmailLog);
    autoFitColumns(wsEmailLog);

    // ----------------------------------------------------
    // SHEET 12: ADMIN ACTIVITY LOG
    // ----------------------------------------------------
    const wsAdminLog = workbook.addWorksheet('Admin Activity');
    wsAdminLog.addRow([
      'Timestamp',
      'Admin Name',
      'Action Performed',
      'Edited Record ID',
      'Previous Value',
      'New Value'
    ]);

    adminLogs.forEach((log: any) => {
      wsAdminLog.addRow([
        formatDateTime(log.timestamp),
        log.adminName,
        log.action,
        log.editedRecord || '-',
        log.previousValue || '-',
        log.newValue || '-'
      ]);
    });
    // ----------------------------------------------------
    // SHEET 13: DAY 1 DESK CHECK-IN ROSTER (PRINT READY)
    // ----------------------------------------------------
    const wsCheckin = workbook.addWorksheet('Day 1 Desk Check-in');
    wsCheckin.addRow([
      'Registration ID',
      'Delegate Full Name',
      'Registration Type',
      'School / Institution Name',
      'Allocated Committee',
      'Allocated Country / Portfolio',
      'Seat Status',
      'Badge Issued (Y/N)',
      'Conference Kit (Y/N)',
      'Breakfast Coupon (Y/N)',
      'Lunch Coupon (Y/N)',
      'Delegate Signature'
    ]);

    delegatesFlat.forEach((d) => {
      wsCheckin.addRow([
        d.registrationId,
        d.fullName,
        d.delegateType,
        d.school,
        d.committee,
        d.countryAllocation,
        d.seatStatus,
        '[  ]',
        '[  ]',
        '[  ]',
        '[  ]',
        '___________________'
      ]);
    });
    styleTableHeaders(wsCheckin);
    styleDataRows(wsCheckin);
    autoFitColumns(wsCheckin);

    // ----------------------------------------------------
    // SHEET 14: MEDICAL & EMERGENCY ALERTS ROSTER
    // ----------------------------------------------------
    const wsMedical = workbook.addWorksheet('Medical & Emergency Alerts');
    wsMedical.addRow([
      'Registration ID',
      'Delegate Full Name',
      'School Name',
      'Allocated Committee',
      'Medical Conditions / Allergies',
      'Gadgets & Electronics List',
      'Parent Name',
      'Parent Phone Number',
      'Emergency Contact (Name & Phone)'
    ]);

    delegatesFlat.forEach((d) => {
      const hasMedical = d.medicalConditions && d.medicalConditions !== 'None' && d.medicalConditions !== 'N/A';
      const hasGadgets = d.gadgetsList && d.gadgetsList !== 'None' && d.gadgetsList !== 'N/A';
      if (hasMedical || hasGadgets) {
        wsMedical.addRow([
          d.registrationId,
          d.fullName,
          d.school,
          d.committee,
          d.medicalConditions,
          d.gadgetsList,
          d.parentName,
          d.parentPhone,
          d.emergencyContact
        ]);
      }
    });
    styleTableHeaders(wsMedical);
    styleDataRows(wsMedical);
    autoFitColumns(wsMedical);

    // Ensure directory exists
    const dirPath = path.dirname(EXCEL_FILE_PATH);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Write file to filesystem
    await workbook.xlsx.writeFile(EXCEL_FILE_PATH);
    console.log('⚡ Master Excel file compiled successfully at:', EXCEL_FILE_PATH);
    return EXCEL_FILE_PATH;

  } catch (error) {
    console.error('❌ Excel Generation Error:', error);
    throw error;
  }
};
