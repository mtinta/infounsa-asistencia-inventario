import { IsNotEmpty, IsOptional, IsString, IsUUID, IsEnum, IsInt, Min, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum MovementType {
  ENTRADA = 'entrada',
  SALIDA = 'salida',
}

export class CreateMovementDto {
  @IsInt({ message: 'El item_id debe ser un número entero' })
  @IsNotEmpty({ message: 'El item_id es obligatorio' })
  item_id!: number;

  @IsEnum(MovementType, { message: 'El tipo debe ser entrada o salida' })
  @IsNotEmpty({ message: 'El tipo es obligatorio' })
  type!: MovementType;

  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor o igual a 1' })
  @IsNotEmpty({ message: 'La cantidad es obligatoria' })
  quantity!: number;

  @IsInt({ message: 'El user_id debe ser un número entero' })
  @IsOptional()
  user_id?: number;

  @IsDateString({}, { message: 'La fecha_hora_marca debe ser un formato ISO8601 válido' })
  @IsNotEmpty({ message: 'La fecha de registro es obligatoria' })
  registered_at!: string;

  @IsUUID('4', { message: 'El id_operacion_local debe ser un UUID v4 válido' })
  @IsOptional()
  id_operacion_local?: string;

  @IsString({ message: 'La observación debe ser una cadena de texto' })
  @IsOptional()
  observations?: string;

  @IsString({ message: 'El destinatario debe ser una cadena de texto' })
  @IsOptional()
  destinatario_name?: string;

  @IsInt({ message: 'El area_id debe ser un número entero' })
  @IsOptional()
  area_id?: number;
}

export class SyncMovementsDto {
  @IsArray({ message: 'El lote de movimientos debe ser una lista' })
  @ValidateNested({ each: true })
  @Type(() => CreateMovementDto)
  batch!: CreateMovementDto[];
}

export class TransferMovementDto {
  @IsInt({ message: 'El item_id debe ser un número entero' })
  @IsNotEmpty({ message: 'El item_id es obligatorio' })
  item_id!: number;

  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor o igual a 1' })
  @IsNotEmpty({ message: 'La cantidad es obligatoria' })
  quantity!: number;

  @IsInt({ message: 'from_area_id debe ser un entero' })
  @IsOptional()
  from_area_id?: number;

  @IsInt({ message: 'to_area_id debe ser un entero' })
  @IsOptional()
  to_area_id?: number;

  @IsString({ message: 'El destinatario debe ser una cadena de texto' })
  @IsOptional()
  destinatario_name?: string;

  @IsInt({ message: 'El user_id debe ser un entero' })
  @IsOptional()
  user_id?: number;

  @IsDateString({}, { message: 'La fecha de registro debe tener formato ISO8601' })
  @IsNotEmpty({ message: 'La fecha de registro es obligatoria' })
  registered_at!: string;

  @IsString({ message: 'La observación debe ser una cadena de texto' })
  @IsOptional()
  observations?: string;
}

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
}
