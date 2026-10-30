import "dotenv/config";
import { defineConfig } from "prisma/config";

// Durante `pnpm install` (postinstall: prisma generate) aun no existe el .env; generar el cliente no
// necesita conexion, por eso hay un valor por defecto. Los comandos que si se conectan usan DATABASE_URL del .env.
const databaseUrl =
  process.env["DATABASE_URL"] ||
  process.env["INVENTARIO_DATABASE_URL"] ||
  "mysql://root:password@localhost:3306/infounsa_inventario";

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
