import React from 'react';
import Modal from './Modal';
import Tooltip from './Tooltip';

interface RegistroVisitanteModalProps {
  dni: string;
  name: string;
  nombres?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  age: string;
  type: 'entrada' | 'salida';
  reason: string;
  notes: string;
  isSubmitting: boolean;
  onNameChange: (value: string) => void;
  onNombresChange?: (value: string) => void;
  onApellidoPaternoChange?: (value: string) => void;
  onApellidoMaternoChange?: (value: string) => void;
  onAgeChange: (value: string) => void;
  onTypeChange: (value: 'entrada' | 'salida') => void;
  onReasonChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onSkip: () => void;
}

export default function RegistroVisitanteModal({
  dni,
  name,
  nombres = '',
  apellidoPaterno = '',
  apellidoMaterno = '',
  age,
  type,
  reason,
  notes,
  isSubmitting,
  onNameChange,
  onNombresChange,
  onApellidoPaternoChange,
  onApellidoMaternoChange,
  onAgeChange,
  onTypeChange,
  onReasonChange,
  onNotesChange,
  onClose,
  onSubmit,
  onSkip,
}: RegistroVisitanteModalProps) {
  const now = new Date();
  const currentDate = now.toISOString().slice(0, 10);
  const currentTime = now.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const canSubmit = (nombres.trim().length >= 2 || name.trim().length >= 3) && reason.trim().length >= 3 && !isSubmitting;

  return (
    <Modal
      title="Registro rápido de visitantes"
      subtitle={`DNI ${dni} no está registrado. Complete la identificación para registrar la marcación.`}
      onClose={onClose}
    >
      <form className="visitor-registration" onSubmit={onSubmit} noValidate>
        <div className="visitor-registration__hero">
          <span className="visitor-registration__eyebrow">Control de acceso</span>
          <strong>{type === 'entrada' ? 'Ingreso de visitante' : 'Salida de visitante'}</strong>
        </div>

        <div className="visitor-registration__grid">
          <div className="form-group visitor-registration__wide">
            <label htmlFor="visitor-nombres">Nombres *</label>
            <input
              id="visitor-nombres"
              type="text"
              value={nombres}
              onChange={(event) => {
                const val = event.target.value;
                onNombresChange?.(val);
                const combined = `${apellidoPaterno} ${apellidoMaterno}`.trim() ? `${apellidoPaterno} ${apellidoMaterno}, ${val}`.trim() : val;
                onNameChange(combined);
              }}
              className="form-input"
              placeholder="Ej: Juan Carlos"
              required
              autoFocus
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="visitor-paterno">Apellido Paterno *</label>
            <input
              id="visitor-paterno"
              type="text"
              value={apellidoPaterno}
              onChange={(event) => {
                const val = event.target.value;
                onApellidoPaternoChange?.(val);
                const surnames = `${val} ${apellidoMaterno}`.trim();
                const combined = surnames ? `${surnames}, ${nombres}`.trim() : nombres;
                onNameChange(combined);
              }}
              className="form-input"
              placeholder="Ej: Pérez"
              required
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="visitor-materno">Apellido Materno</label>
            <input
              id="visitor-materno"
              type="text"
              value={apellidoMaterno}
              onChange={(event) => {
                const val = event.target.value;
                onApellidoMaternoChange?.(val);
                const surnames = `${apellidoPaterno} ${val}`.trim();
                const combined = surnames ? `${surnames}, ${nombres}`.trim() : nombres;
                onNameChange(combined);
              }}
              className="form-input"
              placeholder="Ej: Quispe"
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="visitor-dni">DNI</label>
            <input id="visitor-dni" type="text" value={dni} className="form-input" readOnly />
          </div>

          <div className="form-group">
            <label htmlFor="visitor-age">Edad referencial</label>
            <input
              id="visitor-age"
              type="text"
              value={age}
              onChange={(event) => onAgeChange(event.target.value.replace(/\D/g, '').slice(0, 2))}
              className="form-input"
              placeholder="Opcional"
              inputMode="numeric"
            />
          </div>

          <div className="form-group">
            <label htmlFor="visitor-type">Tipo de marcacion</label>
            <select
              id="visitor-type"
              className="form-input form-select"
              value={type}
              onChange={(event) => onTypeChange(event.target.value as 'entrada' | 'salida')}
            >
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="visitor-date">Fecha</label>
            <input id="visitor-date" type="date" value={currentDate} className="form-input" readOnly />
          </div>

          <div className="form-group">
            <label htmlFor="visitor-time">Hora</label>
            <input id="visitor-time" type="text" value={currentTime} className="form-input" readOnly />
          </div>

          <div className="form-group visitor-registration__wide">
            <label htmlFor="visitor-reason">Motivo de visita *</label>
            <textarea
              id="visitor-reason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              className="form-input"
              placeholder="Describa brevemente el motivo de la visita"
              rows={3}
              required
            />
          </div>

          <div className="form-group visitor-registration__wide">
            <label htmlFor="visitor-notes">Observaciones</label>
            <textarea
              id="visitor-notes"
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              className="form-input"
              placeholder="Datos adicionales, oficina destino o responsable"
              rows={2}
            />
          </div>
        </div>

        <div className="modal-actions visitor-registration__actions">
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancelar
          </button>
          <div className="visitor-registration__actions-right">
            <Tooltip content="Registra el ingreso bajo código genérico sin nombres nominales (Solo contingencias excepcionales)." position="top">
              <button type="button" className="btn-cancel btn-cancel--accent" onClick={onSkip}>
                Continuar sin identificar
              </button>
            </Tooltip>
            <button type="submit" className="btn-submit" disabled={!canSubmit}>
              {isSubmitting ? 'Registrando...' : 'Guardar marcacion'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
