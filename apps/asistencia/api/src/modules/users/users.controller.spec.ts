import { ROLES_KEY } from '../../common/auth/roles.decorator';
import { UsersImportController } from './users-import.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('Autorizacion de administracion de usuarios de Asistencia', () => {
  it('deberia limitar el CRUD de usuarios administrativos al rol administrador', () => {
    const prototype = UsersController.prototype;
    const adminRoutes = ['findAll', 'findOne', 'create', 'update', 'remove'];

    for (const route of adminRoutes) {
      expect(Reflect.getMetadata(ROLES_KEY, prototype[route])).toEqual(['administrador']);
    }
  });

  it('deberia conservar la ruta de sincronizacion para cualquier usuario autenticado', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UsersController.prototype.findAttendanceUsers)).toBeUndefined();
  });

  it('deberia limitar la plantilla e importacion masiva a administradores', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UsersImportController)).toEqual(['administrador']);
  });

  it('deberia conservar el contrato de construccion del controlador', () => {
    expect(new UsersController({} as UsersService)).toBeDefined();
  });
});
