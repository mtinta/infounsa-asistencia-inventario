import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

export interface CreateUserDto {
  username: string;
  email: string;
  password?: string;
  full_name?: string;
  role_id?: number | string;
  sede_id?: number | string;
  status?: string;
}

export interface UpdateUserDto {
  username?: string;
  email?: string;
  password?: string;
  full_name?: string;
  role_id?: number | string;
  sede_id?: number | string;
  status?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.client.usuario.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        dni: true,
        full_name: true,
        nombre_completo: true,
        status: true,
        estado: true,
        role_id: true,
        sede_id: true,
        created_at: true,
      },
      orderBy: { id: 'asc' },
    });
  }

  async findAttendanceUsers() {
    return this.prisma.client.usuario.findMany({
      where: { estado: true },
      orderBy: [
        { apellido_paterno: 'asc' },
        { apellido_materno: 'asc' },
        { nombres: 'asc' },
      ],
    });
  }

  async findOne(id: number | string) {
    const user = await this.prisma.client.usuario.findUnique({
      where: { id: (id as any) },
      select: {
        id: true,
        username: true,
        email: true,
        full_name: true,
        nombre_completo: true,
        status: true,
        role_id: true,
        sede_id: true,
        created_at: true,
        role: {
          select: {
            name: true,
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name || user.nombre_completo,
      status: user.status,
      role_id: user.role_id,
      sede_id: user.sede_id,
      role: user.role?.name || 'usuario',
    };
  }

  async create(data: CreateUserDto) {
    const { username, email, password, full_name, role_id, sede_id, status } = data;
    if (typeof password !== 'string' || password.trim().length < 8) {
      throw new BadRequestException('La contraseña es obligatoria y debe tener al menos 8 caracteres.');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    return this.prisma.client.usuario.create({
      data: {
        username,
        email,
        password: hashedPassword,
        full_name,
        nombre_completo: full_name,
        role_id: role_id ? Number(role_id) : 2, // Default to operador
        sede_id: sede_id ? String(sede_id) : undefined,
        status: status || 'activo',
        estado: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        full_name: true,
        status: true,
        role_id: true,
        sede_id: true,
      },
    });
  }

  async update(id: number | string, data: UpdateUserDto) {
    const current = await this.prisma.client.usuario.findUnique({
      where: { id: String(id) },
      select: {
        id: true,
        username: true,
        email: true,
        password: true,
        full_name: true,
        status: true,
        role_id: true,
        sede_id: true,
      },
    });
    if (!current) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
    const { username, email, password, full_name, status, role_id, sede_id } = data;

    if (password !== undefined && (typeof password !== 'string' || password.trim().length < 8)) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres.');
    }
    const hashedPassword = password === undefined ? current.password : await bcrypt.hash(password, 10);

    return this.prisma.client.usuario.update({
      where: { id: String(id) },
      data: {
        username: username ?? current.username,
        email: email ?? current.email,
        password: hashedPassword,
        full_name: full_name ?? current.full_name,
        nombre_completo: full_name ?? current.full_name,
        status: status ?? current.status,
        role_id: role_id !== undefined ? Number(role_id) : current.role_id,
        sede_id: sede_id !== undefined ? (sede_id ? String(sede_id) : null) : current.sede_id,
      },
      select: {
        id: true,
        username: true,
        email: true,
        full_name: true,
        status: true,
        role_id: true,
        sede_id: true,
      },
    });
  }

  async remove(id: number | string) {
    await this.findOne(id);
    await this.prisma.client.usuario.update({
      where: { id: (id as any) },
      data: { status: 'eliminado', estado: false },
    });
    return { deleted: true, id };
  }
}
