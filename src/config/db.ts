import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { isMockDB } from './mockDb';

dotenv.config();

const connectDB = async (): Promise<void> => {
  try {
    const connString = process.env.MONGODB_URI || 'mock';
    if (isMockDB()) {
      console.log('⚡ Mock Database Mode Active. Using zero-dependency JSON file-based database (db.json)');
      
      const fs = require('fs');
      const path = require('path');
      const bcrypt = require('bcryptjs');
      const dbFile = path.join(__dirname, '../../db.json');
      
      let db: any = { users: [], registrations: [], pendingusers: [], otps: [] };
      if (fs.existsSync(dbFile)) {
        try {
          db = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
        } catch (e) {
          // ignore
        }
      }
      
      if (!db.users) db.users = [];
      const adminExists = db.users.some((u: any) => u.email === 'admin.secretariat@cpsprimemun.org');
      if (!adminExists) {
        console.log('🌱 Seeding Admin User: admin.secretariat@cpsprimemun.org');
        const salt = bcrypt.genSaltSync(12);
        const adminHash = bcrypt.hashSync('CpsMun5.O#Secr3tSecretariat@9843$Xk9!', salt);
        db.users.push({
          userId: 'CPS-U-10001',
          accountId: 'CPS-A-10001',
          fullName: 'CPS Admin Secretariat',
          username: 'cps_super_admin',
          email: 'admin.secretariat@cpsprimemun.org',
          passwordHash: adminHash,
          plainPassword: 'CpsMun5.O#Secr3tSecretariat@9843$Xk9!',
          emailVerified: true,
          registrationCompleted: true,
          role: 'Admin',
          status: 'Active',
          _collectionName: 'users',
          _id: 'mock_admin_user',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf-8');
        console.log('🌱 Admin user seeded successfully.');
      }

      return;
    }
    console.log(`Connecting to MongoDB...`);
    const conn = await mongoose.connect(connString, { serverSelectionTimeoutMS: 5000 });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    try {
      if (conn.connection.db) {
        const adminCol = conn.connection.db.collection('users');
        const adminUser = await adminCol.findOne({ email: 'admin.secretariat@cpsprimemun.org' });
        if (!adminUser) {
          console.log('🌱 Seeding Admin User in MongoDB...');
          const bcrypt = require('bcryptjs');
          const salt = bcrypt.genSaltSync(12);
          const adminHash = bcrypt.hashSync('CpsMun5.O#Secr3tSecretariat@9843$Xk9!', salt);
          await adminCol.insertOne({
            userId: 'CPS-U-10001',
            accountId: 'CPS-A-10001',
            fullName: 'CPS Admin Secretariat',
            username: 'cps_super_admin',
            email: 'admin.secretariat@cpsprimemun.org',
            passwordHash: adminHash,
            emailVerified: true,
            registrationCompleted: true,
            role: 'Admin',
            status: 'Active',
            createdAt: new Date(),
            updatedAt: new Date()
          });
          console.log('🌱 Admin user seeded successfully in MongoDB.');
        }
      }
    } catch (dbErr) {
      console.error('Failed to seed admin in MongoDB:', dbErr);
    }
  } catch (error) {
    console.error(`Error connecting to MongoDB:`, error);
    console.log("Server will keep running and retry connecting in the background...");
  }
};

export default connectDB;
