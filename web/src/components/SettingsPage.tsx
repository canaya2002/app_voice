import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import {
  getSubscriptionDetails,
  canManageSubscription,
  getPlatformLabel,
  getPlatformManageInstructions,
  getPlanLabel,
  getPlanColor,
  getUserPlatforms,
  type SubscriptionInfo,
} from '../lib/subscription';

// ── Settings Page ───────────────────────────────────────────────────────
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'subscription' | 'security'>('profile');
  const [profile, setProfile] = useState<{ email: string; display_name: string; avatar_url: string } | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return;
      const userId = session.user.id;

      const [profileRes, subInfo, plats] = await Promise.all([
        supabase.from('profiles').select('email, display_name, avatar_url').eq('id', userId).single(),
        getSubscriptionDetails(userId),
        getUserPlatforms(userId),
      ]);

      if (profileRes.data) {
        const p = profileRes.data as { email: string; display_name: string; avatar_url: string };
        setProfile(p);
        setDisplayName(p.display_name || '');
      }
      setSubscription(subInfo);
      setPlatforms(plats);
      setLoading(false);
    })();
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    setMessage('');
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return;
    const { error } = await supabase.from('profiles').update({ display_name: displayName.trim() }).eq('id', session.user.id);
    if (error) {
      setMessage('Error al guardar');
    } else {
      setMessage('Guardado');
      setTimeout(() => setMessage(''), 2000);
    }
    setSaving(false);
  };

  const handlePasswordReset = async () => {
    if (!profile?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      setMessage('Error: ' + error.message);
    } else {
      setMessage('Email de restablecimiento enviado a ' + profile.email);
    }
  };

  if (loading) return <div className="container"><div className="loading"><div className="spinner" /></div></div>;

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Configuracion</h1>
        <p>Administra tu cuenta y suscripcion</p>
      </div>

      {/* Tab navigation */}
      <div className="mode-tabs" style={{ marginBottom: 32 }}>
        {(['profile', 'subscription', 'security'] as const).map(tab => (
          <button
            key={tab}
            className={`mode-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'profile' ? '👤 Perfil' : tab === 'subscription' ? '💎 Suscripcion' : '🔒 Seguridad'}
          </button>
        ))}
      </div>

      {/* ── Profile Tab ──────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <div>
          <div className="note-section">
            <h2>Informacion del perfil</h2>
            <div className="note-section-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>Email</label>
                <input className="auth-input" style={{ marginBottom: 0, opacity: 0.6 }} value={profile?.email ?? ''} disabled />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>Nombre</label>
                <input className="auth-input" style={{ marginBottom: 0 }} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Tu nombre" />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="action-btn" style={{ background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }} onClick={handleSaveProfile} disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
                {message && <span style={{ fontSize: 13, color: message.startsWith('Error') ? 'var(--error)' : 'var(--success)' }}>{message}</span>}
              </div>
            </div>
          </div>

          {/* Platform info */}
          {platforms.length > 1 && (
            <div className="note-section" style={{ marginTop: 24 }}>
              <h2>Plataformas conectadas</h2>
              <div className="note-section-content">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {platforms.map(p => (
                    <span key={p} className="note-badge" style={{ padding: '6px 14px' }}>
                      {p === 'ios' ? '📱 iOS' : p === 'android' ? '🤖 Android' : '🌐 Web'}
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 12 }}>
                  Tu cuenta esta activa en estas plataformas. Tus notas se sincronizan automaticamente.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Subscription Tab ─────────────────────────────────── */}
      {activeTab === 'subscription' && subscription && (
        <div>
          {/* Current plan card */}
          <div className="note-section">
            <h2>Tu plan actual</h2>
            <div className="note-section-content">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{
                  fontSize: 24, fontWeight: 800, letterSpacing: -1,
                  color: getPlanColor(subscription.plan),
                }}>
                  {getPlanLabel(subscription.plan)}
                </span>
                {subscription.status === 'active' && (
                  <span className="note-badge" style={{ background: 'var(--success-pale)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.15)' }}>
                    Activo
                  </span>
                )}
                {subscription.status === 'trial' && (
                  <span className="note-badge" style={{ background: 'var(--amber-pale)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.15)' }}>
                    Periodo de prueba
                  </span>
                )}
              </div>

              {subscription.platform && subscription.plan !== 'free' && (
                <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 8 }}>
                  Suscrito via <strong>{getPlatformLabel(subscription.platform)}</strong>
                </p>
              )}

              {subscription.currentPeriodEnd && (
                <p style={{ fontSize: 13, color: 'var(--text3)' }}>
                  {subscription.status === 'cancelled' ? 'Acceso hasta: ' : 'Proxima renovacion: '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          {/* Platform-specific management */}
          {subscription.plan !== 'free' && !canManageSubscription(subscription) && (
            <PlatformBanner platform={subscription.platform} />
          )}

          {/* Free user — show upgrade */}
          {subscription.plan === 'free' && (
            <div className="note-section" style={{ marginTop: 24 }}>
              <h2>Mejorar tu plan</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <UpgradeCard
                  name="Pro"
                  price="$7.99/mes"
                  features={['Notas ilimitadas', 'Audio hasta 120 min', '8 modos de resultado', 'AI Chat', 'Exportar a todos los formatos']}
                  featured
                />
                <UpgradeCard
                  name="Enterprise"
                  price="$14.99/mes"
                  features={['Todo en Pro', 'Workspaces ilimitados', 'Admin dashboard', 'API access', 'Soporte prioritario']}
                />
              </div>
            </div>
          )}

          {/* Web subscription — can manage */}
          {subscription.plan !== 'free' && canManageSubscription(subscription) && (
            <div className="note-section" style={{ marginTop: 24 }}>
              <h2>Administrar suscripcion</h2>
              <div className="note-section-content" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button className="action-btn">Cambiar plan</button>
                <button className="action-btn" style={{ color: 'var(--error)', borderColor: 'rgba(239,68,68,0.3)' }}>
                  Cancelar suscripcion
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Security Tab ─────────────────────────────────────── */}
      {activeTab === 'security' && (
        <div>
          <div className="note-section">
            <h2>Cambiar contrasena</h2>
            <div className="note-section-content">
              <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
                Te enviaremos un email con un link para restablecer tu contrasena. Funciona tanto para web como para la app movil.
              </p>
              <button className="action-btn" onClick={handlePasswordReset}>
                Enviar email de restablecimiento
              </button>
              {message && <p style={{ fontSize: 13, color: 'var(--success)', marginTop: 12 }}>{message}</p>}
            </div>
          </div>

          <div className="note-section" style={{ marginTop: 24 }}>
            <h2>Sesiones activas</h2>
            <div className="note-section-content">
              <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 12 }}>
                Plataformas donde tu cuenta ha iniciado sesion:
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(platforms.length > 0 ? platforms : ['web']).map(p => (
                  <span key={p} className="note-badge" style={{ padding: '8px 16px', fontSize: 13 }}>
                    {p === 'ios' ? '📱 iOS' : p === 'android' ? '🤖 Android' : '🌐 Web'} — Activo
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="note-section" style={{ marginTop: 24 }}>
            <h2>Eliminar cuenta</h2>
            <div className="note-section-content">
              <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
                Esta accion es permanente. Se eliminaran todas tus notas, transcripciones y datos de la cuenta en todas las plataformas.
              </p>
              <button className="action-btn" style={{ color: 'var(--error)', borderColor: 'rgba(239,68,68,0.3)' }}>
                Eliminar mi cuenta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Platform Banner ─────────────────────────────────────────────────────
function PlatformBanner({ platform }: { platform: string | null }) {
  const instructions = getPlatformManageInstructions(platform);
  const label = getPlatformLabel(platform);

  return (
    <div style={{
      padding: '20px 24px',
      borderRadius: 'var(--radius-lg)',
      background: 'rgba(99,102,241,0.06)',
      border: '1px solid rgba(99,102,241,0.15)',
      marginTop: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: 24 }}>{platform === 'ios' ? '📱' : '🤖'}</span>
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            Suscrito via {label}
          </p>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.65 }}>
            {instructions}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 12 }}>
            Tu plan Pro esta activo en web automaticamente. No necesitas hacer nada adicional aqui.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Upgrade Card ────────────────────────────────────────────────────────
function UpgradeCard({ name, price, features, featured }: {
  name: string; price: string; features: string[]; featured?: boolean;
}) {
  return (
    <div style={{
      padding: '28px 24px',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--surface)',
      border: featured ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
      boxShadow: featured ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
    }}>
      {featured && <div className="pricing-badge" style={{ marginBottom: 12 }}>Mas popular</div>}
      <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{name}</h3>
      <p style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: -1, marginBottom: 20 }}>{price}</p>
      <ul style={{ listStyle: 'none', padding: 0, marginBottom: 24 }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 14, color: 'var(--text2)' }}>
            <span style={{ color: 'var(--success)', fontWeight: 700 }}>✓</span> {f}
          </li>
        ))}
      </ul>
      <button className={`pricing-btn ${featured ? 'primary' : 'secondary'}`} style={{ width: '100%' }}>
        Elegir {name}
      </button>
    </div>
  );
}
