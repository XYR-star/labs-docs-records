import bcrypt from 'bcryptjs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });
const password = await rl.question('Admin password: ');
rl.close();

if (!password || password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log(hash);
