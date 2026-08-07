import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const mongoUri = process.env.MONGODB_URI;

const RegistrationSchema = new mongoose.Schema({}, { strict: false });
const Registration = mongoose.model('Registration', RegistrationSchema, 'registrations');

async function check() {
  if (!mongoUri) {
    console.error('MONGODB_URI not set');
    return;
  }
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected!');

  const regs = await Registration.find({});
  console.log(JSON.stringify(regs, null, 2));

  await mongoose.disconnect();
}

check();
