import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { SettingsModule } from './settings/settings.module';
import { MetricsModule } from './metrics/metrics.module';
import { MaintenanceMiddleware } from './settings/maintenance.middleware';
import configuration from './config/configuration';
import { validate } from './config/validation';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ContactsModule } from './contacts/contacts.module';
import { ChatsModule } from './chats/chats.module';
import { MessagesModule } from './messages/messages.module';
import { StoriesModule } from './stories/stories.module';
import { SecurityModule } from './security/security.module';
import { MediaModule } from './media/media.module';
import { CallsModule } from './calls/calls.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SearchModule } from './search/search.module';
import { TranslateModule } from './translate/translate.module';
import { LinkPreviewModule } from './link-preview/link-preview.module';
import { BotsModule } from './bots/bots.module';
import { AdminModule } from './admin/admin.module';
import { FilesModule } from './files/files.module';
import { PresenceModule } from './presence/presence.module';
import { PrivacyModule } from './privacy/privacy.module';
import { AuditModule } from './audit/audit.module';
import { LoggerModule } from './logger/logger.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
      // The server runs from `apps/server`, the project-wide file lives at the
      // repository root. Earlier files win, so a value set in `apps/server/.env`
      // overrides the root one and anything it does not define falls through.
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    RedisModule,
    SettingsModule,
    MetricsModule,
    RateLimitModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('redis.url') },
      }),
    }),
    LoggerModule,
    PrivacyModule,
    AuditModule,
    AuthModule,
    UsersModule,
    ContactsModule,
    ChatsModule,
    MessagesModule,
    StoriesModule,
    SecurityModule,
    MediaModule,
    CallsModule,
    NotificationsModule,
    SearchModule,
    LinkPreviewModule,
    TranslateModule,
    BotsModule,
    AdminModule,
    FilesModule,
    PresenceModule,
    RealtimeModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MaintenanceMiddleware).forRoutes('*');
  }
}
