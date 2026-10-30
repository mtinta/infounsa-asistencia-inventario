import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './src/generated/prisma/client';
import { getMysqlConnectionOptions } from './src/common/database/mysql-connection';

const connectionString = process.env.DATABASE_URL || process.env.ASISTENCIA_DATABASE_URL;

if (!connectionString?.trim()) {
  throw new Error('DATABASE_URL o ASISTENCIA_DATABASE_URL es requerido para el seed de Asistencia.');
}

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(getMysqlConnectionOptions(connectionString)) });

async function main() {
  console.log('Seeding database...');

  const sede = await prisma.sede.upsert({
    where: { id: '84c8a8ca-8ea4-41e9-add6-2b077bcd701a' },
    update: {},
    create: {
      id: '84c8a8ca-8ea4-41e9-add6-2b077bcd701a',
      nombre: 'Sede Central',
      estado: true,
    },
  });
  console.log('Sede upserted:', sede);

  const terminal = await prisma.terminal.upsert({
    where: { id: 'TERM-001' },
    update: {},
    create: {
      id: 'TERM-001',
      sede_id: '84c8a8ca-8ea4-41e9-add6-2b077bcd701a',
      estado: true,
    },
  });
  console.log('Terminal upserted:', terminal);

  const usuario = await prisma.usuario.upsert({
    where: { id: 'USR-101' },
    update: {},
    create: {
      id: 'USR-101',
      dni: '123456789',
      nombre_completo: 'Juan Perez',
      estado: true,
    },
  });
  console.log('Usuario upserted:', usuario);

  console.log('Database seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
