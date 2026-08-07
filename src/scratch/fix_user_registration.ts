import mongoose from 'mongoose';
import Registration from '../models/Registration';
import { allocateCountriesForRoster } from '../services/countryAllocationService';

const MONGODB_URI = 'mongodb+srv://Chennaipublicschool_22:CPS%4022Chennai@cpsprimemun.sfltweu.mongodb.net/cpsprimemun?appName=CPSPRIMEMUN';

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB');

  const reg = await Registration.findOne({ registrationId: 'REG-SCH-P2LH7P' });
  if (!reg) {
    console.error('Registration REG-SCH-P2LH7P not found');
    await mongoose.disconnect();
    return;
  }

  console.log('Current registration details:', JSON.stringify(reg.details, null, 2));

  const delegates = [
    {
      name: 'TANAV',
      gender: 'Male',
      dob: '2010-08-22',
      gradeClass: '11',
      section: 'A',
      email: 'tanav.trt@gmail.com',
      mobile: '6381622440',
      parentName: 'Nalini V',
      parentMobile: '6381622440',
      parentEmail: 'tanav.trt@gmail.com',
      isFirstMUN: 'No',
      numMUNs: '0',
      medicalConditions: '',
      gadgetsList: '',
      emergencyName: '',
      emergencyNumber: '',
      selectedCommittee: 'UN General Assembly (UNGA)',
      allocatedCommittee: 'UN General Assembly (UNGA)',
      allocatedCountry: '',
      docStudentId: '',
      docPhoto: '',
      acceptedTerms: true,
      acceptedRules: true,
      acceptedPrivacy: true,
      acceptedParentConsent: true,
      badgeNumber: 'BADGE-SCH-01'
    },
    {
      name: 'YAASHITHA S',
      gender: 'Female',
      dob: '2011-09-15',
      gradeClass: '10',
      section: 'B',
      email: 'yaashitha.ideal@gmail.com',
      mobile: '6381622440',
      parentName: 'Parent S',
      parentMobile: '6381622440',
      parentEmail: 'yaashitha.ideal@gmail.com',
      isFirstMUN: 'No',
      numMUNs: '0',
      medicalConditions: '',
      gadgetsList: '',
      emergencyName: '',
      emergencyNumber: '',
      selectedCommittee: 'International Labour Organization (ILO)',
      allocatedCommittee: 'International Labour Organization (ILO)',
      allocatedCountry: '',
      docStudentId: '',
      docPhoto: '',
      acceptedTerms: true,
      acceptedRules: true,
      acceptedPrivacy: true,
      acceptedParentConsent: true,
      badgeNumber: 'BADGE-SCH-02'
    }
  ];

  // Allocate random countries using backend service
  await allocateCountriesForRoster(delegates);

  // Update registration
  const updatedDetails = {
    ...reg.details,
    delegates: delegates
  };

  reg.details = updatedDetails;
  // Mark details as modified because it's a mixed type schema
  reg.markModified('details');

  await reg.save();
  console.log('Saved updated registration with delegates roster successfully!');
  console.log('Updated details:', JSON.stringify(reg.details, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
