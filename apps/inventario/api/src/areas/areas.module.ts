import { Module } from '@nestjs/common';
import { AreasService } from './areas.service';
import { AreasController } from './areas.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AreasController],
  providers: [AreasService],
  exports: [AreasService],
})
export class AreasModule {}
