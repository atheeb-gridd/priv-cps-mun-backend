const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../../db.json');

if (!fs.existsSync(DB_FILE)) {
  console.log('No db.json file found.');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
const registrations = data.registrations || [];

console.log(`Total registrations in db.json: ${registrations.length}`);

let updatedCount = 0;

registrations.forEach(reg => {
  if (reg.details && reg.details.schoolName) {
    reg.details.schoolName = reg.details.schoolName.replace(/\s*Main Campus Chennai\s*/gi, '').trim();
  }
  if (reg.schoolName) {
    reg.schoolName = reg.schoolName.replace(/\s*Main Campus Chennai\s*/gi, '').trim();
  }

  if (reg.registrationId && reg.registrationId.startsWith('CPS-SCH-')) {
    reg.registrationType = 'school';
    if (!reg.details) reg.details = {};
    
    let delCount = reg.details.delegatesCount;
    if (!delCount || delCount === 1 || delCount === '1') {
      if (reg.details.delegates && Array.isArray(reg.details.delegates) && reg.details.delegates.length > 0) {
        delCount = reg.details.delegates.length;
      } else if (reg.details.amountPaid) {
        const amt = parseFloat(reg.details.amountPaid);
        delCount = Math.round(amt) > 0 ? Math.round(amt) : 5;
      } else {
        delCount = 5;
      }
    }
    reg.details.delegatesCount = delCount;
    console.log(`Updated ${reg.registrationId} -> schoolName: "${reg.details.schoolName}", delegatesCount: ${delCount}`);
    updatedCount++;
  }
});

fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
console.log(`Successfully fixed ${updatedCount} school registration records in db.json!`);
