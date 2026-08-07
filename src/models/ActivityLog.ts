import { Schema, model, Document } from 'mongoose';

export interface IActivityLog extends Document {
  timestamp: Date;
  registrationId: string;
  delegateName: string;
  action: string;
  description: string;
  ipAddress: string;
  browser: string;
  user: string;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    timestamp: { type: Date, default: Date.now },
    registrationId: { type: String, default: '' },
    delegateName: { type: String, default: '' },
    action: { type: String, required: true },
    description: { type: String, required: true },
    ipAddress: { type: String, default: '' },
    browser: { type: String, default: '' },
    user: { type: String, required: true },
  },
  { timestamps: true }
);

import { createMockModel, isMockDB } from '../config/mockDb';

const MongooseModel = model<IActivityLog>('ActivityLog', ActivityLogSchema);
const MockModel = createMockModel('ActivityLog');

const exportModel = isMockDB() ? MockModel : MongooseModel;
export default exportModel;
