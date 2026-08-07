import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  userId: string;
  accountId: string;
  fullName: string;
  username?: string;
  email: string;
  passwordHash: string;
  plainPassword?: string;
  emailVerified: boolean;
  registrationCompleted: boolean;
  role: 'Delegate' | 'Admin' | 'SuperAdmin';
  status: 'Active' | 'Suspended';
  paymentBypass: boolean;
  lastLogin?: Date;
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    userId: {
      type: String,
      unique: true,
      required: true,
    },
    accountId: {
      type: String,
      unique: true,
      required: true,
    },
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
      unique: true,
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
    emailVerified: {
      type: Boolean,
      default: false,
    },
    registrationCompleted: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ['Delegate', 'Admin', 'SuperAdmin'],
      default: 'Delegate',
    },
    status: {
      type: String,
      enum: ['Active', 'Suspended'],
      default: 'Active',
    },
    paymentBypass: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
    },
    refreshToken: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

import { createMockModel, isMockDB } from '../config/mockDb';

const MongooseModel = model<IUser>('User', UserSchema);
const MockModel = createMockModel('User');

const exportModel = isMockDB() ? MockModel : MongooseModel;
export default exportModel;
