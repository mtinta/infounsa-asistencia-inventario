import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const { username, password } = loginDto;
    const user = await this.prisma.client.user.findUnique({ where: { username } });

    if (!user) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (user.status !== 'activo') {
      throw new UnauthorizedException('El usuario esta inactivo o eliminado');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      subsystem: 'inventario',
    };

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: this.jwtService.sign(payload, { expiresIn: '7d' }),
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    const { fullName, email, username, password } = registerDto;

    const existingUsername = await this.prisma.client.user.findUnique({ where: { username } });
    if (existingUsername) {
      throw new ConflictException('El nombre de usuario ya esta en uso');
    }

    const existingEmail = await this.prisma.client.user.findUnique({ where: { email } });
    if (existingEmail) {
      throw new ConflictException('El correo electronico ya esta registrado');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await this.prisma.client.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        full_name: fullName,
        role: 'operador',
        status: 'activo',
      },
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

    return {
      message: 'Operador de almacen registrado exitosamente',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role,
        status: newUser.status,
      },
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      if (payload.subsystem !== 'inventario') {
        throw new UnauthorizedException('Token de refresco invalido');
      }

      const userId = Number(payload.sub);
      if (!Number.isInteger(userId)) {
        throw new UnauthorizedException('Token de refresco invalido');
      }

      const user = await this.prisma.client.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          role: true,
          status: true,
        },
      });

      if (!user || user.status !== 'activo') {
        throw new UnauthorizedException('El usuario esta inactivo o eliminado');
      }

      const newPayload = {
        sub: user.id,
        username: user.username,
        role: user.role,
        subsystem: 'inventario',
      };
      return {
        access_token: this.jwtService.sign(newPayload),
      };
    } catch {
      throw new UnauthorizedException('Token de refresco invalido o expirado');
    }
  }
}
