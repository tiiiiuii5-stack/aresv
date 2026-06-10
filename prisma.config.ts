import { defineConfig } from "prisma/config";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const runtimeDatabaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://app_builder:app_builder@localhost:5432/app_builder";
const migrationDatabaseUrl = process.env.DIRECT_URL || runtimeDatabaseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: migrationDatabaseUrl
  }
});
