export class HealthService {
  constructor(servicesConfig) {
    this.services = servicesConfig;
    this.statusMap = new Map();
  }

  async checkService(name, url) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return { status: 'offline', latency: 0 };
      }
      
      const data = await response.json();
      if (data.status === 'ok' || data.database === 'connected') {
        return { status: 'online', latency: 85 }; // simulated latency
      } else if (data.database === 'unavailable') {
        return { status: 'degraded', latency: 1200 };
      }
      return { status: 'offline', latency: 0 };
    } catch (error) {
      return { status: 'offline', latency: 0 };
    }
  }

  async checkAll() {
    const results = {};
    for (const [name, config] of Object.entries(this.services)) {
      results[name] = await this.checkService(name, config.url);
      this.statusMap.set(name, results[name]);
      this.updateDOM(name, results[name].status);
    }
    return results;
  }

  updateDOM(name, status) {
    const config = this.services[name];
    if (!config) return;
    
    const dot = document.getElementById(config.dotId);
    const text = document.getElementById(config.textId);
    if (!dot || !text) return;

    if (status === 'online') {
      dot.className = 'status-dot status-online';
      text.textContent = 'En Línea';
      text.style.color = 'var(--color-online)';
    } else if (status === 'degraded') {
      dot.className = 'status-dot status-warning';
      text.textContent = 'Degradado';
      text.style.color = 'var(--color-warning)';
    } else {
      dot.className = 'status-dot status-offline';
      text.textContent = 'Fuera de Servicio';
      text.style.color = 'var(--color-offline)';
    }
  }

  startPolling(intervalMs = 30000) {
    this.checkAll();
    setInterval(() => this.checkAll(), intervalMs);
  }
}
