import { IsNotEmpty, IsDateString, IsOptional, IsString } from 'class-validator';

export class ReportQueryDto {
  @IsDateString({}, { message: 'La fecha de inicio (startDate) debe ser un formato ISO8601 válido' })
  @IsNotEmpty({ message: 'La fecha de inicio (startDate) es obligatoria' })
  startDate!: string;

  @IsDateString({}, { message: 'La fecha de fin (endDate) debe ser un formato ISO8601 válido' })
  @IsNotEmpty({ message: 'La fecha de fin (endDate) es obligatoria' })
  endDate!: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  filterType?: string;

  @IsString()
  @IsOptional()
  filterRole?: string;

  @IsString()
  @IsOptional()
  applyDayFilter?: string;

  @IsString()
  @IsOptional()
  startDayOfWeek?: string;

  @IsString()
  @IsOptional()
  endDayOfWeek?: string;
}
