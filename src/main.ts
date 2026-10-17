import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'https://zsparktech.com',
      'https://app.zsparktech.com',
      'https://www.zsparktech.com',
      'http://localhost:5173', // local Vite
      'http://192.168.100.45:5173', // local WAN
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // So SPA blob downloads can read the PDF filename from the response.
    exposedHeaders: ['Content-Disposition', 'X-Download-Filename'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
