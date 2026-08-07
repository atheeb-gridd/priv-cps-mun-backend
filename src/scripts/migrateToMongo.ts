import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const DB_FILE = path.join(__dirname, '../../db.json');

const runMigration = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri || mongoUri.includes('<db_password>')) {
      console.error('Error: MONGODB_URI is not set or still contains the placeholder <db_password>. Please set the correct password first.');
      process.exit(1);
    }

    if (!fs.existsSync(DB_FILE)) {
      console.error('Error: db.json not found at:', DB_FILE);
      process.exit(1);
    }

    const localData = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(mongoUri);
    console.log('Connected successfully!');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection object is undefined.');
    }

    const collections = ['users', 'registrations', 'pendingusers', 'otps', 'loginlogs', 'adminlogs', 'emaillogs', 'activitylogs'];

    for (const collName of collections) {
      const docs = localData[collName];
      if (!docs || !Array.isArray(docs) || docs.length === 0) {
        console.log(`Collection "${collName}" is empty in db.json. Skipping.`);
        continue;
      }

      console.log(`Migrating ${docs.length} documents for collection "${collName}"...`);
      const collection = db.collection(collName);

      let insertedCount = 0;
      let skippedCount = 0;

      for (const doc of docs) {
        let docToInsert = { ...doc };
        
        Object.keys(docToInsert).forEach(key => {
          if (key.startsWith('$')) {
            delete docToInsert[key];
          }
        });

        if (docToInsert._id) {
          const idStr = String(docToInsert._id);
          if (idStr.match(/^[0-9a-fA-F]{24}$/)) {
            docToInsert._id = new mongoose.Types.ObjectId(idStr);
          }
        }

        if (docToInsert.user) {
          const userIdStr = String(docToInsert.user);
          if (userIdStr.match(/^[0-9a-fA-F]{24}$/)) {
            docToInsert.user = new mongoose.Types.ObjectId(userIdStr);
          }
        }

        const exists = await collection.findOne({ _id: docToInsert._id });
        if (exists) {
          skippedCount++;
          continue;
        }

        const dateFields = ['createdAt', 'updatedAt', 'registeredAt', 'lastLogin', 'expiresAt', 'timestamp', 'date'];
        dateFields.forEach(field => {
          if (docToInsert[field] && typeof docToInsert[field] === 'string') {
            docToInsert[field] = new Date(docToInsert[field]);
          }
        });

        await collection.insertOne(docToInsert);
        insertedCount++;
      }

      console.log(`Collection "${collName}" completed: ${insertedCount} inserted, ${skippedCount} skipped.`);
    }

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

runMigration();
