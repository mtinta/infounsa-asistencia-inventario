import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAreaDto {
  name: string;
  responsable?: string;
  description?: string;
}

export interface UpdateAreaDto {
  name?: string;
  responsable?: string;
  description?: string;
}

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.client.area.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const area = await this.prisma.client.area.findUnique({
      where: { id },
    });
    if (!area) {
      throw new NotFoundException(`Área con ID ${id} no encontrada`);
    }
    return area;
  }

  async create(data: CreateAreaDto) {
    const { name, responsable } = data;
    return this.prisma.client.area.create({
      data: {
        name,
        responsable,
      },
    });
  }

  async update(id: number, data: UpdateAreaDto) {
    await this.findOne(id);
    const { name, responsable } = data;
    return this.prisma.client.area.update({
      where: { id },
      data: {
        name,
        responsable,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.client.area.delete({
      where: { id },
    });
  }
}
