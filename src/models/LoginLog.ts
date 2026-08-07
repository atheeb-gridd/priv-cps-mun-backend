import { Schema, model, Document } from 'mongoose';

export interface ILoginLog extends Document {
  userId: string;
  registrationId: string;
  email: string;
  loginTime: Date;
  logoutTime?: Date;
  sessionDuration?: number; // In seconds
  browser: string;
  device: string;
  os: string;
  ipAddress: string;
  country: string;
  status: string;
}

const LoginLogSchema = new Schema<ILoginLog>(
  {
    userId: { type: String, default: '' },
    registrationId: { type: String, default: '' },
    email: { type: String, required: true },
    loginTime: { type: Date, default: Date.now },
    logoutTime: { type: Date },
    sessionDuration: { type: Number },
    browser: { type: String, default: '' },
    device: { type: String, default: '' },
    os: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    country: { type: String, default: '' },
    status: { type: String, default: 'Success' },
  },
  { timestamps: true }
);

import { createMockModel, isMockDB } from '../config/mockDb';

const MongooseModel = model<ILoginLog>('LoginLog', LoginLogSchema);
const MockModel = createMockModel('LoginLog');

const exportModel = isMockDB() ? MockModel : MongooseModel;
export default exportModel;
