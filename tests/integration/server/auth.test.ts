import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

describe('Auth service', () => {
  let testUserId: string;
  let testEmail: string;

  beforeAll(async () => {
    testEmail = `unit-test-${Date.now()}@example.com`;
    const hash = await argon2.hash('Test1234!', {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await prisma.user.create({
      data: {
        firstName: 'Unit',
        lastName: 'Test',
        emails: {
          create: {
            email: testEmail,
            isPrimary: true,
            isVerified: true,
          },
        },
        passwordCredential: {
          create: { hash },
        },
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: testUserId } });
  });

  it('should create user with hashed password', async () => {
    const user = await prisma.user.findUnique({
      where: { id: testUserId },
      include: { passwordCredential: true, emails: true },
    });

    expect(user).not.toBeNull();
    expect(user?.passwordCredential?.hash).toBeTruthy();
    expect(user?.emails[0]?.email).toBe(testEmail);
  });

  it('should verify password correctly', async () => {
    const user = await prisma.user.findUnique({
      where: { id: testUserId },
      include: { passwordCredential: true },
    });

    const isValid = await argon2.verify(user!.passwordCredential!.hash, 'Test1234!');
    expect(isValid).toBe(true);

    const isInvalid = await argon2.verify(user!.passwordCredential!.hash, 'WrongPass1');
    expect(isInvalid).toBe(false);
  });

  it('should not allow duplicate emails', async () => {
    await expect(
      prisma.userEmail.create({
        data: {
          userId: testUserId,
          email: testEmail,
          isPrimary: false,
          isVerified: false,
        },
      }),
    ).rejects.toThrow();
  });
});
