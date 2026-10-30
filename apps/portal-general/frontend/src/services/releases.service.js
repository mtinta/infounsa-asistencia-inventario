export class ReleasesService {
  constructor(manifestUrl) {
    this.manifestUrl = manifestUrl;
    this.manifest = null;
  }

  async fetchManifest() {
    try {
      const response = await fetch(this.manifestUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error('No fue posible consultar las versiones disponibles.');
      }
      this.manifest = await response.json();
      return this.manifest;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  getApp(appId) {
    if (!this.manifest) return null;
    return this.manifest.applications.find(a => a.id === appId);
  }

  injectAppDetails(appId, containerId) {
    const app = this.getApp(appId);
    if (!app) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    const versionText = document.getElementById(`version-text-${appId}`);
    if (versionText) {
      versionText.innerHTML = `Versión ${app.version} · ${app.platform} ${app.architecture} · ${(app.sizeBytes / 1024 / 1024).toFixed(1)} MB`;
    }

    const downloadBtn = document.getElementById(`btn-dl-${appId}`);
    if (downloadBtn) {
      downloadBtn.href = app.downloadUrl;
      downloadBtn.setAttribute('aria-label', `Descargar ${app.name} versión ${app.version}`);
    }

    const copyBtn = document.getElementById(`btn-copy-${appId}`);
    if (copyBtn) {
      copyBtn.onclick = () => {
        const absoluteUrl = new URL(app.downloadUrl, window.location.href).href;
        navigator.clipboard.writeText(absoluteUrl).then(() => {
          alert("Enlace copiado al portapapeles.");
        });
      };
    }
  }
}
