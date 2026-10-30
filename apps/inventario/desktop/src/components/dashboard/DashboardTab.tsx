import { 
  Package as BoxIcon, 
  AlertTriangle as AlertIcon, 
  RefreshCw as SyncIcon, 
  Wifi, 
  TrendingUp as TrendIcon,
  Home as AreaIcon
} from 'lucide-react';
import { InventoryItem, InventoryMovement, InventoryActiveTab } from '../../types';
import Tooltip from '../ui/Tooltip';

interface DashboardTabProps {
  userRole: string | null;
  items: InventoryItem[];
  movements: InventoryMovement[];
  isOnline: boolean;
  setActiveTab: (tab: InventoryActiveTab) => void;
}

export default function DashboardTab({
  userRole,
  items,
  movements,
  isOnline,
  setActiveTab: _setActiveTab,
}: DashboardTabProps) {
  const criticalItems = items.filter(i => i.stock < i.min_stock);

  // 1. Calculate top items with most movements ( entradas + salidas )
  const itemMovementCounts: Record<string, number> = {};
  for (const m of movements) {
    const key = m.item_name || `Bien #${m.item_id}`;
    itemMovementCounts[key] = (itemMovementCounts[key] || 0) + m.quantity;
  }
  const topItems = Object.entries(itemMovementCounts)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // 2. Calculate top areas with most stock consumption ( salidas only )
  const areaSalidaQuantities: Record<string, number> = {};
  for (const m of movements) {
    if (m.type === 'salida' && m.destinatario_name) {
      // Extract area name (before " - " if formatted)
      const areaName = m.destinatario_name.split(' - ')[0].trim();
      areaSalidaQuantities[areaName] = (areaSalidaQuantities[areaName] || 0) + m.quantity;
    }
  }
  const topAreas = Object.entries(areaSalidaQuantities)
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // 3. Entradas vs Salidas totals
  let totalEntradas = 0;
  let totalSalidas = 0;
  for (const m of movements) {
    if (m.type === 'entrada') {
      totalEntradas += m.quantity;
    } else {
      totalSalidas += m.quantity;
    }
  }

  // Chart heights configuration
  const maxVal = Math.max(totalEntradas, totalSalidas, 10);
  const entradaHeight = (totalEntradas / maxVal) * 120;
  const salidaHeight = (totalSalidas / maxVal) * 120;

  return (
    <div className="dashboard-tab-container" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="panel-header" style={{ marginBottom: '10px' }}>
        <div>
          <h3>Resumen General de Almacén</h3>
          <p className="kiosk-hint">Sistema de Gestión de Inventarios y Control de Stock</p>
        </div>
        <div style={{ padding: '6px 12px', borderRadius: '20px', backgroundColor: 'var(--bg-accent, rgba(96,165,250,0.1))', color: '#60a5fa', fontSize: '13px', fontWeight: 'bold' }}>
          Rol: {userRole === 'administrador' ? 'Administrador' : 'Operador'}
        </div>
      </div>

      {/* Grid de Metricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        <div className="settings-card" style={{ padding: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', textTransform: 'uppercase', opacity: 0.8 }}>Total Bienes</span>
            <BoxIcon size={16} style={{ color: '#60a5fa' }} />
          </div>
          <h2 style={{ fontSize: '32px', margin: '10px 0 5px 0', fontWeight: 'bold' }}>{items.length}</h2>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Artículos en catálogo local</p>
        </div>

        <Tooltip content="Cantidad de bienes cuya existencia actual se encuentra por debajo del stock mínimo de seguridad." position="top" style={{ display: 'block' }}>
          <div className="settings-card" style={{ padding: '15px', height: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', textTransform: 'uppercase', opacity: 0.8 }}>Stock Crítico</span>
              <AlertIcon size={16} style={{ color: '#ef4444' }} />
            </div>
            <h2 style={{ fontSize: '32px', margin: '10px 0 5px 0', fontWeight: 'bold', color: '#ef4444' }}>
              {criticalItems.length}
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Bienes bajo nivel mínimo</p>
          </div>
        </Tooltip>

        <div className="settings-card" style={{ padding: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', textTransform: 'uppercase', opacity: 0.8 }}>Movimientos</span>
            <SyncIcon size={16} style={{ color: '#10b981' }} />
          </div>
          <h2 style={{ fontSize: '32px', margin: '10px 0 5px 0', fontWeight: 'bold' }}>{movements.length}</h2>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Operaciones registradas</p>
        </div>

        <div className="settings-card" style={{ padding: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', textTransform: 'uppercase', opacity: 0.8 }}>Modo Red</span>
            <Wifi size={16} style={{ color: isOnline ? '#10b981' : '#ef4444' }} />
          </div>
          <h2 style={{ fontSize: '20px', margin: '20px 0 5px 0', fontWeight: 'bold' }}>{isOnline ? 'Online' : 'Offline'}</h2>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{isOnline ? 'Sincronizado con Servidor' : 'Sin conexión'}</p>
        </div>
      </div>

      {/* Grid de Reportes y Rankings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '10px' }}>
        
        {/* Grafico Entradas vs Salidas */}
        <Tooltip content="Balance comparativo acumulado de unidades ingresadas vs unidades despachadas en el período." position="top" style={{ display: 'block' }}>
          <div className="settings-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', height: '100%', boxSizing: 'border-box' }}>
            <h4 style={{ borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '8px' }}>Volumen: Ingresos vs Egresos</h4>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', height: '160px', gap: '40px', paddingBottom: '10px' }}>
              {/* Entrada bar */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#22c55e' }}>{totalEntradas} uds</span>
                <div style={{ width: '45px', height: `${entradaHeight}px`, backgroundColor: '#22c55e', borderRadius: '4px 4px 0 0', transition: 'height 0.5s ease' }} />
                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Ingresos</span>
              </div>
              {/* Salida bar */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#ef4444' }}>{totalSalidas} uds</span>
                <div style={{ width: '45px', height: `${salidaHeight}px`, backgroundColor: '#ef4444', borderRadius: '4px 4px 0 0', transition: 'height 0.5s ease' }} />
                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Egresos</span>
              </div>
            </div>
          </div>
        </Tooltip>

        {/* Areas con mas consumos */}
        <div className="settings-card" style={{ padding: '20px' }}>
          <h4 style={{ borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AreaIcon size={16} style={{ color: '#60a5fa' }} /> Áreas con Mayor Consumo
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' }}>
            {topAreas.map((area, index) => (
              <div key={area.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                  <span><strong>{index + 1}. {area.name}</strong></span>
                  <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{area.quantity} unidades</span>
                </div>
                <div style={{ height: '6px', backgroundColor: 'var(--border-color, #334155)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (area.quantity / (totalSalidas || 1)) * 100)}%`, backgroundColor: '#3b82f6' }} />
                </div>
              </div>
            ))}
            {topAreas.length === 0 && (
              <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                No se registran consumos (egresos) de áreas.
              </p>
            )}
          </div>
        </div>

        {/* Productos con mas movimientos */}
        <div className="settings-card" style={{ padding: '20px' }}>
          <h4 style={{ borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <TrendIcon size={16} style={{ color: '#10b981' }} /> Bienes de Alta Rotación
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' }}>
            {topItems.map((item, index) => (
              <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '12.5px' }}>
                  <strong>{index + 1}. {item.name}</strong>
                </span>
                <span className="badge badge-pending" style={{ padding: '2px 8px' }}>
                  {item.total} uds movidas
                </span>
              </div>
            ))}
            {topItems.length === 0 && (
              <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                No hay movimientos de rotación de stock.
              </p>
            )}
          </div>
        </div>

      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', marginTop: '10px' }}>
        <div className="settings-card" style={{ padding: '20px' }}>
          <h4 style={{ marginBottom: '15px', borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '8px' }}>Alertas de Reposición Urgente</h4>
          <div className="table-scroll">
            <table className="crud-table mini-table">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th>Categoría</th>
                  <th>Stock Actual</th>
                  <th>Stock Mínimo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {criticalItems.map(i => (
                  <tr key={i.id}>
                    <td><strong>{i.name}</strong></td>
                    <td>{i.category}</td>
                    <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{i.stock}</td>
                    <td>{i.min_stock}</td>
                    <td>
                      <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
                        Crítico
                      </span>
                    </td>
                  </tr>
                ))}
                {criticalItems.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: '#10b981', fontWeight: 'bold' }}>
                      🟢 Todo el stock se encuentra en niveles saludables.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
