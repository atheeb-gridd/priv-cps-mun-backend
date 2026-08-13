import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import User from '../models/User';
import PendingUser from '../models/PendingUser';
import OTP from '../models/OTP';
import Registration from '../models/Registration';
import LoginLog from '../models/LoginLog';
import ActivityLog from '../models/ActivityLog';
import OTPLog from '../models/OTPLog';
import { generateOTP } from '../utils/otp';
import { generateAccessToken, generateRefreshToken, TokenPayload } from '../utils/jwt';
import { sendVerificationEmail, sendResetPasswordEmail } from '../services/emailService';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { generateMasterExcel } from '../services/excelService';

const parseUA = (ua: string) => {
  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'Desktop';

  if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/chrome/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua)) browser = 'Safari';
  else if (/msie|trident/i.test(ua)) browser = 'IE';
  else if (/edge/i.test(ua)) browser = 'Edge';

  if (/android/i.test(ua)) { os = 'Android'; device = 'Mobile'; }
  else if (/ipad|iphone|ipod/i.test(ua)) { os = 'iOS'; device = 'Mobile'; }
  else if (/macintosh/i.test(ua)) os = 'macOS';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/linux/i.test(ua)) os = 'Linux';

  return { browser, os, device };
};

// Password strength validator helper
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .refine((val) => /[A-Z]/.test(val), 'Password must contain at least one uppercase letter')
  .refine((val) => /[a-z]/.test(val), 'Password must contain at least one lowercase letter')
  .refine((val) => /[0-9]/.test(val), 'Password must contain at least one number')
  .refine((val) => /[^A-Za-z0-9]/.test(val), 'Password must contain at least one special character');

// Zod schemas for input validation
const registerSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').transform(s => s.trim()),
  email: z.string().email('Please enter a valid email address').transform(s => s.trim().toLowerCase()),
  password: passwordSchema,
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords must match',
  path: ['confirmPassword'],
});

const loginSchema = z.object({
  email: z.string().min(1, 'Please enter your email address').transform(s => s.trim().toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});

const verifyEmailSchema = z.object({
  email: z.string().email('Please enter a valid email address').transform(s => s.trim().toLowerCase()),
  code: z.string().length(6, 'Verification code must be exactly 6 digits'),
});

const sendOtpSchema = z.object({
  email: z.string().email('Please enter a valid email address').transform(s => s.trim().toLowerCase()),
});

const resetPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address').transform(s => s.trim().toLowerCase()),
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
  newPassword: passwordSchema,
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords must match',
  path: ['confirmPassword'],
});

export const register = async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    }

    const { fullName, email, password } = parsed.data;

    // Check if email already exists in verified users
    const existingUserByEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingUserByEmail) {
      return res.status(400).json({ message: 'An account already exists with this email. Please sign in.' });
    }

    // Hash password (12 salt rounds)
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate 6-digit OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Save/Update pending user details temporarily
    await PendingUser.findOneAndUpdate(
      { email: email.toLowerCase() },
      { fullName, email: email.toLowerCase(), passwordHash, plainPassword: password, otpCode: otp, expiresAt },
      { upsert: true, new: true }
    );

    // Send email via Brevo SMTP
    await sendVerificationEmail(email, fullName, otp);

    // Logging OTP & Activity
    try {
      const otpLog = new OTPLog({
        email: email.toLowerCase(),
        otpGeneratedTime: new Date(),
        verificationStatus: 'Pending',
        failedAttempts: 0
      });
      await otpLog.save();

      const ua = parseUA(req.headers['user-agent'] || '');
      const activity = new ActivityLog({
        action: 'Account Created & OTP Sent',
        description: `Account created for ${fullName} (${email}). Verification OTP code sent.`,
        user: email,
        ipAddress: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1'),
        browser: ua.browser
      });
      await activity.save();

      generateMasterExcel().catch(err => console.error('Excel update error:', err));
    } catch (logErr) {
      console.error('Failed to write register activity logs:', logErr);
    }

    return res.status(200).json({
      message: 'Verification code sent to your email address.',
      email: email.toLowerCase(),
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: error?.message || 'An internal server error occurred.' });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    }

    const { email, code } = parsed.data;

    // Find pending registration matching email and code
    const pending = await PendingUser.findOne({
      email: email.toLowerCase(),
      otpCode: code,
      expiresAt: { $gt: new Date() }
    });

    if (!pending) {
      // Log OTP failure
      try {
        const expiredPending = await PendingUser.findOne({ email: email.toLowerCase() });
        const isExpired = expiredPending ? (expiredPending.expiresAt <= new Date()) : false;
        
        await OTPLog.findOneAndUpdate(
          { email: email.toLowerCase(), verificationStatus: 'Pending' },
          { 
            $inc: { failedAttempts: 1 },
            $set: { 
              expiredOtp: isExpired, 
              verificationStatus: 'Failed' 
            }
          },
          { upsert: true, new: true }
        );

        const ua = parseUA(req.headers['user-agent'] || '');
        const activity = new ActivityLog({
          action: 'OTP Failed',
          description: `Failed OTP verification attempt for email ${email}. Reason: ${isExpired ? 'Expired' : 'Invalid code'}`,
          user: email,
          ipAddress: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1'),
          browser: ua.browser
        });
        await activity.save();
        generateMasterExcel().catch(err => console.error('Excel update error:', err));
      } catch (logErr) {
        console.error('Failed to write OTP failure log:', logErr);
      }

      const expiredPending = await PendingUser.findOne({ email: email.toLowerCase() });
      if (expiredPending) {
        if (expiredPending.expiresAt <= new Date()) {
          return res.status(400).json({ message: 'Verification code expired. Please click "Resend OTP".' });
        }
        return res.status(400).json({ message: 'Invalid verification code. Please check the code sent to your email.' });
      }

      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ message: 'Your email is already verified! Please go back to Sign In.' });
      }

      return res.status(400).json({ message: 'No pending registration request found for this email. Please click "Go Back" and register again.' });
    }

    // Generate sequential user and account IDs robustly
    const recentUsers = await User.find({ userId: /^CPS-U-/ }).sort({ userId: -1 }).limit(1);
    const lastUser = recentUsers && recentUsers.length > 0 ? recentUsers[0] : null;
    let nextNum = 10001;
    if (lastUser && lastUser.userId) {
      const match = lastUser.userId.match(/CPS-U-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    } else {
      const count = await User.countDocuments();
      nextNum = 10000 + count + 1;
    }
    const suffix = String(nextNum);
    const userId = `CPS-U-${suffix}`;
    const accountId = `CPS-A-${suffix}`;

    // Create the User account in database
    const newUser = new User({
      userId,
      accountId,
      fullName: pending.fullName,
      email: pending.email,
      passwordHash: pending.passwordHash,
      plainPassword: pending.plainPassword,
      emailVerified: true,
      registrationCompleted: false,
      role: pending.email.toLowerCase() === 'admin.secretariat@cpsprimemun.org' ? 'Admin' : 'Delegate',
      status: 'Active',
    });

    // Generate JWT access & refresh tokens
    const payload: TokenPayload = {
      userId: newUser.userId,
      email: newUser.email,
      role: newUser.role,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    newUser.lastLogin = new Date();
    newUser.refreshToken = refreshToken;
    await newUser.save();

    // Clean up pending user temporary store
    await PendingUser.deleteOne({ _id: pending._id });

    // Log verification success
    try {
      await OTPLog.findOneAndUpdate(
        { email: email.toLowerCase(), verificationStatus: 'Pending' },
        { 
          $set: { 
            otpVerifiedTime: new Date(),
            verificationStatus: 'Verified' 
          }
        },
        { upsert: true, new: true }
      );

      const ua = parseUA(req.headers['user-agent'] || '');
      const activity = new ActivityLog({
        action: 'OTP Verified',
        description: `Email verified successfully. User Account Created for ${newUser.fullName} (${email}).`,
        user: email,
        ipAddress: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1'),
        browser: ua.browser
      });
      await activity.save();

      // Trigger excel generation in background
      generateMasterExcel().catch(err => console.error('Excel update error:', err));
    } catch (logErr) {
      console.error('Failed to log email verification success:', logErr);
    }

    return res.status(201).json({
      message: 'Email verified successfully.',
      accessToken,
      refreshToken,
      user: {
        userId: newUser.userId,
        accountId: newUser.accountId,
        fullName: newUser.fullName,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        registrationCompleted: newUser.registrationCompleted,
      },
    });
  } catch (error: any) {
    console.error('Email verification error:', error);
    return res.status(500).json({ message: error?.message || 'An internal server error occurred.' });
  }
};

export const sendOtp = async (req: Request, res: Response) => {
  try {
    const parsed = sendOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    }

    const { email } = parsed.data;
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Check if email belongs to a pending user (Resend verification OTP)
    const pending = await PendingUser.findOne({ email: email.toLowerCase() });
    if (pending) {
      pending.otpCode = otp;
      pending.expiresAt = expiresAt;
      await pending.save();

      await sendVerificationEmail(pending.email, pending.fullName, otp);
      return res.status(200).json({ message: 'Verification code resent successfully.' });
    }

    // Check if email belongs to a registered user (Resend/Send password reset OTP)
    const user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      // Upsert OTP for password reset
      await OTP.findOneAndUpdate(
        { email: email.toLowerCase(), purpose: 'password_reset' },
        { code: otp, expiresAt },
        { upsert: true, new: true }
      );

      await sendResetPasswordEmail(user.email, user.fullName, otp);
      return res.status(200).json({ message: 'Password reset code sent to your email.' });
    }

    return res.status(404).json({ message: 'No account found with this email address.' });
  } catch (error: any) {
    console.error('Send OTP error:', error);
    return res.status(500).json({ message: error?.message || 'An internal server error occurred.' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    }

    const { email, password } = parsed.data;

    // Find verified user by email or username
    const user = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: email.toLowerCase() }
      ]
    });
    if (!user) {
      return res.status(400).json({ message: 'Incorrect email or password.' });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({ message: 'Your account has been suspended.' });
    }

    // Check if registration or account is locked by Secretariat Admin
    if (user.role !== 'Admin') {
      const reg = await Registration.findOne({
        $or: [
          { registeredByUser: user.email.toLowerCase() },
          { 'details.email': user.email.toLowerCase() },
          { 'details.teacherEmail': user.email.toLowerCase() }
        ]
      });
      if (reg && (reg.isLocked === true || reg.details?.isLocked === true)) {
        return res.status(403).json({ message: '🔒 Entry Locked: Your registration has been locked by Secretariat Admin. Portal access and sign-in are disabled.' });
      }
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect email or password.' });
    }

    // Generate JWT access & refresh tokens
    const payload: TokenPayload = {
      userId: user.userId,
      email: user.email,
      role: user.role,
      username: user.username,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Save last login and refresh token
    user.lastLogin = new Date();
    user.refreshToken = refreshToken;
    await user.save();

    // Log login success
    try {
      const ua = parseUA(req.headers['user-agent'] || '');
      
      // Find registration ID if exists
      const reg = await Registration.findOne({ registeredByUser: user.email.toLowerCase() });
      const regId = reg ? reg.registrationId : '';

      const loginLog = new LoginLog({
        userId: user.userId,
        registrationId: regId,
        email: user.email,
        loginTime: new Date(),
        browser: ua.browser,
        device: ua.device,
        os: ua.os,
        ipAddress: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1'),
        status: 'Success'
      });
      await loginLog.save();

      const activity = new ActivityLog({
        registrationId: regId,
        delegateName: user.fullName,
        action: 'Login',
        description: `User logged in from browser ${ua.browser} (${ua.os})`,
        user: user.email,
        ipAddress: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1'),
        browser: ua.browser
      });
      await activity.save();

      // Trigger background Excel update
      generateMasterExcel().catch(err => console.error('Excel update error:', err));
    } catch (logErr) {
      console.error('Failed to log login success:', logErr);
    }

    return res.status(200).json({
      message: 'Login successful.',
      accessToken,
      refreshToken,
      user: {
        userId: user.userId,
        accountId: user.accountId,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        role: user.role,
        registrationCompleted: user.registrationCompleted,
        paymentBypass: user.paymentBypass || false,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ message: error?.message || 'An internal server error occurred.' });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const parsed = sendOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    }

    const { email } = parsed.data;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ message: 'No account found with this email address.' });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await OTP.findOneAndUpdate(
      { email: email.toLowerCase(), purpose: 'password_reset' },
      { code: otp, expiresAt },
      { upsert: true, new: true }
    );

    await sendResetPasswordEmail(user.email, user.fullName, otp);

    return res.status(200).json({
      message: 'Password reset verification code sent to your email.',
      email: email.toLowerCase(),
    });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ message: error?.message || 'An internal server error occurred.' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    }

    const { email, otp, newPassword } = parsed.data;

    // Verify OTP
    const validOtp = await OTP.findOne({
      email: email.toLowerCase(),
      code: otp,
      purpose: 'password_reset',
      expiresAt: { $gt: new Date() }
    });

    if (!validOtp) {
      const expiredOtp = await OTP.findOne({ email: email.toLowerCase(), purpose: 'password_reset' });
      if (expiredOtp) {
        if (expiredOtp.expiresAt <= new Date()) {
          return res.status(400).json({ message: 'Verification code expired.' });
        }
        return res.status(400).json({ message: 'Invalid verification code.' });
      }
      return res.status(400).json({ message: 'No reset request found for this email.' });
    }

    // Update user password
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'User account not found.' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.plainPassword = newPassword;
    user.refreshToken = undefined; // Invalidate current sessions
    await user.save();

    // Clean up OTP record
    await OTP.deleteOne({ _id: validOtp._id });

    return res.status(200).json({ message: 'Password updated successfully. You can now log in.' });
  } catch (error: any) {
    console.error('Reset password error:', error);
    return res.status(500).json({ message: error?.message || 'An internal server error occurred.' });
  }
};

export const logout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user) {
      await User.findOneAndUpdate({ userId: req.user.userId }, { $unset: { refreshToken: 1 } });

      // Log logout details
      try {
        const ua = parseUA(req.headers['user-agent'] || '');
        const reg = await Registration.findOne({ registeredByUser: req.user.email.toLowerCase() });
        const regId = reg ? reg.registrationId : '';

        // Find recent login log to update session duration
        const lastLogin = await LoginLog.findOne({ 
          email: req.user.email.toLowerCase(), 
          logoutTime: { $exists: false } 
        });

        let duration = 0;
        if (lastLogin) {
          const loginTime = new Date(lastLogin.loginTime);
          const logoutTime = new Date();
          duration = Math.round((logoutTime.getTime() - loginTime.getTime()) / 1000); // duration in seconds
          
          lastLogin.logoutTime = logoutTime;
          lastLogin.sessionDuration = duration;
          await lastLogin.save();
        }

        const activity = new ActivityLog({
          registrationId: regId,
          delegateName: req.user.username,
          action: 'Logout',
          description: `User logged out. Session duration: ${Math.round(duration / 60)} minutes.`,
          user: req.user.email,
          ipAddress: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1'),
          browser: ua.browser
        });
        await activity.save();

        generateMasterExcel().catch(err => console.error('Excel update error:', err));
      } catch (logErr) {
        console.error('Failed to log logout activity:', logErr);
      }
    }
    return res.status(200).json({ message: 'Logout successful.' });
  } catch (error: any) {
    console.error('Logout error:', error);
    return res.status(500).json({ message: error?.message || 'An internal server error occurred.' });
  }
};

export const getMe = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    let user: any = null;
    try {
      user = await User.findOne({
        $or: [
          { userId: req.user.userId },
          { email: req.user.email.toLowerCase() }
        ]
      }).select('-passwordHash');
    } catch (dbErr) {
      console.warn('GetMe DB warning:', dbErr);
    }

    if (!user) {
      user = {
        userId: req.user.userId,
        email: req.user.email,
        role: req.user.role,
        fullName: req.user.username || req.user.email.split('@')[0],
        emailVerified: true,
        registrationCompleted: false
      };
    } else {
      try {
        const registration = await Registration.findOne({
          $or: [
            { user: user._id },
            { registeredByUser: user.email.toLowerCase() },
            { 'details.email': user.email.toLowerCase() }
          ]
        });

        if (registration && !user.registrationCompleted) {
          user.registrationCompleted = true;
          await user.save().catch(() => {});
        }
      } catch (regErr) {
        console.warn('GetMe registration check warning:', regErr);
      }
    }

    return res.status(200).json({ user });
  } catch (error: any) {
    console.error('Get me error:', error);
    return res.status(200).json({
      user: {
        userId: req.user?.userId || 'CPS-U-FALLBACK',
        email: req.user?.email || 'admin@cpsprimemun.org',
        role: req.user?.role || 'Admin',
        fullName: req.user?.username || 'User',
        emailVerified: true,
        registrationCompleted: true
      }
    });
  }
};

// ─── Test Account Seeder ─────────────────────────────────────────────────────
const TEST_ACCOUNTS = [
  { fullName: 'Counsellor Ann',  email: 'counsellor.ann@chennaipublicschool.com', password: 'CpsAnn@2025!' },
  { fullName: 'Reena CPS',       email: 'reena@cpsglobalschool.com',              password: 'CpsReena@2025!' },
  { fullName: 'Omar M CPS',      email: 'omarm@cpsglobalschool.com',              password: 'CpsOmar@2025!' },
];

export const seedTestAccounts = async (req: Request, res: Response) => {
  try {
    const results: any[] = [];

    for (const acct of TEST_ACCOUNTS) {
      const email = acct.email.toLowerCase();

      // If account already exists just ensure paymentBypass is set
      const existing = await User.findOne({ email });
      if (existing) {
        existing.paymentBypass = true;
        await existing.save();
        results.push({ email, status: 'updated', action: 'paymentBypass enforced' });
        continue;
      }

      // Generate sequential ID
      const recentTestUsers = await User.find({ userId: /^CPS-U-/ }).sort({ userId: -1 }).limit(1);
      const lastUser = recentTestUsers && recentTestUsers.length > 0 ? recentTestUsers[0] : null;
      let nextNum = 10001;
      if (lastUser && lastUser.userId) {
        const match = lastUser.userId.match(/CPS-U-(\d+)/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      } else {
        const count = await User.countDocuments();
        nextNum = 10000 + count + 1;
      }
      const suffix = String(nextNum);

      const passwordHash = await bcrypt.hash(acct.password, 12);
      const newUser = new User({
        userId: `CPS-U-${suffix}`,
        accountId: `CPS-A-${suffix}`,
        fullName: acct.fullName,
        email,
        passwordHash,
        plainPassword: acct.password,
        emailVerified: true,
        registrationCompleted: false,
        role: 'Delegate',
        status: 'Active',
        paymentBypass: true,
      });
      await newUser.save();
      results.push({ email, status: 'created', userId: newUser.userId, password: acct.password });
    }

    return res.status(200).json({ message: 'Test accounts seeded.', results });
  } catch (error: any) {
    console.error('Seed test accounts error:', error);
    return res.status(500).json({ message: error.message || 'Failed to seed test accounts.' });
  }
};
