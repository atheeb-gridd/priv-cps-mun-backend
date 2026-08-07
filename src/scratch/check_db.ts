import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://Chennaipublicschool_22:CPS%4022Chennai@cpsprimemun.sfltweu.mongodb.net/cpsprimemun?appName=CPSPRIMEMUN';

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB');

  const Registration = mongoose.model('Registration', new mongoose.Schema({}, { strict: false }));
  const regs = await Registration.find({});
  
  console.log('Total Registrations:', regs.length);
  for (const r of regs) {
    console.log('RegID:', r.get('registrationId'));
    console.log('Type:', r.get('registrationType'));
    console.log('Email:', r.get('registeredByUser'));
    console.log('Details:', JSON.stringify(r.get('details'), null, 2));
    console.log('------------------------------------');
  }

  await mongoose.disconnect();
}

run().catch(console.error);
