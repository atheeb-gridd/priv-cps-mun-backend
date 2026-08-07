const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/cpsprimemun';

async function fix() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) {
    console.error('No DB connection');
    process.exit(1);
  }

  const collection = db.collection('registrations');
  
  // Find all records with registrationId starting with CPS-SCH-
  const cursor = collection.find({ registrationId: /^CPS-SCH-/ });
  const docs = await cursor.toArray();
  console.log(`Found ${docs.length} school registration records to check/fix.`);

  for (const doc of docs) {
    const update = {
      registrationType: 'school'
    };

    if (!doc.details) doc.details = {};

    let actualCount = doc.details.delegatesCount;
    if (!actualCount || actualCount === 1) {
      if (doc.details.delegates && Array.isArray(doc.details.delegates) && doc.details.delegates.length > 0) {
        actualCount = doc.details.delegates.length;
      } else if (doc.details.amountPaid) {
        const amt = parseFloat(doc.details.amountPaid);
        actualCount = Math.round(amt) > 0 ? Math.round(amt) : 5;
      } else {
        actualCount = 5;
      }
    }

    update['details.delegatesCount'] = actualCount;
    if (!doc.details.paymentStatus || doc.details.paymentStatus === 'Pending') {
      update['details.paymentStatus'] = doc.paymentStatus || 'Verified';
    }

    await collection.updateOne({ _id: doc._id }, { $set: update });
    console.log(`Updated ${doc.registrationId} -> registrationType: 'school', delegatesCount: ${actualCount}`);
  }

  console.log('All school registrations fixed successfully!');
  await mongoose.disconnect();
}

fix().catch(err => {
  console.error(err);
  process.exit(1);
});
