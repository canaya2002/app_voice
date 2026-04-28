// Enterprise contact form — landing page for B2B inquiries.
//
// Submits to the enterprise-inquiry edge function which:
//   1. Stores the inquiry in the enterprise_inquiries table
//   2. Sends an email to the founder via Resend
//
// Public route — no auth required (visitors should be able to inquire before signing up).

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://oewjbeqwihhzuvbsfctf.supabase.co';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export function EnterpriseContactPage() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [numUsers, setNumUsers] = useState('');
  const [message, setMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side validation
    if (!name.trim() || name.length < 2) {
      setError('Ingresa tu nombre.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Email no válido.');
      return;
    }
    if (!company.trim() || company.length < 2) {
      setError('Ingresa el nombre de tu empresa.');
      return;
    }
    const usersInt = parseInt(numUsers, 10);
    if (!Number.isFinite(usersInt) || usersInt < 5) {
      setError('Enterprise es para equipos de 5 usuarios o más. Para uso individual, considera Premium o Pro+.');
      return;
    }

    setSubmitting(true);
    try {
      // Note: this endpoint is configured with verify_jwt=false (public).
      // Spam protection: server enforces IP rate limit + honeypot.
      const res = await fetch(`${SUPABASE_URL}/functions/v1/enterprise-inquiry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // anon key required by Supabase platform gateway even on public functions
          apikey: SUPABASE_ANON,
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          company: company.trim(),
          role: role.trim() || null,
          num_users: usersInt,
          message: message.trim() || null,
        }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.message || 'No se pudo enviar tu solicitud.');
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar.');
    } finally {
      setSubmitting(false);
    }
  };

  // After successful submit, give them a closing screen.
  if (sent) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0B0B0B 0%, #1a1a2e 100%)', padding: 24 }}>
        <div className="auth-card" style={{ maxWidth: 480, width: '100%', padding: 36, textAlign: 'center' }}>
          <img src="/images/icon.png" alt="Sythio" className="auth-logo" />
          <h1 className="auth-title" style={{ marginBottom: 12 }}>¡Mensaje enviado!</h1>
          <p className="auth-subtitle">
            Recibimos tu solicitud. Nuestro equipo te contactará en menos de 24 horas hábiles para entender tus necesidades y armar una propuesta a tu medida.
          </p>
          <button className="auth-btn" onClick={() => navigate('/', { replace: true })} style={{ marginTop: 24 }}>
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0B0B0B 0%, #1a1a2e 100%)', padding: 24 }}>
      <div style={{ maxWidth: 720, margin: '40px auto' }}>
        <div className="auth-card" style={{ padding: 40 }}>
          <img src="/images/icon.png" alt="Sythio" className="auth-logo" />

          <h1 className="auth-title" style={{ fontSize: 28, marginBottom: 8 }}>Sythio Enterprise</h1>
          <p className="auth-subtitle" style={{ marginBottom: 24, fontSize: 15 }}>
            Para equipos de 5+ personas. Workspaces, MCP, API ilimitada, soporte dedicado y precio personalizado por equipo.
          </p>

          <ul style={{ marginBottom: 28, paddingLeft: 20, color: '#ccc', fontSize: 14, lineHeight: 1.8 }}>
            <li>👥 Workspaces compartidos con roles (owner, admin, member)</li>
            <li>🔗 Integraciones MCP con tus herramientas (Notion, Slack, Linear, etc.)</li>
            <li>🚀 API ilimitada para automatizar flujos</li>
            <li>🔒 SSO opcional (SAML / OIDC) bajo solicitud</li>
            <li>📞 Soporte prioritario con tiempo de respuesta &lt;4h</li>
            <li>📊 Dashboard de uso por equipo</li>
          </ul>

          {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            {/* Honeypot — bots fill it, humans don't see it */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}
              aria-hidden="true"
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <input
                className="auth-input"
                type="text"
                placeholder="Tu nombre *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
              <input
                className="auth-input"
                type="email"
                placeholder="Email corporativo *"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={200}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <input
                className="auth-input"
                type="text"
                placeholder="Empresa *"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                required
                maxLength={200}
              />
              <input
                className="auth-input"
                type="text"
                placeholder="Tu rol (opcional)"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                maxLength={100}
              />
            </div>

            <input
              className="auth-input"
              type="number"
              placeholder="Número de usuarios estimado * (mín. 5)"
              value={numUsers}
              onChange={(e) => setNumUsers(e.target.value)}
              required
              min={5}
              max={10000}
              style={{ marginTop: 12 }}
            />

            <textarea
              className="auth-input"
              placeholder="Cuéntanos un poco sobre tu equipo y caso de uso (opcional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={4}
              style={{ marginTop: 12, resize: 'vertical', fontFamily: 'inherit' }}
            />

            <button className="auth-btn" type="submit" disabled={submitting} style={{ marginTop: 16 }}>
              {submitting ? 'Enviando…' : 'Solicitar contacto'}
            </button>

            <p style={{ marginTop: 14, fontSize: 12, color: '#666', textAlign: 'center' }}>
              Respondemos en menos de 24 horas hábiles. Sin compromiso.
            </p>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13 }}
          >
            ← Volver
          </button>
        </div>
      </div>
    </div>
  );
}
