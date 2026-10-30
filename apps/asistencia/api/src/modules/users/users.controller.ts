import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';
import { Roles } from '../../common/auth/roles.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('administrador')
  async findAll() {
    return this.usersService.findAll();
  }

  /**
   * Lista usuarios activos que el cliente de asistencia mantiene en caché.
   *
   * @see apps/asistencia/desktop/src/main/sync/remote-client.js#pullUsersFromServer
   */
  @Get('attendance-users')
  async findAttendanceUsers() {
    return this.usersService.findAttendanceUsers();
  }

  @Get(':id')
  @Roles('administrador')
  async findOne(@Param('id') id: string | number) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles('administrador')
  async create(@Body() body: CreateUserDto) {
    return this.usersService.create(body);
  }

  @Put(':id')
  @Roles('administrador')
  async update(@Param('id') id: string | number, @Body() body: UpdateUserDto) {
    return this.usersService.update(id, body);
  }

  @Delete(':id')
  @Roles('administrador')
  async remove(@Param('id') id: string | number) {
    return this.usersService.remove(id);
  }
}
