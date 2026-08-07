import { Schema, model, Document } from 'mongoose';

export interface IOTPLog extends Document {
  registrationId: string;
  email: string;
  otpGeneratedTime: Date;
  otpVerifiedTime?: Date;
  verificationStatus: string;
  expiredOtp: boolean;
  failedAttempts: number;
}

const OTPLogSchema = new Schema<IOTPLog>(
  {
    registrationId: { type: String, default: '' },
    email: { type: String, required: true },
    otpGeneratedTime: { type: Date, default: Date.now },
    otpVerifiedTime: { type: Date },
    verificationStatus: { type: String, default: 'Pending' },
    expiredOtp: { type: Boolean, default: false },
    failedAttempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

import { createMockModel, isMockDB } from '../config/mockDb';

const MongooseModel = model<IOTPLog>('OTPLog', OTPLogSchema);
const MockModel = createMockModel('OTPLog');

const exportModel = isMockDB() ? MockModel : MongooseModel;
export default exportModel;
