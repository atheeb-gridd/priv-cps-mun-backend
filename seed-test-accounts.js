/**
 * Standalone seed script — run once to create/update the three test accounts
 * with paymentBypass: true.
 * Usage: node seed-test-accounts.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

const TEST_ACCOUNTS = [
  { fullName: 'Counsellor Ann', email: 'counsellor.ann@chennaipublicschool.com', password: 'CpsAnn@2025!' },
  { fullName: 'Reena CPS',      email: 'reena@cpsglobalschool.com',              password: 'CpsReena@2025!' },
  { fullName: 'Omar M CPS',     email: 'omarm@cpsglobalschool.com',              password: 'CpsOmar@2025!' },
];

const UserSchema = new mongoose.Schema({
  userId:                { type: String, unique: true, required: true },
  accountId:             { type: String, unique: true, required: true },
  fullName:              { type: String, required: true },
  username:              String,
  email:                 { type: String, unique: true, required: true, lowercase: true },
  passwordHash:          { type: String, required: true },
  plainPassword:         String,
  emailVerified:         { type: Boolean, default: false },
  registrationCompleted: { type: Boolean, default: false },
  role:                  { type: String, enum: ['Delegate','Admin','SuperAdmin'], default: 'Delegate' },
  status:                { type: String, enum: ['Active','Suspended'], default: 'Active' },
  paymentBypass:         { type: Boolean, default: false },
  lastLogin:             Date,
  refreshToken:          String,
}, { timestamps: true });

async function seed() {
  if (!MONGO_URI) {
    console.error('No MONGO_URI in environment. Check your .env file.');
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Use existing compiled model if registered, else create
  const User = mongoose.models.User || mongoose.model('User', UserSchema);

  for (const acct of TEST_ACCOUNTS) {
    const email = acct.email.toLowerCase();
    const existing = await User.findOne({ email });

    if (existing) {
      existing.paymentBypass = true;
      existing.emailVerified = true;
      await existing.save();
      console.log(`✅ Updated (paymentBypass=true): ${email}`);
    } else {
      // Find next sequential ID
      const lastUser = await User.findOne({ userId: /^CPS-U-/ }).sort({ userId: -1 });
      let nextNum = 10001;
      if (lastUser && lastUser.userId) {
        const m = lastUser.userId.match(/CPS-U-(\d+)/);
        if (m) nextNum = parseInt(m[1], 10) + 1;
      } else {
        const count = await User.countDocuments();
        nextNum = 10000 + count + 1;
      }
      const suffix = String(nextNum);
      const passwordHash = await bcrypt.hash(acct.password, 12);

      await User.create({
        userId:       `CPS-U-${suffix}`,
        accountId:    `CPS-A-${suffix}`,
        fullName:     acct.fullName,
        email,
        passwordHash,
        plainPassword: acct.password,
        emailVerified: true,
        registrationCompleted: false,
        role:         'Delegate',
        status:       'Active',
        paymentBypass: true,
      });
      console.log(`✅ Created: ${email} | Password: ${acct.password} | ID: CPS-U-${suffix}`);
    }
  }

  await mongoose.disconnect();
  console.log('\nSeeding complete.');
}

seed().catch(err => { console.error(err); process.exit(1); });
