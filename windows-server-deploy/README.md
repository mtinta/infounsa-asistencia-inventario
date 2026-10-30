# Despliegue historico de APIs en Contenedores de Windows (Windows Server 2019)

> **No usar esta carpeta para produccion.** La entrega objetivo es mediante servicios Windows nativos (Node.js + NSSM y MySQL como servicio). Estos archivos conservan una propuesta anterior de contenedores Windows y quedan fuera de la promocion hasta que se prepare la rama `release/windows-native-services`.

Para el flujo vigente, consulte [flujo Docker QA y Windows nativo](../docs/despliegue/flujo-docker-qa-y-windows-nativo.md). Docker se usa para QA Linux; no se usa Docker Desktop ni `host.docker.internal` en el despliegue nativo.

Esta carpeta contiene la configuración para empaquetar y ejecutar las APIs de **Asistencia** e **Inventario** como contenedores nativos de Windows (`Windows Containers`) bajo **Windows Server 2019 (LTSC 2019 / versión 1809)**.

---

## 📋 Requisitos en el Servidor Windows

1. **Docker con Windows Containers habilitado:**
   * Habilitar la característica mediante PowerShell como Administrador:
     ```powershell
     Install-WindowsFeature -Name Containers
     Restart-Computer
     ```
   * Instalar el motor de Docker (Docker EE o Docker Desktop configurado en modo *Windows Containers*).
2. **Base de Datos MySQL (Bare-Metal):**
   * MySQL corriendo en el host en puerto `3306`.
   * La URL de conexion y los secretos JWT se proporcionan mediante variables de entorno; no se guardan en este repositorio.

---

## 🚀 Instrucciones de Ejecución y Despliegue

1. **Ubicarse en este directorio:**
   ```powershell
   cd C:\Users\Developer\plataforma-infounsa\windows-server-deploy
   ```

2. **Configurar secretos y TLS fuera del repositorio:**
   ```powershell
   New-Item -ItemType Directory -Force C:\ProgramData\InfoUNSA\config
   New-Item -ItemType Directory -Force C:\ProgramData\InfoUNSA\secrets\mysql
   Copy-Item .\.env.example C:\ProgramData\InfoUNSA\config\infounsa-production.env
   # Colocar la CA de MySQL en C:\ProgramData\InfoUNSA\secrets\mysql\mysql-ca.pem
   ```

   Edita el archivo con valores reales. Usa secretos aleatorios independientes y no los incluyas en archivos versionados ni en capturas de pantalla.

3. **Compilar las imágenes de Docker:**
   Este comando compilará las APIs utilizando imágenes base oficiales de Node.js montadas sobre `windowsservercore-ltsc2019`:
   ```powershell
   docker-compose.exe --env-file C:\ProgramData\InfoUNSA\config\infounsa-production.env -f .\docker-compose.yml build
   ```

4. **Arrancar los contenedores en segundo plano:**
   ```powershell
   docker-compose.exe --env-file C:\ProgramData\InfoUNSA\config\infounsa-production.env -f .\docker-compose.yml up -d --remove-orphans
   ```

5. **Verificar el estado de ejecución:**
   ```powershell
   docker-compose.exe --env-file C:\ProgramData\InfoUNSA\config\infounsa-production.env -f .\docker-compose.yml ps
   docker logs infounsa-asistencia-container
   docker logs infounsa-inventario-container
   ```

---

## 🌐 Comunicación con la Base de Datos del Host

La configuración usa `host.docker.internal` mapeado al gateway del host para que las APIs corriendo dentro de los contenedores de Windows puedan conectarse directamente a la base de datos MySQL local del host sin exponer la base de datos a redes públicas.

---

## 🛑 Detener el Despliegue

Para apagar los servicios:
```powershell
docker-compose.exe --env-file C:\ProgramData\InfoUNSA\config\infounsa-production.env -f .\docker-compose.yml down
```

## Produccion en Windows Server 2019

Para produccion no se registran las APIs Node como servicios Windows separados. Las APIs se ejecutan como contenedores Windows y Docker controla su reinicio. El arranque se registra con una tarea programada que espera MySQL y Docker, valida las variables y levanta Compose.

1. Copiar `.env.example` fuera del repositorio, por ejemplo a `C:\ProgramData\InfoUNSA\config\infounsa-production.env`.
2. Colocar `mysql-ca.pem` en `C:\ProgramData\InfoUNSA\secrets\mysql` y configurar permisos para Administradores y la cuenta `SYSTEM`.
3. Confirmar el nombre del servicio MySQL con `Get-Service -Name 'MySQL*'`.
4. Registrar el arranque como Administrador:

   ```powershell
   .\register-startup-task.ps1 -MySqlServiceName MySQL80 -EnvFile C:\ProgramData\InfoUNSA\config\infounsa-production.env
   ```

Los scripts `start-stack.ps1` y `register-startup-task.ps1` implementan el orden MySQL -> Docker -> APIs. La configuracion completa, TLS, backups, actualizaciones y rollback esta en [docs/despliegue/windows-server-2019-mysql.md](../docs/despliegue/windows-server-2019-mysql.md).
