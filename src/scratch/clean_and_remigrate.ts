import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const DB_FILE = path.join(__dirname, '../../db.json');

const run = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('Error: MONGODB_URI not found.');
      process.exit(1);
    }

    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(mongoUri);
    console.log('Connected!');

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database object is undefined.');

    if (!fs.existsSync(DB_FILE)) {
      console.error('db.json not found.');
      process.exit(1);
    }
    const localData = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));

    const collections = ['users', 'registrations', 'pendingusers', 'otps', 'loginlogs', 'adminlogs', 'emaillogs', 'activitylogs'];
    for (const collName of collections) {
      const collection = db.collection(collName);
      if (collName === 'users') {
        await collection.deleteMany({ email: { $ne: 'cpsprimemun@gmail.com' } });
      } else if (collName === 'registrations') {
        await collection.deleteMany({ registrationId: { $ne: 'REG-SCH-F0YERL' } });
      } else {
        await collection.deleteMany({});
      }
    }
    console.log('Cleaned up previous migration attempts from MongoDB Atlas.');

    const idMap: { [key: string]: mongoose.Types.ObjectId } = {};

    idMap['mock_admin_user'] = new mongoose.Types.ObjectId();

    const localUsers = localData.users || [];
    localUsers.forEach((u: any) => {
      if (u._id && String(u._id).startsWith('mock_')) {
        idMap[String(u._id)] = new mongoose.Types.ObjectId();
      }
    });

    const localRegs = localData.registrations || [];
    localRegs.forEach((r: any) => {
      if (r._id && String(r._id).startsWith('mock_')) {
        idMap[String(r._id)] = new mongoose.Types.ObjectId();
      }
    });

    for (const collName of collections) {
      const docs = localData[collName];
      if (!docs || !Array.isArray(docs) || docs.length === 0) {
        continue;
      }

      console.log(`Migrating ${docs.length} documents for collection "${collName}" with clean IDs...`);
      const collection = db.collection(collName);

      for (const doc of docs) {
        let docToInsert = { ...doc };

        Object.keys(docToInsert).forEach(key => {
          if (key.startsWith('$')) {
            delete docToInsert[key];
          }
        });

        const currentIdStr = String(docToInsert._id);
        if (idMap[currentIdStr]) {
          docToInsert._id = idMap[currentIdStr];
        } else if (currentIdStr.match(/^[0-9a-fA-F]{24}$/)) {
          docToInsert._id = new mongoose.Types.ObjectId(currentIdStr);
        } else {
          docToInsert._id = new mongoose.Types.ObjectId();
        }

        if (docToInsert.user) {
          const currentUserStr = String(docToInsert.user);
          if (idMap[currentUserStr]) {
            docToInsert.user = idMap[currentUserStr];
          } else if (currentUserStr.match(/^[0-9a-fA-F]{24}$/)) {
            docToInsert.user = new mongoose.Types.ObjectId(currentUserStr);
          } else if (currentUserStr === 'mock_9vvcvk5') {
            docToInsert.user = new mongoose.Types.ObjectId('6a5a5d1f8e3837a7cf041b81');
          } else {
            docToInsert.user = new mongoose.Types.ObjectId();
          }
        }

        if (collName === 'users') {
          if (!docToInsert.username) {
            docToInsert.username = docToInsert.email.toLowerCase();
          }
          if (docToInsert.email === 'admin.secretariat@cpsprimemun.org') {
            docToInsert.userId = 'CPS-U-10005';
            docToInsert.accountId = 'CPS-A-10005';
          }
        }

        const dateFields = ['createdAt', 'updatedAt', 'registeredAt', 'lastLogin', 'expiresAt', 'timestamp', 'date'];
        dateFields.forEach(field => {
          if (docToInsert[field] && typeof docToInsert[field] === 'string') {
            docToInsert[field] = new Date(docToInsert[field]);
          }
        });

        await collection.insertOne(docToInsert);
      }
      console.log(`Collection "${collName}" migrated successfully!`);
    }

    console.log('Migration completed successfully with zero schema conflicts!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

run();
