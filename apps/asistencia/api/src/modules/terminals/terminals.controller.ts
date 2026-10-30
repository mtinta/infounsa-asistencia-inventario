import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { TerminalsService } from './terminals.service';
import { Roles } from '../../common/auth/roles.decorator';

@Controller('terminals')
@Roles('administrador')
export class TerminalsController {
  constructor(private readonly terminalsService: TerminalsService) {}

  @Get()
  async findAll() {
    return this.terminalsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string | number) {
    return this.terminalsService.findOne(id);
  }

  @Post()
  async create(@Body() body: { name: string; code: string; status?: string }) {
    return this.terminalsService.create(body);
  }

  @Put(':id')
  async update(
    @Param('id') id: string | number,
    @Body() body: { name?: string; code?: string; status?: string },
  ) {
    return this.terminalsService.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string | number) {
    return this.terminalsService.remove(id);
  }
}
