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
// Por seguridad, volver a ejecutar el seed NO restablece contraseñas ya existentes (salvo SEED_RESET_PASSWORDS=true)
// ni borra marcaciones (los datos de demostración solo se generan con SEED_DEMO_DATA=true).
const resetPasswords = process.env.SEED_RESET_PASSWORDS === 'true';
const demoData = process.env.SEED_DEMO_DATA === 'true';

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
    update: { description: 'Administrador del sistema de asistencia' },
    create: { name: 'administrador', description: 'Administrador del sistema de asistencia' },
  });
  const operatorRole = await prisma.role.upsert({
    where: { name: 'operador' },
    update: { description: 'Encargado de control de personal' },
    create: { name: 'operador', description: 'Encargado de control de personal' },
  });
  const sede = await prisma.sede.upsert({
    where: { id: sedeId },
    update: { nombre: 'Sede Universitaria', name: 'Sede Universitaria', code: 'SEDE_UNI', direccion: 'Av. Venezuela s/n', address: 'Av. Venezuela s/n', estado: true },
    create: { id: sedeId, nombre: 'Sede Universitaria', name: 'Sede Universitaria', code: 'SEDE_UNI', direccion: 'Av. Venezuela s/n', address: 'Av. Venezuela s/n', estado: true },
  });

  const adminName = splitName('Administrador QA Asistencia');
  await prisma.usuario.upsert({
    where: { username: 'admin' },
    update: { ...(resetPasswords ? { password } : {}), status: 'activo', estado: true, role_id: adminRole.id, sede_id: sede.id, nombres: adminName.nombres, apellido_paterno: adminName.apellido_paterno, apellido_materno: adminName.apellido_materno, full_name: 'Administrador QA Asistencia', nombre_completo: 'Administrador QA Asistencia' },
    create: {
      username: 'admin',
      email: 'admin.asistencia@infounsa.local',
      password,
      nombres: adminName.nombres,
      apellido_paterno: adminName.apellido_paterno,
      apellido_materno: adminName.apellido_materno,
      full_name: 'Administrador QA Asistencia',
      nombre_completo: 'Administrador QA Asistencia',
      status: 'activo',
      estado: true,
      role_id: adminRole.id,
      sede_id: sede.id,
    },
  });

  const operatorName = splitName('Operador QA Asistencia');
  await prisma.usuario.upsert({
    where: { username: 'operador_ast' },
    update: { ...(resetPasswords ? { password } : {}), status: 'activo', estado: true, role_id: operatorRole.id, sede_id: sede.id, nombres: operatorName.nombres, apellido_paterno: operatorName.apellido_paterno, apellido_materno: operatorName.apellido_materno, full_name: 'Operador QA Asistencia', nombre_completo: 'Operador QA Asistencia' },
    create: {
      username: 'operador_ast',
      email: 'operador.asistencia@infounsa.local',
      password,
      nombres: operatorName.nombres,
      apellido_paterno: operatorName.apellido_paterno,
      apellido_materno: operatorName.apellido_materno,
      full_name: 'Operador QA Asistencia',
      nombre_completo: 'Operador QA Asistencia',
      status: 'activo',
      estado: true,
      role_id: operatorRole.id,
      sede_id: sede.id,
    },
  });
  await prisma.terminal.upsert({
    where: { id: 'TERM_ENT_A' },
    update: { nombre: 'Lector Entrada QA', name: 'Lector Entrada QA', code: 'TERM_ENT_A', status: 'activo', estado: true, sede_id: sede.id },
    create: { id: 'TERM_ENT_A', nombre: 'Lector Entrada QA', name: 'Lector Entrada QA', code: 'TERM_ENT_A', status: 'activo', estado: true, sede_id: sede.id },
  });
}

async function seedSyncData() {
  await prisma.sede.upsert({
    where: { id: sedeId },
    update: { nombre: 'Sede Universitaria', estado: true },
    create: { id: sedeId, nombre: 'Sede Universitaria', estado: true },
  });
  await prisma.terminal.upsert({
    where: { id: 'TERM-001' },
    update: { sede_id: sedeId, estado: true },
    create: { id: 'TERM-001', sede_id: sedeId, estado: true },
  });

  if (!demoData) {
    console.log('Datos de demostración omitidos (defina SEED_DEMO_DATA=true solo en entornos de prueba).');
    return;
  }

  // Limpiar marcaciones y usuarios de prueba previos (DNI) sin borrar las cuentas
  // administrativas creadas por seedAdminData (admin / operador_ast).
  console.log('Limpiando asistencias y usuarios de prueba anteriores...');
  await prisma.asistencia.deleteMany({});
  await prisma.usuario.deleteMany({ where: { username: null } });

  const sampleUsers = [
    { id: 'USR-001', dni: '70000001', nombres: 'Juan Carlos', apellido_paterno: 'Pérez', apellido_materno: 'Quispe', nombre_completo: 'Pérez Quispe, Juan Carlos', condicion: 'NOMBRADO', cargo: 'DOCENTE_TC' },
    { id: 'USR-002', dni: '70000002', nombres: 'María Elena', apellido_paterno: 'García', apellido_materno: 'López', nombre_completo: 'García López, María Elena', condicion: 'CONTRATADO', cargo: 'PERSONAL_ADMINISTRATIVO' },
    { id: 'USR-003', dni: '70000003', nombres: 'Carlos Alberto', apellido_paterno: 'Flores', apellido_materno: 'Mamani', nombre_completo: 'Flores Mamani, Carlos Alberto', condicion: 'NOMBRADO', cargo: 'DOCENTE_TP' },
    { id: 'USR-004', dni: '70000004', nombres: 'Ana Lucía', apellido_paterno: 'Quispe', apellido_materno: 'Ramos', nombre_completo: 'Quispe Ramos, Ana Lucía', condicion: 'CONTRATADO', cargo: 'PERSONAL_ADMINISTRATIVO' },
    { id: 'USR-005', dni: '70000005', nombres: 'Roberto Luis', apellido_paterno: 'Mendoza', apellido_materno: 'Torres', nombre_completo: 'Mendoza Torres, Roberto Luis', condicion: 'NOMBRADO', cargo: 'JEFE_PRACTICA' },
  ];

  for (const u of sampleUsers) {
    await prisma.usuario.create({
      data: {
        id: u.id,
        dni: u.dni,
        nombres: u.nombres,
        apellido_paterno: u.apellido_paterno,
        apellido_materno: u.apellido_materno,
        nombre_completo: u.nombre_completo,
        condicion: u.condicion,
        cargo: u.cargo,
        estado: true,
      },
    });
  }

  // Generar exactamente 5 entradas a las 07:00 AM del día de hoy
  console.log('Generando 5 marcaciones iniciales de entrada a las 07:00 AM...');
  const todayStr = new Date().toISOString().split('T')[0];

  for (let i = 0; i < sampleUsers.length; i++) {
    const u = sampleUsers[i];
    const secondStr = String(i * 5).padStart(2, '0');
    const entryTime = new Date(`${todayStr}T07:00:${secondStr}.000Z`);

    await prisma.asistencia.create({
      data: {
        id_operacion_local: `seed-entry-${u.id}-${todayStr}`,
        usuario_id: u.id,
        terminal_id: 'TERM-001',
        sede_id: sedeId,
        tipo: 'entrada',
        fecha_hora_marca: entryTime,
        observacion: 'Ingreso regular 07:00 AM',
      },
    });
  }
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
  console.log(
    demoData
      ? 'Seedeo de asistencia completado: usuarios iniciales y 5 entradas de demostración a las 07:00 AM generadas.'
      : 'Seedeo de asistencia completado: roles, sede, terminales y usuarios iniciales (sin datos de demostración).',
  );
}

main()
  .catch((error) => {
    console.error('Asistencia seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
