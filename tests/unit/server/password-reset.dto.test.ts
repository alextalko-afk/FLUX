import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
} from '../../../apps/server/src/auth/dto/auth.dto';

async function validateDto<T extends object>(cls: new () => T, payload: Record<string, unknown>) {
  return validate(plainToInstance(cls, payload));
}

describe('password reset DTOs', () => {
  it('accepts a well-formed reset request', async () => {
    const errors = await validateDto(ResetPasswordDto, {
      email: 'user@example.com',
      code: '123456',
      password: 'Passw0rdX',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a code that is not exactly six characters', async () => {
    expect(
      await validateDto(ResetPasswordDto, {
        email: 'user@example.com',
        code: '12345',
        password: 'Passw0rdX',
      }),
    ).not.toHaveLength(0);
  });

  it('rejects weak passwords (no digit / no uppercase / too short)', async () => {
    const cases = ['password', 'PASSWORD1', 'Pw1', 'passw0rd'];
    for (const password of cases) {
      const errors = await validateDto(ResetPasswordDto, {
        email: 'user@example.com',
        code: '123456',
        password,
      });
      expect(errors.length, `expected "${password}" to be rejected`).toBeGreaterThan(0);
    }
  });

  it('rejects a malformed email on both DTOs', async () => {
    expect(
      await validateDto(ForgotPasswordDto, { email: 'not-an-email' }),
    ).not.toHaveLength(0);
    expect(
      await validateDto(ResetPasswordDto, {
        email: 'not-an-email',
        code: '123456',
        password: 'Passw0rdX',
      }),
    ).not.toHaveLength(0);
  });
});
