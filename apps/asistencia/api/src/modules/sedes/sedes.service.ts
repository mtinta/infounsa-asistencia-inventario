import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma/prisma.service';

@Injectable()
export class SedesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.client.sede.findMany({ orderBy: { id: 'asc' } });
  }

  async findOne(id: number | string) {
    const sede = await this.prisma.client.sede.findUnique({ where: { id: (id as any) } });
    if (!sede) {
      throw new NotFoundException(`Sede con ID ${id} no encontrada`);
    }
    return sede;
  }

  async create(data: { name?: string; nombre?: string; code: string; address?: string; direccion?: string }) {
    const nombre = data.nombre || data.name || 'Sede Sin Nombre';
    const address = data.address || data.direccion;
    return this.prisma.client.sede.create({
      data: {
        nombre,
        name: nombre,
        code: data.code,
        address,
        direccion: address,
        estado: true,
      },
    });
  }

  async update(id: number | string, data: { name?: string; nombre?: string; code?: string; address?: string; direccion?: string }) {
    const current = await this.findOne(id);
    const nombre = data.nombre ?? data.name ?? (current as any).name ?? current.nombre;
    const address = data.address !== undefined ? data.address : (data.direccion !== undefined ? data.direccion : (current as any).address);

    return this.prisma.client.sede.update({
      where: { id: (id as any) },
      data: {
        nombre,
        name: nombre,
        code: data.code ?? current.code,
        address,
        direccion: address,
      },
    });
  }

  async remove(id: number | string) {
    await this.findOne(id);
    await this.prisma.client.sede.delete({ where: { id: (id as any) } });
    return { deleted: true };
  }
}
