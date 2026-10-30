import { Test, TestingModule } from '@nestjs/testing';
import { StatsGateway } from './stats.gateway';
import { PrismaService } from '../../common/database/prisma/prisma.service';
import { Socket, Server } from 'socket.io';

describe('Pruebas Unitarias: StatsGateway', () => {
  let gateway: StatsGateway;
  let prisma: PrismaService;

  let mockSocket: Partial<Socket>;
  let mockServer: Partial<Server>;

  const mockPrismaService = {
    client: {
      asistencia: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      usuario: {
        count: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsGateway,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    gateway = module.get<StatsGateway>(StatsGateway);
    prisma = module.get<PrismaService>(PrismaService);

    mockSocket = {
      id: 'socket-cliente-123',
      emit: jest.fn(),
    };

    mockServer = {
      emit: jest.fn(),
    };

    gateway.server = mockServer as Server;

    mockPrismaService.client.asistencia.count.mockResolvedValue(10);
    mockPrismaService.client.usuario.count.mockResolvedValue(50);
    mockPrismaService.client.asistencia.findMany.mockResolvedValue([]);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debería estar definido', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('debería aumentar el contador de clientes, emitir KPIs iniciales e inicializar el intervalo de broadcast', async () => {
      const spyEmitKpis = jest.spyOn(gateway as any, 'emitKpisToClient').mockResolvedValue(null);
      const spyBroadcast = jest.spyOn(gateway, 'broadcastKpis').mockResolvedValue(null);

      gateway.handleConnection(mockSocket as Socket);

      expect((gateway as any).connectedClients).toBe(1);
      expect(spyEmitKpis).toHaveBeenCalledWith(mockSocket);
      expect((gateway as any).broadcastInterval).not.toBeNull();

      jest.advanceTimersByTime(30000);
      expect(spyBroadcast).toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('debería disminuir los clientes y limpiar el intervalo si el contador llega a cero', () => {
      (gateway as any).connectedClients = 1;
      (gateway as any).broadcastInterval = setInterval(() => {}, 30000);

      gateway.handleDisconnect(mockSocket as Socket);

      expect((gateway as any).connectedClients).toBe(0);
      expect((gateway as any).broadcastInterval).toBeNull();
    });
  });

  describe('handleKpiRequest', () => {
    it('debería procesar la petición manual del cliente emitiéndole los KPIs actualizados', () => {
      const spyEmitKpis = jest.spyOn(gateway as any, 'emitKpisToClient').mockResolvedValue(null);

      gateway.handleKpiRequest(mockSocket as Socket);

      expect(spyEmitKpis).toHaveBeenCalledWith(mockSocket);
    });
  });

  describe('emitKpisToClient - Manejo de Errores', () => {
    it('debería emitir un payload con ceros y error controlado si Prisma falla', async () => {
      mockPrismaService.client.usuario.count.mockRejectedValue(new Error('DB_CONN_ERROR'));

      await (gateway as any).emitKpisToClient(mockSocket as Socket);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'iis:kpis',
        expect.objectContaining({
          totalAttendanceToday: 0,
          syncPending: 0,
          error: 'No se pudieron obtener datos en tiempo real',
        }),
      );
    });
  });

  describe('broadcastKpis', () => {
    it('debería cancelar el envío masivo si no hay ningún cliente conectado', async () => {
      (gateway as any).connectedClients = 0;
      const spyQuery = jest.spyOn(gateway as any, 'queryKpis');

      await gateway.broadcastKpis();

      expect(spyQuery).not.toHaveBeenCalled();
      expect(mockServer.emit).not.toHaveBeenCalled();
    });

    it('debería enviar KPIs a todo el servidor si hay clientes escuchando', async () => {
      (gateway as any).connectedClients = 2;
      
      mockPrismaService.client.asistencia.count.mockResolvedValueOnce(5); // today
      mockPrismaService.client.asistencia.count.mockResolvedValueOnce(2); // pending
      mockPrismaService.client.asistencia.findMany.mockResolvedValueOnce([]); // sedes
      mockPrismaService.client.usuario.count.mockResolvedValueOnce(100); // totalUsers
      mockPrismaService.client.asistencia.findMany.mockResolvedValueOnce([]); // weekly

      await gateway.broadcastKpis();

      expect(mockServer.emit).toHaveBeenCalledWith(
        'iis:kpis',
        expect.objectContaining({
          totalAttendanceToday: 5,
          syncPending: 2,
          totalUsers: 100,
        }),
      );
    });
  });
});
