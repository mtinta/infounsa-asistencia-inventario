import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'http://localhost:43000',
    ],
    credentials: true,
  },
  namespace: '/stats',
})
export class StatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(StatsGateway.name);
  private broadcastInterval: NodeJS.Timeout | null = null;
  private connectedClients = 0;

  constructor(private readonly prisma: PrismaService) {}

  handleConnection(client: Socket) {
    this.connectedClients++;
    this.logger.log(`Cliente WebSocket conectado: ${client.id} (total: ${this.connectedClients})`);
    this.emitKpisToClient(client);

    if (!this.broadcastInterval) {
      this.broadcastInterval = setInterval(() => {
        this.broadcastKpis();
      }, 30000);
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedClients--;
    this.logger.log(`Cliente WebSocket desconectado: ${client.id} (total: ${this.connectedClients})`);

    if (this.connectedClients <= 0 && this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
      this.connectedClients = 0;
    }
  }

  @SubscribeMessage('request:kpis')
  handleKpiRequest(client: Socket) {
    this.emitKpisToClient(client);
  }

  private async queryKpis() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      totalAttendanceToday,
      syncPending,
      activeSedesRows,
      totalUsers,
      weeklyRows,
    ] = await Promise.all([
      this.prisma.client.asistencia.count({
        where: { fecha_hora_marca: { gte: startOfToday } },
      }),
      this.prisma.client.asistencia.count({
        where: { sync_status: { in: ['pendiente', 'pending', 'Pendiente', 'Enviando', 'Error', 'Conflicto'] } },
      }),
      this.prisma.client.asistencia.findMany({
        where: { fecha_hora_marca: { gte: sevenDaysAgo } },
        select: { sede_id: true, usuario: { select: { sede_id: true } } },
      }),
      this.prisma.client.usuario.count(),
      this.prisma.client.asistencia.findMany({
        where: { fecha_hora_marca: { gte: sevenDaysAgo } },
        select: { fecha_hora_marca: true },
        orderBy: { fecha_hora_marca: 'asc' },
      }),
    ]);

    const activeSedes = new Set(
      activeSedesRows
        .map((row: { sede_id?: string | null; usuario?: { sede_id?: string | null } | null; user?: { sede_id?: string | null } | null }) => row.sede_id || row.usuario?.sede_id || row.user?.sede_id)
        .filter(Boolean),
    ).size;
    const weeklyAttendanceMap = weeklyRows.reduce<Record<string, number>>((acc: Record<string, number>, row: { fecha_hora_marca?: Date | string | null; registered_at?: Date | string | null }) => {
      const dateVal = row.fecha_hora_marca || row.registered_at;
      if (dateVal) {
        const day = new Date(dateVal).toISOString().slice(0, 10);
        acc[day] = (acc[day] ?? 0) + 1;
      }
      return acc;
    }, {});

    return {
      totalAttendanceToday,
      syncPending,
      activeSedes,
      totalUsers,
      weeklyAttendance: Object.entries(weeklyAttendanceMap).map(([day, total]) => ({ day, total })),
      lastUpdated: new Date().toISOString(),
    };
  }

  private async emitKpisToClient(client: Socket) {
    try {
      const kpis = await this.queryKpis();
      client.emit('iis:kpis', kpis);
    } catch (err) {
      this.logger.error('Error al consultar KPIs para cliente:', err);
      client.emit('iis:kpis', {
        totalAttendanceToday: 0,
        syncPending: 0,
        activeSedes: 0,
        totalUsers: 0,
        weeklyAttendance: [],
        lastUpdated: new Date().toISOString(),
        error: 'No se pudieron obtener datos en tiempo real',
      });
    }
  }

  async broadcastKpis() {
    if (this.connectedClients <= 0) return;
    try {
      const kpis = await this.queryKpis();
      this.server.emit('iis:kpis', kpis);
      this.logger.log(`KPIs emitidos a ${this.connectedClients} cliente(s)`);
    } catch (err) {
      this.logger.error('Error al hacer broadcast de KPIs:', err);
    }
  }
}
