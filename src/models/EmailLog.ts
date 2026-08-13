import { Schema, model, Document } from 'mongoose';

export interface IEmailLog extends Document {
  timestamp: Date;
  emailType: string;
  recipient: string;
  deliveryStatus: string;
  messageId: string;
}

const EmailLogSchema = new Schema<IEmailLog>(
  {
    timestamp: { type: Date, default: Date.now },
    emailType: { type: String, required: true },
    recipient: { type: String, required: true },
    deliveryStatus: { type: String, default: 'Sent' },
    messageId: { type: String, default: '' },
  },
  { timestamps: true }
);

import { createHybridModel } from '../config/mockDb';

const MongooseModel = model<IEmailLog>('EmailLog', EmailLogSchema);
const exportModel = createHybridModel('EmailLog', MongooseModel);
export default exportModel;
