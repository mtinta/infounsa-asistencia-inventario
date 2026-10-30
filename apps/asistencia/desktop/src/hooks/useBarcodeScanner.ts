import { useEffect, useRef } from 'react';

interface UseBarcodeScannerOptions {
  onScan: (code: string) => void;
  enabled?: boolean;
  timeThreshold?: number; // Máximo tiempo entre caracteres en ms (ej: 50ms)
  minLength?: number;     // Longitud mínima del código (DNI = 8)
}

export function useBarcodeScanner({
  onScan,
  enabled = true,
  timeThreshold = 50,
  minLength = 8,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string[]>([]);
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = [];
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignorar teclas modificadoras
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      // Ignorar si el usuario está enfocado en un campo de texto de un modal
      // (por ejemplo, al registrar un visitante o la edad de un menor)
      const target = event.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        // Si el input está dentro de un modal, no queremos interceptar la lectura globalmente
        // para que no interfiera con lo que escribe el usuario.
        // Podemos verificar si el input tiene la clase 'form-input' (usada en modales) o si
        // no es el campo de entrada principal del kiosco.
        const isKioskInput = target.classList.contains('kiosk-input');
        if (!isKioskInput) {
          return;
        }
      }

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      const key = event.key;

      // Si presiona Enter, procesamos lo acumulado
      if (key === 'Enter') {
        const rawCode = bufferRef.current.join('');
        bufferRef.current = [];

        // Validar longitud y que no esté vacío
        if (rawCode.length >= minLength) {
          event.preventDefault();
          event.stopPropagation();
          onScan(rawCode);
        }
        return;
      }

      // Acumular caracteres simples (letras o números)
      if (key.length === 1) {
        // Si la diferencia de tiempo entre caracteres es mayor al umbral, 
        // asumimos que es escritura humana lenta y reiniciamos el buffer.
        if (bufferRef.current.length > 0 && timeDiff > timeThreshold) {
          bufferRef.current = [];
        }
        bufferRef.current.push(key);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, onScan, timeThreshold, minLength]);
}
