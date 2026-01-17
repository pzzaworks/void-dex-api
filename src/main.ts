import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Graceful shutdown - port'u düzgün serbest bırak
  app.enableShutdownHooks();

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : ['http://localhost:3012', 'http://127.0.0.1:3012'];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('VoidDex API')
    .setDescription('PrivacyFi Aggregator - Privacy routing for DeFi')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('privacy', 'Privacy routing endpoints')
    .addTag('protocols', 'Protocol information')
    .addTag('transactions', 'Transaction management')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.API_PORT || 3013;
  await app.listen(port);

  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   ██╗   ██╗ ██████╗ ██╗██████╗     ██████╗ ███████╗██╗  ██╗║
  ║   ██║   ██║██╔═══██╗██║██╔══██╗    ██╔══██╗██╔════╝╚██╗██╔╝║
  ║   ██║   ██║██║   ██║██║██║  ██║    ██║  ██║█████╗   ╚███╔╝ ║
  ║   ╚██╗ ██╔╝██║   ██║██║██║  ██║    ██║  ██║██╔══╝   ██╔██╗ ║
  ║    ╚████╔╝ ╚██████╔╝██║██████╔╝    ██████╔╝███████╗██╔╝ ██╗║
  ║     ╚═══╝   ╚═════╝ ╚═╝╚═════╝     ╚═════╝ ╚══════╝╚═╝  ╚═╝║
  ║                                                           ║
  ║   PrivacyFi Aggregator API                                ║
  ║   Running on: http://localhost:${port}                      ║
  ║   Swagger:    http://localhost:${port}/docs                 ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
