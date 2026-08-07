import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const run = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('Error: MONGODB_URI is not set in environment.');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database object is undefined.');

    // Check login logs
    const loginCollection = db.collection('loginlogs');
    const logs = await loginCollection.find({}).sort({ createdAt: -1 }).limit(10).toArray();
    console.log('--- RECENT LOGIN LOGS ---');
    logs.forEach(l => {
      console.log(`Time: ${l.createdAt}, Email: ${l.email || l.authEmail}, Status: ${l.status}, Message: ${l.message || l.details}`);
    });
    console.log('--------------------------');

    // Check activity logs
    const activityCollection = db.collection('activitylogs');
    const actLogs = await activityCollection.find({}).sort({ createdAt: -1 }).limit(10).toArray();
    console.log('--- RECENT ACTIVITY LOGS ---');
    actLogs.forEach(al => {
      console.log(`Time: ${al.createdAt}, User: ${al.userEmail || al.email}, Action: ${al.action}, Details: ${al.details}`);
    });
    console.log('-----------------------------');

    process.exit(0);
  } catch (error) {
    console.error('Query failed:', error);
    process.exit(1);
  }
};

run();
