import bcrypt from 'bcryptjs';

const run = async () => {
  const hash = '$2a$12$.EY.0R8r.h8K4m7JNjjNP.m6oEUsgmbHv4O3/MmoX4G8USX6leqMq';
  const providedPassword = 'CpsMun5.O#Secr3tSecretariat@9843!';
  
  const matches = await bcrypt.compare(providedPassword, hash);
  console.log(`Password matches hash: ${matches}`);
  
  process.exit(0);
};

run();
