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

// ── Design tokens ─────────────────────────────────────────────────────────
const t = {
  bg: '#06060B',
  surface: '#0E0E18',
  surfaceHi: '#14142B',
  border: 'rgba(255,255,255,0.06)',
  borderHi: 'rgba(255,255,255,0.12)',
  text: '#F2F2F7',
  textMuted: '#9095A6',
  textDim: '#5C6178',
  accent: '#7C5CFF',
  accentHi: '#9D85FF',
  accentSoft: 'rgba(124,92,255,0.12)',
  success: '#34D399',
  successSoft: 'rgba(52,211,153,0.10)',
  warn: '#FBBF24',
  danger: '#F87171',
  dangerSoft: 'rgba(248,113,113,0.10)',
  shadow: '0 8px 24px rgba(0,0,0,0.4)',
};

const fontStack = '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif';

const Card: React.CSSProperties = {
  background: t.surface,
  border: `1px solid ${t.border}`,
  borderRadius: 12,
  padding: 20,
  transition: 'border-color 0.2s, transform 0.2s',
};

export function AdminPage() {
  const navigate = useNavigate();
  const [authChecking, setAuthChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [activeTab, setActiveTab] = useState<'inquiries' | 'onboard' | 'workspaces'>('inquiries');
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

  // Auth check
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
      setAdminEmail(profile.email || session.user.email || '');
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
    if (!companyName.trim() || companyName.length < 2) { setError('Nombre de empresa requerido'); return; }
    const lines = usersText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { setError('Al menos un usuario requerido'); return; }

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
      if (!Number.isFinite(amt) || amt < 1) { setError('Monto de facturación inválido'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) { setError('Email de facturación inválido'); return; }
    }

    setSubmitting(true);
    try {
      const body: any = { company_name: companyName.trim(), users, inquiry_id: selectedInquiryId };
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
        setError(data.error || 'Operación fallida');
        setResult(data);
        return;
      }
      setResult(data);
      fetchWorkspaces();
      fetchInquiries();
      setCompanyName('');
      setUsersText('');
      setBillingEmail('');
      setSelectedInquiryId(null);
    } catch (e: any) {
      setError(e.message || 'Error de red');
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
    alert(data.ok ? `✓ Agregados ${data.result?.added ?? emails.length} usuarios` : `Error: ${data.error}`);
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
    if (!confirm('Cancelar la subscription de Stripe? Los usuarios mantendrán acceso enterprise hasta que los bajes manualmente.')) return;
    const res = await fetch(`${FN_URL}/admin-list-workspaces?action=cancel_subscription`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId }),
    });
    const data = await res.json();
    alert(res.ok ? '✓ Subscription cancelada' : `Error: ${data.error}`);
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

  const formatRelative = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (authChecking) {
    return (
      <div style={{ background: t.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontStack }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: t.textMuted }}>
          <div style={{ width: 18, height: 18, border: `2px solid ${t.border}`, borderTopColor: t.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span>Verificando acceso…</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div style={{ background: t.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontStack, padding: 24 }}>
        <div style={{ ...Card, maxWidth: 420, width: '100%', padding: 36, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 20px', borderRadius: 14, background: t.dangerSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🔒</div>
          <h1 style={{ color: t.text, fontSize: 22, margin: '0 0 8px', fontWeight: 600 }}>Acceso restringido</h1>
          <p style={{ color: t.textMuted, fontSize: 14, lineHeight: 1.5, margin: '0 0 24px' }}>
            Esta página es solo para administradores de Sythio.
          </p>
          <button
            onClick={() => navigate('/', { replace: true })}
            style={{ background: t.accent, color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 500, fontSize: 14, transition: 'background 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.background = t.accentHi}
            onMouseLeave={(e) => e.currentTarget.style.background = t.accent}
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: t.bg, minHeight: '100vh', color: t.text, fontFamily: fontStack, paddingBottom: 60 }}>
      {/* Top bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(6,6,11,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${t.border}`,
        padding: '14px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${t.accent}, ${t.accentHi})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>S</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>Sythio Admin</div>
            <div style={{ fontSize: 11, color: t.textDim }}>Internal operations</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: t.textMuted }}>{adminEmail}</span>
          <button
            onClick={() => navigate('/', { replace: true })}
            style={{ background: 'transparent', color: t.textMuted, border: `1px solid ${t.border}`, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
          >
            Volver al app ↗
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 32px 0' }}>
        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
          <StatCard
            label="Solicitudes nuevas"
            value={inquiries.filter((i) => i.status === 'new').length}
            hint="Click 'Solicitudes' abajo"
            color={t.accent}
            t={t}
          />
          <StatCard
            label="Workspaces activos"
            value={workspaces.length}
            hint="Empresas onboardeadas"
            color={t.success}
            t={t}
          />
          <StatCard
            label="Total miembros"
            value={workspaces.reduce((sum, w) => sum + w.member_count, 0)}
            hint="Across all workspaces"
            color={t.warn}
            t={t}
          />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${t.border}`, marginBottom: 24 }}>
          {([
            ['inquiries', '📬 Solicitudes', inquiries.length],
            ['onboard', '✨ Crear Enterprise', null],
            ['workspaces', '🏢 Workspaces', workspaces.length],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              style={{
                background: 'transparent',
                color: activeTab === id ? t.text : t.textMuted,
                border: 'none',
                padding: '12px 18px',
                cursor: 'pointer',
                fontWeight: activeTab === id ? 600 : 400,
                fontSize: 14,
                borderBottom: `2px solid ${activeTab === id ? t.accent : 'transparent'}`,
                marginBottom: -1,
                fontFamily: 'inherit',
                transition: 'color 0.15s',
              }}
            >
              {label} {count != null && <span style={{ color: t.textDim, fontSize: 12, marginLeft: 4 }}>({count})</span>}
            </button>
          ))}
        </div>

        {/* INQUIRIES TAB */}
        {activeTab === 'inquiries' && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
              {(['new', 'contacted', 'qualified', 'converted', 'rejected'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setInquiryFilter(s)}
                  style={{
                    background: inquiryFilter === s ? t.accentSoft : 'transparent',
                    color: inquiryFilter === s ? t.accentHi : t.textMuted,
                    border: `1px solid ${inquiryFilter === s ? t.accent : t.border}`,
                    padding: '6px 14px', cursor: 'pointer', borderRadius: 999, fontSize: 12, fontFamily: 'inherit',
                    textTransform: 'capitalize', transition: 'all 0.15s',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            {inquiries.length === 0 ? (
              <EmptyState icon="📭" title="Sin solicitudes" desc={`No hay solicitudes en estado "${inquiryFilter}".`} t={t} />
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {inquiries.map((inq) => (
                  <div key={inq.id} style={{ ...Card, padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{inq.company}</h3>
                          <Badge t={t} color={inq.num_users && inq.num_users >= 20 ? t.success : t.accent}>
                            {inq.num_users} usuarios
                          </Badge>
                          <span style={{ fontSize: 11, color: t.textDim }}>{formatRelative(inq.created_at)}</span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: t.textMuted }}>
                          <span style={{ color: t.text }}>{inq.name}</span>
                          {inq.role && <span style={{ color: t.textDim }}> · {inq.role}</span>}
                          {' · '}
                          <a href={`mailto:${inq.email}`} style={{ color: t.accentHi, textDecoration: 'none' }}>{inq.email}</a>
                        </div>
                        {inq.message && (
                          <div style={{
                            marginTop: 12, padding: 12, background: t.bg, borderRadius: 8,
                            fontSize: 13, color: t.textMuted, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                            border: `1px solid ${t.border}`,
                          }}>
                            {inq.message}
                          </div>
                        )}
                      </div>
                      {inq.status === 'new' && (
                        <button
                          onClick={() => useInquiryAsTemplate(inq)}
                          style={{
                            background: `linear-gradient(135deg, ${t.accent}, ${t.accentHi})`,
                            color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8,
                            cursor: 'pointer', fontWeight: 500, fontSize: 13, fontFamily: 'inherit',
                            whiteSpace: 'nowrap', flexShrink: 0,
                          }}
                        >
                          Convertir →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ONBOARD TAB */}
        {activeTab === 'onboard' && (
          <div style={{ ...Card, padding: 28 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600, letterSpacing: -0.3 }}>Crear Enterprise Workspace</h2>
            <p style={{ margin: '0 0 24px', color: t.textMuted, fontSize: 14, lineHeight: 1.5 }}>
              Invita usuarios, crea el workspace y genera la subscription Stripe en un solo paso.
            </p>

            {selectedInquiryId && (
              <div style={{
                background: t.successSoft, border: `1px solid ${t.success}`,
                padding: '12px 14px', borderRadius: 8, marginBottom: 20, fontSize: 13, color: t.success,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>✨</span>
                <span>Pre-llenado desde solicitud. Al crear, se marcará como convertida automáticamente.</span>
              </div>
            )}

            {error && (
              <div style={{ background: t.dangerSoft, border: `1px solid ${t.danger}`, color: t.danger, padding: 12, borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
                {error}
              </div>
            )}

            <form onSubmit={handleOnboard}>
              <Field label="Nombre de la empresa" required t={t}>
                <input
                  type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required
                  style={inputStyle(t)} placeholder="Acme Corp"
                />
              </Field>

              <Field label="Usuarios" required hint="Un email por línea. Formato: email[,owner|admin|member]. El primer email sin rol = owner." t={t}>
                <textarea
                  value={usersText} onChange={(e) => setUsersText(e.target.value)} required
                  placeholder={'ceo@acme.com\ncto@acme.com,admin\ndev1@acme.com\ndev2@acme.com'}
                  rows={6}
                  style={{ ...inputStyle(t), fontFamily: '"JetBrains Mono", Menlo, monospace', fontSize: 13, resize: 'vertical' }}
                />
              </Field>

              <div style={{
                marginTop: 8, padding: 18, border: `1px solid ${t.border}`, borderRadius: 10,
                background: enableBilling ? t.surfaceHi : 'transparent', transition: 'all 0.15s',
              }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 10 }}>
                  <input
                    type="checkbox" checked={enableBilling} onChange={(e) => setEnableBilling(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: t.accent }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Crear suscripción Stripe automáticamente</span>
                </label>
                {enableBilling && (
                  <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
                    <SubField label="Monto USD" t={t}>
                      <input
                        type="number" value={billingAmount} onChange={(e) => setBillingAmount(e.target.value)} min={1}
                        style={inputStyle(t)}
                      />
                    </SubField>
                    <SubField label="Cada" t={t}>
                      <select
                        value={billingInterval} onChange={(e) => setBillingInterval(e.target.value as 'month' | 'year')}
                        style={inputStyle(t)}
                      >
                        <option value="month">mes</option>
                        <option value="year">año</option>
                      </select>
                    </SubField>
                    <SubField label="Email de facturación" t={t}>
                      <input
                        type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)}
                        placeholder="billing@acme.com" style={inputStyle(t)}
                      />
                    </SubField>
                  </div>
                )}
              </div>

              <button
                type="submit" disabled={submitting}
                style={{
                  marginTop: 24, background: submitting ? t.surfaceHi : `linear-gradient(135deg, ${t.accent}, ${t.accentHi})`,
                  color: '#fff', border: 'none', padding: '14px 28px', borderRadius: 10,
                  cursor: submitting ? 'wait' : 'pointer', fontWeight: 600, fontSize: 15, fontFamily: 'inherit',
                  boxShadow: submitting ? 'none' : `0 4px 16px ${t.accentSoft}`, transition: 'all 0.15s',
                }}
              >
                {submitting ? 'Procesando…' : 'Crear Enterprise →'}
              </button>
            </form>

            {result && (
              <div style={{
                marginTop: 24, padding: 18, background: result.ok ? t.successSoft : t.dangerSoft,
                border: `1px solid ${result.ok ? t.success : t.danger}`, borderRadius: 10,
              }}>
                <h3 style={{ marginTop: 0, fontSize: 15, color: result.ok ? t.success : t.danger }}>
                  {result.ok ? '✓ Enterprise creada exitosamente' : '⚠️ Resultado parcial'}
                </h3>
                {result.workspace_id && (
                  <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 8 }}>
                    Workspace: <code style={{ color: t.text, background: t.bg, padding: '2px 6px', borderRadius: 4 }}>{result.workspace_id}</code>
                  </div>
                )}
                {result.invite_results && (
                  <div style={{ fontSize: 13, color: t.textMuted, marginTop: 12 }}>
                    Usuarios procesados:
                    <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                      {result.invite_results.map((r: any, i: number) => (
                        <li key={i}>
                          <code>{r.email}</code> — <span style={{ color: r.status === 'failed' ? t.danger : t.success }}>{r.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.stripe?.invoice_url && (
                  <a
                    href={result.stripe.invoice_url} target="_blank" rel="noopener"
                    style={{
                      display: 'inline-block', marginTop: 12, padding: '8px 14px',
                      background: t.accent, color: '#fff', textDecoration: 'none',
                      borderRadius: 6, fontSize: 13, fontWeight: 500,
                    }}
                  >
                    Ver invoice en Stripe →
                  </a>
                )}
                <details style={{ marginTop: 14, fontSize: 12, color: t.textDim }}>
                  <summary style={{ cursor: 'pointer' }}>Ver detalle técnico</summary>
                  <pre style={{
                    fontSize: 11, overflow: 'auto', whiteSpace: 'pre-wrap',
                    background: t.bg, padding: 12, borderRadius: 6, marginTop: 8,
                  }}>{JSON.stringify(result, null, 2)}</pre>
                </details>
              </div>
            )}
          </div>
        )}

        {/* WORKSPACES TAB */}
        {activeTab === 'workspaces' && (
          <div>
            {workspaces.length === 0 ? (
              <EmptyState icon="🏢" title="Sin workspaces aún" desc="Cuando convierts una solicitud, aparece aquí." t={t} />
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {workspaces.map((w) => (
                  <div key={w.id} style={{ ...Card, padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{w.name}</h3>
                            <Badge t={t} color={t.success}>{w.member_count} miembros</Badge>
                          </div>
                          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>
                            Owner: <span style={{ color: t.text }}>{w.owner_email || '—'}</span> · creado {formatRelative(w.created_at)}
                          </div>
                          <div style={{ fontSize: 11, color: t.textDim, marginTop: 4, fontFamily: '"JetBrains Mono", Menlo, monospace' }}>
                            {w.id}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                          <button
                            onClick={() => {
                              const next = expandedWs === w.id ? null : w.id;
                              setExpandedWs(next);
                              if (next && !wsMembers[w.id]) fetchMembers(w.id);
                            }}
                            style={btnStyle(t, 'secondary')}
                          >
                            {expandedWs === w.id ? 'Ocultar' : 'Gestionar'}
                          </button>
                          <button onClick={() => handleCancelStripe(w.id)} style={btnStyle(t, 'danger')}>
                            Cancelar Stripe
                          </button>
                        </div>
                      </div>
                    </div>

                    {expandedWs === w.id && (
                      <div style={{ borderTop: `1px solid ${t.border}`, padding: 18, background: t.bg }}>
                        <h4 style={{ margin: '0 0 12px', fontSize: 13, color: t.textMuted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Miembros</h4>
                        <div style={{ display: 'grid', gap: 6 }}>
                          {(wsMembers[w.id] ?? []).map((m: any) => (
                            <div key={m.user_id} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '8px 12px', background: t.surface, borderRadius: 6, fontSize: 13,
                            }}>
                              <div>
                                <span style={{ color: t.text, fontWeight: 500 }}>{m.profiles?.email || m.user_id.slice(0, 8)}</span>
                                <Badge t={t} color={m.role === 'owner' ? t.warn : m.role === 'admin' ? t.accent : t.textMuted} style={{ marginLeft: 10 }}>
                                  {m.role}
                                </Badge>
                                <span style={{ marginLeft: 10, fontSize: 11, color: t.textDim }}>plan: {m.profiles?.plan}</span>
                              </div>
                              {m.role !== 'owner' && (
                                <button
                                  onClick={() => handleRemoveUser(w.id, m.profiles?.email)}
                                  style={{
                                    background: 'transparent', color: t.danger,
                                    border: `1px solid ${t.danger}`, padding: '4px 10px',
                                    borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
                                  }}
                                >
                                  Quitar
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        <div style={{
                          marginTop: 16, padding: 14, background: t.surface, borderRadius: 8,
                          border: `1px solid ${t.border}`,
                        }}>
                          <h4 style={{ margin: '0 0 10px', fontSize: 13, color: t.textMuted, fontWeight: 500 }}>Agregar usuarios</h4>
                          <textarea
                            value={wsAddEmails[w.id] ?? ''}
                            onChange={(e) => setWsAddEmails((prev) => ({ ...prev, [w.id]: e.target.value }))}
                            placeholder={'nuevo1@empresa.com\nnuevo2@empresa.com'}
                            rows={2} style={{ ...inputStyle(t), fontSize: 12, fontFamily: '"JetBrains Mono", Menlo, monospace' }}
                          />
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <select
                              value={wsAddRole[w.id] ?? 'member'}
                              onChange={(e) => setWsAddRole((prev) => ({ ...prev, [w.id]: e.target.value as any }))}
                              style={{ ...inputStyle(t), width: 'auto', flexShrink: 0 }}
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button onClick={() => handleAddUsers(w.id)} style={btnStyle(t, 'primary')}>
                              Agregar e invitar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────
function StatCard({ label, value, hint, color, t }: { label: string; value: number; hint?: string; color: string; t: any }) {
  return (
    <div style={{
      background: t.surface, border: `1px solid ${t.border}`,
      borderRadius: 12, padding: 18, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: color }} />
      <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: t.text, marginTop: 6, letterSpacing: -1 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: t.textDim, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Badge({ children, color, t, style }: { children: React.ReactNode; color: string; t: any; style?: React.CSSProperties }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      background: color + '22', color, fontSize: 11, fontWeight: 500, ...style,
    }}>
      {children}
    </span>
  );
}

function Field({ label, required, hint, children, t }: { label: string; required?: boolean; hint?: string; children: React.ReactNode; t: any }) {
  return (
    <label style={{ display: 'block', marginBottom: 16 }}>
      <div style={{ marginBottom: 6, fontSize: 13, color: t.text, fontWeight: 500 }}>
        {label} {required && <span style={{ color: t.accent }}>*</span>}
      </div>
      {hint && <div style={{ fontSize: 11, color: t.textDim, marginBottom: 6 }}>{hint}</div>}
      {children}
    </label>
  );
}

function SubField({ label, children, t }: { label: string; children: React.ReactNode; t: any }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function EmptyState({ icon, title, desc, t }: { icon: string; title: string; desc: string; t: any }) {
  return (
    <div style={{ textAlign: 'center', padding: 60, color: t.textMuted }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <h3 style={{ margin: '0 0 6px', fontSize: 16, color: t.text, fontWeight: 600 }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 13 }}>{desc}</p>
    </div>
  );
}

function inputStyle(t: any): React.CSSProperties {
  return {
    width: '100%', padding: 10, background: t.bg, color: t.text,
    border: `1px solid ${t.border}`, borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
    outline: 'none', transition: 'border-color 0.15s',
    boxSizing: 'border-box',
  };
}

function btnStyle(t: any, variant: 'primary' | 'secondary' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = {
    border: 'none', padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
    fontSize: 12, fontFamily: 'inherit', fontWeight: 500, transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  };
  if (variant === 'primary') return { ...base, background: t.accent, color: '#fff' };
  if (variant === 'danger') return { ...base, background: 'transparent', color: t.danger, border: `1px solid ${t.danger}` };
  return { ...base, background: t.surfaceHi, color: t.text, border: `1px solid ${t.border}` };
}
