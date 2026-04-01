import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getStats } from './adminApi';

interface Stats {
  total_users: number;
  free_users: number;
  premium_users: number;
  enterprise_users: number;
  active_orgs: number;
  notes_today: number;
  estimated_cost_today: number;
  premium_mrr: number;
  enterprise_mrr: number;
  total_mrr: number;
  activity: {
    users_by_day: Record<string, number>;
    notes_by_day: Record<string, number>;
  };
  recent_orgs: Array<{
    id: string;
    name: string;
    slug: string;
    domain: string | null;
    seats_used: number;
    max_seats: number;
    active: boolean;
    created_at: string;
  }>;
}

function formatCurrency(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function MiniChart({ data, label }: { data: Record<string, number>; label: string }) {
  const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <p className="admin-muted">Sin datos</p>;

  const maxVal = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="admin-chart">
      <p className="admin-chart-label">{label}</p>
      <div className="admin-chart-bars">
        {entries.map(([day, count]) => (
          <div key={day} className="admin-chart-bar-wrap" title={`${day}: ${count}`}>
            <div
              className="admin-chart-bar"
              style={{ height: `${Math.max((count / maxVal) * 100, 2)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="admin-chart-x">
        <span>{entries[0]?.[0]?.slice(5)}</span>
        <span>{entries[entries.length - 1]?.[0]?.slice(5)}</span>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin-loading"><div className="spinner" /></div>;
  if (error) return <div className="admin-error">{error}</div>;
  if (!stats) return null;

  const cards = [
    { label: 'Organizaciones activas', value: String(stats.active_orgs), accent: false },
    { label: 'Usuarios totales', value: `${stats.total_users} (${stats.free_users}F / ${stats.premium_users}P / ${stats.enterprise_users}E)`, accent: false },
    { label: 'MRR estimado', value: formatCurrency(stats.total_mrr), accent: true },
    { label: 'Notas hoy', value: String(stats.notes_today), accent: false },
    { label: 'Costo estimado hoy', value: formatCurrency(stats.estimated_cost_today), accent: false },
  ];

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">Overview</h1>

      <div className="admin-cards-grid">
        {cards.map((c, i) => (
          <div key={i} className={`admin-metric-card ${c.accent ? 'accent' : ''}`}>
            <p className="admin-metric-label">{c.label}</p>
            <p className="admin-metric-value">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="admin-row">
        <div className="admin-card" style={{ flex: 1 }}>
          <h3>Nuevos usuarios (30 días)</h3>
          <MiniChart data={stats.activity.users_by_day} label="" />
        </div>
        <div className="admin-card" style={{ flex: 1 }}>
          <h3>Notas procesadas (30 días)</h3>
          <MiniChart data={stats.activity.notes_by_day} label="" />
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>Organizaciones recientes</h3>
          <Link to="/admin/organizations" className="admin-link">Ver todas →</Link>
        </div>
        {stats.recent_orgs.length === 0 ? (
          <p className="admin-muted">No hay organizaciones aún</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Dominio</th>
                <th>Seats</th>
                <th>Status</th>
                <th>Creada</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_orgs.map((org) => (
                <tr key={org.id}>
                  <td><Link to={`/admin/organizations/${org.id}`} className="admin-link">{org.name}</Link></td>
                  <td>{org.domain || '—'}</td>
                  <td>{org.seats_used}/{org.max_seats}</td>
                  <td><span className={`admin-badge ${org.active ? 'green' : 'red'}`}>{org.active ? 'Activa' : 'Inactiva'}</span></td>
                  <td>{formatDate(org.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-row">
        <div className="admin-card" style={{ flex: 1 }}>
          <h3>Revenue breakdown</h3>
          <div className="admin-revenue-row">
            <div>
              <p className="admin-muted">Premium MRR</p>
              <p className="admin-metric-value">{formatCurrency(stats.premium_mrr * 0.70)}</p>
              <p className="admin-tiny">{stats.premium_users} usuarios × $14.99 × 70%</p>
            </div>
            <div>
              <p className="admin-muted">Enterprise MRR</p>
              <p className="admin-metric-value">{formatCurrency(stats.enterprise_mrr)}</p>
              <p className="admin-tiny">{stats.active_orgs} organizaciones</p>
            </div>
            <div>
              <p className="admin-muted">ARR proyectado</p>
              <p className="admin-metric-value">{formatCurrency(stats.total_mrr * 12)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
