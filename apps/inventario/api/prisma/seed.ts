import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';
import { getMysqlConnectionOptions } from '../src/config/mysql-connection';

dotenv.config();

function getSeedConnectionOptions() {
  const rawConnectionString = process.env.DATABASE_URL || process.env.INVENTARIO_DATABASE_URL;

  if (!rawConnectionString?.trim()) {
    throw new Error('DATABASE_URL o INVENTARIO_DATABASE_URL es requerido para el seed de Inventario.');
  }

  return getMysqlConnectionOptions(rawConnectionString);
}

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(getSeedConnectionOptions()) });

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
  throw new Error('Demo seed is disabled in production. Set ALLOW_DEMO_SEED=true only for an approved test environment.');
}

// Volver a ejecutar el seed NO restablece contraseñas existentes (salvo SEED_RESET_PASSWORDS=true).
const resetPasswords = process.env.SEED_RESET_PASSWORDS === 'true';

async function seedUsers(password: string) {
  const users = [
    {
      username: 'admin',
      email: 'admin.inventario@infounsa.local',
      full_name: 'Administrador QA Inventario',
      role: 'administrador',
    },
    {
      username: 'almacenero',
      email: 'almacenero@infounsa.local',
      full_name: 'Almacenero QA Inventario',
      role: 'operador',
    },
  ];
  for (const user of users) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: { ...(resetPasswords ? { password } : {}), status: 'activo', role: user.role },
      create: { ...user, password, status: 'activo' },
    });
  }
}

async function seedCatalog() {
  const categories = [
    { name: 'Equipos de computo', description: 'Equipos y perifericos para oficinas y laboratorios.' },
    { name: 'Material de oficina', description: 'Utiles y consumibles administrativos.' },
    { name: 'Limpieza', description: 'Insumos para mantenimiento de sedes.' },
  ];
  const categoryIds = new Map<string, number>();
  for (const category of categories) {
    const saved = await prisma.category.upsert({
      where: { name: category.name },
      update: { description: category.description },
      create: category,
    });
    categoryIds.set(category.name, saved.id);
  }

  const items = [
    { barcode: '7750000000011', name: 'Laptop QA', description: 'Equipo de demostracion', quantity: 8, min_stock: 2, unit: 'unidad', category: 'Equipos de computo' },
    { barcode: '7750000000028', name: 'Papel bond A4 QA', description: 'Millar para pruebas de movimiento', quantity: 20, min_stock: 5, unit: 'millar', category: 'Material de oficina' },
    { barcode: '7750000000035', name: 'Desinfectante QA', description: 'Insumo con alerta de stock', quantity: 3, min_stock: 5, unit: 'galon', category: 'Limpieza' },
  ];
  for (const item of items) {
    await prisma.inventoryItem.upsert({
      where: { barcode: item.barcode },
      update: {
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        min_stock: item.min_stock,
        unit: item.unit,
        category_id: categoryIds.get(item.category),
        status: 'activo',
      },
      create: {
        barcode: item.barcode,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        min_stock: item.min_stock,
        unit: item.unit,
        category_id: categoryIds.get(item.category),
        sede_id: 1,
        status: 'activo',
      },
    });
  }
}

async function seedAreas() {
  const areas = [
    { name: 'Dirección', responsable: 'Director General' },
    { name: 'Administración', responsable: 'Jefe de Administración' },
    { name: 'Biblioteca', responsable: 'Encargado de Biblioteca' },
    { name: 'Laboratorio A', responsable: 'Coordinador Laboratorio A' },
    { name: 'Laboratorio B', responsable: 'Coordinador Laboratorio B' },
    { name: 'Aulas', responsable: 'Supervisor de Aulas' },
    { name: 'Departamento de Desarrollo', responsable: 'Jefe de Desarrollo' },
    { name: 'Mesa de Partes', responsable: 'Encargado de Mesa de Partes' },
  ];
  for (const area of areas) {
    await prisma.area.upsert({
      where: { name: area.name },
      update: { responsable: area.responsable },
      create: area,
    });
  }
}

async function seedMovements() {
  const laptop = await prisma.inventoryItem.findUnique({ where: { barcode: '7750000000011' } });
  const papel = await prisma.inventoryItem.findUnique({ where: { barcode: '7750000000028' } });
  const desinfectante = await prisma.inventoryItem.findUnique({ where: { barcode: '7750000000035' } });
  const user = await prisma.user.findUnique({ where: { username: 'admin' } });
  const areas = await prisma.area.findMany();

  if (laptop && papel && desinfectante && user && areas.length > 0) {
    console.log('Simulating 15 days of inventory movements...');
    const today = new Date();

    // Base initial stock loads
    const baseMovements = [
      {
        item_id: laptop.id,
        type: 'entrada',
        quantity: 10,
        user_id: user.id,
        area_id: null,
        destinatario_name: null,
        registered_at: new Date(today.getTime() - 3600000 * 24 * 16),
        id_operacion_local: 'seed-op-base-1',
        sync_status: 'sincronizado',
        observations: 'Carga inicial de inventario Laptop QA.',
      },
      {
        item_id: papel.id,
        type: 'entrada',
        quantity: 50,
        user_id: user.id,
        area_id: null,
        destinatario_name: null,
        registered_at: new Date(today.getTime() - 3600000 * 24 * 16),
        id_operacion_local: 'seed-op-base-2',
        sync_status: 'sincronizado',
        observations: 'Abastecimiento inicial Papel bond QA.',
      },
      {
        item_id: desinfectante.id,
        type: 'entrada',
        quantity: 10,
        user_id: user.id,
        area_id: null,
        destinatario_name: null,
        registered_at: new Date(today.getTime() - 3600000 * 24 * 16),
        id_operacion_local: 'seed-op-base-3',
        sync_status: 'sincronizado',
        observations: 'Abastecimiento inicial Desinfectante QA.',
      }
    ];

    for (const bm of baseMovements) {
      await prisma.inventoryMovement.upsert({
        where: { id_operacion_local: bm.id_operacion_local },
        update: {},
        create: bm,
      });
    }

    // Simulate 15 days of entries/exits/office transfers
    for (let i = 0; i < 15; i++) {
      const currentDate = new Date(today);
      currentDate.setDate(today.getDate() - i);
      const dateStr = currentDate.toISOString().split('T')[0];

      // Laptop allocation to office
      if (Math.random() > 0.5) {
        const destArea = areas[Math.floor(Math.random() * areas.length)];
        await prisma.inventoryMovement.upsert({
          where: { id_operacion_local: `sim-inv-mv-laptop-${dateStr}` },
          update: {},
          create: {
            item_id: laptop.id,
            type: 'salida',
            quantity: 1,
            user_id: user.id,
            area_id: destArea.id,
            destinatario_name: `${destArea.name} - ${destArea.responsable}`,
            registered_at: new Date(`${dateStr}T10:30:00.000Z`),
            id_operacion_local: `sim-inv-mv-laptop-${dateStr}`,
            sync_status: 'sincronizado',
            observations: `Traslado de Laptop a oficina de ${destArea.name}.`,
          }
        });
      }

      // Paper transfer to office
      if (Math.random() > 0.3) {
        const destArea = areas[Math.floor(Math.random() * areas.length)];
        await prisma.inventoryMovement.upsert({
          where: { id_operacion_local: `sim-inv-mv-papel-${dateStr}` },
          update: {},
          create: {
            item_id: papel.id,
            type: 'salida',
            quantity: Math.floor(Math.random() * 3) + 1,
            user_id: user.id,
            area_id: destArea.id,
            destinatario_name: `${destArea.name} - ${destArea.responsable}`,
            registered_at: new Date(`${dateStr}T14:15:00.000Z`),
            id_operacion_local: `sim-inv-mv-papel-${dateStr}`,
            sync_status: 'sincronizado',
            observations: `Entrega de insumos de escritorio a ${destArea.name}.`,
          }
        });
      }

      // Supplies restock (entrada)
      if (Math.random() > 0.7) {
        await prisma.inventoryMovement.upsert({
          where: { id_operacion_local: `sim-inv-mv-restock-${dateStr}` },
          update: {},
          create: {
            item_id: desinfectante.id,
            type: 'entrada',
            quantity: 5,
            user_id: user.id,
            area_id: null,
            destinatario_name: null,
            registered_at: new Date(`${dateStr}T09:00:00.000Z`),
            id_operacion_local: `sim-inv-mv-restock-${dateStr}`,
            sync_status: 'sincronizado',
            observations: `Compra y reposición de desinfectantes en almacén.`,
          }
        });
      }
    }
  }
}

const DEFAULT_SEED_PASSWORD = 'admin123';

async function main() {
  await prisma.$connect();
  // Contraseña por defecto de la entrega: admin / admin123. Cámbiala tras el primer inicio de sesión
  // o define SEED_ADMIN_PASSWORD (mínimo 8 caracteres) para usar otra.
  const seedPassword = process.env.SEED_ADMIN_PASSWORD?.trim() || DEFAULT_SEED_PASSWORD;
  if (seedPassword.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 8 caracteres para ejecutar el seed de Inventario.');
  }
  const password = await bcrypt.hash(seedPassword, 10);
  await seedUsers(password);
  // seedCatalog, seedAreas, and seedMovements deactivated to preserve user data modifications
  console.log('Inventario seed ready: admin and almacenero users loaded.');
}

main()
  .catch((error) => {
    console.error('Inventario seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
