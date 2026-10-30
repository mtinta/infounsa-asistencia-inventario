interface NumpadProps {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}

export default function NumpadTactil({ value, onChange, maxLength = 8 }: NumpadProps) {
  const keys = ['1','2','3','4','5','6','7','8','9','←','0','OK'];

  const handleKey = (k: string) => {
    if (k === '←') { onChange(value.slice(0, -1)); return; }
    if (k === 'OK') return;
    if (value.length < maxLength) onChange(value + k);
  };

  return (
    <div className="numpad">
      <div className="numpad-display">
        <span className="numpad-value">{value ? '•'.repeat(value.length) : 'Ingrese edad'}</span>
      </div>
      <div className="numpad-grid">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            className={`numpad-key ${k === 'OK' ? 'numpad-ok' : ''} ${k === '←' ? 'numpad-del' : ''}`}
            onClick={() => handleKey(k)}
            aria-label={k === '←' ? 'Borrar' : k}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
