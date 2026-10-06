import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsAdapter } from '@nestjs/platform-ws';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * Normalizes an API prefix so that `setGlobalPrefix` never produces a
 * double slash (e.g. `"/api/v1"` or `"api/v1/"` both become `"api/v1"`).
 */
function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+/, '').replace(/\/+$/, '');
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Route all Nest + HTTP logs through pino.
  app.useLogger(app.get(PinoLogger));

  const configService = app.get(ConfigService);

  const port = Number(configService.get<string>('PORT') ?? 3000) || 3000;
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  const apiPrefix = normalizePrefix(configService.get<string>('API_PREFIX') ?? 'api/v1') || 'api/v1';

  // Security headers.
  //
  // `crossOriginResourcePolicy` is relaxed to `cross-origin` so that media
  // proxied through this backend can be embedded by the SPA.
  //
  // The CSP is deliberately strict: this process only ever answers with JSON,
  // never with HTML, so it has no reason to load or execute anything. The SPA
  // itself is served by nginx (or the Vite dev server) and carries its own
  // policy. Previously the CSP was disabled outright, which left API responses
  // with no protection at all.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'none'"],
          'frame-ancestors': ["'none'"],
          'sandbox': [],
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // Behind nginx every request would otherwise appear to come from the proxy,
  // which collapses all per-IP rate limits into one shared bucket. Set
  // TRUST_PROXY to the number of reverse proxies in front of the API (0 = none).
  const trustProxyHops = Number(configService.get<string>('TRUST_PROXY') ?? 0) || 0;
  if (trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  }

  app.use(cookieParser());

  // The realtime layer uses the `ws` adapter (raw WebSocket, path-based
  // routing) which matches the RealtimeGateway / CallsGateway implementations.
  app.useWebSocketAdapter(new WsAdapter(app));

  app.enableCors({
    origin: frontendUrl
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    credentials: true,
    // `X-CSRF-Token` must be allowed explicitly: sending it from the SPA makes
    // the request non-simple, so the browser runs a preflight.
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count'],
    maxAge: 600,
  });

  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  // Allows Prisma / Redis / BullMQ to close their connections on SIGTERM.
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  Logger.log(
    `FLUX server listening on http://localhost:${port}/${apiPrefix}`,
    'Bootstrap',
  );
}

void bootstrap();
