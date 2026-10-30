import { Logger } from '@nestjs/common';
import { Response } from 'express';
import { HealthController } from './health.controller';
import { PrismaService } from '../../common/database/prisma/prisma.service';

describe('HealthController de Asistencia', () => {
  it('no debe exponer el detalle interno de la base de datos', async () => {
    const queryRaw = jest.fn().mockRejectedValue(new Error('password=secreto host interno'));
    const reconnect = jest.fn().mockResolvedValue(false);
    const prisma = { client: { $queryRaw: queryRaw }, reconnect } as unknown as PrismaService;
    const response = { status: jest.fn(), json: jest.fn() } as unknown as Response & { status: jest.Mock; json: jest.Mock };
    response.status.mockReturnValue(response);
    const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await new HealthController(prisma).checkHealth(response);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      status: 'error',
      database: 'unavailable',
      code: 'DATABASE_UNAVAILABLE',
    });
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain('secreto');
    expect(loggerSpy).toHaveBeenCalled();
    loggerSpy.mockRestore();
  });
});
