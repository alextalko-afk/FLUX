import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const email = getArg('email')?.toLowerCase().trim();
  const password = getArg('password');
  if (!email || !password || password.length < 8) {
    console.error('Usage: pnpm cli:reset-password --email=user@example.com --password=NewStrongPass123!');
    process.exit(1);
  }

  const record = await prisma.userEmail.findUnique({ where: { email } });
  if (!record) {
    console.error(`No account with email ${email}.`);
    process.exit(1);
  }

  const pepper = process.env.PASSCODE_PEPPER || '';
  const hash = (await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: Number(process.env.ARGON2_MEMORY_COST || 65536),
    timeCost: Number(process.env.ARGON2_TIME_COST || 3),
    parallelism: Number(process.env.ARGON2_PARALLELISM || 4),
    ...(pepper ? { secret: Buffer.from(pepper, 'utf8') } : {}),
  } as any)) as unknown as string;

  await prisma.passwordCredential.upsert({
    where: { userId: record.userId },
    update: { hash },
    create: { userId: record.userId, hash },
  });
  // A reset must also sign the account out everywhere.
  const revoked = await prisma.session.updateMany({
    where: { userId: record.userId, isActive: true },
    data: { isActive: false },
  });
  console.log(`Password reset for ${email}. ${revoked.count} session(s) signed out.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
