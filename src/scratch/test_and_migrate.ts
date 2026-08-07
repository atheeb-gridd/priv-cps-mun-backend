import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const passwords = ['CPS@22Chennai', 'NTKbGDEHpBkL97nz'];
const baseUri = 'mongodb+srv://Chennaipublicschool_22:<db_password>@cpsprimemun.sfltweu.mongodb.net/cpsprimemun?retryWrites=true&w=majority&appName=CPSPRIMEMUN';
const DB_FILE = path.join(__dirname, '../../db.json');
const ENV_FILE = path.join(__dirname, '../../.env');

const run = async () => {
  let workingPassword = '';
  let workingUri = '';

  for (const pass of passwords) {
    const testUri = baseUri.replace('<db_password>', encodeURIComponent(pass));
    console.log(`Testing connection with password: ${pass.substring(0, 3)}...`);
    try {
      await mongoose.connect(testUri, { serverSelectionTimeoutMS: 5000 });
      console.log(`Success! Password works: ${pass}`);
      workingPassword = pass;
      workingUri = testUri;
      await mongoose.disconnect();
      break;
    } catch (err) {
      console.log(`Failed for password ${pass.substring(0, 3)}... Error:`, (err as Error).message);
    }
  }

  if (!workingPassword) {
    console.error('Neither password could connect to MongoDB Atlas. Please double check the credentials or network access/IP whitelist on MongoDB Atlas.');
    process.exit(1);
  }

  try {
    let envContent = fs.readFileSync(ENV_FILE, 'utf-8');
    envContent = envContent.replace(/MONGODB_URI=.*/, `MONGODB_URI=${baseUri.replace('<db_password>', workingPassword)}`);
    fs.writeFileSync(ENV_FILE, envContent, 'utf-8');
    console.log('Updated backend/.env file with the working database URI.');
  } catch (envErr) {
    console.error('Failed to write .env file:', envErr);
  }

  try {
    console.log('Starting migration to MongoDB Atlas...');
    await mongoose.connect(workingUri);
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection object is undefined.');

    if (!fs.existsSync(DB_FILE)) {
      console.error('db.json not found.');
      process.exit(1);
    }

    const localData = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
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

        // Fix missing username constraint
        if (collName === 'users' && !docToInsert.username) {
          docToInsert.username = docToInsert.email.toLowerCase();
        }

        let exists = false;
        if (collName === 'users') {
          const dup = await collection.findOne({
            $or: [
              { _id: docToInsert._id },
              { email: docToInsert.email },
              { userId: docToInsert.userId }
            ]
          });
          if (dup) exists = true;
        } else if (collName === 'registrations') {
          const dup = await collection.findOne({
            $or: [
              { _id: docToInsert._id },
              { registrationId: docToInsert.registrationId }
            ]
          });
          if (dup) exists = true;
        } else if (collName === 'pendingusers') {
          const dup = await collection.findOne({
            $or: [
              { _id: docToInsert._id },
              { email: docToInsert.email }
            ]
          });
          if (dup) exists = true;
        } else {
          const dup = await collection.findOne({ _id: docToInsert._id });
          if (dup) exists = true;
        }

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
  } catch (migErr) {
    console.error('Migration failed:', migErr);
    process.exit(1);
  }
};

run();
