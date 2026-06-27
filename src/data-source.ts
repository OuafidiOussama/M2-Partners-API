import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
const isProduction = !!databaseUrl;

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(databaseUrl
    ? { url: databaseUrl }
    : {
        host: process.env.DB_HOST,
        port: +(process.env.DB_PORT ?? '5432'),
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
      }),
  ssl: isProduction,
  extra: isProduction ? { ssl: { rejectUnauthorized: false } } : {},
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
