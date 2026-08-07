import dotenv from 'dotenv';
import path from 'path';
import connectDB from '../config/db';
import Registration from '../models/Registration';
import { sendRegistrationConfirmationEmail } from '../services/emailService';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const run = async () => {
  await connectDB();
  const reg = await Registration.findOne({ registeredByUser: 'tanav.trt@gmail.com' });
  if (!reg) {
    console.error('No registration found for tanav.trt@gmail.com');
    process.exit(1);
  }

  console.log(`Resending registration confirmation email for: ${reg.registrationId}`);
  // send to parent (tanav.trt@icloud.com)
  await sendRegistrationConfirmationEmail('tanav.trt@icloud.com', reg);
  // send to delegate (tanav.trt@gmail.com)
  await sendRegistrationConfirmationEmail('tanav.trt@gmail.com', reg);

  console.log('Done!');
  process.exit(0);
};

run();
