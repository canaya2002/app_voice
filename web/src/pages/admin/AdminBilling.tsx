import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getStats, getOrganizations, getBilling, updateBillingRecord } from './adminApi';

interface OrgBilling {
  id: string; name: string; slug: string; billing_type: string;
  price_per_seat: number | null; flat_price: number | null;
  seats_used: number; billing_cycle: string; active: boolean;
  mrr: number;
}

interface BillingRecord {
  id: string; org_id: string; period_start: string; period_end: string;
  seats_billed: number; amount_charged: number; status: string;
  notes: string | null; created_at: string;
}

function formatCurrency(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminBilling() {
  const [stats, setStats] = useState<{ premium_users: number; premium_mrr: number; enterprise_mrr: number; total_mrr: number } | null>(null);
  const [orgs, setOrgs] = useState<OrgBilling[]>([]);
  const [billing, setBilling] = useState<BillingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getStats(),
      getOrganizations({ status: 'active' }),
      getBilling(),
    ])
      .then(([s, o, b]) => {
        setStats(s);
        setOrgs(o);
        setBilling(b);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  const handleMarkPaid = async (id: string) => {
    try {
      await updateBillingRecord(id, { status: 'paid' });
      const b = await getBilling();
      setBilling(b);
      flash('Marcado como pagado');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleExportCSV = () => {
    const header = 'Org ID,Período inicio,Período fin,Seats,Monto,Status,Fecha\n';
    const rows = billing.map((b) =>
      `${b.org_id},${b.period_start},${b.period_end},${b.seats_billed},${b.amount_charged},${b.status},${formatDate(b.created_at)}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `sythio-billing-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <div className="admin-loading"><div className="spinner" /></div>;

  const totalEnterpriseMRR = orgs.reduce((sum, o) => sum + o.mrr, 0);
  const premiumNetMRR = (stats?.premium_mrr ?? 0) * 0.70;

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">Billing</h1>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      <div className="admin-cards-grid">
        <div className="admin-metric-card accent">
          <p className="admin-metric-label">MRR total</p>
          <p className="admin-metric-value">{formatCurrency(premiumNetMRR + totalEnterpriseMRR)}</p>
          <p className="admin-tiny">Premium (net) + Enterprise</p>
        </div>
        <div className="admin-metric-card">
          <p className="admin-metric-label">ARR proyectado</p>
          <p className="admin-metric-value">{formatCurrency((premiumNetMRR + totalEnterpriseMRR) * 12)}</p>
        </div>
        <div className="admin-metric-card">
          <p className="admin-metric-label">Usuarios premium</p>
          <p className="admin-metric-value">{stats?.premium_users ?? 0}</p>
          <p className="admin-tiny">× $14.99 × 70% = {formatCurrency(premiumNetMRR)}/mes</p>
        </div>
        <div className="admin-metric-card">
          <p className="admin-metric-label">Enterprise MRR</p>
          <p className="admin-metric-value">{formatCurrency(totalEnterpriseMRR)}</p>
          <p className="admin-tiny">{orgs.length} organizaciones activas</p>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>Billing por organización (mes actual)</h3>
          <button className="admin-btn secondary" onClick={handleExportCSV}>Exportar CSV</button>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Organización</th>
              <th>Tipo</th>
              <th>Seats</th>
              <th>MRR</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 ? (
              <tr><td colSpan={5} className="admin-muted" style={{ textAlign: 'center', padding: 24 }}>Sin organizaciones activas</td></tr>
            ) : orgs.map((org) => (
              <tr key={org.id}>
                <td><Link to={`/admin/organizations/${org.id}`} className="admin-link">{org.name}</Link></td>
                <td>{org.billing_type === 'per_seat' ? `Per seat (${formatCurrency(org.price_per_seat ?? 0)})` : `Flat`}</td>
                <td>{org.seats_used}</td>
                <td>{formatCurrency(org.mrr)}</td>
                <td><span className="admin-badge green">Activa</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-card">
        <h3>Historial de pagos recientes</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Período</th>
              <th>Seats</th>
              <th>Monto</th>
              <th>Status</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {billing.length === 0 ? (
              <tr><td colSpan={6} className="admin-muted" style={{ textAlign: 'center', padding: 24 }}>Sin registros</td></tr>
            ) : billing.slice(0, 20).map((b) => (
              <tr key={b.id}>
                <td>{formatDate(b.period_start)} — {formatDate(b.period_end)}</td>
                <td>{b.seats_billed}</td>
                <td>{formatCurrency(b.amount_charged)}</td>
                <td><span className={`admin-badge ${b.status === 'paid' ? 'green' : b.status === 'pending' ? 'yellow' : 'red'}`}>{b.status}</span></td>
                <td>{formatDate(b.created_at)}</td>
                <td>
                  {b.status !== 'paid' && (
                    <button className="admin-btn-sm green" onClick={() => handleMarkPaid(b.id)}>Marcar pagado</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
