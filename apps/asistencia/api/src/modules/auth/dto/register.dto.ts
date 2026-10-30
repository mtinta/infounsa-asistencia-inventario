import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2, { message: 'El nombre completo debe tener al menos 2 caracteres' })
  @MaxLength(100)
  fullName!: string;

  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email!: string;

  @IsString()
  @MinLength(4, { message: 'El nombre de usuario debe tener al menos 4 caracteres' })
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_.]+$/, { message: 'El usuario solo puede contener letras, números, puntos y guiones bajos' })
  username!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(100)
  password!: string;
}
