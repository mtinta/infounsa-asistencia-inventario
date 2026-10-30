import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    ValidateNested,
    MinLength,
    Equals
} from 'class-validator';
import { Type } from 'class-transformer';

export class DatosMenorDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(3, { message: 'El nombre del menor debe tener al menos 3 caracteres.' })
    nombre_completo!: string;

    @IsString()
    @IsOptional()
    @Equals('00000000', { message: 'El DNI de contingencia debe ser 00000000' })
    dni_contingencia?: string = '00000000'; // Valor default exigido por el RF (8 dígitos)
}

export class RegistroAsistenciaDto {
    @IsString({ message: 'El id_operacion_local debe ser una cadena de caracteres válida' })
    @IsNotEmpty()
    id_operacion_local!: string;

    @IsString()
    @IsOptional()
    usuario_id!: string | null;

    @IsString()
    @IsOptional()
    dni?: string | null;

    @IsString()
    @IsOptional()
    nombre?: string | null;

    @IsDateString({}, { message: 'La fecha_hora_marca debe ser un formato ISO8601 válido' })
    @IsNotEmpty()
    fecha_hora_marca!: string;

    @IsString()
    @IsNotEmpty()
    @IsIn(['entrada', 'salida'], { message: 'El tipo solo puede ser entrada o salida.' })
    tipo!: 'entrada' | 'salida';

    @IsBoolean()
    @IsNotEmpty()
    es_menor_manual!: boolean;

    @IsOptional()
    @ValidateNested()
    @Type(() => DatosMenorDto)
    datos_menor?: DatosMenorDto;

    @IsOptional()
    @IsString()
    observacion?: string;

    @IsOptional()
    @IsString()
    visitante_nombre?: string;

    @IsOptional()
    @IsString()
    visitante_motivo?: string;

    @IsOptional()
    @IsString()
    visitante_observacion?: string;

    @IsOptional()
    @IsString()
    estado_auditoria?: string;
}

export class SyncAttendanceDto {
    @IsString()
    @IsNotEmpty()
    terminal_id!: string;

    @IsUUID('4', { message: 'El sede_id debe ser un UUID v4 válido' })
    @IsNotEmpty()
    sede_id!: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RegistroAsistenciaDto)
    registros!: RegistroAsistenciaDto[];
}
