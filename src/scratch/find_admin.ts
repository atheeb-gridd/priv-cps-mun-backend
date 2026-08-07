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

    const collection = db.collection('users');
    const users = await collection.find({}).toArray();
    console.log('--- ALL USERS IN MONGODB ATLAS ---');
    users.forEach(u => {
      console.log(`ID: ${u._id}, userId: ${u.userId}, email: ${u.email}, role: ${u.role}, username: ${u.username}`);
    });
    console.log('----------------------------------');

    process.exit(0);
  } catch (error) {
    console.error('Query failed:', error);
    process.exit(1);
  }
};

run();
