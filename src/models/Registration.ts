import { Schema, model, Document } from 'mongoose';

export interface IRegistration extends Document {
  registrationId: string;
  user?: Schema.Types.ObjectId;
  paymentId: string;
  paymentStatus?: string;
  registrationType: 'individual' | 'school';
  registeredByUser: string; // Email
  registeredAt: Date;
  amountPaid: number;
  allocatedCommittee: string;
  allocatedCountry: string;
  isLocked?: boolean;
  details: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const DelegateDetailSchema = new Schema({
  name: { type: String, default: '' },
  fullName: { type: String, default: '' },
  email: { type: String, default: '' },
  mobile: { type: String, default: '' },
  gender: { type: String, default: '' },
  dob: { type: String, default: '' },
  gradeClass: { type: String, default: '' },
  section: { type: String, default: '' },
  schoolName: { type: String, default: '' },
  schoolCity: { type: String, default: '' },
  selectedCommittee: { type: String, default: '' },
  allocatedCommittee: { type: String, default: '' },
  allocatedCountry: { type: String, default: '' },
  isFirstMUN: { type: String, default: 'Yes' },
  numMUNs: { type: String, default: '0' },
  previousMUNs: { type: String, default: '' },
  medicalConditions: { type: String, default: '' },
  gadgetsList: { type: String, default: '' },
  docStudentId: { type: String, default: '' },
  docAadhar: { type: String, default: '' },
  docStudentIdDriveUrl: { type: String, default: '' },
  docPhotoDriveUrl: { type: String, default: '' },
  docAadharDriveUrl: { type: String, default: '' },
  parentName: { type: String, default: '' },
  parentMobile: { type: String, default: '' },
  parentEmail: { type: String, default: '' },
  emergencyName: { type: String, default: '' },
  emergencyNumber: { type: String, default: '' },
  attendanceStatus: { type: String, enum: ['Present', 'Absent'], default: 'Absent' },
  seatStatus: { type: String, enum: ['Pending', 'Confirmed', 'Cancelled'], default: 'Pending' },
  certificateStatus: { type: String, enum: ['Not Generated', 'Generated', 'Issued'], default: 'Not Generated' }
});

const RegistrationSchema = new Schema<IRegistration>(
  {
    registrationId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    paymentId: {
      type: String,
      required: true,
      default: 'PAY-MOCK',
    },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Verified', 'Failed', 'Cancelled'],
      default: 'Pending',
      index: true,
    },
    registrationType: {
      type: String,
      enum: ['individual', 'school'],
      required: true,
      index: true,
    },
    registeredByUser: {
      type: String,
      required: true,
      index: true,
    },
    registeredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    amountPaid: {
      type: Number,
      required: true,
      default: 0,
    },
    allocatedCommittee: {
      type: String,
      default: '',
    },
    allocatedCountry: {
      type: String,
      default: '',
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    details: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

import { createMockModel, isMockDB } from '../config/mockDb';

const MongooseModel = model<IRegistration>('Registration', RegistrationSchema);
const MockModel = createMockModel('Registration');

const exportModel = isMockDB() ? MockModel : MongooseModel;
export default exportModel;
