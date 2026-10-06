import { registerDecorator, ValidationOptions } from 'class-validator';
import { toSafeLinkUrl } from '../utils/sanitize-text';

/** Accepts only absolute http(s)/mailto URLs without embedded credentials. */
export function IsSafeLinkUrl(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isSafeLinkUrl',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be an http, https or mailto URL without credentials`,
        ...validationOptions,
      },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && toSafeLinkUrl(value) !== null,
      },
    });
  };
}
