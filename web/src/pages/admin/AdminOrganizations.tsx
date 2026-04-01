import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getOrganizations, createOrganization } from './adminApi';

interface Org {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  billing_type: string;
  price_per_seat: number | null;
  flat_price: number | null;
  billing_cycle: string;
  max_seats: number;
  seats_used: number;
  active: boolean;
  created_at: string;
  mrr: number;
}

function formatCurrency(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

export default function AdminOrganizations() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // New org form
  const [form, setForm] = useState({
    name: '', slug: '', domain: '', billing_type: 'per_seat',
    price_per_seat: '', flat_price: '', billing_cycle: 'monthly',
    max_seats: '10', contract_start: '', contract_end: '',
    notes: '', admin_email: '',
    custom_audio_minutes_per_day: '', custom_notes_per_day: '',
  });

  const fetchOrgs = () => {
    setLoading(true);
    getOrganizations({ search, status: statusFilter, sort: sortField, order: sortOrder })
      .then(setOrgs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchOrgs(); }, [search, statusFilter, sortField, sortOrder]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createOrganization({
        name: form.name,
        slug: form.slug || slugify(form.name),
        domain: form.domain || null,
        billing_type: form.billing_type,
        price_per_seat: form.billing_type === 'per_seat' ? parseFloat(form.price_per_seat) || null : null,
        flat_price: form.billing_type === 'flat' ? parseFloat(form.flat_price) || null : null,
        billing_cycle: form.billing_cycle,
        max_seats: parseInt(form.max_seats) || 10,
        contract_start: form.contract_start || null,
        contract_end: form.contract_end || null,
        notes: form.notes || null,
        admin_email: form.admin_email || null,
        custom_audio_minutes_per_day: form.custom_audio_minutes_per_day ? parseInt(form.custom_audio_minutes_per_day) : null,
        custom_notes_per_day: form.custom_notes_per_day ? parseInt(form.custom_notes_per_day) : null,
      });
      setShowModal(false);
      setForm({ name: '', slug: '', domain: '', billing_type: 'per_seat', price_per_seat: '', flat_price: '', billing_cycle: 'monthly', max_seats: '10', contract_start: '', contract_end: '', notes: '', admin_email: '', custom_audio_minutes_per_day: '', custom_notes_per_day: '' });
      fetchOrgs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Organizaciones</h1>
        <button className="admin-btn primary" onClick={() => setShowModal(true)}>+ Nueva Organización</button>
      </div>

      <div className="admin-filters">
        <input
          className="admin-search"
          type="text"
          placeholder="Buscar por nombre o dominio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="admin-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </select>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {loading ? (
        <div className="admin-loading"><div className="spinner" /></div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('name')}>Nombre {sortField === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</th>
              <th>Dominio</th>
              <th>Plan</th>
              <th className="sortable" onClick={() => handleSort('seats_used')}>Seats {sortField === 'seats_used' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</th>
              <th className="sortable" onClick={() => handleSort('mrr')}>MRR {sortField === 'mrr' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</th>
              <th>Status</th>
              <th className="sortable" onClick={() => handleSort('created_at')}>Creada {sortField === 'created_at' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 ? (
              <tr><td colSpan={7} className="admin-muted" style={{ textAlign: 'center', padding: 32 }}>No hay organizaciones</td></tr>
            ) : orgs.map((org) => (
              <tr key={org.id} className="clickable">
                <td><Link to={`/admin/organizations/${org.id}`} className="admin-link">{org.name}</Link></td>
                <td>{org.domain || '—'}</td>
                <td>{org.billing_type === 'per_seat' ? `Per seat (${formatCurrency(org.price_per_seat ?? 0)})` : `Flat (${formatCurrency(org.flat_price ?? 0)})`}</td>
                <td>{org.seats_used}/{org.max_seats}</td>
                <td>{formatCurrency(org.mrr)}</td>
                <td><span className={`admin-badge ${org.active ? 'green' : 'red'}`}>{org.active ? 'Activa' : 'Inactiva'}</span></td>
                <td>{formatDate(org.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Create Org Modal */}
      {showModal && (
        <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>Nueva Organización</h2>
              <button className="admin-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreate} className="admin-form">
              <div className="admin-form-row">
                <label>Nombre de la empresa *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) })} />
              </div>
              <div className="admin-form-row">
                <label>Slug</label>
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-generado" />
              </div>
              <div className="admin-form-row">
                <label>Dominio del email (ej: acme.com)</label>
                <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="acme.com" />
              </div>
              <div className="admin-form-row">
                <label>Tipo de billing</label>
                <select value={form.billing_type} onChange={(e) => setForm({ ...form, billing_type: e.target.value })}>
                  <option value="per_seat">Por asiento</option>
                  <option value="flat">Precio fijo mensual</option>
                </select>
              </div>
              {form.billing_type === 'per_seat' ? (
                <div className="admin-form-row">
                  <label>Precio por usuario/mes ($)</label>
                  <input type="number" step="0.01" min="0" value={form.price_per_seat} onChange={(e) => setForm({ ...form, price_per_seat: e.target.value })} placeholder="8.00" />
                </div>
              ) : (
                <div className="admin-form-row">
                  <label>Precio mensual total ($)</label>
                  <input type="number" step="0.01" min="0" value={form.flat_price} onChange={(e) => setForm({ ...form, flat_price: e.target.value })} placeholder="299.00" />
                </div>
              )}
              <div className="admin-form-row">
                <label>Ciclo de facturación</label>
                <select value={form.billing_cycle} onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}>
                  <option value="monthly">Mensual</option>
                  <option value="annual">Anual</option>
                </select>
              </div>
              <div className="admin-form-row">
                <label>Máximo de asientos</label>
                <input type="number" min="1" value={form.max_seats} onChange={(e) => setForm({ ...form, max_seats: e.target.value })} />
              </div>
              <div className="admin-form-row">
                <label>Email del admin (opcional — se enviará invitación)</label>
                <input type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} placeholder="admin@acme.com" />
              </div>
              <div className="admin-form-row two-col">
                <div>
                  <label>Fecha inicio contrato</label>
                  <input type="date" value={form.contract_start} onChange={(e) => setForm({ ...form, contract_start: e.target.value })} />
                </div>
                <div>
                  <label>Fecha fin contrato (opcional)</label>
                  <input type="date" value={form.contract_end} onChange={(e) => setForm({ ...form, contract_end: e.target.value })} />
                </div>
              </div>
              <div className="admin-form-row two-col">
                <div>
                  <label>Audio máx por nota (min)</label>
                  <input type="number" min="1" value={form.custom_audio_minutes_per_day} onChange={(e) => setForm({ ...form, custom_audio_minutes_per_day: e.target.value })} placeholder="Sin límite" />
                </div>
                <div>
                  <label>Min audio/día</label>
                  <input type="number" min="1" value={form.custom_notes_per_day} onChange={(e) => setForm({ ...form, custom_notes_per_day: e.target.value })} placeholder="Sin límite" />
                </div>
              </div>
              <div className="admin-form-row">
                <label>Notas internas</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
              </div>
              <div className="admin-form-actions">
                <button type="button" className="admin-btn secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="admin-btn primary" disabled={saving || !form.name}>
                  {saving ? 'Creando...' : 'Crear Organización'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
