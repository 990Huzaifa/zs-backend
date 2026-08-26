import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from './src/config/database.config';

loadEnv();

export default new DataSource(buildDatabaseOptions());
