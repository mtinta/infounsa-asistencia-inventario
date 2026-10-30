import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceRegistrationService } from './attendance-registration.service';
import { AttendanceSyncService } from './attendance-sync.service';
import { AttendanceReportService } from './attendance-report.service';

@Module({
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceRegistrationService,
    AttendanceSyncService,
    AttendanceReportService,
  ],
  exports: [
    AttendanceService,
    AttendanceRegistrationService,
    AttendanceSyncService,
    AttendanceReportService,
  ],
})
export class AttendanceModule {}
