import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../App';
import { useI18n } from '../i18n';
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

// Stripe Checkout — invokes the stripe-checkout edge function and redirects.
async function handleStripeCheckout(
  tier: 'premium' | 'enterprise',
  interval: 'month' | 'year',
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void,
) {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-checkout', {
      body: { tier, interval },
    });
    if (error) throw error;
    if (data?.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
    toast('No se pudo iniciar el pago. Inténtalo de nuevo.', 'error');
  } catch (err) {
    console.error('[stripe-checkout] error:', err);
    toast('Error al iniciar el pago. Contacta soporte si persiste.', 'error');
  }
}

// ── Settings Page ───────────────────────────────────────────────────────
export default function SettingsPage() {
  const { toast, showConfirm } = useToast();
  const { t, lang } = useI18n();
  const [activeTab, setActiveTab] = useState<'profile' | 'subscription' | 'security'>('profile');
  const [profile, setProfile] = useState<{ email: string; display_name: string; avatar_url: string } | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');

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
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return;
    const { error } = await supabase.from('profiles').update({ display_name: displayName.trim() }).eq('id', session.user.id);
    if (error) {
      toast(t('toast.saveError'), 'error');
    } else {
      toast(t('toast.profileSaved'));
    }
    setSaving(false);
  };

  const handlePasswordReset = async () => {
    if (!profile?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      toast(t('common.error') + ': ' + error.message, 'error');
    } else {
      toast(t('toast.resetSent') + ' ' + profile.email);
    }
  };

  const handleCancelSubscription = () => {
    showConfirm(t('confirm.cancelSub'), async () => {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return;
      // RLS only allows SELECT on subscriptions — use edge function
      const res = await supabase.functions.invoke('cancel-subscription', {
        body: { user_id: session.user.id },
      });
      if (res.error) {
        toast(t('toast.cancelError'), 'error');
        return;
      }
      setSubscription(prev => prev ? { ...prev, status: 'cancelled' } : prev);
      toast(t('toast.subCancelled'));
    });
  };

  const handleDeleteAccount = () => {
    showConfirm(t('confirm.deleteAccount'), async () => {
      // Use SECURITY DEFINER RPC — deletes auth.users which CASCADE deletes all related data
      const { error } = await supabase.rpc('delete_user');
      if (error) {
        toast(t('toast.deleteError') + ' ' + error.message, 'error');
        return;
      }
      toast(t('toast.accountDeleted'));
      // Auth session is already invalidated by deleting from auth.users
      await supabase.auth.signOut();
    });
  };

  if (loading) return <div className="container"><div className="loading"><div className="spinner" /></div></div>;

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>{t('settings.title')}</h1>
        <p>{t('settings.subtitle')}</p>
      </div>

      {/* Tab navigation */}
      <div className="mode-tabs" style={{ marginBottom: 32 }}>
        {(['profile', 'subscription', 'security'] as const).map(tab => (
          <button
            key={tab}
            className={`mode-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'profile' ? `👤 ${t('settings.profile')}` : tab === 'subscription' ? `💎 ${t('settings.subscription')}` : `🔒 ${t('settings.security')}`}
          </button>
        ))}
      </div>

      {/* ── Profile Tab ──────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <div>
          <div className="note-section">
            <h2>{t('settings.profileInfo')}</h2>
            <div className="note-section-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>Email</label>
                <input className="auth-input" style={{ marginBottom: 0, opacity: 0.6 }} value={profile?.email ?? ''} disabled />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>{t('settings.name')}</label>
                <input className="auth-input" style={{ marginBottom: 0 }} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={t('auth.yourName')} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="action-btn" style={{ background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }} onClick={handleSaveProfile} disabled={saving}>
                  {saving ? t('settings.saving') : t('settings.saveChanges')}
                </button>
              </div>
            </div>
          </div>

          {/* Platform info */}
          {platforms.length > 1 && (
            <div className="note-section" style={{ marginTop: 24 }}>
              <h2>{t('settings.platforms')}</h2>
              <div className="note-section-content">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {platforms.map(p => (
                    <span key={p} className="note-badge" style={{ padding: '6px 14px' }}>
                      {p === 'ios' ? '📱 iOS' : p === 'android' ? '🤖 Android' : '🌐 Web'}
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 12 }}>
                  {t('settings.platformsSync')}
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
            <h2>{t('settings.currentPlan')}</h2>
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
                    {t('settings.active')}
                  </span>
                )}
                {subscription.status === 'trial' && (
                  <span className="note-badge" style={{ background: 'var(--amber-pale)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.15)' }}>
                    {t('settings.trial')}
                  </span>
                )}
              </div>

              {subscription.platform && subscription.plan !== 'free' && (
                <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 8 }}>
                  {t('settings.subscribedVia')} <strong>{getPlatformLabel(subscription.platform)}</strong>
                </p>
              )}

              {subscription.priceCents != null && subscription.plan !== 'free' && (
                <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 4 }}>
                  ${(subscription.priceCents / 100).toFixed(2)} USD/mes
                  {subscription.plan === 'enterprise' && subscription.enterpriseMemberCount != null && (
                    <span style={{ color: 'var(--text3)' }}> ({subscription.enterpriseMemberCount} miembros)</span>
                  )}
                </p>
              )}

              {subscription.currentPeriodEnd && (
                <p style={{ fontSize: 13, color: 'var(--text3)' }}>
                  {subscription.status === 'cancelled' ? t('settings.accessUntil') : t('settings.nextRenewal')}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'it' ? 'it-IT' : lang === 'fr' ? 'fr-FR' : lang === 'pt' ? 'pt-BR' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}

              {subscription.plan === 'enterprise' && subscription.enterpriseOrgName && (
                <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--amber-pale)', border: '1px solid rgba(245,158,11,0.12)', borderRadius: 'var(--radius)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)' }}>{t('settings.organization')}: {subscription.enterpriseOrgName}</span>
                </div>
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
              <h2>{t('settings.upgrade')}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <UpgradeCard
                  name="Premium"
                  price="$14.99/mo"
                  features={['Unlimited notes', 'Audio up to 30 min', 'All 9 AI modes', 'AI Chat', 'Export all formats', 'Personal API']}
                  featured
                  onSelect={() => handleStripeCheckout('premium', 'month', toast)}
                />
                <UpgradeCard
                  name="Enterprise"
                  price="$29.99/mo"
                  features={['Everything in Premium', 'Workspaces & teams', 'API access (unlimited)', 'MCP for Claude/Cursor', 'Audio up to 60 min', 'Priority support']}
                  onSelect={() => handleStripeCheckout('enterprise', 'month', toast)}
                />
              </div>
            </div>
          )}

          {/* Web subscription — can manage */}
          {subscription.plan !== 'free' && canManageSubscription(subscription) && (
            <div className="note-section" style={{ marginTop: 24 }}>
              <h2>{t('settings.manageSub')}</h2>
              <div className="note-section-content" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {subscription.status !== 'cancelled' ? (
                  <button className="action-btn" style={{ color: 'var(--error)', borderColor: 'rgba(239,68,68,0.3)' }} onClick={handleCancelSubscription}>
                    {t('settings.cancelSub')}
                  </button>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text3)', alignSelf: 'center' }}>{t('settings.cancelledNote')}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Security Tab ─────────────────────────────────────── */}
      {activeTab === 'security' && (
        <div>
          <div className="note-section">
            <h2>{t('settings.changePassword')}</h2>
            <div className="note-section-content">
              <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
                {t('settings.passwordHint')}
              </p>
              <button className="action-btn" onClick={handlePasswordReset}>
                {t('settings.sendReset')}
              </button>
            </div>
          </div>

          <div className="note-section" style={{ marginTop: 24 }}>
            <h2>{t('settings.activeSessions')}</h2>
            <div className="note-section-content">
              <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 12 }}>
                {t('settings.sessionsHint')}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(platforms.length > 0 ? platforms : ['web']).map(p => (
                  <span key={p} className="note-badge" style={{ padding: '8px 16px', fontSize: 13 }}>
                    {p === 'ios' ? '📱 iOS' : p === 'android' ? '🤖 Android' : '🌐 Web'} — {t('settings.active')}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="note-section" style={{ marginTop: 24 }}>
            <h2>{t('settings.deleteAccount')}</h2>
            <div className="note-section-content">
              <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
                {t('settings.deleteHint')}
              </p>
              <button className="action-btn" style={{ color: 'var(--error)', borderColor: 'rgba(239,68,68,0.3)' }} onClick={handleDeleteAccount}>
                {t('settings.deleteMyAccount')}
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
function UpgradeCard({ name, price, features, featured, onSelect }: {
  name: string; price: string; features: string[]; featured?: boolean; onSelect: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className={`pricing-tier ${featured ? 'featured' : ''}`}>
      {featured && <div className="pricing-badge">{t('settings.mostPopular')}</div>}
      <h3 className="pricing-tier__name">{name}</h3>
      <p className="pricing-tier__price">{price}</p>
      <p className="pricing-tier__price-note">Cancela cuando quieras</p>
      <ul className="pricing-tier__features">
        {features.map((f, i) => (
          <li key={i} className="pricing-tier__feature">{f}</li>
        ))}
      </ul>
      <button className={`pricing-btn ${featured ? 'primary' : 'secondary'}`} onClick={onSelect}>
        {t('settings.choose')} {name}
      </button>
    </div>
  );
}
