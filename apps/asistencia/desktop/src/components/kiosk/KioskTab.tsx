import React, { useEffect, useRef, useState } from 'react';
import { AttendanceRecord } from '../../types';
import { Clock, UserCheck, CheckCircle2 } from 'lucide-react';
import Tooltip from '../ui/Tooltip';

interface KioskTabProps {
  dniInput: string;
  setDniInput: (v: string) => void;
  handleDniSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  records: AttendanceRecord[];
  syncQueue: AttendanceRecord[];
  scannedUserCard: AttendanceRecord | null;
  profileName?: string;
  profileLastName?: string;
}

export default function KioskTab({
  dniInput,
  setDniInput,
  handleDniSubmit,
  isLoading,
  records: _records,
  syncQueue: _syncQueue,
  scannedUserCard,
  profileName: _profileName,
  profileLastName: _profileLastName,
}: KioskTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Digital clock states
  const [currentTime, setCurrentTime] = useState(() => new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
      setCurrentDate(now.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Strict privacy: only show card if there is an active scan in progress (no fallback to past records)
  const activeCard = scannedUserCard;

  useEffect(() => {
    const shouldSkipRefocus = () => {
      const activeEl = document.activeElement;
      const isTypingInInput = activeEl && activeEl !== inputRef.current && (
        activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT'
      );
      const isModalOpen = !!document.querySelector('.modal-overlay') || !!document.querySelector('.modal-card');
      return Boolean(isTypingInInput || isModalOpen);
    };

    if (inputRef.current && !shouldSkipRefocus()) {
      inputRef.current.focus();
    }

    const handleWindowClick = () => {
      if (shouldSkipRefocus()) return;
      if (inputRef.current) {
        inputRef.current.focus();
      }
    };
    window.addEventListener('click', handleWindowClick);

    const interval = setInterval(() => {
      if (shouldSkipRefocus()) return;
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    }, 1500);

    return () => {
      window.removeEventListener('click', handleWindowClick);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="kiosk-tab-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 'calc(100vh - 120px)', padding: '20px 10px', boxSizing: 'border-box' }}>
      
      {/* 1. RELOJ DIGITAL SUPERIOR GRANDE */}
      <div className="kiosk-big-clock-container" style={{ textAlign: 'center', marginBottom: '28px', animation: 'fadeIn 0.3s ease' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <Clock size={38} color="#38bdf8" strokeWidth={2} style={{ filter: 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.4))' }} />
          <h1 style={{
            fontSize: 'clamp(2.8rem, 6vw, 4.5rem)',
            fontWeight: '800',
            letterSpacing: '3px',
            fontFamily: 'monospace, sans-serif',
            color: 'var(--text-main, #f8fafc)',
            margin: 0,
            lineHeight: 1,
            textShadow: '0 2px 10px rgba(0,0,0,0.3)',
          }}>
            {currentTime}
          </h1>
        </div>
        <p style={{
          fontSize: 'clamp(1rem, 1.6vw, 1.25rem)',
          color: 'var(--text-muted, #94a3b8)',
          textTransform: 'capitalize',
          margin: '10px 0 0 0',
          fontWeight: '500',
          letterSpacing: '0.5px'
        }}>
          {currentDate}
        </p>
      </div>

      {/* 2. CONTENEDOR PRINCIPAL: ESTADO DE MARCACIÓN O FORMULARIO DE ESPERA */}
      <div style={{ width: '100%', maxWidth: '640px' }}>
        {activeCard ? (
          /* TARJETA DE CONFIRMACIÓN INMEDIATA (SE OCULTA AUTOMÁTICAMENTE EN 5 SEGUNDOS) */
          <div
            className="kiosk-card"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '36px 30px',
              borderRadius: '16px',
              border: activeCard.type === 'salida' ? '2px solid #ef4444' : '2px solid #10b981',
              backgroundColor: 'var(--bg-panel, #1e293b)',
              boxShadow: activeCard.type === 'salida' ? '0 10px 30px rgba(239, 68, 68, 0.25)' : '0 10px 30px rgba(16, 185, 129, 0.25)',
              textAlign: 'center',
              animation: 'fadeIn 0.25s ease-out',
            }}
          >
            <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: activeCard.type === 'salida' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <CheckCircle2 size={40} color={activeCard.type === 'salida' ? '#ef4444' : '#10b981'} strokeWidth={2.2} />
              </div>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <span
                style={{
                  display: 'inline-block',
                  backgroundColor: activeCard.type === 'salida' ? '#dc2626' : '#16a34a',
                  color: '#ffffff',
                  fontWeight: '800',
                  fontSize: '1.25rem',
                  letterSpacing: '1.5px',
                  padding: '6px 24px',
                  borderRadius: '9999px',
                  textTransform: 'uppercase',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}
              >
                {activeCard.type === 'salida' ? 'SALIDA REGISTRADA' : 'ENTRADA REGISTRADA'}
              </span>
            </div>

            <h2 style={{ fontSize: '1.6rem', color: '#38bdf8', margin: '0 0 8px 0', fontWeight: '700' }}>
              {activeCard.name}
            </h2>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '1rem', color: 'var(--text-muted, #94a3b8)', marginBottom: '16px' }}>
              <span>DNI: <strong style={{ color: 'var(--text-main)', fontFamily: 'monospace' }}>{activeCard.dni}</strong></span>
              <span>•</span>
              <span>Hora: <strong style={{ color: 'var(--text-main)' }}>{new Date(activeCard.registered_at).toLocaleTimeString('es-PE')}</strong></span>
            </div>

            {activeCard.observacion && (
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px 14px', borderRadius: '8px', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '16px' }}>
                Obs: {activeCard.observacion}
              </div>
            )}

            {/* Temporizador visual de limpieza de pantalla */}
            <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
              Esta confirmación se cerrará automáticamente en unos segundos...
            </div>
          </div>
        ) : (
          /* ESTADO EN ESPERA MINIMALISTA (SOLO RELOJ + INPUT LISTO) */
          <div
            className="kiosk-card"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '40px 30px',
              borderRadius: '16px',
              border: '1px solid var(--border-color, #334155)',
              backgroundColor: 'var(--bg-panel, #1e293b)',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
              textAlign: 'center',
            }}
          >
            <div className="kiosk-icon-wrapper" aria-hidden="true" style={{ marginBottom: '16px' }}>
              <UserCheck size={48} strokeWidth={1.5} color="var(--accent, #38bdf8)" />
            </div>
            
            <h3 style={{ fontSize: 'clamp(1.2rem, 2.2vw, 1.5rem)', margin: '0 0 6px 0', fontWeight: '700', color: 'var(--text-main)' }}>
              Acerque su carnet al lector
            </h3>
            
            <p className="kiosk-hint" style={{ fontSize: '0.95rem', color: 'var(--text-muted, #94a3b8)', marginBottom: '24px' }}>
              O ingrese su DNI numérico de 8 dígitos y presione Enter
            </p>

            <form onSubmit={handleDniSubmit} className="kiosk-form" noValidate style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <input
                ref={inputRef}
                type="text"
                className="kiosk-input"
                placeholder="DNI (8 dígitos)"
                value={dniInput}
                onChange={(e) => setDniInput(e.target.value.replace(/[^0-9]/g, ''))}
                maxLength={8}
                autoFocus
                autoComplete="off"
                inputMode="numeric"
                aria-label="Ingrese DNI"
                style={{
                  fontSize: 'clamp(1.4rem, 2.4vw, 1.8rem)',
                  padding: '12px 16px',
                  textAlign: 'center',
                  letterSpacing: '4px',
                  fontFamily: 'monospace',
                  width: '100%',
                  maxWidth: '340px',
                  borderRadius: '10px',
                  border: '2px solid var(--border-color, #334155)',
                  backgroundColor: 'var(--bg-main, #0f172a)',
                  color: 'var(--text-main, #f8fafc)',
                  outline: 'none',
                }}
              />
              
              <Tooltip content="Use este botón al digitar el DNI en pantalla. Con lector de código de barras el registro es automático." position="top" style={{ width: '100%', maxWidth: '340px' }}>
                <button
                  type="submit"
                  className="kiosk-submit-btn"
                  disabled={isLoading || dniInput.length !== 8}
                  style={{
                    fontSize: '1rem',
                    fontWeight: '700',
                    padding: '12px 28px',
                    borderRadius: '8px',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    cursor: (isLoading || dniInput.length !== 8) ? 'not-allowed' : 'pointer',
                    opacity: (isLoading || dniInput.length !== 8) ? 0.6 : 1,
                    transition: 'all 0.2s',
                    width: '100%',
                  }}
                >
                  {isLoading ? (
                    <span className="loading-dots">Procesando<span>.</span><span>.</span><span>.</span></span>
                  ) : 'Marcar Asistencia'}
                </button>
              </Tooltip>
            </form>

            {isLoading && (
              <div className="progress-bar" role="progressbar" aria-label="Procesando" style={{ marginTop: '16px' }}>
                <div className="progress-bar-fill"></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
