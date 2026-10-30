import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

export interface CreateUserDto {
  username: string;
  email: string;
  password?: string;
  full_name?: string;
  role?: string;
  status?: string;
}

export interface UpdateUserDto {
  username?: string;
  email?: string;
  password?: string;
  full_name?: string;
  role?: string;
  status?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.client.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        full_name: true,
        role: true,
        status: true,
        created_at: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    const user = await this.prisma.client.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        full_name: true,
        role: true,
        status: true,
        created_at: true,
      },
    });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      status: user.status,
      created_at: user.created_at,
    };
  }

  async create(data: CreateUserDto) {
    const { username, email, password, full_name, role, status } = data;
    if (typeof password !== 'string' || password.trim().length < 8) {
      throw new BadRequestException('La contraseña es obligatoria y debe tener al menos 8 caracteres.');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    return this.prisma.client.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        full_name,
        role: role || 'operador',
        status: status || 'activo',
      },
      select: {
        id: true,
        username: true,
        email: true,
        full_name: true,
        role: true,
        status: true,
      },
    });
  }

  async update(id: number, data: UpdateUserDto) {
    const current = await this.prisma.client.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        password: true,
        full_name: true,
        role: true,
        status: true,
      },
    });
    if (!current) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
    const { username, email, password, full_name, status, role } = data;

    if (password !== undefined && (typeof password !== 'string' || password.trim().length < 8)) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres.');
    }
    const hashedPassword = password === undefined ? current.password : await bcrypt.hash(password, 10);

    return this.prisma.client.user.update({
      where: { id },
      data: {
        username: username ?? current.username,
        email: email ?? current.email,
        password: hashedPassword,
        full_name: full_name ?? current.full_name,
        status: status ?? current.status,
        role: role ?? current.role,
      },
      select: {
        id: true,
        username: true,
        email: true,
        full_name: true,
        role: true,
        status: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.client.user.delete({
      where: { id },
      select: {
        id: true,
        username: true,
      },
    });
  }
}
