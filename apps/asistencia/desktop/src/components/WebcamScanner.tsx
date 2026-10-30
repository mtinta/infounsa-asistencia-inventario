import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface WebcamScannerProps {
  onScan: (code: string) => void;
  paused?: boolean;
}

export function WebcamScanner({ onScan, paused = false }: WebcamScannerProps) {
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const isCooldownRef = useRef(false);
  const pausedRef = useRef(paused);

  // Mantener referencia del estado de pausa
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Cargar cámaras disponibles
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          setSelectedCameraId(devices[0].id);
        } else {
          setErrorMsg('No se detectaron cámaras en este dispositivo.');
        }
      })
      .catch((err) => {
        console.error('Error al listar cámaras:', err);
        setErrorMsg('Error al acceder a la cámara. Asegúrese de dar permisos.');
      });

    return () => {
      if (html5QrcodeRef.current) {
        html5QrcodeRef.current.stop().catch(console.error);
      }
    };
  }, []);

  // Generar Beep audible usando Web Audio API
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // Tono alto y claro (La5)
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15); // Desvanecer rápido

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (err) {
      console.warn('No se pudo reproducir el beep:', err);
    }
  };

  const handleSuccessScan = (decodedText: string) => {
    // Si está en pausa (ej: modal abierto) o en cooldown, omitir
    if (isCooldownRef.current || pausedRef.current) {
      return;
    }

    // Intentar extraer DNI (8 dígitos) o código UNSA (8-12 caracteres alfanuméricos)
    const dniMatch = decodedText.match(/[a-zA-Z0-9]{8,12}/);
    const dni = dniMatch ? dniMatch[0] : decodedText.trim();

    isCooldownRef.current = true;
    playBeep();
    onScan(dni);

    // Cooldown de 2.5 segundos para evitar múltiples registros rápidos del mismo DNI
    setTimeout(() => {
      isCooldownRef.current = false;
    }, 2500);
  };

  const startScanning = async () => {
    if (!selectedCameraId) return;
    setIsLoading(true);
    setErrorMsg('');

    try {
      const html5Qrcode = new Html5Qrcode('reader');
      html5QrcodeRef.current = html5Qrcode;

      await html5Qrcode.start(
        selectedCameraId,
        {
          fps: 10,
          qrbox: { width: 260, height: 130 },
        },
        (decodedText) => {
          handleSuccessScan(decodedText);
        },
        () => {
          // Callback de error de lectura (silenciado para no saturar consola)
        }
      );

      setIsScanning(true);
      setIsLoading(false);
    } catch (err: unknown) {
      console.error('Error al iniciar escaneo:', err);
      setErrorMsg('Error al iniciar la cámara. Asegúrese de que no esté en uso.');
      setIsLoading(false);
    }
  };

  const stopScanning = async () => {
    if (html5QrcodeRef.current && isScanning) {
      setIsLoading(true);
      try {
        await html5QrcodeRef.current.stop();
        html5QrcodeRef.current = null;
        setIsScanning(false);
      } catch (err) {
        console.error('Error al detener la cámara:', err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="webcam-scanner-container">
      <div className="webcam-selector">
        <label>Seleccionar Cámara:</label>
        <select
          value={selectedCameraId}
          onChange={(e) => {
            setSelectedCameraId(e.target.value);
            if (isScanning) {
              stopScanning().then(() => startScanning());
            }
          }}
          disabled={isScanning || cameras.length <= 1}
        >
          {cameras.map((device) => (
            <option key={device.id} value={device.id}>
              {device.label || `Cámara ${cameras.indexOf(device) + 1}`}
            </option>
          ))}
        </select>
      </div>

      {errorMsg && <div className="scanner-error">{errorMsg}</div>}

      <div className="scanner-preview-box">
        {/* Elemento de renderizado del video de la cámara */}
        <div id="reader" className={isScanning ? 'active' : ''}></div>
        
        {!isScanning && (
          <div className="scanner-placeholder">
            <span>📷 Cámara Apagada</span>
            <p>Haga clic en el botón inferior para iniciar el escaneo visual de DNI.</p>
          </div>
        )}

        {isScanning && (
          <div className="scanner-hud-overlay">
            <div className="hud-laser"></div>
            {paused && <div className="hud-paused-status">LECTURA DETENIDA</div>}
          </div>
        )}
      </div>

      <div className="scanner-actions">
        {!isScanning ? (
          <button
            type="button"
            className="btn-scanner-toggle start-btn"
            onClick={startScanning}
            disabled={isLoading || !selectedCameraId}
          >
            {isLoading ? 'Cargando...' : 'Encender Cámara'}
          </button>
        ) : (
          <button
            type="button"
            className="btn-scanner-toggle stop-btn"
            onClick={stopScanning}
            disabled={isLoading}
          >
            {isLoading ? 'Deteniendo...' : 'Apagar Cámara'}
          </button>
        )}
      </div>
    </div>
  );
}
