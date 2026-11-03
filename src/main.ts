import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  const allowedOrigins = [
    'http://localhost:5173',
    process.env.CORS_ORIGIN,
  ].filter(Boolean) as string[];
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    // The UI reads the download filename from this header.
    exposedHeaders: ['Content-Disposition'],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`M2 Partners API running on port ${port}`);
}
void bootstrap();
