import { Schema, model, Document } from 'mongoose';
import { createMockModel, isMockDB } from '../config/mockDb';

export interface IRegistrationDraft extends Document {
  userId: string;
  userEmail: string;
  registrationId?: string;
  currentStep: number;
  regType: 'individual' | 'school';
  formData: Record<string, any>;
  lastSavedAt: Date;
  draftStatus: 'IN_PROGRESS' | 'COMPLETED';
  createdAt: Date;
  updatedAt: Date;
}

const RegistrationDraftSchema = new Schema<IRegistrationDraft>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    userEmail: {
      type: String,
      required: true,
      index: true,
    },
    registrationId: {
      type: String,
      default: '',
    },
    currentStep: {
      type: Number,
      default: 1,
    },
    regType: {
      type: String,
      enum: ['individual', 'school'],
      default: 'individual',
    },
    formData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    lastSavedAt: {
      type: Date,
      default: Date.now,
    },
    draftStatus: {
      type: String,
      enum: ['IN_PROGRESS', 'COMPLETED'],
      default: 'IN_PROGRESS',
    },
  },
  {
    timestamps: true,
  }
);

import { createHybridModel } from '../config/mockDb';

const MongooseModel = model<IRegistrationDraft>('RegistrationDraft', RegistrationDraftSchema, 'registrationDrafts');
const exportModel = createHybridModel('RegistrationDraft', MongooseModel);
export default exportModel;
