import { Schema, model, Document } from 'mongoose';

export interface IAdminLog extends Document {
  adminName: string;
  timestamp: Date;
  action: string;
  editedRecord: string;
  previousValue: string;
  newValue: string;
}

const AdminLogSchema = new Schema<IAdminLog>(
  {
    adminName: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    action: { type: String, required: true },
    editedRecord: { type: String, required: true },
    previousValue: { type: String, default: '' },
    newValue: { type: String, default: '' },
  },
  { timestamps: true }
);

import { createHybridModel } from '../config/mockDb';

const MongooseModel = model<IAdminLog>('AdminLog', AdminLogSchema);
const exportModel = createHybridModel('AdminLog', MongooseModel);
export default exportModel;
