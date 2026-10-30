import { HealthService } from './src/services/health.service.js';
import { ReleasesService } from './src/services/releases.service.js';

// ── 1. RELOJ ──────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('system-time');
  if (el) {
    el.textContent = new Date().toLocaleTimeString('es-PE', { hour12: false });
  }
}
setInterval(updateClock, 1000);
updateClock();

// ── 2. HEALTHCHECK CONFIG ─────────────────────────────────────
const healthConfig = {
  asistencia: {
    url: '/api/asistencia/health',
    dotId: 'dot-asistencia',
    textId: 'lbl-asistencia',
    pillId: 'pill-asistencia',
    latId: 'lat-asistencia',
    timeId: 'time-asistencia',
  },
  inventario: {
    url: '/api/inventario/health',
    dotId: 'dot-inventario',
    textId: 'lbl-inventario',
    pillId: 'pill-inventario',
    latId: 'lat-inventario',
    timeId: 'time-inventario',
  }
};

// Override HealthService.updateDOM para nuevo diseño
class PortalHealthService extends HealthService {
  updateDOM(name, status) {
    const cfg = this.services[name];
    if (!cfg) return;

    const dot    = document.getElementById(cfg.dotId);
    const text   = document.getElementById(cfg.textId);
    const pill   = document.getElementById(cfg.pillId);
    const latEl  = document.getElementById(cfg.latId);
    const timeEl = document.getElementById(cfg.timeId);
    const now    = new Date().toLocaleTimeString('es-PE', { hour12: false });

    const labels = {
      online:   { text: 'En línea',          dotClass: 'status--online',  pillClass: 'pill--online',  latency: '~85 ms' },
      degraded: { text: 'Degradado',          dotClass: 'status--warning', pillClass: 'pill--warning', latency: '~1.2 s' },
      offline:  { text: 'Fuera de servicio',  dotClass: 'status--offline', pillClass: 'pill--offline', latency: '—'       },
    };

    const conf = labels[status] || labels.offline;

    if (dot)    { dot.className = `status-dot ${conf.dotClass}`; }
    if (text)   { text.textContent = conf.text; text.style.color = status === 'online' ? 'var(--color-online)' : status === 'degraded' ? 'var(--color-warning)' : 'var(--color-offline)'; }
    if (pill)   { pill.textContent = conf.text; pill.className = `status-pill ${conf.pillClass}`; }
    if (latEl)  { latEl.textContent = conf.latency; }
    if (timeEl) { timeEl.textContent = now; }

    // Contar servicios online para el stat del hero
    this._updateOnlineCount();
  }

  _updateOnlineCount() {
    const onlineCount = [...this.statusMap.values()].filter(s => s.status === 'online').length;
    const el = document.getElementById('services-online');
    if (el) el.textContent = onlineCount;
  }
}

const healthSvc = new PortalHealthService(healthConfig);
healthSvc.startPolling(30000);

// ── 3. MANIFIESTO Y VERSIONES ─────────────────────────────────
async function loadReleases() {
  const svc = new ReleasesService('./public/releases/manifest.json');
  const manifest = await svc.fetchManifest();

  if (!manifest) {
    document.querySelectorAll('[id^="ver-"]').forEach(el => {
      el.textContent = 'Versión no disponible';
    });
    return;
  }

  // Asistencia
  const asist = svc.getApp('asistencia-desktop');
  if (asist) {
    const verEl = document.getElementById('ver-asistencia');
    if (verEl) verEl.textContent = `v${asist.version} · ${(asist.sizeBytes / 1024 / 1024).toFixed(1)} MB`;

    const dlBtn = document.getElementById('btn-dl-asistencia-desktop');
    if (dlBtn) dlBtn.href = asist.downloadUrl;

    const cpBtn = document.getElementById('btn-copy-asistencia-desktop');
    if (cpBtn) cpBtn.onclick = () => {
      navigator.clipboard.writeText(new URL(asist.downloadUrl, location.href).href);
      cpBtn.innerHTML = '<i data-lucide="check" aria-hidden="true"></i> Copiado';
      lucide.createIcons();
      setTimeout(() => {
        cpBtn.innerHTML = '<i data-lucide="link-2" aria-hidden="true"></i> Copiar enlace';
        lucide.createIcons();
      }, 2000);
    };
  }

  // Inventario
  const inv = svc.getApp('inventario-desktop');
  if (inv) {
    const verEl = document.getElementById('ver-inventario');
    if (verEl) verEl.textContent = `v${inv.version} · ${(inv.sizeBytes / 1024 / 1024).toFixed(1)} MB`;

    const dlBtn = document.getElementById('btn-dl-inventario-desktop');
    if (dlBtn) dlBtn.href = inv.downloadUrl;

    const cpBtn = document.getElementById('btn-copy-inventario-desktop');
    if (cpBtn) cpBtn.onclick = () => {
      navigator.clipboard.writeText(new URL(inv.downloadUrl, location.href).href);
      cpBtn.innerHTML = '<i data-lucide="check" aria-hidden="true"></i> Copiado';
      lucide.createIcons();
      setTimeout(() => {
        cpBtn.innerHTML = '<i data-lucide="link-2" aria-hidden="true"></i> Copiar enlace';
        lucide.createIcons();
      }, 2000);
    };
  }
}

loadReleases();

// ── 4. TABS SWITCHER & DYNAMIC ANALYTICS ──────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const tabDownloads = document.getElementById('tab-downloads');
  const tabIis = document.getElementById('tab-iis');
  const viewDownloads = document.getElementById('view-downloads');
  const viewIis = document.getElementById('view-iis');

  if (tabDownloads && tabIis && viewDownloads && viewIis) {
    // Save target heights for bar charts
    const bars = viewIis.querySelectorAll('.bar-fill');
    const targetHeights = Array.from(bars).map(bar => bar.style.height);
    
    // Set to 0% initially for animation
    bars.forEach(bar => {
      bar.style.height = '0%';
    });

    const animateCharts = () => {
      setTimeout(() => {
        bars.forEach((bar, idx) => {
          bar.style.height = targetHeights[idx] || '0%';
        });
      }, 150);
    };

    tabDownloads.addEventListener('click', (e) => {
      e.preventDefault();
      tabDownloads.classList.add('active');
      tabIis.classList.remove('active');
      viewDownloads.classList.remove('hidden');
      viewIis.classList.add('hidden');
      
      // Reset heights so they animate again next time
      bars.forEach(bar => {
        bar.style.height = '0%';
      });
    });

    tabIis.addEventListener('click', (e) => {
      e.preventDefault();
      tabDownloads.classList.remove('active');
      tabIis.classList.add('active');
      viewDownloads.classList.add('hidden');
      viewIis.classList.remove('hidden');
      
      // Re-initialize Lucide icons inside the dashboard
      if (window.lucide) {
        window.lucide.createIcons();
      }
      
      // Animate chart bars
      animateCharts();
    });
  }
});

// ── 5. WEBSOCKET IIS — KPIs EN TIEMPO REAL ────────────────────

/**
 * Animador de contador numérico para KPI cards.
 * @param {HTMLElement} el - Elemento a animar
 * @param {number} newValue - Nuevo valor a mostrar
 */
function animateCounter(el, newValue) {
  if (!el) return;
  const currentText = el.textContent;
  const current = parseInt(currentText, 10) || 0;
  const target  = parseInt(newValue, 10) || 0;
  if (current === target) return;

  const duration = 600;
  const startTime = performance.now();

  function step(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const value    = Math.round(current + (target - current) * eased);
    el.textContent = value;
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/**
 * Actualiza los KPI cards del IIS Dashboard con los datos recibidos por WebSocket.
 * @param {Object} kpis - Objeto con los KPIs emitidos por el servidor
 */
function updateIisKpis(kpis) {
  const attendance = document.getElementById('iis-kpi-attendance');
  const sync       = document.getElementById('iis-kpi-sync');
  const sedes      = document.getElementById('iis-kpi-sedes');
  const users      = document.getElementById('iis-kpi-users');
  const lastUpdate = document.getElementById('iis-last-update');

  animateCounter(attendance, kpis.totalAttendanceToday ?? 0);
  animateCounter(sync,       kpis.syncPending          ?? 0);
  animateCounter(sedes,      kpis.activeSedes           ?? 0);
  animateCounter(users,      kpis.totalUsers            ?? 0);

  if (lastUpdate && kpis.lastUpdated) {
    const time = new Date(kpis.lastUpdated).toLocaleTimeString('es-PE', { hour12: false });
    lastUpdate.textContent = `Actualizado: ${time}`;
  }
}

/**
 * Establece la conexión WebSocket al StatsGateway de la API de Asistencia.
 * URL: ws://localhost:43000/stats  (namespace /stats)
 * Reconexión automática si falla con backoff exponencial.
 */
function initIisWebSocket() {
  // socket.io-client está disponible como global 'io' desde el CDN
  if (typeof io === 'undefined') {
    console.warn('[IIS-WS] socket.io-client no disponible. Verifique el CDN.');
    return;
  }

  const WS_URL = 'http://localhost:43000';
  const dot    = document.getElementById('ws-status-dot');
  const label  = document.getElementById('ws-status-label');

  const setStatus = (status) => {
    if (!dot || !label) return;
    const states = {
      connecting: { color: '#f59e0b', text: 'Conectando al sistema...' },
      connected:  { color: '#10b981', text: 'En línea — datos en tiempo real' },
      error:      { color: '#ef4444', text: 'Sin conexión al backend' },
    };
    const s = states[status] || states.error;
    dot.style.background = s.color;
    label.textContent    = s.text;
  };

  setStatus('connecting');

  const socket = io(WS_URL, {
    path:           '/socket.io',
    transports:     ['websocket', 'polling'],
    namespace:      '/stats',
    reconnection:      true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30000,
  });

  socket.on('connect', () => {
    console.log('[IIS-WS] Conectado al StatsGateway:', socket.id);
    setStatus('connected');
    // Solicitar KPIs inmediatamente al conectar
    socket.emit('request:kpis');
  });

  socket.on('iis:kpis', (kpis) => {
    console.log('[IIS-WS] KPIs recibidos:', kpis);
    updateIisKpis(kpis);
  });

  socket.on('disconnect', (reason) => {
    console.warn('[IIS-WS] Desconectado:', reason);
    setStatus('error');
  });

  socket.on('connect_error', (err) => {
    console.warn('[IIS-WS] Error de conexión:', err.message);
    setStatus('error');
    // Mostrar valores de fallback si el WS falla
    const attendance = document.getElementById('iis-kpi-attendance');
    const sync       = document.getElementById('iis-kpi-sync');
    const sedes      = document.getElementById('iis-kpi-sedes');
    const users      = document.getElementById('iis-kpi-users');
    if (attendance && attendance.textContent === '—') attendance.textContent = 'N/A';
    if (sync && sync.textContent === '—') sync.textContent = 'N/A';
    if (sedes && sedes.textContent === '—') sedes.textContent = 'N/A';
    if (users && users.textContent === '—') users.textContent = 'N/A';
  });

  return socket;
}

// Iniciar WS cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIisWebSocket);
} else {
  initIisWebSocket();
}
