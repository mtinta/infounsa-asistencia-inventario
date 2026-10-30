import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { SedesService } from './sedes.service';
import { Roles } from '../../common/auth/roles.decorator';

@Controller('sedes')
@Roles('administrador')
export class SedesController {
  constructor(private readonly sedesService: SedesService) {}

  @Get()
  async findAll() {
    return this.sedesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string | number) {
    return this.sedesService.findOne(id);
  }

  @Post()
  async create(@Body() body: { name: string; code: string; address?: string }) {
    return this.sedesService.create(body);
  }

  @Put(':id')
  async update(
    @Param('id') id: string | number,
    @Body() body: { name?: string; code?: string; address?: string },
  ) {
    return this.sedesService.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string | number) {
    return this.sedesService.remove(id);
  }
}
