import { IsNotEmpty, IsOptional, IsString, IsDateString } from 'class-validator';

export class RegisterAttendanceDto {
  @IsString({ message: 'El usuario_id debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El usuario_id es obligatorio' })
  usuario_id!: string;

  @IsString({ message: 'El terminal_id debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El terminal_id es obligatorio' })
  terminal_id!: string;

  @IsString({ message: 'El sede_id debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El sede_id es obligatorio' })
  sede_id!: string;

  @IsDateString({}, { message: 'La fecha_hora_marca debe ser una fecha en formato ISO 8601' })
  @IsNotEmpty({ message: 'La fecha_hora_marca es obligatoria' })
  fecha_hora_marca!: string;

  @IsString({ message: 'El id_operacion_local debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El id_operacion_local es obligatorio' })
  id_operacion_local!: string;

  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsString()
  observacion?: string;
}
