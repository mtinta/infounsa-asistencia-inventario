import { Module } from '@nestjs/common';
import { StatsGateway } from './stats.gateway';

@Module({
  providers: [StatsGateway],
  exports: [StatsGateway],
})
export class StatsModule {}
