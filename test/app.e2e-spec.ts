// @ts-nocheck
import { jest, describe, it, beforeEach, afterEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

process.env['JWT_SECRET'] = 'test-jwt-secret-32-chars-minimum!!';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-32-chars-min!';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';

const mockPrisma = {
  $queryRaw: jest.fn().mockResolvedValue([{ result: 1 }]),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  user: { findUnique: jest.fn().mockResolvedValue(null) },
};

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
  });

  afterEach(async () => {
    await app.close();
  });
});
