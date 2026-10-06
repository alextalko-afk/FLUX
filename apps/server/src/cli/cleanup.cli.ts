import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Removes used or expired verification codes and long-signed-out sessions. */
async function main(): Promise<void> {
  const now = new Date();
  const codes = await prisma.verificationCode.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { isUsed: true }] },
  });
  const sessions = await prisma.session.deleteMany({
    where: { isActive: false, lastActiveAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } },
  });
  console.log(`Removed ${codes.count} code(s) and ${sessions.count} old session(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
