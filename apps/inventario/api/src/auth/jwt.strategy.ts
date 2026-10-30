import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getJwtSecret } from './jwt-secret';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string | number;
  subsystem?: string;
  username?: string;
  role?: string;
  [key: string]: unknown;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload || !payload.sub || payload.subsystem !== 'inventario') {
      throw new UnauthorizedException('Token inválido para el subsistema de inventario');
    }
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId)) {
      throw new UnauthorizedException('Token invalido para el subsistema de inventario');
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

    return {
      id: user.id,
      username: user.username,
      role: user.role,
    };
  }
}
