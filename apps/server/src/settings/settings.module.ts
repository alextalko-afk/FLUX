import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { MaintenanceMiddleware } from './maintenance.middleware';

@Global()
@Module({
  providers: [SettingsService, MaintenanceMiddleware],
  exports: [SettingsService, MaintenanceMiddleware],
})
export class SettingsModule {}
