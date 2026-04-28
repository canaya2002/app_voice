// Admin Dashboard — Sythio internal operations panel.
// Access: only users with profiles.is_admin = true.

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

const FN_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://oewjbeqwihhzuvbsfctf.supabase.co') + '/functions/v1';

type UserRow = { email: string; role: 'owner' | 'admin' | 'member' };

interface Workspace {
  id: string;
  name: string;
  created_at: string;
  owner_email: string | null;
  member_count: number;
}

interface Inquiry {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string | null;
  num_users: number | null;
  message: string | null;
  status: string;
  created_at: string;
}

export function AdminPage() {
  const navigate = useNavigate();
  const [authChecking, setAuthChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState<'onboard' | 'workspaces' | 'inquiries'>('inquiries');
  const [token, setToken] = useState<string>('');

  // Onboard form state
  const [companyName, setCompanyName] = useState('');
  const [usersText, setUsersText] = useState('');
  const [enableBilling, setEnableBilling] = useState(true);
  const [billingAmount, setBillingAmount] = useState('200');
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [billingEmail, setBillingEmail] = useState('');
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  // Lists
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [inquiryFilter, setInquiryFilter] = useState<'new' | 'contacted' | 'qualified' | 'converted' | 'rejected'>('new');
  const [expandedWs, setExpandedWs] = useState<string | null>(null);
  const [wsMembers, setWsMembers] = useState<Record<string, any[]>>({});
  const [wsAddEmails, setWsAddEmails] = useState<Record<string, string>>({});
  const [wsAddRole, setWsAddRole] = useState<Record<string, 'owner' | 'admin' | 'member'>>({});

  // Auth check on mount
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/', { replace: true });
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, email')
        .eq('id', session.user.id)
        .single();
      if (!profile?.is_admin) {
        setAuthChecking(false);
        setAuthorized(false);
        return;
      }
      setToken(session.access_token);
      setAuthChecking(false);
      setAuthorized(true);
    })();
  }, [navigate]);

  // Fetchers
  const fetchInquiries = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${FN_URL}/admin-list-workspaces?action=inquiries&status=${inquiryFilter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.inquiries) setInquiries(data.inquiries);
    } catch (e) { console.error(e); }
  }, [token, inquiryFilter]);

  const fetchWorkspaces = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${FN_URL}/admin-list-workspaces?action=list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.workspaces) setWorkspaces(data.workspaces);
    } catch (e) { console.error(e); }
  }, [token]);

  useEffect(() => { if (authorized) fetchInquiries(); }, [authorized, fetchInquiries]);
  useEffect(() => { if (authorized) fetchWorkspaces(); }, [authorized, fetchWorkspaces]);

  const fetchMembers = async (workspaceId: string) => {
    const res = await fetch(`${FN_URL}/admin-list-workspaces?action=members&workspace_id=${workspaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.members) setWsMembers((prev) => ({ ...prev, [workspaceId]: data.members }));
  };

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!companyName.trim() || companyName.length < 2) { setError('Company name required'); return; }

    // Parse users text — format per line: email[,role]
    // Default role is member; first line role is owner unless overridden.
    const lines = usersText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { setError('At least one user required'); return; }

    let ownerSet = false;
    const users: UserRow[] = lines.map((line, i) => {
      const [emailRaw, roleRaw] = line.split(/[\s,;|]+/);
      const email = emailRaw?.trim().toLowerCase();
      let role: UserRow['role'] = (roleRaw?.trim().toLowerCase() as UserRow['role']) || 'member';
      if (!['owner', 'admin', 'member'].includes(role)) role = 'member';
      if (i === 0 && !roleRaw) role = 'owner';
      if (role === 'owner') {
        if (ownerSet) role = 'admin';
        else ownerSet = true;
      }
      return { email, role };
    });
    if (!ownerSet) users[0].role = 'owner';

    if (enableBilling) {
      const amt = parseInt(billingAmount, 10);
      if (!Number.isFinite(amt) || amt < 1) { setError('Billing amount invalid'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) { setError('Billing email invalid'); return; }
    }

    setSubmitting(true);
    try {
      const body: any = {
        company_name: companyName.trim(),
        users,
        inquiry_id: selectedInquiryId,
      };
      if (enableBilling) {
        body.billing = {
          amount_cents: parseInt(billingAmount, 10) * 100,
          interval: billingInterval,
          billing_email: billingEmail.trim().toLowerCase(),
        };
      }
      const res = await fetch(`${FN_URL}/admin-onboard-enterprise`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed');
        setResult(data);
        return;
      }
      setResult(data);
      // Refresh
      fetchWorkspaces();
      fetchInquiries();
      // Reset form
      setCompanyName('');
      setUsersText('');
      setBillingEmail('');
      setSelectedInquiryId(null);
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddUsers = async (workspaceId: string) => {
    const emailsRaw = wsAddEmails[workspaceId] || '';
    const role = wsAddRole[workspaceId] || 'member';
    const emails = emailsRaw.split(/[\s,;\n]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (emails.length === 0) return;

    const res = await fetch(`${FN_URL}/admin-list-workspaces?action=add_users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId, emails, role }),
    });
    const data = await res.json();
    alert(JSON.stringify(data, null, 2));
    setWsAddEmails((prev) => ({ ...prev, [workspaceId]: '' }));
    fetchMembers(workspaceId);
  };

  const handleRemoveUser = async (workspaceId: string, email: string) => {
    if (!confirm(`Quitar a ${email} del workspace?`)) return;
    const res = await fetch(`${FN_URL}/admin-list-workspaces?action=remove_user`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId, email }),
    });
    const data = await res.json();
    if (!res.ok) alert(`Error: ${data.error}`);
    else fetchMembers(workspaceId);
  };

  const handleCancelStripe = async (workspaceId: string) => {
    if (!confirm('Cancelar la subscription Stripe? Los users quedarán en enterprise hasta que tú los bajes manualmente.')) return;
    const res = await fetch(`${FN_URL}/admin-list-workspaces?action=cancel_subscription`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId }),
    });
    const data = await res.json();
    alert(res.ok ? 'Subscription cancelada' : `Error: ${data.error}`);
  };

  const useInquiryAsTemplate = (inq: Inquiry) => {
    setActiveTab('onboard');
    setCompanyName(inq.company);
    setUsersText(inq.email);
    setBillingEmail(inq.email);
    setSelectedInquiryId(inq.id);
    if (inq.num_users) {
      const suggestedAmount = inq.num_users * 20;
      setBillingAmount(String(suggestedAmount));
    }
  };

  if (authChecking) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#fff' }}>Verificando acceso…</div>;
  }
  if (!authorized) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#fff', background: '#0B0B0B', minHeight: '100vh' }}>
        <h1>Acceso denegado</h1>
        <p>Esta página solo es para administradores.</p>
        <button onClick={() => navigate('/', { replace: true })} style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>
          Volver
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: '#0B0B0B', minHeight: '100vh', color: '#fff', padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ marginBottom: 20 }}>🛠 Sythio Admin</h1>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #333', paddingBottom: 8 }}>
          {(['inquiries', 'onboard', 'workspaces'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? '#6366F1' : 'transparent',
                color: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer',
                borderRadius: 6, fontWeight: activeTab === tab ? 600 : 400,
              }}
            >
              {tab === 'inquiries' ? `📬 Solicitudes (${inquiries.length})`
                : tab === 'onboard' ? '✨ Crear Enterprise'
                : `🏢 Workspaces (${workspaces.length})`}
            </button>
          ))}
        </div>

        {/* INQUIRIES TAB */}
        {activeTab === 'inquiries' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['new', 'contacted', 'qualified', 'converted', 'rejected'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setInquiryFilter(s)}
                  style={{
                    background: inquiryFilter === s ? '#444' : 'transparent',
                    color: '#ccc', border: '1px solid #444', padding: '6px 12px',
                    cursor: 'pointer', borderRadius: 4, fontSize: 13,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            {inquiries.length === 0 && <p style={{ color: '#888' }}>No hay solicitudes en esta categoría.</p>}
            <div style={{ display: 'grid', gap: 12 }}>
              {inquiries.map((inq) => (
                <div key={inq.id} style={{ background: '#1a1a2e', padding: 16, borderRadius: 8, border: '1px solid #333' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16 }}>{inq.company} <span style={{ color: '#888', fontSize: 13 }}>· {inq.num_users} usuarios</span></h3>
                      <p style={{ margin: '4px 0', color: '#ccc', fontSize: 13 }}>
                        {inq.name} ({inq.role || 'sin rol'}) — <a href={`mailto:${inq.email}`} style={{ color: '#6366F1' }}>{inq.email}</a>
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: '#666' }}>{new Date(inq.created_at).toLocaleString()}</p>
                      {inq.message && <p style={{ background: '#0B0B0B', padding: 10, borderRadius: 4, fontSize: 13, marginTop: 10, whiteSpace: 'pre-wrap' }}>{inq.message}</p>}
                    </div>
                    {inq.status === 'new' && (
                      <button onClick={() => useInquiryAsTemplate(inq)} style={{ background: '#22C55E', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        Convertir →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ONBOARD TAB */}
        {activeTab === 'onboard' && (
          <div style={{ background: '#1a1a2e', padding: 24, borderRadius: 8 }}>
            <h2 style={{ marginTop: 0 }}>Crear Enterprise Workspace</h2>
            {selectedInquiryId && (
              <div style={{ background: '#22C55E22', border: '1px solid #22C55E', padding: 10, borderRadius: 4, marginBottom: 16, fontSize: 13 }}>
                ✨ Pre-llenado desde solicitud. Al onboardear, se marcará como convertida automáticamente.
              </div>
            )}
            {error && <div style={{ background: '#EF4444', color: '#fff', padding: 10, borderRadius: 4, marginBottom: 16 }}>{error}</div>}
            <form onSubmit={handleOnboard}>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ marginBottom: 4, fontSize: 13, color: '#ccc' }}>Nombre de la empresa *</div>
                <input
                  type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required
                  style={{ width: '100%', padding: 10, background: '#0B0B0B', color: '#fff', border: '1px solid #333', borderRadius: 4, fontSize: 14 }}
                />
              </label>

              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ marginBottom: 4, fontSize: 13, color: '#ccc' }}>
                  Usuarios (uno por línea) *
                  <span style={{ color: '#888', fontWeight: 400, marginLeft: 8, fontSize: 11 }}>
                    Formato: <code>email[,owner|admin|member]</code> · El primero sin rol = owner
                  </span>
                </div>
                <textarea
                  value={usersText} onChange={(e) => setUsersText(e.target.value)} required
                  placeholder={'ceo@acme.com\ncto@acme.com,admin\ndev1@acme.com\ndev2@acme.com'}
                  rows={6}
                  style={{ width: '100%', padding: 10, background: '#0B0B0B', color: '#fff', border: '1px solid #333', borderRadius: 4, fontFamily: 'monospace', fontSize: 13 }}
                />
              </label>

              <div style={{ marginBottom: 16, padding: 16, border: '1px dashed #444', borderRadius: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={enableBilling} onChange={(e) => setEnableBilling(e.target.checked)} style={{ marginRight: 8 }} />
                  <span style={{ fontSize: 14 }}>Crear suscripción Stripe automáticamente</span>
                </label>
                {enableBilling && (
                  <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Monto USD</div>
                      <input
                        type="number" value={billingAmount} onChange={(e) => setBillingAmount(e.target.value)} min={1}
                        style={{ width: '100%', padding: 8, background: '#0B0B0B', color: '#fff', border: '1px solid #333', borderRadius: 4, fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Cada</div>
                      <select
                        value={billingInterval} onChange={(e) => setBillingInterval(e.target.value as 'month' | 'year')}
                        style={{ width: '100%', padding: 8, background: '#0B0B0B', color: '#fff', border: '1px solid #333', borderRadius: 4, fontSize: 13 }}
                      >
                        <option value="month">mes</option>
                        <option value="year">año</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Email de facturación</div>
                      <input
                        type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)}
                        placeholder="billing@acme.com"
                        style={{ width: '100%', padding: 8, background: '#0B0B0B', color: '#fff', border: '1px solid #333', borderRadius: 4, fontSize: 13 }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <button type="submit" disabled={submitting}
                style={{ background: '#6366F1', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 6, cursor: submitting ? 'wait' : 'pointer', fontWeight: 600, fontSize: 15 }}>
                {submitting ? 'Procesando…' : 'Crear Enterprise'}
              </button>
            </form>

            {result && (
              <div style={{ marginTop: 24, padding: 16, background: result.ok ? '#22C55E22' : '#EF444422', border: `1px solid ${result.ok ? '#22C55E' : '#EF4444'}`, borderRadius: 4 }}>
                <h3 style={{ marginTop: 0 }}>{result.ok ? '✅ Listo' : '⚠️ Resultado'}</h3>
                <pre style={{ fontSize: 11, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>
                {result.stripe?.invoice_url && (
                  <p style={{ marginTop: 10 }}>
                    <a href={result.stripe.invoice_url} target="_blank" rel="noopener" style={{ color: '#6366F1' }}>
                      Ver invoice en Stripe →
                    </a>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* WORKSPACES TAB */}
        {activeTab === 'workspaces' && (
          <div>
            {workspaces.length === 0 && <p style={{ color: '#888' }}>No hay workspaces enterprise activos aún.</p>}
            <div style={{ display: 'grid', gap: 12 }}>
              {workspaces.map((w) => (
                <div key={w.id} style={{ background: '#1a1a2e', padding: 16, borderRadius: 8, border: '1px solid #333' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16 }}>{w.name}</h3>
                      <p style={{ margin: '4px 0', color: '#ccc', fontSize: 13 }}>
                        Owner: {w.owner_email} · {w.member_count} miembros · creado {new Date(w.created_at).toLocaleDateString()}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: '#666' }}>ID: <code>{w.id}</code></p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          const next = expandedWs === w.id ? null : w.id;
                          setExpandedWs(next);
                          if (next && !wsMembers[w.id]) fetchMembers(w.id);
                        }}
                        style={{ background: '#444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                      >
                        {expandedWs === w.id ? 'Ocultar' : 'Ver miembros'}
                      </button>
                      <button onClick={() => handleCancelStripe(w.id)} style={{ background: '#EF4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                        Cancelar Stripe
                      </button>
                    </div>
                  </div>

                  {expandedWs === w.id && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #333' }}>
                      <h4 style={{ marginTop: 0 }}>Miembros</h4>
                      {(wsMembers[w.id] ?? []).map((m: any) => (
                        <div key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                          <span>
                            <strong>{m.profiles?.email || m.user_id.slice(0, 8)}</strong>
                            <span style={{ color: '#888', marginLeft: 8 }}>{m.role}</span>
                            <span style={{ color: '#666', marginLeft: 8, fontSize: 11 }}>plan: {m.profiles?.plan}</span>
                          </span>
                          {m.role !== 'owner' && (
                            <button onClick={() => handleRemoveUser(w.id, m.profiles?.email)} style={{ background: 'transparent', color: '#EF4444', border: '1px solid #EF4444', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                              Quitar
                            </button>
                          )}
                        </div>
                      ))}

                      <div style={{ marginTop: 16, padding: 12, background: '#0B0B0B', borderRadius: 4 }}>
                        <h4 style={{ marginTop: 0, fontSize: 13 }}>Agregar usuarios</h4>
                        <textarea
                          value={wsAddEmails[w.id] ?? ''}
                          onChange={(e) => setWsAddEmails((prev) => ({ ...prev, [w.id]: e.target.value }))}
                          placeholder="email1@empresa.com&#10;email2@empresa.com"
                          rows={2}
                          style={{ width: '100%', padding: 8, background: '#1a1a2e', color: '#fff', border: '1px solid #333', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <select
                            value={wsAddRole[w.id] ?? 'member'}
                            onChange={(e) => setWsAddRole((prev) => ({ ...prev, [w.id]: e.target.value as any }))}
                            style={{ padding: 6, background: '#1a1a2e', color: '#fff', border: '1px solid #333', borderRadius: 4, fontSize: 12 }}
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button onClick={() => handleAddUsers(w.id)} style={{ background: '#22C55E', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                            Agregar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
