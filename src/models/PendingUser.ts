import { Schema, model, Document } from 'mongoose';

export interface IPendingUser extends Document {
  fullName: string;
  username?: string;
  email: string;
  passwordHash: string;
  plainPassword?: string;
  otpCode: string;
  expiresAt: Date;
}

const PendingUserSchema = new Schema<IPendingUser>(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    plainPassword: {
      type: String,
    },
    otpCode: {
      type: String,
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

// TTL index to automatically delete unverified signups
PendingUserSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

import { createHybridModel } from '../config/mockDb';

const MongooseModel = model<IPendingUser>('PendingUser', PendingUserSchema);
const exportModel = createHybridModel('PendingUser', MongooseModel);
export default exportModel;
