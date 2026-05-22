// ============================================
// CodeForge API Gateway — Entry Point
// ============================================
// Bootstraps the NestJS application with security,
// validation, CORS, Swagger, and cookie parsing.

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const helmet = require('helmet');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cookieParser = require('cookie-parser');

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // ── Security ────────────────────────────────
  app.use(helmet());
  app.use(cookieParser());

  // ── CORS ────────────────────────────────────
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Validation ──────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Strip unknown properties
      forbidNonWhitelisted: true, // Throw on unknown properties
      transform: true,           // Auto-transform payloads
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── API Prefix ──────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Swagger Documentation ───────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CodeForge API')
    .setDescription('AI-Powered Realtime Collaborative Cloud IDE API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('workspaces', 'Workspace management')
    .addTag('files', 'File operations')
    .addTag('execution', 'Code execution')
    .addTag('ai', 'AI analysis')
    .addTag('admin', 'Admin analytics')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // ── Start Server ────────────────────────────
  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`🚀 CodeForge API running on http://localhost:${port}`);
  logger.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
