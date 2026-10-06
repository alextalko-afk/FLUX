import { Global, Module } from '@nestjs/common';
import { PrivacyService } from './privacy.service';

/**
 * Global so privacy checks can be injected from any feature module without
 * wiring an edge for every consumer.
 */
@Global()
@Module({
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
