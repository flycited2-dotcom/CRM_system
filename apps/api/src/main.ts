import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const webOrigin = configService.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';

  // The API sits behind reverse proxies; without this, request.ip (audit log,
  // login throttling) would be the proxy address instead of the client address.
  const trustProxyHops = Number(configService.get<string>('TRUST_PROXY_HOPS') ?? 1);
  app.set('trust proxy', Number.isFinite(trustProxyHops) ? trustProxyHops : 1);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: webOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  // The API map is internal: publish it in production only when asked explicitly.
  const swaggerEnabled =
    configService.get<string>('SWAGGER_ENABLED') === 'true' || process.env.NODE_ENV !== 'production';

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CRM API')
      .setDescription('Internal CRM API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(configService.get<string>('API_PORT') ?? 4000);
  await app.listen(port);
}

void bootstrap();
