import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getJwtSecret } from '../../common/auth/jwt-secret';
import { PrismaService } from '../../common/database/prisma/prisma.service';

export interface JwtPayload {
  sub: string | number;
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
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Token inválido');
    }
    const userId = String(payload.sub);
    if (!userId.trim()) {
      throw new UnauthorizedException('Token invalido');
    }

    const user = await this.prisma.client.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        status: true,
        role: {
          select: { name: true },
        },
      },
    });

    if (!user || user.status !== 'activo') {
      throw new UnauthorizedException('El usuario esta inactivo o eliminado');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role?.name || 'usuario',
    };
  }
}
