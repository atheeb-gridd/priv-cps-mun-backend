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

    console.log('Connecting to MongoDB Atlas to reset admin password...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully!');

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database object is undefined.');

    const collection = db.collection('users');
    const adminEmail = 'admin.secretariat@cpsprimemun.org';

    // The working password hash from local db.json
    const workingHash = '$2a$12$.EY.0R8r.h8K4m7JNjjNP.m6oEUsgmbHv4O3/MmoX4G8USX6leqMq';
    const workingPlain = 'CpsMun5.O#Secr3tSecretariat@9843!';

    const result = await collection.updateOne(
      { email: adminEmail },
      { 
        $set: { 
          passwordHash: workingHash,
          plainPassword: workingPlain
        } 
      }
    );

    if (result.matchedCount === 0) {
      console.log('Admin user not found. Seeding a new admin user...');
      await collection.insertOne({
        userId: 'CPS-U-10001',
        accountId: 'CPS-A-10001',
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
      console.log('Admin user seeded successfully!');
    } else {
      console.log('Admin user password updated successfully!');
    }

    process.exit(0);
  } catch (error) {
    console.error('Reset failed:', error);
    process.exit(1);
  }
};

run();
