// Password reset landing page — handles the recovery token from the email link.
//
// Flow:
//   1. User clicks "forgot password" in /auth → resetPasswordForEmail(email, { redirectTo: /auth/reset })
//   2. Supabase sends an email with a magic link → /auth/reset#access_token=...&type=recovery
//   3. Supabase JS auto-detects the hash and creates a recovery session
//   4. This page checks for that session and lets the user set a new password
//   5. After update, sign out and redirect to /auth so they sign in with the new password.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'checking' | 'ready' | 'invalid' | 'success' | 'error'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Supabase auto-parses the hash on mount. We listen for the recovery session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setPhase('ready');
      }
    });

    // Fallback: check session directly after a tick (in case event fired before listener attached)
    setTimeout(async () => {
      if (!mounted) return;
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setPhase('ready');
      } else {
        // No recovery session — link expired or invalid
        setPhase((current) => (current === 'checking' ? 'invalid' : current));
      }
    }, 500);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setSubmitting(true);
    const { error: e2 } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (e2) {
      setError(e2.message || 'No se pudo actualizar la contraseña.');
      setPhase('error');
      return;
    }
    // Sign out so the user logs in fresh with the new password.
    await supabase.auth.signOut();
    setPhase('success');
    setTimeout(() => navigate('/', { replace: true }), 2500);
  };

  return (
    <div className="auth-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0B0B0B 0%, #1a1a2e 100%)' }}>
      <div className="auth-card" style={{ maxWidth: 420, width: '90%', padding: 32 }}>
        <img src="/images/icon.png" alt="Sythio" className="auth-logo" />

        {phase === 'checking' && (
          <>
            <h1 className="auth-title">Verificando enlace…</h1>
            <p className="auth-subtitle">Un momento por favor.</p>
          </>
        )}

        {phase === 'invalid' && (
          <>
            <h1 className="auth-title">Enlace no válido</h1>
            <p className="auth-subtitle">
              Este enlace expiró o ya fue usado. Solicita uno nuevo desde el inicio de sesión.
            </p>
            <button className="auth-btn" onClick={() => navigate('/', { replace: true })} style={{ marginTop: 16 }}>
              Volver al inicio
            </button>
          </>
        )}

        {phase === 'ready' && (
          <>
            <h1 className="auth-title">Nueva contraseña</h1>
            <p className="auth-subtitle">Elige una contraseña segura de al menos 8 caracteres.</p>
            {error && <div className="auth-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <input
                className="auth-input"
                type="password"
                placeholder="Nueva contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoFocus
              />
              <input
                className="auth-input"
                type="password"
                placeholder="Confirmar contraseña"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
              <button className="auth-btn" type="submit" disabled={submitting}>
                {submitting ? 'Guardando…' : 'Actualizar contraseña'}
              </button>
            </form>
          </>
        )}

        {phase === 'success' && (
          <>
            <h1 className="auth-title">¡Listo!</h1>
            <p className="auth-subtitle">
              Tu contraseña fue actualizada. Te llevamos al inicio de sesión…
            </p>
          </>
        )}

        {phase === 'error' && (
          <>
            <h1 className="auth-title">Error</h1>
            <p className="auth-subtitle">{error || 'Algo salió mal. Intenta de nuevo.'}</p>
            <button className="auth-btn" onClick={() => navigate('/', { replace: true })} style={{ marginTop: 16 }}>
              Volver al inicio
            </button>
          </>
        )}
      </div>
    </div>
  );
}
