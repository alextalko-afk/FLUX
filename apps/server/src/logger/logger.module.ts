import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: {
          target: 'pino-pretty',
          options: {
            singleLine: true,
          },
        },
        autoLogging: {
          ignore: (req) => req.url === '/api/v1/health',
        },
      },
    }),
  ],
})
export class LoggerModule {}
