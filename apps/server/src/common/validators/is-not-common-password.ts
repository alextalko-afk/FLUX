import { registerDecorator, ValidationOptions } from 'class-validator';

/** Passwords that appear at the top of every leaked-password list. Compared case-insensitively. */
const COMMON = new Set(
  [
    'password1', 'password12', 'password123', 'password1234', 'password123!', 'passw0rd', 'p@ssw0rd', 'p@ssword1',
    'qwerty123', 'qwerty1234', 'qwertyuiop1', 'qwerty12345', '1qaz2wsx', '1q2w3e4r', '1q2w3e4r5t', 'zaq12wsx',
    'abc12345', 'abcd1234', 'abcd12345', 'abc123456', 'iloveyou1', 'welcome1', 'welcome123', 'admin123', 'admin1234',
    'letmein123', 'monkey123', 'dragon123', 'football1', 'baseball1', 'master123', 'sunshine1', 'princess1',
    'changeme1', 'changeme123', 'trustno1', 'login123', 'user1234', 'test1234', 'test12345', 'flux1234', 'flux12345',
    '123456789', '1234567890', '12345678', '11111111', '00000000', 'qazwsxedc1', 'privet123', 'parol123', 'qwerty123456',
  ].map((entry) => entry.toLowerCase()),
);

export function isCommonPassword(value: unknown): boolean {
  return typeof value === 'string' && COMMON.has(value.toLowerCase());
}

export function IsNotCommonPassword(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isNotCommonPassword',
      target: object.constructor,
      propertyName,
      options: { message: 'This password is too common. Choose a less guessable one.', ...options },
      validator: { validate: (value: unknown) => !isCommonPassword(value) },
    });
}
