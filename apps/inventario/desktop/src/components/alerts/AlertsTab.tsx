import { InventoryItem } from '../../types';
import Tooltip from '../ui/Tooltip';

interface AlertsTabProps {
  items: InventoryItem[];
}

export default function AlertsTab({ items }: AlertsTabProps) {
  const criticalItems = items.filter(i => i.stock < i.min_stock);

  return (
    <div>
      <div className="panel-header">
        <div>
          <h3>Alertas de Stock Crítico</h3>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '13px' }}>Bienes cuyo stock actual es menor al umbral mínimo requerido.</p>
        </div>
      </div>
      <div className="table-scroll" style={{ marginTop: '16px' }}>
        <table className="crud-table">
          <thead>
            <tr>
              <th style={{ width: '15%' }}>Código</th>
              <th style={{ width: '45%' }}>Descripción</th>
              <th style={{ width: '20%' }}>Stock Actual</th>
              <th style={{ width: '20%' }}>Stock Mínimo</th>
            </tr>
          </thead>
          <tbody>
            {criticalItems.map(item => (
              <tr key={item.id} className="critical-row">
                <td><code>{item.code}</code></td>
                <td><strong>{item.name}</strong></td>
                <td>
                  <Tooltip content="Nivel de existencias bajo el mínimo requerido. Requiere reposición urgente." position="top">
                    <span className="text-critical" style={{ cursor: 'help' }}>⚠️ {item.stock}</span>
                  </Tooltip>
                </td>
                <td>{item.min_stock}</td>
              </tr>
            ))}
            {criticalItems.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px' }}>No hay alertas de stock crítico. Todas las existencias están en rango óptimo.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
