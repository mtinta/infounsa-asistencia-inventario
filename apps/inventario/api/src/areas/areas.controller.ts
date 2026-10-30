import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { AreasService, CreateAreaDto, UpdateAreaDto } from './areas.service';
import { Roles } from '../auth/roles.decorator';

@Controller('areas')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Get()
  @Roles('administrador', 'operador')
  async findAll() {
    return this.areasService.findAll();
  }

  @Get(':id')
  @Roles('administrador', 'operador')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.areasService.findOne(id);
  }

  @Post()
  @Roles('administrador', 'operador')
  async create(@Body() body: CreateAreaDto) {
    return this.areasService.create(body);
  }

  @Put(':id')
  @Roles('administrador')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateAreaDto) {
    return this.areasService.update(id, body);
  }

  @Delete(':id')
  @Roles('administrador')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.areasService.remove(id);
  }
}
