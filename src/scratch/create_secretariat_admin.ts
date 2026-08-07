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

    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully!');

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database object is undefined.');

    const collection = db.collection('users');
    const adminEmail = 'admin.secretariat@cpsprimemun.org';

    // Password: CpsMun5.O#Secr3tSecretariat@9843!
    const workingHash = '$2a$12$.EY.0R8r.h8K4m7JNjjNP.m6oEUsgmbHv4O3/MmoX4G8USX6leqMq';
    const workingPlain = 'CpsMun5.O#Secr3tSecretariat@9843!';

    // Remove any existing user with the same email to avoid duplicates
    await collection.deleteOne({ email: adminEmail });

    // Insert with unique ID
    await collection.insertOne({
      userId: 'CPS-U-10005',
      accountId: 'CPS-A-10005',
      fullName: 'CPS Admin Secretariat',
      username: 'cps_super_admin',
      email: adminEmail,
      passwordHash: workingHash,
      plainPassword: workingPlain,
      emailVerified: true,
      registrationCompleted: true,
      role: 'Admin',
      status: 'Active',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log('Secretariat admin user successfully created in MongoDB Atlas!');
    process.exit(0);
  } catch (error) {
    console.error('Operation failed:', error);
    process.exit(1);
  }
};

run();
