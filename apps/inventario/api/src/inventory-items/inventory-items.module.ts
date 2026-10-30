import { Module } from '@nestjs/common';
import { InventoryItemsController } from './inventory-items.controller';
import { InventoryItemsService } from './inventory-items.service';

@Module({
  controllers: [InventoryItemsController],
  providers: [InventoryItemsService],
  exports: [InventoryItemsService],
})
export class InventoryItemsModule {}
