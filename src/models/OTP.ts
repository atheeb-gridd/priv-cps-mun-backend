import { Schema, model, Document } from 'mongoose';

export interface IOTP extends Document {
  email: string;
  code: string;
  purpose: 'email_verification' | 'password_reset';
  expiresAt: Date;
  createdAt: Date;
}

const OTPSchema = new Schema<IOTP>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    code: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ['email_verification', 'password_reset'],
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// TTL index to automatically delete documents after expiresAt has passed
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

import { createMockModel, isMockDB } from '../config/mockDb';

const MongooseModel = model<IOTP>('OTP', OTPSchema);
const MockModel = createMockModel('OTP');

const exportModel = isMockDB() ? MockModel : MongooseModel;
export default exportModel;
