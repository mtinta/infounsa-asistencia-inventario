-- CreateTable
CREATE TABLE "sedes" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "estado" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sedes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminales" (
    "id" VARCHAR(50) NOT NULL,
    "sede_id" UUID NOT NULL,
    "estado" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "terminales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" VARCHAR(50) NOT NULL,
    "dni" VARCHAR(9) NOT NULL,
    "nombre_completo" VARCHAR(255) NOT NULL,
    "estado" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asistencias" (
    "id" UUID NOT NULL,
    "id_operacion_local" UUID NOT NULL,
    "usuario_id" VARCHAR(50) NOT NULL,
    "terminal_id" VARCHAR(50) NOT NULL,
    "sede_id" UUID NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "fecha_hora_marca" TIMESTAMPTZ NOT NULL,
    "creado_en" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacion" TEXT,

    CONSTRAINT "asistencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_dni_key" ON "usuarios"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "asistencias_id_operacion_local_key" ON "asistencias"("id_operacion_local");

-- AddForeignKey
ALTER TABLE "terminales" ADD CONSTRAINT "terminales_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencias" ADD CONSTRAINT "asistencias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencias" ADD CONSTRAINT "asistencias_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencias" ADD CONSTRAINT "asistencias_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
