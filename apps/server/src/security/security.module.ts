import { Global, Module } from '@nestjs/common';
import { CsrfService } from './csrf.service';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

/**
 * Security primitives that are not tied to a single feature module.
 *
 * `CsrfService` is global so that any controller can issue or verify a token
 * without importing a local module; `CsrfGuard` is not registered globally
 * because it is applied selectively to the cookie-authenticated routes.
 * `DevicesService` holds the public keys behind end-to-end encrypted chats.
 */
@Global()
@Module({
  controllers: [DevicesController],
  providers: [CsrfService, DevicesService],
  exports: [CsrfService, DevicesService],
})
export class SecurityModule {}
