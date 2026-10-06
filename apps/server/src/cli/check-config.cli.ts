import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { validate } from '../config/validation';

for (const file of ['.env', '../../.env']) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

try {
  const config = validate(process.env as Record<string, unknown>) as Record<string, unknown>;
  console.log('Configuration is valid.');
  if (!config.SMTP_HOST) console.log('Note: SMTP_HOST is empty; e-mail codes are logged, not sent.');
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
