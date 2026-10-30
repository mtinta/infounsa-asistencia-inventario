import React, { useEffect } from 'react';

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function Modal({ title, subtitle, onClose, children }: ModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h4 id="modal-title">{title}</h4>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar modal">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
