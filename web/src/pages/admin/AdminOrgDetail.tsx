import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getOrganization, updateOrganization, getOrgMembers, inviteToOrg,
  suspendAllMembers, updateOrgMember, removeOrgMember, getOrgActivity,
  getBilling, recordBilling, updateBillingRecord, getInvitations, deleteInvitation,
} from './adminApi';

interface Org {
  id: string; name: string; slug: string; domain: string | null;
  owner_id: string | null; billing_type: string; price_per_seat: number | null;
  flat_price: number | null; billing_cycle: string; max_seats: number;
  seats_used: number; active: boolean; notes: string | null;
  contract_start: string | null; contract_end: string | null;
  stripe_customer_id: string | null; stripe_subscription_id: string | null;
  custom_audio_minutes_per_day: number | null; custom_notes_per_day: number | null;
  created_at: string; updated_at: string;
}

interface Member {
  id: string; user_id: string; role: string; status: string;
  email?: string; display_name?: string; notes_this_month: number;
  joined_at: string | null;
}

interface Invitation {
  id: string; email: string; role: string; created_at: string;
  expires_at: string; accepted_at: string | null;
}

interface BillingRecord {
  id: string; period_start: string; period_end: string;
  seats_billed: number; amount_charged: number; status: string;
  notes: string | null; created_at: string;
}

interface ActivityMember {
  user_id: string; email: string; display_name: string;
  notes_this_month: number; audio_minutes_this_month: number;
}

function formatCurrency(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminOrgDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [billing, setBilling] = useState<BillingRecord[]>([]);
  const [activity, setActivity] = useState<{ members: ActivityMember[]; top_5: ActivityMember[] } | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'users' | 'billing' | 'activity'>('info');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state for editing
  const [editForm, setEditForm] = useState<Record<string, string | number | boolean | null>>({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [billingForm, setBillingForm] = useState({
    period_start: '', period_end: '', amount_charged: '', seats_billed: '',
    status: 'paid', notes: '',
  });

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getOrganization(id).then((o) => { setOrg(o); setEditForm(o); }),
      getOrgMembers(id).then(setMembers),
      getInvitations(id).then(setInvitations),
      getBilling(id).then(setBilling),
      getOrgActivity(id).then(setActivity),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  const handleSaveOrg = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await updateOrganization(id, editForm);
      setOrg(updated);
      flash('Organización actualizada');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!id || !inviteEmail) return;
    try {
      await inviteToOrg(id, inviteEmail, inviteRole);
      setInviteEmail('');
      const inv = await getInvitations(id);
      setInvitations(inv);
      flash('Invitación enviada');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  const handleSuspendAll = async () => {
    if (!id || !confirm('¿Suspender todos los usuarios de esta organización?')) return;
    await suspendAllMembers(id);
    const m = await getOrgMembers(id);
    setMembers(m);
    flash('Todos los usuarios suspendidos');
  };

  const handleMemberAction = async (userId: string, action: 'suspend' | 'activate' | 'remove', role?: string) => {
    if (!id) return;
    if (action === 'remove') {
      if (!confirm('¿Eliminar este usuario de la organización?')) return;
      await removeOrgMember(id, userId);
    } else if (action === 'suspend') {
      await updateOrgMember(id, userId, { status: 'suspended' });
    } else if (action === 'activate') {
      await updateOrgMember(id, userId, { status: 'active' });
    }
    if (role) {
      await updateOrgMember(id, userId, { role });
    }
    const m = await getOrgMembers(id);
    setMembers(m);
  };

  const handleRecordBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    await recordBilling({
      org_id: id,
      period_start: billingForm.period_start,
      period_end: billingForm.period_end,
      amount_charged: parseFloat(billingForm.amount_charged),
      seats_billed: parseInt(billingForm.seats_billed),
      status: billingForm.status,
      notes: billingForm.notes || null,
    });
    setShowBillingModal(false);
    setBillingForm({ period_start: '', period_end: '', amount_charged: '', seats_billed: '', status: 'paid', notes: '' });
    const b = await getBilling(id);
    setBilling(b);
    flash('Pago registrado');
  };

  const handleMarkPaid = async (recordId: string) => {
    await updateBillingRecord(recordId, { status: 'paid' });
    if (id) {
      const b = await getBilling(id);
      setBilling(b);
    }
    flash('Marcado como pagado');
  };

  const handleExportCSV = () => {
    const header = 'Período inicio,Período fin,Seats,Monto,Status,Fecha\n';
    const rows = billing.map((b) =>
      `${b.period_start},${b.period_end},${b.seats_billed},${b.amount_charged},${b.status},${formatDate(b.created_at)}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `billing-${org?.slug || id}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <div className="admin-loading"><div className="spinner" /></div>;
  if (!org) return <div className="admin-error">Organización no encontrada</div>;

  // Calculate current month billing amount
  const calcAmount = org.billing_type === 'per_seat'
    ? (org.price_per_seat ?? 0) * org.seats_used
    : (org.flat_price ?? 0);
  const formula = org.billing_type === 'per_seat'
    ? `${org.seats_used} usuarios × ${formatCurrency(org.price_per_seat ?? 0)} = ${formatCurrency(calcAmount)}`
    : `Precio fijo: ${formatCurrency(org.flat_price ?? 0)}`;

  const tabs = [
    { id: 'info' as const, label: 'Información' },
    { id: 'users' as const, label: `Usuarios (${members.length})` },
    { id: 'billing' as const, label: 'Billing' },
    { id: 'activity' as const, label: 'Actividad' },
  ];

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <button className="admin-back" onClick={() => navigate('/admin/organizations')}>← Organizaciones</button>
          <h1 className="admin-page-title">{org.name}</h1>
          <span className="admin-muted">{org.slug} · {org.domain || 'Sin dominio'}</span>
        </div>
        <span className={`admin-badge large ${org.active ? 'green' : 'red'}`}>{org.active ? 'Activa' : 'Inactiva'}</span>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      <div className="admin-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`admin-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      {/* TAB 1 — INFORMACIÓN */}
      {activeTab === 'info' && (
        <div className="admin-card">
          <div className="admin-form">
            <div className="admin-form-row two-col">
              <div>
                <label>Nombre</label>
                <input value={String(editForm.name || '')} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <label>Slug</label>
                <input value={String(editForm.slug || '')} onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })} />
              </div>
            </div>
            <div className="admin-form-row two-col">
              <div>
                <label>Dominio</label>
                <input value={String(editForm.domain || '')} onChange={(e) => setEditForm({ ...editForm, domain: e.target.value })} placeholder="acme.com" />
              </div>
              <div>
                <label>Máx. asientos</label>
                <input type="number" value={String(editForm.max_seats || '')} onChange={(e) => setEditForm({ ...editForm, max_seats: parseInt(e.target.value) })} />
              </div>
            </div>
            <div className="admin-form-row two-col">
              <div>
                <label>Tipo de billing</label>
                <select value={String(editForm.billing_type || 'per_seat')} onChange={(e) => setEditForm({ ...editForm, billing_type: e.target.value })}>
                  <option value="per_seat">Por asiento</option>
                  <option value="flat">Precio fijo</option>
                </select>
              </div>
              <div>
                <label>{editForm.billing_type === 'per_seat' ? 'Precio/usuario/mes' : 'Precio mensual'}</label>
                <input type="number" step="0.01"
                  value={String(editForm.billing_type === 'per_seat' ? (editForm.price_per_seat || '') : (editForm.flat_price || ''))}
                  onChange={(e) => setEditForm({
                    ...editForm,
                    [editForm.billing_type === 'per_seat' ? 'price_per_seat' : 'flat_price']: parseFloat(e.target.value),
                  })} />
              </div>
            </div>
            <div className="admin-form-row two-col">
              <div>
                <label>Ciclo</label>
                <select value={String(editForm.billing_cycle || 'monthly')} onChange={(e) => setEditForm({ ...editForm, billing_cycle: e.target.value })}>
                  <option value="monthly">Mensual</option>
                  <option value="annual">Anual</option>
                </select>
              </div>
              <div>
                <label>Activa</label>
                <select value={editForm.active ? 'true' : 'false'} onChange={(e) => setEditForm({ ...editForm, active: e.target.value === 'true' })}>
                  <option value="true">Activa</option>
                  <option value="false">Inactiva</option>
                </select>
              </div>
            </div>
            <div className="admin-form-row two-col">
              <div>
                <label>Stripe Customer ID</label>
                <input value={String(editForm.stripe_customer_id || '')} onChange={(e) => setEditForm({ ...editForm, stripe_customer_id: e.target.value })} placeholder="cus_..." />
              </div>
              <div>
                <label>Stripe Subscription ID</label>
                <input value={String(editForm.stripe_subscription_id || '')} onChange={(e) => setEditForm({ ...editForm, stripe_subscription_id: e.target.value })} placeholder="sub_..." />
              </div>
            </div>
            <div className="admin-form-row two-col">
              <div>
                <label>Fecha inicio contrato</label>
                <input type="date" value={String(editForm.contract_start || '')} onChange={(e) => setEditForm({ ...editForm, contract_start: e.target.value })} />
              </div>
              <div>
                <label>Fecha fin contrato</label>
                <input type="date" value={String(editForm.contract_end || '')} onChange={(e) => setEditForm({ ...editForm, contract_end: e.target.value })} />
              </div>
            </div>
            <div className="admin-form-row">
              <label>Notas internas</label>
              <textarea value={String(editForm.notes || '')} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
            </div>
            <div className="admin-form-actions">
              <button className="admin-btn danger" onClick={handleSuspendAll}>Suspender todos los usuarios</button>
              <button className="admin-btn primary" onClick={handleSaveOrg} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2 — USUARIOS */}
      {activeTab === 'users' && (
        <div>
          <div className="admin-card">
            <h3>Invitar usuario</h3>
            <div className="admin-inline-form">
              <input placeholder="Email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button className="admin-btn primary" onClick={handleInvite} disabled={!inviteEmail}>Invitar</button>
            </div>

            {invitations.length > 0 && (
              <>
                <h4 style={{ marginTop: 16 }}>Invitaciones pendientes</h4>
                <table className="admin-table compact">
                  <tbody>
                    {invitations.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.email}</td>
                        <td>{inv.role}</td>
                        <td>{formatDate(inv.created_at)}</td>
                        <td><button className="admin-btn-sm danger" onClick={async () => { await deleteInvitation(inv.id); if (id) { const i = await getInvitations(id); setInvitations(i); } }}>Cancelar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="admin-card">
            <h3>Miembros ({members.length})</h3>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Status</th>
                  <th>Notas este mes</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.email || '—'}</td>
                    <td>{m.display_name || '—'}</td>
                    <td>
                      <select value={m.role} onChange={(e) => handleMemberAction(m.user_id, 'activate', e.target.value)} className="admin-select-sm">
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    </td>
                    <td><span className={`admin-badge ${m.status === 'active' ? 'green' : m.status === 'suspended' ? 'red' : 'yellow'}`}>{m.status}</span></td>
                    <td>{m.notes_this_month}</td>
                    <td>
                      {m.status === 'active' ? (
                        <button className="admin-btn-sm warning" onClick={() => handleMemberAction(m.user_id, 'suspend')}>Suspender</button>
                      ) : (
                        <button className="admin-btn-sm green" onClick={() => handleMemberAction(m.user_id, 'activate')}>Activar</button>
                      )}
                      <button className="admin-btn-sm danger" onClick={() => handleMemberAction(m.user_id, 'remove')} style={{ marginLeft: 4 }}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3 — BILLING */}
      {activeTab === 'billing' && (
        <div>
          <div className="admin-card">
            <h3>Resumen del mes actual</h3>
            <div className="admin-billing-summary">
              <div>
                <p className="admin-muted">Seats activos</p>
                <p className="admin-metric-value">{org.seats_used}</p>
              </div>
              <div>
                <p className="admin-muted">Monto a cobrar</p>
                <p className="admin-metric-value">{formatCurrency(calcAmount)}</p>
                <p className="admin-tiny">{formula}</p>
                {org.billing_cycle === 'annual' && (
                  <p className="admin-tiny">Anual: {formatCurrency(calcAmount * 12 * 0.85)} (15% desc.)</p>
                )}
              </div>
            </div>
            <div className="admin-form-actions">
              <button className="admin-btn primary" onClick={() => setShowBillingModal(true)}>Registrar Pago</button>
              <button className="admin-btn secondary" onClick={handleExportCSV}>Exportar CSV</button>
            </div>
          </div>

          <div className="admin-card">
            <h3>Historial de pagos</h3>
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
                ) : billing.map((b) => (
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

          {showBillingModal && (
            <div className="admin-modal-overlay" onClick={() => setShowBillingModal(false)}>
              <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
                <div className="admin-modal-header">
                  <h2>Registrar Pago</h2>
                  <button className="admin-close" onClick={() => setShowBillingModal(false)}>×</button>
                </div>
                <form onSubmit={handleRecordBilling} className="admin-form">
                  <div className="admin-form-row two-col">
                    <div>
                      <label>Inicio del período</label>
                      <input type="date" required value={billingForm.period_start} onChange={(e) => setBillingForm({ ...billingForm, period_start: e.target.value })} />
                    </div>
                    <div>
                      <label>Fin del período</label>
                      <input type="date" required value={billingForm.period_end} onChange={(e) => setBillingForm({ ...billingForm, period_end: e.target.value })} />
                    </div>
                  </div>
                  <div className="admin-form-row two-col">
                    <div>
                      <label>Monto ($)</label>
                      <input type="number" step="0.01" required value={billingForm.amount_charged} onChange={(e) => setBillingForm({ ...billingForm, amount_charged: e.target.value })} />
                    </div>
                    <div>
                      <label>Seats facturados</label>
                      <input type="number" required value={billingForm.seats_billed} onChange={(e) => setBillingForm({ ...billingForm, seats_billed: e.target.value })} />
                    </div>
                  </div>
                  <div className="admin-form-row">
                    <label>Status</label>
                    <select value={billingForm.status} onChange={(e) => setBillingForm({ ...billingForm, status: e.target.value })}>
                      <option value="paid">Pagado</option>
                      <option value="pending">Pendiente</option>
                    </select>
                  </div>
                  <div className="admin-form-row">
                    <label>Notas</label>
                    <textarea value={billingForm.notes} onChange={(e) => setBillingForm({ ...billingForm, notes: e.target.value })} rows={2} />
                  </div>
                  <div className="admin-form-actions">
                    <button type="button" className="admin-btn secondary" onClick={() => setShowBillingModal(false)}>Cancelar</button>
                    <button type="submit" className="admin-btn primary">Registrar</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4 — ACTIVIDAD */}
      {activeTab === 'activity' && (
        <div className="admin-card">
          <h3>Actividad este mes</h3>
          {!activity ? (
            <p className="admin-muted">Cargando...</p>
          ) : (
            <>
              <h4>Top 5 usuarios más activos</h4>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Nombre</th>
                    <th>Notas este mes</th>
                    <th>Min audio este mes</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.top_5.map((m) => (
                    <tr key={m.user_id}>
                      <td>{m.email || '—'}</td>
                      <td>{m.display_name || '—'}</td>
                      <td>{m.notes_this_month}</td>
                      <td>{m.audio_minutes_this_month} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4 style={{ marginTop: 24 }}>Todos los miembros</h4>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Notas</th>
                    <th>Audio (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.members.map((m) => (
                    <tr key={m.user_id}>
                      <td>{m.email || m.display_name || '—'}</td>
                      <td>{m.notes_this_month}</td>
                      <td>{m.audio_minutes_this_month}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
