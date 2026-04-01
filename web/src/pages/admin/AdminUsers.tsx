import { useState, useEffect } from 'react';
import { getUsers, updateUser, getOrganizations } from './adminApi';

interface UserRow {
  id: string; email: string; display_name: string | null; plan: string;
  org_id: string | null; org_name: string | null; org_slug: string | null;
  daily_count: number; total_notes: number; notes_today: number;
  created_at: string; last_reset_date: string;
}

interface OrgOption {
  id: string; name: string; slug: string;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(0);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionUser, setActionUser] = useState<string | null>(null);

  const PAGE_SIZE = 50;

  const fetchUsers = () => {
    setLoading(true);
    getUsers({
      search, plan: planFilter,
      has_org: orgFilter || undefined,
      sort: sortField, order: sortOrder,
      limit: PAGE_SIZE, offset: page * PAGE_SIZE,
    })
      .then((res) => { setUsers(res.users); setTotal(res.total); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, [search, planFilter, orgFilter, sortField, sortOrder, page]);

  useEffect(() => {
    getOrganizations().then((o: OrgOption[]) => setOrgs(o)).catch(() => {});
  }, []);

  const handleSort = (field: string) => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('desc'); }
  };

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  const handleChangePlan = async (userId: string, plan: string) => {
    try {
      await updateUser(userId, { plan });
      fetchUsers();
      flash(`Plan cambiado a ${plan}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleAssignOrg = async (userId: string, orgId: string) => {
    try {
      if (orgId) {
        await updateUser(userId, { org_id: orgId, plan: 'enterprise' });
      } else {
        await updateUser(userId, { org_id: null, plan: 'free' });
      }
      fetchUsers();
      flash('Organización asignada');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleResetDaily = async (userId: string) => {
    try {
      await updateUser(userId, { daily_count: 0 });
      fetchUsers();
      flash('Contador diario reseteado');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const sortIcon = (field: string) => sortField === field ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">Usuarios ({total})</h1>

      <div className="admin-filters">
        <input
          className="admin-search"
          type="text"
          placeholder="Buscar por email o nombre..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <select className="admin-select" value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(0); }}>
          <option value="">Todos los planes</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select className="admin-select" value={orgFilter} onChange={(e) => { setOrgFilter(e.target.value); setPage(0); }}>
          <option value="">Con/sin org</option>
          <option value="true">Con org</option>
          <option value="false">Sin org</option>
        </select>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      {loading ? (
        <div className="admin-loading"><div className="spinner" /></div>
      ) : (
        <>
          <table className="admin-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('email')}>Email{sortIcon('email')}</th>
                <th>Nombre</th>
                <th>Plan</th>
                <th>Organización</th>
                <th className="sortable" onClick={() => handleSort('daily_count')}>Notas hoy{sortIcon('daily_count')}</th>
                <th>Notas total</th>
                <th className="sortable" onClick={() => handleSort('created_at')}>Registro{sortIcon('created_at')}</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={8} className="admin-muted" style={{ textAlign: 'center', padding: 32 }}>Sin resultados</td></tr>
              ) : users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.display_name || '—'}</td>
                  <td>
                    <span className={`admin-badge ${u.plan === 'premium' ? 'blue' : u.plan === 'enterprise' ? 'purple' : 'gray'}`}>
                      {u.plan}
                    </span>
                  </td>
                  <td>{u.org_name || '—'}</td>
                  <td>{u.notes_today}</td>
                  <td>{u.total_notes}</td>
                  <td>{formatDate(u.created_at)}</td>
                  <td>
                    <button className="admin-btn-sm" onClick={() => setActionUser(actionUser === u.id ? null : u.id)}>
                      {actionUser === u.id ? 'Cerrar' : 'Acciones'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="admin-pagination">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>← Anterior</button>
              <span>Página {page + 1} de {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Siguiente →</button>
            </div>
          )}
        </>
      )}

      {/* Action drawer for selected user */}
      {actionUser && (
        <div className="admin-action-drawer">
          <div className="admin-card">
            <h4>Acciones para {users.find(u => u.id === actionUser)?.email}</h4>
            <div className="admin-action-grid">
              <div>
                <label>Cambiar plan</label>
                <div className="admin-inline-form">
                  <button className="admin-btn-sm" onClick={() => handleChangePlan(actionUser, 'free')}>Free</button>
                  <button className="admin-btn-sm blue" onClick={() => handleChangePlan(actionUser, 'premium')}>Premium</button>
                  <button className="admin-btn-sm purple" onClick={() => handleChangePlan(actionUser, 'enterprise')}>Enterprise</button>
                </div>
              </div>
              <div>
                <label>Asignar a organización</label>
                <select
                  className="admin-select"
                  value={users.find(u => u.id === actionUser)?.org_id || ''}
                  onChange={(e) => handleAssignOrg(actionUser, e.target.value)}
                >
                  <option value="">Sin organización</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.slug})</option>)}
                </select>
              </div>
              <div>
                <button className="admin-btn-sm warning" onClick={() => handleResetDaily(actionUser)}>Resetear contador diario</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
