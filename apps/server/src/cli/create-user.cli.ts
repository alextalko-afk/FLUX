import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

async function main(): Promise<void> {
  const email = getArg('email');
  const password = getArg('password');
  const username = getArg('username');
  const firstName = getArg('first-name') || 'User';
  const lastName = getArg('last-name') || null;
  const pepper = process.env.PASSCODE_PEPPER || '';

  if (!email || !password) {
    console.error('Usage: pnpm cli:user --email=user@example.com --password=StrongPass123! --username=user');
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existingEmail = await prisma.userEmail.findUnique({ where: { email: normalizedEmail } });
  if (existingEmail) {
    console.error(`Email ${normalizedEmail} is already used.`);
    process.exit(1);
  }

  if (username) {
    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      console.error(`Username ${username} is already taken.`);
      process.exit(1);
    }
  }

  const options: any = {
    type: argon2.argon2id,
    memoryCost: Number(process.env.ARGON2_MEMORY_COST || 65536),
    timeCost: Number(process.env.ARGON2_TIME_COST || 3),
    parallelism: Number(process.env.ARGON2_PARALLELISM || 4),
  };

  if (pepper) {
    options.secret = Buffer.from(pepper, 'utf8');
  }

  // ЯВНОЕ ПРЕОБРАЗОВАНИЕ ТИПА ЧЕРЕЗ unknown
  const hash = (await argon2.hash(password, options)) as unknown as string;

  const user = await prisma.user.create({
    data: {
      username: username || null,
      firstName,
      lastName,
      role: UserRole.USER,
      isVerified: true,
      emails: {
        create: { email: normalizedEmail, isPrimary: true, isVerified: true },
      },
      passwordCredential: {
        create: { hash },
      },
    },
  });

  console.log('User created successfully.');
  console.log(`User ID: ${user.id}`);
  console.log(`Email: ${normalizedEmail}`);
  if (username) console.log(`Username: ${username}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });