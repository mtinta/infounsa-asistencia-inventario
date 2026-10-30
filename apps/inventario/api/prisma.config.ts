import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env["DATABASE_URL"] || process.env["INVENTARIO_DATABASE_URL"];

if (!databaseUrl?.trim()) {
  throw new Error("DATABASE_URL o INVENTARIO_DATABASE_URL es requerido para Prisma Inventario.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
