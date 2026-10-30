import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.client.category.findMany({ orderBy: { id: 'asc' } });
  }

  async findOne(id: number) {
    const category = await this.prisma.client.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Categoria con ID ${id} no encontrada`);
    }
    return category;
  }

  async create(data: { name: string; description?: string }) {
    return this.prisma.client.category.create({
      data: {
        name: data.name,
        description: data.description,
      },
    });
  }

  async update(id: number, data: { name?: string; description?: string }) {
    const current = await this.findOne(id);
    return this.prisma.client.category.update({
      where: { id },
      data: {
        name: data.name ?? current.name,
        description: data.description !== undefined ? data.description : current.description,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.client.category.delete({ where: { id } });
    return { deleted: true, id };
  }
}
