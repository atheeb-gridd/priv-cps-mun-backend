const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://Chennaipublicschool_22:CPS%4022Chennai@cpsprimemun.sfltweu.mongodb.net/cpsprimemun?appName=CPSPRIMEMUN';

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected successfully!');

  const RegistrationSchema = new mongoose.Schema({}, { strict: false });
  const Registration = mongoose.model('Registration', RegistrationSchema);
  
  const regs = await Registration.find({});
  console.log(`Total registrations found: ${regs.length}`);
  
  for (const r of regs) {
    const regId = r.get('registrationId');
    const type = r.get('registrationType');
    const email = r.get('registeredByUser');
    const details = r.get('details');
    console.log(`ID: ${regId} | Type: ${type} | User: ${email}`);
    console.log('Details:', JSON.stringify(details, null, 2));
    console.log('--------------------------------------------------');
  }
  
  await mongoose.disconnect();
  console.log('Disconnected.');
}

run().catch(err => {
  console.error('Error occurred:', err);
  process.exit(1);
});
