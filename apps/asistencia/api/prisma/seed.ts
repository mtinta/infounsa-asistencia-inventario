import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '../src/generated/prisma/client';
import { getMysqlConnectionOptions } from '../src/common/database/mysql-connection';

dotenv.config();

function getSeedConnectionOptions() {
  const rawConnectionString = process.env.DATABASE_URL || process.env.ASISTENCIA_DATABASE_URL;

  if (!rawConnectionString?.trim()) {
    throw new Error('DATABASE_URL o ASISTENCIA_DATABASE_URL es requerido para el seed de Asistencia.');
  }

  return getMysqlConnectionOptions(rawConnectionString);
}

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(getSeedConnectionOptions()) });
const sedeId = '84c8a8ca-8ea4-41e9-add6-2b077bcd701a';
// Por seguridad, volver a ejecutar el seed NO restablece contraseñas ya existentes (salvo SEED_RESET_PASSWORDS=true).
// Si los registros ya existen (por ejemplo, tras migrar una version anterior) NO se modifican.
// El seed nunca crea ni borra marcaciones: solo deja los datos base (roles, sede, terminal y usuarios iniciales).
const resetPasswords = process.env.SEED_RESET_PASSWORDS === 'true';

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
  throw new Error('Demo seed is disabled in production. Set ALLOW_DEMO_SEED=true only for an approved test environment.');
}

function splitName(fullName: string) {
  if (!fullName) return { nombres: '', apellido_paterno: '', apellido_materno: '' };
  if (fullName.includes(',')) {
    const [apellidosPart, nombresPart] = fullName.split(',').map((s) => s.trim());
    const apParts = apellidosPart.split(/\s+/);
    return {
      nombres: nombresPart || '',
      apellido_paterno: apParts[0] || '',
      apellido_materno: apParts.slice(1).join(' ') || '',
    };
  }
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) {
    return { nombres: parts[0] || '', apellido_paterno: '', apellido_materno: '' };
  }
  if (parts.length === 2) {
    return { nombres: parts[0], apellido_paterno: parts[1], apellido_materno: '' };
  }
  return {
    nombres: parts.slice(2).join(' ') || parts[0],
    apellido_paterno: parts[0],
    apellido_materno: parts[1],
  };
}

async function seedAdminData(password: string) {
  const adminRole = await prisma.role.upsert({
    where: { name: 'administrador' },
    update: {},
    create: { name: 'administrador', description: 'Administrador del sistema de asistencia' },
  });
  const operatorRole = await prisma.role.upsert({
    where: { name: 'operador' },
    update: {},
    create: { name: 'operador', description: 'Encargado de control de personal' },
  });
  const sede = await prisma.sede.upsert({
    where: { id: sedeId },
    update: {},
    create: { id: sedeId, nombre: 'Sede Universitaria', name: 'Sede Universitaria', code: 'SEDE_UNI', direccion: 'Av. Venezuela s/n', address: 'Av. Venezuela s/n', estado: true },
  });

  const adminName = splitName('Administrador');
  await prisma.usuario.upsert({
    where: { username: 'admin' },
    update: { ...(resetPasswords ? { password } : {}), status: 'activo', estado: true, role_id: adminRole.id },
    create: {
      username: 'admin',
      email: 'admin.asistencia@infounsa.local',
      password,
      nombres: adminName.nombres,
      apellido_paterno: adminName.apellido_paterno,
      apellido_materno: adminName.apellido_materno,
      full_name: 'Administrador',
      nombre_completo: 'Administrador',
      status: 'activo',
      estado: true,
      role_id: adminRole.id,
      sede_id: sede.id,
    },
  });

  const operatorName = splitName('Operador');
  await prisma.usuario.upsert({
    where: { username: 'operador_ast' },
    update: { ...(resetPasswords ? { password } : {}), status: 'activo', estado: true, role_id: operatorRole.id },
    create: {
      username: 'operador_ast',
      email: 'operador.asistencia@infounsa.local',
      password,
      nombres: operatorName.nombres,
      apellido_paterno: operatorName.apellido_paterno,
      apellido_materno: operatorName.apellido_materno,
      full_name: 'Operador',
      nombre_completo: 'Operador',
      status: 'activo',
      estado: true,
      role_id: operatorRole.id,
      sede_id: sede.id,
    },
  });
  await prisma.terminal.upsert({
    where: { id: 'TERM_ENT_A' },
    update: {},
    create: { id: 'TERM_ENT_A', nombre: 'Lector de Entrada', name: 'Lector de Entrada', code: 'TERM_ENT_A', status: 'activo', estado: true, sede_id: sede.id },
  });
}

async function seedSyncData() {
  await prisma.sede.upsert({
    where: { id: sedeId },
    update: {},
    create: { id: sedeId, nombre: 'Sede Universitaria', estado: true },
  });
  await prisma.terminal.upsert({
    where: { id: 'TERM-001' },
    update: {},
    create: { id: 'TERM-001', sede_id: sedeId, estado: true },
  });
}

const DEFAULT_SEED_PASSWORD = 'admin123';

async function main() {
  await prisma.$connect();
  // Contraseña por defecto de la entrega: admin / admin123. Cámbiala tras el primer inicio de sesión
  // o define SEED_ADMIN_PASSWORD (mínimo 8 caracteres) para usar otra.
  const seedPassword = process.env.SEED_ADMIN_PASSWORD?.trim() || DEFAULT_SEED_PASSWORD;
  if (seedPassword.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 8 caracteres para ejecutar el seed de Asistencia.');
  }
  const password = await bcrypt.hash(seedPassword, 10);
  await seedAdminData(password);
  await seedSyncData();
  console.log('Seedeo de asistencia completado: roles, sede, terminales y usuarios iniciales (no se crean marcaciones).');
}

main()
  .catch((error) => {
    console.error('Asistencia seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
