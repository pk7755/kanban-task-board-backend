import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { RolesGuard } from './common/guards/roles.guard.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(helmet());

  const corsOrigins = configService.get<string>(
    'CORS_ORIGINS',
    'http://localhost:5173',
  );
  app.enableCors({
    origin: corsOrigins.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const reflector = app.get(Reflector);
  app.useGlobalGuards(new RolesGuard(reflector));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Kanban Task Board API')
    .setDescription('REST API for a Kanban-style project tracking application')
    .setVersion('1.0')
    .addBearerAuth()
    .addServer(`http://localhost:${configService.get<number>('PORT', 3000)}`)
    .addServer(configService.get<string>('NGROK_URL') || '')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}

void bootstrap();
