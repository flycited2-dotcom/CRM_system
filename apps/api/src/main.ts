import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const webOrigin = configService.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: webOrigin,
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CRM API')
    .setDescription('Internal CRM API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(configService.get<string>('API_PORT') ?? 4000);
  await app.listen(port);
}

void bootstrap();
