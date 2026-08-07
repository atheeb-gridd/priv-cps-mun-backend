import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const mongoUri = process.env.MONGODB_URI;

const RegistrationSchema = new mongoose.Schema({}, { strict: false });
const Registration = mongoose.model('Registration', RegistrationSchema, 'registrations');

async function fix() {
  if (!mongoUri) {
    console.error('MONGODB_URI not set');
    return;
  }
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected!');

  const regs = await Registration.find({});
  console.log(`Checking ${regs.length} registrations...`);
  
  for (const r of regs) {
    const item = r.toObject() as any;
    // If status inside details is missing or undefined, update it to 'Draft'
    if (!item.details || !item.details.status) {
      console.log(`Updating registration ${item.registrationId} to status: 'Draft'...`);
      await Registration.updateOne(
        { _id: r._id },
        { 
          $set: { 
            'details.status': 'Draft' 
          } 
        }
      );
    }
  }

  console.log('Done fixing registrations!');
  await mongoose.disconnect();
}

fix();
