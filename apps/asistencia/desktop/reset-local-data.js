// SOLO DESARROLLO: borra la base SQLite local, claves y sesion de ESTA maquina.
// Ejecutar manualmente con `npm run reset:local-data`. Ya no forma parte de `npm run dist`,
// para que compilar o actualizar el cliente nunca elimine datos de usuario.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Force close any running instances of the app to release file locks
try {
  if (process.platform === 'win32') {
    execSync('taskkill /F /IM InfoUNSA-Asistencia.exe /T 2>nul || exit 0');
    execSync('taskkill /F /IM electron.exe /T 2>nul || exit 0');
  } else {
    execSync('killall -9 InfoUNSA-Asistencia 2>/dev/null || true');
    execSync('killall -9 electron 2>/dev/null || true');
  }
} catch (e) {
  // Ignore process kill errors
}

// Small timeout to allow process resource cleanup
execSync('node -e "setTimeout(() => {}, 1000)"');

const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
const userDataDir = path.join(appData, 'infounsa-asistencia-desktop');

const filesToDelete = [
  'local_db.sqlite',
  'sync-auth-asistencia.json',
  'local_db.key',
  'local_db_fallback.key',
  'window-state.json'
];

if (fs.existsSync(userDataDir)) {
  filesToDelete.forEach(file => {
    const p = path.join(userDataDir, file);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
        console.log(`Deleted local file during build: ${file}`);
      } catch (err) {
        console.warn(`Could not delete file ${file}: ${err.message}`);
      }
    }
  });
} else {
  console.log('Local userData directory does not exist yet. Fresh installation simulated.');
}
