import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma/prisma.service';

@Injectable()
export class TerminalsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const terminals = await this.prisma.client.terminal.findMany({
      include: {
        sede: true,
        _count: {
          select: { asistencias: true },
        },
      },
      orderBy: { id: 'asc' },
    });

    return terminals.map((t) => ({
      id: t.id,
      name: t.name || t.nombre || `Terminal (${t.id})`,
      ip: t.code || t.id,
      sede: t.sede?.nombre || 'Sede Central',
      status: t.estado ? (t.status === 'activo' ? 'ACTIVE' : t.status) : 'INACTIVE',
      total_asistencias: t._count ? t._count.asistencias : 0,
    }));
  }

  async findOne(id: number | string) {
    const terminal = await this.prisma.client.terminal.findUnique({ where: { id: (id as any) } });
    if (!terminal) {
      throw new NotFoundException(`Terminal con ID ${id} no encontrado`);
    }
    return terminal;
  }

  async create(data: { name?: string; nombre?: string; code: string; status?: string; sede_id?: string }) {
    const nombre = data.nombre || data.name || data.code;
    const status = data.status ?? 'activo';
    return this.prisma.client.terminal.create({
      data: {
        id: data.code,
        nombre,
        name: nombre,
        code: data.code,
        sede_id: data.sede_id,
        status,
        estado: status === 'activo',
      },
    });
  }

  async update(id: number | string, data: { name?: string; nombre?: string; code?: string; status?: string; sede_id?: string }) {
    const current = await this.findOne(id);
    const nombre = data.nombre ?? data.name ?? (current as any).name ?? current.nombre;
    const status = data.status ?? current.status;

    return this.prisma.client.terminal.update({
      where: { id: (id as any) },
      data: {
        nombre,
        name: nombre,
        code: data.code ?? current.code,
        sede_id: data.sede_id ?? current.sede_id,
        status,
        estado: status === 'activo',
      },
    });
  }

  async remove(id: number | string) {
    await this.findOne(id);
    await this.prisma.client.terminal.delete({ where: { id: (id as any) } });
    return { deleted: true, id };
  }
}
