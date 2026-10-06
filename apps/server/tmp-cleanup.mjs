import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  try {
    const env = readFileSync(new URL('./.env', import.meta.url), 'utf8');
    for (const line of env.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // No .env file: rely on the ambient environment.
  }
}

const prisma = new PrismaClient();

for (const email of process.argv.slice(2)) {
  const rec = await prisma.userEmail.findUnique({ where: { email } });
  if (rec) {
    await prisma.verificationCode.deleteMany({ where: { email } });
    await prisma.user.delete({ where: { id: rec.userId } });
    console.log(`deleted ${email}`);
  } else {
    console.log(`not found ${email}`);
  }
}

await prisma.$disconnect();