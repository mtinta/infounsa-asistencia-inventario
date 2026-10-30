import { Module } from '@nestjs/common';
import { InventoryMovementsController } from './inventory-movements.controller';
import { InventoryMovementsService } from './inventory-movements.service';
import { StockAlertService } from './stock-alert.service';
import { InventoryReportService } from './inventory-report.service';

@Module({
  controllers: [InventoryMovementsController],
  providers: [
    InventoryMovementsService,
    StockAlertService,
    InventoryReportService,
  ],
  exports: [
    InventoryMovementsService,
    StockAlertService,
    InventoryReportService,
  ],
})
export class InventoryMovementsModule {}
