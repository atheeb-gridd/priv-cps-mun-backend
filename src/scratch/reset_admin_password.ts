import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

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

    const targetPassword = 'CpsMun5.O#Secr3tSecretariat@9843!';
    const salt = await bcrypt.genSalt(12);
    const newHash = await bcrypt.hash(targetPassword, salt);

    console.log(`Generated new hash: ${newHash}`);

    const userCollection = db.collection('users');
    const updateResult = await userCollection.updateOne(
      { email: 'admin.secretariat@cpsprimemun.org' },
      { $set: { passwordHash: newHash } }
    );

    console.log(`Update result:`, updateResult);

    process.exit(0);
  } catch (error) {
    console.error('Reset failed:', error);
    process.exit(1);
  }
};

run();
