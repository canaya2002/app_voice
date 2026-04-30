import { useState, useEffect, useCallback, createContext, useContext, useRef, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';
import { logPlatformSession, getSubscriptionDetails } from './lib/subscription';
import { I18nProvider, useI18n, LANG_LABELS, type Lang } from './i18n';
import { Turnstile } from './components/Turnstile';

// Heavy / rarely-visited routes — code-split into separate chunks.
const ResetPasswordPage = lazy(() => import('./components/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const EnterpriseContactPage = lazy(() => import('./components/EnterpriseContactPage').then(m => ({ default: m.EnterpriseContactPage })));
const AdminPage = lazy(() => import('./components/AdminPage').then(m => ({ default: m.AdminPage })));
const SettingsPage = lazy(() => import('./components/SettingsPage'));

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

function RouteFallback() {
  return <div className="loading" style={{ minHeight: '100vh', alignItems: 'center' }}><div className="spinner" /></div>;
}

// ── Toast System ────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; type: ToastType }

const ToastContext = createContext<{
  toast: (message: string, type?: ToastType) => void;
  showConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}>({ toast: () => {}, showConfirm: () => {} });

export const useToast = () => useContext(ToastContext);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void | Promise<void> } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const nextId = useRef(0);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const showConfirm = useCallback((message: string, onConfirm: () => void | Promise<void>) => {
    setConfirmState({ message, onConfirm });
    setConfirmLoading(false);
  }, []);

  const handleConfirm = async () => {
    if (!confirmState) return;
    setConfirmLoading(true);
    try {
      await confirmState.onConfirm();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.errorAction'), 'error');
    } finally {
      setConfirmState(null);
      setConfirmLoading(false);
    }
  };

  return (
    <ToastContext.Provider value={{ toast, showConfirm }}>
      {children}
      {/* Toast container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-icon">{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
      {/* Confirm modal */}
      {confirmState && (
        <div className="modal-overlay" onClick={() => !confirmLoading && setConfirmState(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
              <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.7 }}>⚠️</div>
              <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--text)', marginBottom: 28 }}>{confirmState.message}</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="action-btn" style={{ flex: 1, justifyContent: 'center', height: 44 }} onClick={() => setConfirmState(null)} disabled={confirmLoading}>{t('common.cancel')}</button>
                <button className="action-btn" style={{ flex: 1, justifyContent: 'center', height: 44, background: 'var(--error)', color: '#fff', borderColor: 'var(--error)' }} onClick={handleConfirm} disabled={confirmLoading}>
                  {confirmLoading ? t('common.processing') : t('common.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

// ── Types (mirror mobile app) ───────────────────────────────────────────────

interface Note {
  id: string;
  title: string;
  transcript: string;
  summary: string;
  key_points: string[];
  tasks: string[];
  clean_text: string;
  audio_duration: number;
  speakers_detected: number;
  is_conversation: boolean;
  segments: { start: number; end: number; speaker: string; text: string }[];
  speakers: { id: string; default_name: string; custom_name?: string }[];
  primary_mode: string;
  template?: string;
  status: string;
  created_at: string;
  deleted_at?: string | null;
  folder_id?: string | null;
  share_token?: string | null;
}

interface ModeResult {
  id: string;
  mode: string;
  result: Record<string, unknown>;
  created_at: string;
}

interface Folder {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatDuration(s: number) { const m = Math.floor(s / 60); return `${m} min`; }
function formatTimestamp(s: number) {
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function getModeLabel(mode: string, t: (k: string, fb?: string) => string): string {
  const map: Record<string, string> = {
    summary: 'mode.summary', tasks: 'mode.tasks', action_plan: 'mode.actionPlan',
    clean_text: 'mode.cleanText', executive_report: 'mode.execReport',
    ready_message: 'mode.readyMsg', study: 'mode.study', ideas: 'mode.ideas',
    outline: 'mode.outline',
  };
  return t(map[mode] ?? mode, mode);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── DOCX generation ─────────────────────────────────────────────────────────

function downloadDOCX(note: Note) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/><title>${escapeHtml(note.title)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;padding:40px;color:#1a1a1a;line-height:1.6}h1{font-size:22pt}h2{font-size:13pt;color:#333;margin-top:18pt;border-bottom:1.5pt solid #eee;padding-bottom:4pt}ul{padding-left:18pt}li{margin-bottom:4pt;font-size:11pt}p{font-size:11pt}.meta{color:#666;font-size:10pt;margin-bottom:18pt}</style>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
</head><body>
<h1>${escapeHtml(note.title)}</h1>
<p class="meta">${formatDate(note.created_at)} · ${formatDuration(note.audio_duration)}</p>
${note.summary ? `<h2>Resumen</h2><p>${escapeHtml(note.summary)}</p>` : ''}
${note.key_points?.length ? `<h2>Puntos clave</h2><ul>${note.key_points.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
${note.tasks?.length ? `<h2>Tareas</h2><ul>${note.tasks.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` : ''}
<h2>Transcripción</h2><p>${escapeHtml(note.transcript || note.clean_text || '').replace(/\n/g, '<br/>')}</p>
<p style="margin-top:30pt;text-align:center;color:#bbb;font-size:9pt">Generado con Sythio</p>
</body></html>`;
  const blob = new Blob([html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${note.title.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 40)}.doc`;
  a.click(); URL.revokeObjectURL(url);
}

// ── Testimonials (used in AuthPage + SharedNotePage) ─────────────────────────

const TESTIMONIALS = [
  { name: 'María G.', role: 'Directora de Operaciones', text: 'Mis reuniones ahora tienen actas automáticas. Sythio me ahorra 2 horas por semana.', stars: 5 },
  { name: 'Carlos M.', role: 'Emprendedor', text: 'Grabo ideas en el carro y cuando llego ya tengo un plan de acción estructurado. Mágico.', stars: 5 },
  { name: 'Ana R.', role: 'Coach Ejecutiva', text: 'La detección de hablantes es increíble. Perfecto para transcribir mis sesiones de coaching.', stars: 5 },
  { name: 'Roberto S.', role: 'Estudiante de Medicina', text: 'El modo Estudio convierte clases de 1 hora en fichas perfectas para repasar. Mi promedio subió.', stars: 5 },
  { name: 'Laura P.', role: 'Gerente de Proyectos', text: 'Exportar a Word directo con las tareas y responsables ya asignados. Un game changer.', stars: 5 },
  { name: 'Diego F.', role: 'Abogado', text: 'Uso Sythio para grabar declaraciones. El reporte ejecutivo ahorra días de trabajo.', stars: 4 },
];

// ── Auth Page ────────────────────────────────────────────────────────────────

// ── Login Demo: recording → transcription → AI summary (big, visible) ───────
function LoginDemo() {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [typedChars, setTypedChars] = useState(0);
  const [aiLines, setAiLines] = useState(0);
  const transcript = t('demo.login.transcript');
  const summaryLines = [
    t('demo.login.sum1'),
    t('demo.login.sum2'),
    t('demo.login.sum3'),
  ];
  const tasks = [
    { text: t('demo.login.task1'), who: 'María', color: '#818cf8' },
    { text: t('demo.login.task2'), who: 'Carlos', color: '#34d399' },
    { text: t('demo.login.task3'), who: 'Ana', color: '#fbbf24' },
  ];

  useEffect(() => {
    let s = 0;
    const durations = [3000, 4000, 3000, 4000];
    let timeout: ReturnType<typeof setTimeout>;
    const run = () => {
      timeout = setTimeout(() => { s = (s + 1) % 4; setStep(s); run(); }, durations[s]);
    };
    run();
    return () => clearTimeout(timeout);
  }, []);

  // Typing effect for step 1
  useEffect(() => {
    if (step === 0) { setTypedChars(0); setAiLines(0); return; }
    if (step === 1) {
      let i = 0;
      const len = transcript.length;
      const timer = setInterval(() => { i += 2; setTypedChars(Math.min(i, len)); if (i >= len) clearInterval(timer); }, 25);
      return () => clearInterval(timer);
    }
    setTypedChars(transcript.length);
  }, [step, transcript]);

  // AI lines appearing one by one in step 2-3
  useEffect(() => {
    if (step < 2) { setAiLines(0); return; }
    if (step === 2) {
      let i = 0;
      const t = setInterval(() => { i++; setAiLines(i); if (i >= 6) clearInterval(t); }, 400);
      return () => clearInterval(t);
    }
    setAiLines(6);
  }, [step]);

  const barPct = [15, 45, 80, 100][step];

  return (
    <div className="demo-scene">
      <h3 className="demo-scene-title">{t('demo.login.title')}</h3>
      <p className="demo-scene-sub">{t('demo.login.sub')}</p>
      <div className="demo-window">
        <div className="demo-titlebar"><div className="demo-dot r"/><div className="demo-dot y"/><div className="demo-dot g"/><span className="demo-titlebar-text">Sythio</span></div>
        <div className="demo-body">
          {/* Step 0: Big animated waveform */}
          <div className="demo-waveform" style={{ height: step === 0 ? 48 : 0, opacity: step === 0 ? 1 : 0 }}>
            {Array.from({ length: 40 }).map((_, i) => (
              <div key={i} className="demo-wave-bar" style={{ animationDelay: `${i * 0.04}s`, height: `${10 + Math.random() * 30}px`, animationDuration: `${0.4 + Math.random() * 0.6}s` }} />
            ))}
          </div>
          {step === 0 && <div className="demo-rec-badge"><span className="demo-rec-dot" />REC 00:{String(Math.floor(Date.now() / 1000) % 60).padStart(2, '0')}</div>}

          {/* Step 1: Transcript typing */}
          {step >= 1 && (
            <div className="demo-transcript">
              <span className="demo-transcript-label">{t('demo.login.liveTranscript')}</span>
              <p className="demo-transcript-text">{transcript.slice(0, typedChars)}{step === 1 && <span className="demo-cursor">|</span>}</p>
            </div>
          )}

          {/* Step 2-3: AI Result building up line by line */}
          {step >= 2 && (
            <div className="demo-ai-result">
              {aiLines >= 1 && <div className="demo-ai-section">
                <span className="demo-ai-tag">{t('demo.login.summary')}</span>
                {summaryLines.map((line, i) => aiLines >= i + 1 && <p key={i} className="demo-ai-text">{line}</p>)}
              </div>}
              {aiLines >= 4 && <div className="demo-ai-section">
                <span className="demo-ai-tag">Tareas ({tasks.length})</span>
                {tasks.map((t, i) => aiLines >= 4 + i && (
                  <div key={i} className="demo-ai-task">
                    <span className="demo-check" style={{ color: t.color }}>●</span>
                    <span>{t.text}</span>
                    <span className="demo-task-who" style={{ background: t.color + '22', color: t.color }}>{t.who}</span>
                  </div>
                ))}
              </div>}
            </div>
          )}

          {/* Progress always visible */}
          <div className="demo-progress"><div className="demo-progress-fill" style={{ width: `${barPct}%` }}/></div>
          <div className="demo-status">
            <span style={{ fontSize: 16 }}>{['🎤', '📝', '✨', '✅'][step]}</span>
            <span>{[t('demo.login.step0'), t('demo.login.step1'), t('demo.login.step2'), t('demo.login.step3')][step]}</span>
          </div>
        </div>
      </div>
      <div className="demo-stats">
        <div className="demo-stat"><strong>90+</strong><span>{t('demo.login.languages')}</span></div>
        <div className="demo-stat-sep"/>
        <div className="demo-stat"><strong>8</strong><span>{t('demo.login.aiModes')}</span></div>
        <div className="demo-stat-sep"/>
        <div className="demo-stat"><strong>4.8 ★</strong><span>rating</span></div>
      </div>
    </div>
  );
}

// ── Register Demo: voice idea → speakers → modes → export ───────────────────
function RegisterDemo() {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [visibleSpeakers, setVisibleSpeakers] = useState(0);
  const [showModes, setShowModes] = useState(0);
  const speakers = [
    { name: t('demo.reg.you'), color: '#818cf8', text: t('demo.reg.speaker1') },
    { name: 'Sythio IA', color: '#34d399', text: t('demo.reg.speaker2') },
  ];
  const modes = [
    { icon: '📝', label: t('mode.summary'), color: '#818cf8' },
    { icon: '✅', label: t('mode.tasks'), color: '#34d399' },
    { icon: '📊', label: t('mode.actionPlan'), color: '#fbbf24' },
    { icon: '📄', label: t('mode.execReport'), color: '#f87171' },
  ];

  useEffect(() => {
    let s = 0;
    const durations = [3000, 3500, 4000, 3500];
    let timeout: ReturnType<typeof setTimeout>;
    const run = () => {
      timeout = setTimeout(() => { s = (s + 1) % 4; setStep(s); run(); }, durations[s]);
    };
    run();
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    setVisibleSpeakers(0);
    setShowModes(0);
    if (step === 0) {
      let i = 0;
      const t = setInterval(() => { i++; setVisibleSpeakers(i); if (i >= 2) clearInterval(t); }, 800);
      return () => clearInterval(t);
    }
    if (step === 1) { setVisibleSpeakers(2); }
    if (step >= 2) {
      setVisibleSpeakers(2);
      let i = 0;
      const t = setInterval(() => { i++; setShowModes(i); if (i >= modes.length) clearInterval(t); }, 500);
      return () => clearInterval(t);
    }
  }, [step]);

  const barPct = [20, 50, 80, 100][step];

  return (
    <div className="demo-scene">
      <h3 className="demo-scene-title">{t('demo.reg.title')}</h3>
      <p className="demo-scene-sub">{t('demo.reg.sub')}</p>
      <div className="demo-window">
        <div className="demo-titlebar"><div className="demo-dot r"/><div className="demo-dot y"/><div className="demo-dot g"/><span className="demo-titlebar-text">Sythio</span></div>
        <div className="demo-body">
          {/* Speaker conversation appearing */}
          <div className="demo-speakers">
            {speakers.map((sp, i) => (
              <div key={i} className={`demo-speaker-row ${visibleSpeakers > i ? 'visible' : ''}`}>
                <div className="demo-speaker-avatar" style={{ background: sp.color }}>{sp.name[0]}</div>
                <div className="demo-speaker-bubble" style={{ borderColor: sp.color + '33' }}>
                  <span className="demo-speaker-name" style={{ color: sp.color }}>{sp.name}</span>
                  <p>{sp.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Modes grid appearing */}
          {step >= 2 && (
            <div className="demo-modes-grid">
              {modes.map((m, i) => (
                <div key={i} className={`demo-mode-card ${showModes > i ? 'visible' : ''}`} style={{ borderColor: m.color + '33' }}>
                  <span style={{ fontSize: 20 }}>{m.icon}</span>
                  <span style={{ color: m.color, fontWeight: 700, fontSize: 11 }}>{m.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Export */}
          {step >= 3 && (
            <div className="demo-export">
              <div className="demo-export-file">
                <span className="demo-file-icon">📄</span>
                <div><strong>{t('demo.reg.filename')}</strong><span>{t('demo.reg.fileMeta')}</span></div>
                <span className="demo-export-check">✓</span>
              </div>
            </div>
          )}

          <div className="demo-progress"><div className="demo-progress-fill" style={{ width: `${barPct}%` }}/></div>
          <div className="demo-status">
            <span style={{ fontSize: 16 }}>{['🎙️', '👥', '✨', '📄'][step]}</span>
            <span>{[t('demo.reg.step0'), t('demo.reg.step1'), t('demo.reg.step2'), t('demo.reg.step3')][step]}</span>
          </div>
        </div>
      </div>
      <div className="demo-stats">
        <div className="demo-stat"><strong>12,400+</strong><span>{t('demo.reg.users')}</span></div>
        <div className="demo-stat-sep"/>
        <div className="demo-stat"><strong>850K+</strong><span>{t('demo.reg.notes')}</span></div>
        <div className="demo-stat-sep"/>
        <div className="demo-stat"><strong>4.8 ★</strong><span>rating</span></div>
      </div>
    </div>
  );
}

function AuthPage({ onAuth }: { onAuth: () => void }) {
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const handleToggle = () => {
    setTransitioning(true);
    setTimeout(() => {
      setIsRegister(!isRegister);
      setError('');
      setCaptchaToken(null);
      setTransitioning(false);
    }, 350);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Verify captcha before signup (only if site key is configured).
    if (isRegister && TURNSTILE_SITE_KEY) {
      if (!captchaToken) {
        setError(t('auth.captchaRequired') ?? 'Completa la verificación antes de continuar.');
        setLoading(false);
        return;
      }
      try {
        const verifyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-captcha`;
        const verifyRes = await fetch(verifyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ token: captchaToken }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyData.ok) {
          setError(t('auth.captchaFailed') ?? 'Verificación fallida. Intenta de nuevo.');
          setCaptchaToken(null);
          setLoading(false);
          return;
        }
      } catch {
        // Network error verifying captcha — fail open to avoid blocking signups
        // if Cloudflare or our edge function is unreachable.
      }
    }

    const { error: err } = isRegister
      ? await supabase.auth.signUp({ email, password, options: { data: { display_name: name } } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); setLoading(false); return; }
    if (isRegister) { setError(t('auth.checkEmail')); setLoading(false); return; }
    onAuth();
    setLoading(false);
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    const { error: e } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
    if (e) setError(e.message);
  };

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const handleForgot = async () => {
    setError('');
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Ingresa un email válido');
      return;
    }
    setLoading(true);
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    setLoading(false);
    if (e) {
      setError(e.message);
      return;
    }
    setForgotSent(true);
  };

  const formContent = (
    <div className="auth-form-panel">
      <div className="auth-card">
        <img src="/images/icon.png" alt="Sythio" className="auth-logo" />
        <h1 className="auth-title">
          {forgotMode ? 'Recuperar contraseña' : (isRegister ? t('auth.createAccount') : t('auth.welcome'))}
        </h1>
        <p className="auth-subtitle">
          {forgotMode
            ? (forgotSent
                ? 'Si tu email está registrado, recibirás un enlace en unos minutos. Revisa también tu carpeta de spam.'
                : 'Te enviaremos un enlace para crear una nueva contraseña.')
            : (isRegister ? t('auth.freeNoCc') : t('auth.accessNotes'))}
        </p>
        {error && <div className="auth-error">{error}</div>}
        {forgotMode ? (
          forgotSent ? (
            <button className="auth-btn" type="button" onClick={() => { setForgotMode(false); setForgotSent(false); setError(''); }}>
              Volver al inicio de sesión
            </button>
          ) : (
            <>
              <input className="auth-input" type="email" placeholder={t('auth.email')} value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
              <button className="auth-btn" type="button" onClick={handleForgot} disabled={loading}>
                {loading ? '...' : 'Enviar enlace'}
              </button>
              <p className="auth-link" style={{ marginTop: 12, fontSize: 12, color: '#888' }}>
                Si te registraste con Google o Apple, este enlace te permitirá agregar una contraseña.
              </p>
              <button
                type="button"
                onClick={() => { setForgotMode(false); setError(''); }}
                style={{ marginTop: 8, background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13 }}
              >
                ← Volver
              </button>
            </>
          )
        ) : (
        <form onSubmit={handleSubmit}>
          {isRegister && <input className="auth-input" type="text" placeholder={t('auth.yourName')} value={name} onChange={e => setName(e.target.value)} />}
          <input className="auth-input" type="email" placeholder={t('auth.email')} value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="auth-input" type="password" placeholder={isRegister ? t('auth.passwordMin') : t('auth.password')} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
          {isRegister && TURNSTILE_SITE_KEY && (
            <Turnstile
              siteKey={TURNSTILE_SITE_KEY}
              onToken={setCaptchaToken}
              onError={() => setCaptchaToken(null)}
            />
          )}
          <button className="auth-btn" type="submit" disabled={loading || (isRegister && !!TURNSTILE_SITE_KEY && !captchaToken)}>
            {loading ? '...' : isRegister ? t('auth.createFree') : t('auth.signIn')}
          </button>
          {!isRegister && (
            <button
              type="button"
              onClick={() => { setForgotMode(true); setError(''); setForgotSent(false); }}
              style={{ marginTop: 10, background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}
        </form>
        )}
        {!forgotMode && (
        <div className="auth-social">
          <div className="auth-divider"><span>{t('auth.orContinue')}</span></div>
          <div className="auth-social-row">
            <button className="auth-social-btn" onClick={() => handleOAuth('google')}>
              <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92A8.78 8.78 0 0 0 17.64 9.2z" fill="#4285F4"/><path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" fill="#34A853"/><path d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" fill="#FBBC05"/><path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335"/></svg>
              Google
            </button>
            <button className="auth-social-btn" onClick={() => handleOAuth('apple')}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="#000"><path d="M14.94 15.26c-.68.98-1.42 1.96-2.54 1.98-1.12.02-1.48-.66-2.76-.66s-1.68.64-2.74.68c-1.08.04-1.9-1.06-2.58-2.04C3 13.16 1.94 9.52 3.34 7.06a4.18 4.18 0 0 1 3.52-2.14c1.08-.02 2.1.72 2.76.72.66 0 1.9-.9 3.2-.76.54.02 2.08.22 3.06 1.66-.08.04-1.82 1.06-1.8 3.18.02 2.52 2.22 3.36 2.24 3.38-.02.04-.34 1.2-1.38 2.16zM11.14.56c.76-.92 2.02-1.6 3.08-1.64.14 1.2-.34 2.38-1.08 3.26-.74.88-1.96 1.56-3.14 1.46-.16-1.16.4-2.38 1.14-3.08z"/></svg>
              Apple
            </button>
          </div>
        </div>
        )}
        {!forgotMode && (
        <p className="auth-link">
          {isRegister ? t('auth.hasAccount') : t('auth.noAccount')}
          <a href="#" onClick={e => { e.preventDefault(); handleToggle(); }}>{isRegister ? t('auth.signIn') : t('auth.signUpFree')}</a>
        </p>
        )}
        <div className="auth-lang-bar">
          {(Object.entries(LANG_LABELS) as [Lang, string][]).map(([code, label]) => (
            <button key={code} className={`auth-lang-btn ${lang === code ? 'active' : ''}`} onClick={() => setLang(code)}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const showcaseContent = (
    <div className="auth-showcase">
      {isRegister ? <RegisterDemo /> : <LoginDemo />}
    </div>
  );

  return (
    <div className={`auth-page ${transitioning ? 'auth-fade-out' : 'auth-fade-in'}`}>
      {isRegister ? <>{showcaseContent}{formContent}</> : <>{formContent}{showcaseContent}</>}
    </div>
  );
}

// ── Sidebar Navigation ──────────────────────────────────────────────────────

function Sidebar({ email, onLogout, folders }: { email: string; onLogout: () => void; folders: Folder[] }) {
  const { t, lang, setLang } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const close = () => setMobileOpen(false);

  return (
    <>
      <button className="mobile-menu-btn" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      {mobileOpen && <div className="sidebar-overlay" onClick={close} />}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        {/* Brand */}
        <Link to="/" className="sb-brand" onClick={close}>
          <img src="/images/favicon.png" alt="Sythio" className="sb-logo" />
          <span>Sythio</span>
        </Link>

        {/* Main */}
        <div className="sb-group">
          <Link to="/" className={`sb-item ${pathname === '/' ? 'active' : ''}`} onClick={close}>
            <span className="sb-icon sb-icon-lib">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>
            </span>
            <span>{t('dash.library')}</span>
          </Link>
          <Link to="/workspaces" className={`sb-item ${pathname === '/workspaces' ? 'active' : ''}`} onClick={close}>
            <span className="sb-icon sb-icon-ws">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </span>
            <span>{t('nav.workspaces')}</span>
          </Link>
          <Link to="/integrations" className={`sb-item ${pathname === '/integrations' ? 'active' : ''}`} onClick={close}>
            <span className="sb-icon sb-icon-int">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </span>
            <span>{t('nav.integrations')}</span>
          </Link>
        </div>

        {/* Folders */}
        {folders.length > 0 && (
          <div className="sb-group">
            <span className="sb-label">Folders</span>
            {folders.map(f => (
              <Link key={f.id} to={`/?folder=${f.id}`} className="sb-item sb-folder" onClick={close}>
                <span className="sb-folder-dot" style={{ background: f.color, boxShadow: `0 0 6px ${f.color}44` }} />
                <span>{f.name}</span>
              </Link>
            ))}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Bottom */}
        <div className="sb-group sb-group-bottom">
          <Link to="/trash" className={`sb-item ${pathname === '/trash' ? 'active' : ''}`} onClick={close}>
            <span className="sb-icon sb-icon-trash">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </span>
            <span>{t('nav.trash')}</span>
          </Link>
          <Link to="/settings" className={`sb-item ${pathname === '/settings' ? 'active' : ''}`} onClick={close}>
            <span className="sb-icon sb-icon-set">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </span>
            <span>{t('nav.settings')}</span>
          </Link>

          <div className="sb-divider" />

          <select value={lang} onChange={e => setLang(e.target.value as Lang)} className="sb-lang">
            {(Object.keys(LANG_LABELS) as Lang[]).map(l => <option key={l} value={l}>{LANG_LABELS[l]}</option>)}
          </select>

          <div className="sb-user">
            <div className="sb-avatar">{email[0]?.toUpperCase()}</div>
            <div className="sb-user-info">
              <span className="sb-email">{email}</span>
              <button className="sb-logout" onClick={onLogout}>{t('nav.logout')}</button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard() {
  const { t } = useI18n();
  const { showConfirm } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      supabase.from('notes').select('*').eq('status', 'done').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('folders').select('*').order('created_at'),
    ]).then(([notesRes, foldersRes]) => {
      setNotes((notesRes.data ?? []) as Note[]);
      setFolders((foldersRes.data ?? []) as Folder[]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = notes.filter(n => {
    if (selectedFolder && n.folder_id !== selectedFolder) return false;
    if (search.trim()) {
      const words = search.toLowerCase().split(/\s+/);
      const hay = [n.title, n.summary, n.transcript, ...n.key_points, ...n.tasks].join(' ').toLowerCase();
      if (!words.every(w => hay.includes(w))) return false;
    }
    if (filter === 'all') return true;
    if (filter === 'meeting') return n.template === 'meeting' || n.template === 'client';
    if (filter === 'tasks') return n.primary_mode === 'tasks' || n.template === 'task';
    if (filter === 'ideas') return n.primary_mode === 'ideas' || n.template === 'brainstorm';
    if (filter === 'conversations') return n.is_conversation && n.speakers_detected > 1;
    return true;
  });

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="container">
      <div className="dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1>{t('dash.library')}</h1>
            <p>{notes.length} {notes.length === 1 ? t('dash.note') : t('dash.notes')} · {t('dash.organized')}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {selectMode ? (
              <>
                <button className="action-btn" onClick={() => {
                  const sel = notes.filter(n => selected.has(n.id));
                  sel.forEach(n => downloadDOCX(n));
                  setSelectMode(false); setSelected(new Set());
                }} disabled={selected.size === 0}>📥 {t('dash.export')} {selected.size}</button>
                <button className="action-btn" onClick={() => {
                  showConfirm(`${t('common.delete')} ${selected.size} ${t('dash.notes')}?`, async () => {
                    for (const nId of selected) await supabase.from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', nId);
                    setNotes(prev => prev.filter(n => !selected.has(n.id)));
                    setSelectMode(false); setSelected(new Set());
                  });
                }} disabled={selected.size === 0} style={{ color: 'var(--error)' }}>🗑️ {t('common.delete')} {selected.size}</button>
                <button className="action-btn" onClick={() => { setSelectMode(false); setSelected(new Set()); }}>✕ {t('common.cancel')}</button>
              </>
            ) : (
              <button className="action-btn" onClick={() => setSelectMode(true)}>☑️ {t('dash.select')}</button>
            )}
          </div>
        </div>
      </div>

      {/* Folders */}
      {folders.length > 0 && (
        <div className="folders-bar">
          <button
            className={`folder-chip ${!selectedFolder ? 'active' : ''}`}
            onClick={() => setSelectedFolder(null)}
          >
            {t('dash.allFolders')}
          </button>
          {folders.map(f => (
            <button
              key={f.id}
              className={`folder-chip ${selectedFolder === f.id ? 'active' : ''}`}
              onClick={() => setSelectedFolder(selectedFolder === f.id ? null : f.id)}
              style={selectedFolder === f.id ? { background: f.color, borderColor: f.color, color: '#fff' } : { borderColor: f.color, color: f.color }}
            >
              📁 {f.name}
            </button>
          ))}
        </div>
      )}

      <div className="search-bar">
        <input className="search-input" placeholder={t('dash.search')} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="filters">
        {[['all',t('dash.all')],['meeting',t('dash.meetings')],['tasks',t('dash.tasks')],['ideas',t('dash.ideas')],['conversations',t('dash.conversations')]].map(([id, label]) => (
          <button key={id} className={`filter-chip ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📄</div>
          <h3>{search ? t('dash.noResults') : t('dash.libraryReady')}</h3>
          <p>{search ? t('dash.noResultsHint') : t('dash.emptyHint')}</p>
        </div>
      ) : (
        <div className="note-list">
          {filtered.map(note => (
            <div key={note.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {selectMode && (
                <label className="batch-checkbox">
                  <input type="checkbox" checked={selected.has(note.id)} onChange={() => {
                    setSelected(prev => { const n = new Set(prev); n.has(note.id) ? n.delete(note.id) : n.add(note.id); return n; });
                  }} />
                  <span className="checkmark" />
                </label>
              )}
              <Link to={selectMode ? '#' : `/note/${note.id}`} className="note-card" style={{ flex: 1 }}
                onClick={selectMode ? (e) => { e.preventDefault(); setSelected(prev => { const n = new Set(prev); n.has(note.id) ? n.delete(note.id) : n.add(note.id); return n; }); } : undefined}
              >
                <h3>{note.title}</h3>
                <p>{note.summary || note.transcript?.slice(0, 120)}</p>
                <div className="note-meta">
                  <span>{formatDate(note.created_at)}</span>
                  <span>{formatDuration(note.audio_duration)}</span>
                  {note.is_conversation && <span className="note-badge">👥 {note.speakers_detected} {t('dash.speakers')}</span>}
                  {note.template && <span className="note-badge">{note.template}</span>}
                  {(() => { const fl = note.folder_id ? folders.find(f => f.id === note.folder_id) : null; return fl ? (
                    <span className="note-badge" style={{ borderLeft: `3px solid ${fl.color}` }}>{fl.name}</span>
                  ) : null; })()}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Trash Page ───────────────────────────────────────────────────────────────

function TrashPage() {
  const { t } = useI18n();
  const { showConfirm } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrash = useCallback(async () => {
    const { data } = await supabase
      .from('notes')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    setNotes((data ?? []) as Note[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTrash(); }, [fetchTrash]);

  const handleRestore = async (id: string) => {
    await supabase.from('notes').update({ deleted_at: null }).eq('id', id);
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const handlePermanentDelete = (id: string) => {
    showConfirm(t('trash.permDelete'), async () => {
      await supabase.from('notes').delete().eq('id', id);
      setNotes(prev => prev.filter(n => n.id !== id));
    });
  };

  if (loading) return <div className="container"><div className="loading"><div className="spinner" /></div></div>;

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>🗑️ {t('trash.title')}</h1>
        <p>{notes.length} {notes.length === 1 ? t('dash.note') : t('dash.notes')} · {t('trash.autoDelete')}</p>
      </div>
      <p style={{ marginBottom: 20 }}><Link to="/">{t('trash.backHome')}</Link></p>

      {notes.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🗑️</div>
          <h3>{t('trash.empty')}</h3>
          <p>{t('trash.emptyHint')}</p>
        </div>
      ) : (
        <div className="note-list">
          {notes.map(note => (
            <div key={note.id} className="trash-card">
              <div className="trash-info">
                <h3>{note.title}</h3>
                <p>{t('trash.deletedOn')} {note.deleted_at ? formatDate(note.deleted_at) : ''}</p>
              </div>
              <div className="trash-actions">
                <button className="btn-restore" onClick={() => handleRestore(note.id)}>{t('trash.restore')}</button>
                <button className="btn-perm-delete" onClick={() => handlePermanentDelete(note.id)}>{t('trash.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Note Detail ──────────────────────────────────────────────────────────────

function NoteDetail() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast, showConfirm } = useToast();
  const [note, setNote] = useState<Note | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [modeResults, setModeResults] = useState<ModeResult[]>([]);
  const [activeMode, setActiveMode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [shareLoading, setShareLoading] = useState(false);
  // Editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [speakerDraft, setSpeakerDraft] = useState('');
  // Channel sharing
  const [showChannelShare, setShowChannelShare] = useState(false);
  const [wsChannels, setWsChannels] = useState<{id:string;name:string;workspace_name:string}[]>([]);
  // Images
  const [noteImages, setNoteImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  // Comments
  const [comments, setComments] = useState<{id:string; text:string; created_at:string; user_id:string}[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  // Highlights
  const [highlights, setHighlights] = useState<number[]>([]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('notes').select('*').eq('id', id).single(),
      supabase.from('mode_results').select('*').eq('note_id', id).order('created_at'),
      supabase.from('folders').select('*').order('created_at'),
    ]).then(([noteRes, modesRes, foldersRes]) => {
      if (noteRes.data) {
        setNote(noteRes.data as Note);
        setActiveMode((noteRes.data as Note).primary_mode);
      }
      setModeResults((modesRes.data ?? []) as ModeResult[]);
      setFolders((foldersRes.data ?? []) as Folder[]);
      setHighlights(((noteRes.data as any)?.highlights as number[]) ?? []);
      setNoteImages(((noteRes.data as any)?.images as string[]) ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
    // Fetch comments
    Promise.resolve(supabase.from('comments').select('*').eq('note_id', id).order('created_at')).then(({ data }) => {
      setComments((data ?? []) as any[]);
    }).catch(() => {});
  }, [id]);

  const handleSaveTitle = useCallback(async () => {
    if (!id || !titleDraft.trim()) return;
    await supabase.from('notes').update({ title: titleDraft.trim() }).eq('id', id);
    setNote(prev => prev ? { ...prev, title: titleDraft.trim() } : prev);
    setEditingTitle(false);
  }, [id, titleDraft]);

  const handleSaveSpeaker = useCallback(async (speakerId: string) => {
    if (!id || !note || !speakerDraft.trim()) return;
    const updated = note.speakers.map(s => s.id === speakerId ? { ...s, custom_name: speakerDraft.trim() } : s);
    await supabase.from('notes').update({ speakers: updated }).eq('id', id);
    setNote(prev => prev ? { ...prev, speakers: updated } : prev);
    setEditingSpeaker(null);
  }, [id, note, speakerDraft]);

  const handleMoveToFolder = useCallback(async (folderId: string | null) => {
    if (!id) return;
    await supabase.from('notes').update({ folder_id: folderId }).eq('id', id);
    setNote(prev => prev ? { ...prev, folder_id: folderId } : prev);
  }, [id]);

  const handleSoftDelete = useCallback(() => {
    if (!id) return;
    showConfirm(t('note.moveTrash'), async () => {
      await supabase.from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      navigate('/');
    });
  }, [id, navigate, showConfirm]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast(t('common.copied'));
  }, [toast]);

  const handleDownloadTxt = useCallback(() => {
    if (!note) return;
    const text = [
      `# ${note.title}`,
      `Fecha: ${formatDate(note.created_at)}`,
      '',
      '## Resumen', note.summary,
      '', '## Puntos clave', ...note.key_points.map(p => `- ${p}`),
      '', '## Tareas', ...note.tasks.map(t => `☐ ${t}`),
      '', '## Transcripción', note.transcript,
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${note.title.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 40)}.txt`;
    a.click(); URL.revokeObjectURL(url);
  }, [note]);

  const handleDownloadSrt = useCallback(() => {
    if (!note || !note.segments?.length) return;
    const srt = note.segments.map((seg, i) => {
      const speaker = note.speakers?.length > 1
        ? `${note.speakers.find(s => s.id === seg.speaker)?.custom_name ?? seg.speaker}: `
        : '';
      const fmt = (s: number) => {
        const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); const sec = Math.floor(s%60); const ms = Math.round((s%1)*1000);
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
      };
      return `${i+1}\n${fmt(seg.start)} --> ${fmt(seg.end)}\n${speaker}${seg.text}\n`;
    }).join('\n');
    const blob = new Blob([srt], { type: 'application/x-subrip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${note.title.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 40)}.srt`;
    a.click(); URL.revokeObjectURL(url);
  }, [note]);

  const handleShareLink = useCallback(async () => {
    if (!note || !id) return;
    setShareLoading(true);
    try {
      let token = note.share_token;
      if (!token) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        token = '';
        for (let i = 0; i < 24; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
        await supabase.from('notes').update({ share_token: token }).eq('id', id);
        setNote(prev => prev ? { ...prev, share_token: token } : prev);
      }
      const url = `${window.location.origin}/shared/${token}`;
      await navigator.clipboard.writeText(url);
      toast(t('common.linkCopied'));
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setShareLoading(false);
    }
  }, [note, id, toast]);

  if (loading) return <div className="container"><div className="loading"><div className="spinner" /></div></div>;
  if (!note) return <div className="container"><div className="empty"><h3>{t('note.notFound')}</h3><p><a href="#" onClick={e => { e.preventDefault(); navigate('/'); }}>{t('common.back')}</a></p></div></div>;

  const activeModeResult = modeResults.find(r => r.mode === activeMode);
  const availableModes = [note.primary_mode, ...modeResults.map(r => r.mode)].filter((m, i, a) => a.indexOf(m) === i);

  return (
    <div className="container">
      <div className="note-detail">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <a href="#" className="note-back" onClick={e => { e.preventDefault(); navigate('/'); }} style={{ margin: 0 }}>{t('note.back')}</a>
          <button className="action-btn" onClick={handleSoftDelete} style={{ color: 'var(--error)', borderColor: 'rgba(255,59,48,0.3)' }}>🗑️ {t('note.trash')}</button>
        </div>

        {/* Editable title */}
        {editingTitle ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              className="edit-inline-input"
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
              style={{ flex: 1, fontSize: 22, fontWeight: 700 }}
            />
            <button className="action-btn" onClick={handleSaveTitle}>{t('note.save')}</button>
            <button className="action-btn" onClick={() => setEditingTitle(false)}>{t('note.cancel')}</button>
          </div>
        ) : (
          <h1 onClick={() => { setTitleDraft(note.title); setEditingTitle(true); }} className="editable-title" title="Click para editar">
            {note.title} <span className="edit-hint">✏️</span>
          </h1>
        )}

        <div className="meta">
          {formatDate(note.created_at)} · {formatDuration(note.audio_duration)}
          {note.is_conversation && ` · ${note.speakers_detected} ${t('dash.speakers')}`}
          {note.template && ` · ${note.template}`}
        </div>

        {/* Folder selector + Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <select
            className="folder-select"
            value={note.folder_id ?? ''}
            onChange={e => handleMoveToFolder(e.target.value || null)}
          >
            <option value="">📁 {t('note.noFolder')}</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>📁 {f.name}</option>
            ))}
          </select>
        </div>

        <div className="actions-bar">
          <button className="action-btn" onClick={handleShareLink} disabled={shareLoading}>
            🔗 {shareLoading ? t('note.generating') : t('note.copyLink')}
          </button>
          <button className="action-btn" onClick={() => handleCopy(note.summary || note.transcript)}>📋 {t('note.copySummary')}</button>
          <button className="action-btn" onClick={handleDownloadTxt}>📄 TXT</button>
          <button className="action-btn" onClick={() => downloadDOCX(note)}>📝 Word</button>
          {note.segments?.length > 0 && <button className="action-btn" onClick={handleDownloadSrt}>🎬 SRT</button>}
          <button className="action-btn" onClick={() => handleCopy(note.transcript)}>📝 {t('note.transcript')}</button>
          <button className="action-btn" onClick={async () => {
            const session = (await supabase.auth.getSession()).data.session;
            if (!session) return;
            const { data: memberships } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', session.user.id);
            if (!memberships?.length) { toast(t('toast.noWorkspaces'), 'info'); return; }
            const wsIds = memberships.map(m => m.workspace_id);
            const { data: wsList } = await supabase.from('workspaces').select('id, name').in('id', wsIds);
            const { data: chList } = await supabase.from('channels').select('id, name, workspace_id').in('workspace_id', wsIds);
            const mapped = (chList || []).map(ch => ({ id: ch.id, name: ch.name, workspace_name: (wsList || []).find(w => w.id === ch.workspace_id)?.name || '' }));
            if (mapped.length === 0) { toast(t('toast.noChannels'), 'info'); return; }
            setWsChannels(mapped);
            setShowChannelShare(true);
          }}>📢 {t('note.channel')}</button>
        </div>

        {/* Channel share dropdown */}
        {showChannelShare && wsChannels.length > 0 && (
          <div className="share-banner" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{t('note.shareToChannel')}</span>
              <button onClick={() => setShowChannelShare(false)} style={{ background: 'none', fontSize: 16, color: 'var(--text3)' }}>×</button>
            </div>
            {wsChannels.map(ch => (
              <button key={ch.id} className="action-btn" style={{ justifyContent: 'flex-start', width: '100%' }} onClick={async () => {
                const session = (await supabase.auth.getSession()).data.session;
                if (!session) return;
                const { error } = await supabase.from('channel_notes').insert({ channel_id: ch.id, note_id: id, shared_by: session.user.id });
                if (error?.code === '23505') toast(t('toast.alreadyShared'), 'info');
                else if (error) toast(t('common.error') + ': ' + error.message, 'error');
                else { toast(`${t('toast.sharedIn')} #${ch.name}`); setShowChannelShare(false); }
              }}>
                #{ch.name} <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 4 }}>{ch.workspace_name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Share link banner */}
        {note.share_token && (
          <div className="share-banner">
            <span>🔗 {t('note.publicLink')}</span>
            <button onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/shared/${note.share_token}`);
              toast(t('common.linkCopied'));
            }}>{t('note.copy')}</button>
          </div>
        )}

        {/* Mode tabs */}
        {availableModes.length > 1 && (
          <div className="mode-tabs">
            {availableModes.map(mode => (
              <button key={mode} className={`mode-tab ${activeMode === mode ? 'active' : ''}`} onClick={() => setActiveMode(mode)}>
                {getModeLabel(mode, t)}
              </button>
            ))}
          </div>
        )}

        {/* Mode result */}
        {activeModeResult ? (
          <ModeResultView mode={activeMode} result={activeModeResult.result} />
        ) : activeMode === note.primary_mode ? (
          <ModeResultView mode={activeMode} result={{ summary: note.summary, key_points: note.key_points, tasks: note.tasks.map(t => ({ text: t })), clean_text: note.clean_text }} />
        ) : null}

        {/* Speaker rename section */}
        {note.is_conversation && note.speakers?.length > 1 && (
          <div className="note-section">
            <h2>{t('note.speakers')} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text3)' }}>{t('note.speakersRename')}</span></h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {note.speakers.map(sp => (
                editingSpeaker === sp.id ? (
                  <div key={sp.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      className="edit-inline-input"
                      value={speakerDraft}
                      onChange={e => setSpeakerDraft(e.target.value)}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveSpeaker(sp.id); if (e.key === 'Escape') setEditingSpeaker(null); }}
                      style={{ width: 140, fontSize: 13 }}
                    />
                    <button className="action-btn" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => handleSaveSpeaker(sp.id)}>OK</button>
                  </div>
                ) : (
                  <button
                    key={sp.id}
                    className="speaker-chip"
                    onClick={() => { setEditingSpeaker(sp.id); setSpeakerDraft(sp.custom_name ?? sp.default_name); }}
                  >
                    👤 {sp.custom_name ?? sp.default_name}
                  </button>
                )
              ))}
            </div>
          </div>
        )}

        {/* Images */}
        <div className="note-section">
          <h2>{t('note.images')} ({noteImages.length})</h2>
          <div className="note-images">
            {noteImages.map((path, idx) => (
              <div key={idx} className="note-image-wrap">
                <img src={`https://oewjbeqwihhzuvbsfctf.supabase.co/storage/v1/object/public/note-images/${path}`} alt="" className="note-image" />
                <button className="note-image-remove" onClick={async () => {
                  await supabase.storage.from('note-images').remove([path]);
                  const updated = noteImages.filter((_,i) => i !== idx);
                  setNoteImages(updated);
                  await supabase.from('notes').update({ images: updated }).eq('id', id);
                }}>×</button>
              </div>
            ))}
            <label className="note-image-add">
              <input type="file" accept="image/*" hidden onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !id) return;
                setUploadingImage(true);
                const session = (await supabase.auth.getSession()).data.session;
                if (!session) { setUploadingImage(false); return; }
                const ext = file.name.split('.').pop() || 'jpg';
                const fileName = `${session.user.id}/${id}_${Date.now()}.${ext}`;
                const { error } = await supabase.storage.from('note-images').upload(fileName, file);
                if (!error) {
                  const updated = [...noteImages, fileName];
                  setNoteImages(updated);
                  await supabase.from('notes').update({ images: updated }).eq('id', id);
                }
                setUploadingImage(false);
                e.target.value = '';
              }} />
              {uploadingImage ? '...' : t('note.addImage')}
            </label>
          </div>
        </div>

        {/* Comments */}
        <div className="note-section">
          <h2>{t('note.comments')} ({comments.length})</h2>
          <div className="comments-section">
            {comments.length === 0 && <p className="comments-empty">{t('note.noComments')}</p>}
            {comments.map(c => (
              <div key={c.id} className="comment-card">
                <div className="comment-header">
                  <span className="comment-avatar">💬</span>
                  <span className="comment-time">{formatDate(c.created_at)}</span>
                  <button className="comment-delete" onClick={async () => {
                    await supabase.from('comments').delete().eq('id', c.id);
                    setComments(prev => prev.filter(x => x.id !== c.id));
                  }}>×</button>
                </div>
                <p className="comment-text">{c.text}</p>
              </div>
            ))}
            <div className="comment-input-row">
              <input
                className="comment-input"
                placeholder={t('note.writeComment')}
                value={commentDraft}
                onChange={e => setCommentDraft(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && commentDraft.trim()) {
                    setPostingComment(true);
                    const session = (await supabase.auth.getSession()).data.session;
                    if (!session) return;
                    const { data } = await supabase.from('comments').insert({ note_id: id, user_id: session.user.id, text: commentDraft.trim() }).select().single();
                    if (data) setComments(prev => [...prev, data as any]);
                    setCommentDraft('');
                    setPostingComment(false);
                  }
                }}
                disabled={postingComment}
              />
              <button className="comment-send" disabled={!commentDraft.trim() || postingComment} onClick={async () => {
                if (!commentDraft.trim()) return;
                setPostingComment(true);
                const session = (await supabase.auth.getSession()).data.session;
                if (!session) return;
                const { data } = await supabase.from('comments').insert({ note_id: id, user_id: session.user.id, text: commentDraft.trim() }).select().single();
                if (data) setComments(prev => [...prev, data as any]);
                setCommentDraft('');
                setPostingComment(false);
              }}>{t('note.send')}</button>
            </div>
          </div>
        </div>

        {/* Transcript */}
        <div className="note-section">
          <h2>{t('note.fullTranscript')}</h2>
          {note.is_conversation && note.segments?.length > 0 ? (
            <div className="note-section-content">
              {note.segments.map((seg, i) => {
                const sp = note.speakers?.find(s => s.id === seg.speaker);
                const name = sp?.custom_name ?? sp?.default_name ?? seg.speaker;
                const isHighlighted = highlights.includes(i);
                return (
                  <div key={i} className={`segment ${isHighlighted ? 'segment-highlighted' : ''}`}
                    onClick={async () => {
                      const newHL = isHighlighted ? highlights.filter(h => h !== i) : [...highlights, i];
                      setHighlights(newHL);
                      await supabase.from('notes').update({ highlights: newHL }).eq('id', id);
                    }}
                    title={t('note.clickHighlight')}
                    style={{ cursor: 'pointer' }}
                  >
                    {isHighlighted && <span className="highlight-badge">★</span>}
                    <span className="segment-speaker">{name}</span>
                    <span className="segment-time">{formatTimestamp(seg.start)}</span>
                    <div className="segment-text">{seg.text}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="note-section-content">{note.transcript}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared Note (public, no auth) ────────────────────────────────────────────

function SharedNotePage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { token } = useParams<{ token: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [modeResults, setModeResults] = useState<ModeResult[]>([]);
  const [activeMode, setActiveMode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    supabase.functions.invoke('get-shared-note', { body: { token } })
      .then(({ data, error: err }) => {
        if (err || !data?.note) {
          setError(t('shared.notFound'));
          setLoading(false);
          return;
        }
        setNote(data.note as Note);
        setModeResults((data.mode_results ?? []) as ModeResult[]);
        setActiveMode((data.note as Note).primary_mode);
        setLoading(false);
      });
  }, [token]);

  if (loading) return <div className="loading" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}><div className="spinner" /></div>;
  if (error || !note) return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 12 }}>
      <h2>Sythio</h2>
      <p style={{ color: '#8A8F98' }}>{error || t('note.notFound')}</p>
    </div>
  );

  const activeModeResult = modeResults.find(r => r.mode === activeMode);
  const availableModes = [note.primary_mode, ...modeResults.map(r => r.mode)].filter((m, i, a) => a.indexOf(m) === i);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#8A8F98', textTransform: 'uppercase', letterSpacing: 1 }}>{t('shared.via')}</span>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{note.title}</h1>
      <p style={{ fontSize: 13, color: '#8A8F98', marginBottom: 24 }}>
        {formatDate(note.created_at)} · {formatDuration(note.audio_duration)}
        {note.is_conversation && ` · ${note.speakers_detected} ${t('dash.speakers')}`}
      </p>

      {/* Actions */}
      <div className="actions-bar">
        <button className="action-btn" onClick={() => { navigator.clipboard.writeText(note.summary || note.transcript); toast(t('common.copied')); }}>📋 {t('note.copySummary')}</button>
        <button className="action-btn" onClick={() => downloadDOCX(note)}>📝 Word</button>
        <button className="action-btn" onClick={() => {
          const text = [`# ${note.title}`, `Fecha: ${formatDate(note.created_at)}`, '', '## Resumen', note.summary, '', '## Puntos clave', ...note.key_points.map(p => `- ${p}`), '', '## Tareas', ...note.tasks.map(t => `☐ ${t}`), '', '## Transcripción', note.transcript].join('\n');
          const blob = new Blob([text], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `${note.title.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 40)}.txt`; a.click(); URL.revokeObjectURL(url);
        }}>📄 TXT</button>
      </div>

      {/* Mode tabs */}
      {availableModes.length > 1 && (
        <div className="mode-tabs">
          {availableModes.map(mode => (
            <button key={mode} className={`mode-tab ${activeMode === mode ? 'active' : ''}`} onClick={() => setActiveMode(mode)}>
              {getModeLabel(mode, t)}
            </button>
          ))}
        </div>
      )}

      {activeModeResult ? (
        <ModeResultView mode={activeMode} result={activeModeResult.result} />
      ) : activeMode === note.primary_mode ? (
        <ModeResultView mode={activeMode} result={{ summary: note.summary, key_points: note.key_points, tasks: note.tasks.map(t => ({ text: t })), clean_text: note.clean_text }} />
      ) : null}

      <div className="note-section">
        <h2>{t('note.fullTranscript')}</h2>
        {note.is_conversation && note.segments?.length > 0 ? (
          <div className="note-section-content">
            {note.segments.map((seg, i) => {
              const sp = note.speakers?.find(s => s.id === seg.speaker);
              const name = sp?.custom_name ?? sp?.default_name ?? seg.speaker;
              return <div key={i} className="segment"><span className="segment-speaker">{name}</span><span className="segment-time">{formatTimestamp(seg.start)}</span><div className="segment-text">{seg.text}</div></div>;
            })}
          </div>
        ) : (
          <div className="note-section-content">{note.transcript}</div>
        )}
      </div>

      {/* CTA + Social Proof Footer */}
      <div className="shared-footer">
        <div className="shared-cta">
          <h3>{t('shared.madeWith')}</h3>
          <p>{t('shared.cta')}</p>
          <div className="shared-rating">
            <span className="shared-stars">★★★★★</span>
            <span>4.8/5 — 347 valoraciones</span>
          </div>
          <a href="https://sythio.app" className="shared-cta-btn">{t('shared.tryFree')}</a>
        </div>
        <div className="shared-testimonials">
          {TESTIMONIALS.slice(0, 2).map((t, i) => (
            <div key={i} className="shared-testimonial">
              <p>"{t.text}"</p>
              <span>{t.name}, {t.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Mode Result View ─────────────────────────────────────────────────────────

function ModeResultView({ mode, result }: { mode: string; result: Record<string, unknown> }) {
  const { t } = useI18n();
  const s = (v: unknown) => typeof v === 'string' ? v : '';
  const arr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const rArr = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];

  switch (mode) {
    case 'summary':
      return (
        <>
          {s(result.summary) && <div className="note-section"><h2>{t('mode.summary')}</h2><div className="note-section-content">{s(result.summary)}</div></div>}
          {arr(result.key_points).length > 0 && <div className="note-section"><h2>{t('modeResult.keyPoints')}</h2><ul className="note-list-items">{arr(result.key_points).map((p,i) => <li key={i}>{p}</li>)}</ul></div>}
        </>
      );
    case 'tasks':
      return (
        <div className="note-section"><h2>{t('mode.tasks')}</h2>
          <ul className="note-list-items">{rArr(result.tasks).map((t,i) => <li key={i}>☐ {s(t.text) || s(t.task)} {s(t.priority) && <span className="note-badge">{s(t.priority)}</span>} {s(t.responsible) && <span style={{color:'var(--text3)', fontSize:12}}>→ {s(t.responsible)}</span>}</li>)}</ul>
        </div>
      );
    case 'action_plan':
      return (
        <>
          {s(result.objective) && <div className="note-section"><h2>{t('modeResult.objective')}</h2><div className="note-section-content">{s(result.objective)}</div></div>}
          {rArr(result.steps).length > 0 && <div className="note-section"><h2>{t('modeResult.steps')}</h2><ul className="note-list-items">{rArr(result.steps).map((st,i) => <li key={i}><strong>{i+1}.</strong> {s(st.action) || s(st.step)}</li>)}</ul></div>}
        </>
      );
    case 'clean_text':
      return <div className="note-section"><h2>{t('mode.cleanText')}</h2><div className="note-section-content" style={{whiteSpace:'pre-wrap'}}>{s(result.clean_text)}</div></div>;
    case 'executive_report':
      return (
        <>
          {s(result.executive_summary) && <div className="note-section"><h2>{t('modeResult.execSummary')}</h2><div className="note-section-content">{s(result.executive_summary)}</div></div>}
          {arr(result.key_points).length > 0 && <div className="note-section"><h2>{t('modeResult.keyPoints')}</h2><ul className="note-list-items">{arr(result.key_points).map((p,i) => <li key={i}>{p}</li>)}</ul></div>}
          {arr(result.next_steps).length > 0 && <div className="note-section"><h2>{t('modeResult.nextSteps')}</h2><ul className="note-list-items">{arr(result.next_steps).map((p,i) => <li key={i}>{p}</li>)}</ul></div>}
        </>
      );
    case 'ready_message': {
      const msgs = typeof result.messages === 'object' && result.messages ? result.messages as Record<string, unknown> : {};
      return (
        <div className="note-section"><h2>{t('modeResult.readyMsgs')}</h2>
          {(['professional','friendly','firm','brief'] as const).map(tone => {
            const text = s(msgs[tone]); if (!text) return null;
            const labels: Record<string, string> = { professional: t('modeResult.professional'), friendly: t('modeResult.friendly'), firm: t('modeResult.firm'), brief: t('modeResult.brief') };
            return <div key={tone} style={{marginBottom:16}}><div style={{fontSize:12,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',marginBottom:4}}>{labels[tone]}</div><div className="note-section-content">{text}</div></div>;
          })}
        </div>
      );
    }
    case 'study':
      return (
        <>
          {s(result.summary) && <div className="note-section"><h2>{t('mode.summary')}</h2><div className="note-section-content">{s(result.summary)}</div></div>}
          {rArr(result.key_concepts).length > 0 && <div className="note-section"><h2>{t('modeResult.keyConcepts')}</h2>{rArr(result.key_concepts).map((c,i) => <div key={i} style={{borderLeft:'3px solid var(--text)',padding:'8px 12px',margin:'8px 0',background:'var(--surface)',borderRadius:'0 8px 8px 0'}}><strong>{s(c.concept)}</strong><br/><span style={{color:'var(--text2)',fontSize:13}}>{s(c.explanation)}</span></div>)}</div>}
          {rArr(result.probable_questions).length > 0 && <div className="note-section"><h2>{t('modeResult.probableQ')}</h2><ul className="note-list-items">{rArr(result.probable_questions).map((q,i) => <li key={i}><strong>{s(q.question)}</strong>{s(q.answer_hint) && <><br/><em style={{color:'var(--text2)'}}>{s(q.answer_hint)}</em></>}</li>)}</ul></div>}
        </>
      );
    case 'ideas':
      return (
        <>
          {s(result.core_idea) && <div className="note-section"><h2>{t('modeResult.coreIdea')}</h2><div className="note-section-content">{s(result.core_idea)}</div></div>}
          {rArr(result.opportunities).length > 0 && <div className="note-section"><h2>{t('modeResult.opportunities')}</h2><ul className="note-list-items">{rArr(result.opportunities).map((o,i) => <li key={i}>{s(o.opportunity)} {s(o.potential) && <span className="note-badge">{s(o.potential)}</span>}</li>)}</ul></div>}
          {s(result.structured_version) && <div className="note-section"><h2>{t('modeResult.structured')}</h2><div className="note-section-content" style={{whiteSpace:'pre-wrap'}}>{s(result.structured_version)}</div></div>}
        </>
      );
    case 'outline':
      return (
        <div className="note-section">
          <h2>{t('mode.outline')}</h2>
          {rArr(result.sections).map((section, sIdx) => (
            <div key={sIdx} className="outline-section">
              <div className="outline-heading">
                <span className="outline-number">{sIdx + 1}</span>
                <span className="outline-title">{s(section.heading)}</span>
              </div>
              {arr(section.points as unknown as string[]).length > 0 && (
                <ul className="outline-points">
                  {(Array.isArray(section.points) ? section.points as string[] : []).map((p, pIdx) => (
                    <li key={pIdx}>{typeof p === 'string' ? p : ''}</li>
                  ))}
                </ul>
              )}
              {rArr(section.subsections).map((sub, subIdx) => (
                <div key={subIdx} className="outline-subsection">
                  <div className="outline-sub-heading">{s(sub.heading)}</div>
                  <ul className="outline-points outline-sub-points">
                    {(Array.isArray(sub.points) ? sub.points as string[] : []).map((sp, spIdx) => (
                      <li key={spIdx}>{typeof sp === 'string' ? sp : ''}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    default:
      return <div className="note-section"><div className="note-section-content"><pre style={{whiteSpace:'pre-wrap',fontSize:13}}>{JSON.stringify(result, null, 2)}</pre></div></div>;
  }
}

// ── Workspaces Page ─────────────────────────────────────────────────────

function WorkspacesPage() {
  const { t } = useI18n();
  const [workspaces, setWorkspaces] = useState<{id:string;name:string;description:string;owner_id:string;created_at:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  useEffect(() => {
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return;
      const { data: memberships } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', session.user.id);
      if (!memberships?.length) { setLoading(false); return; }
      const ids = memberships.map(m => m.workspace_id);
      const { data } = await supabase.from('workspaces').select('*').in('id', ids).order('created_at', { ascending: false });
      setWorkspaces((data ?? []) as any[]);
      setLoading(false);
    })();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return;
    const { data } = await supabase.from('workspaces').insert({ name: name.trim(), description: desc.trim(), owner_id: session.user.id }).select().single();
    if (data) {
      await supabase.from('workspace_members').insert({ workspace_id: data.id, user_id: session.user.id, role: 'owner' });
      setWorkspaces(prev => [data as any, ...prev]);
      setShowCreate(false); setName(''); setDesc('');
    }
  };

  if (loading) return <div className="container"><div className="loading"><div className="spinner" /></div></div>;

  return (
    <div className="container">
      <div className="dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1>👥 {t('ws.title')}</h1>
            <p>{t('ws.subtitle')}</p>
          </div>
          <button className="action-btn" style={{ background: 'var(--text)', color: '#fff' }} onClick={() => setShowCreate(true)}>{t('ws.create')}</button>
        </div>
      </div>

      <p style={{ marginBottom: 20 }}><Link to="/">{t('int.backHome')}</Link></p>

      {workspaces.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">👥</div>
          <h3>{t('ws.empty')}</h3>
          <p>{t('ws.emptyHint')}</p>
        </div>
      ) : (
        <div className="workspace-grid">
          {workspaces.map(ws => (
            <div key={ws.id} className="workspace-card">
              <div className="workspace-icon">👥</div>
              <div>
                <h3>{ws.name}</h3>
                {ws.description && <p>{ws.description}</p>}
                <span className="workspace-date">{formatDate(ws.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <h2>{t('ws.new')}</h2>
            <input className="auth-input" placeholder={t('ws.name')} value={name} onChange={e => setName(e.target.value)} autoFocus />
            <input className="auth-input" placeholder={t('ws.descOpt')} value={desc} onChange={e => setDesc(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="action-btn" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
              <button className="auth-btn" style={{ flex: 1, marginTop: 0 }} onClick={handleCreate} disabled={!name.trim()}>{t('ws.create').replace('+ ', '')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Integrations Page ────────────────────────────────────────────────────

function IntegrationsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [slackUrl, setSlackUrl] = useState('');
  const [slackSaved, setSlackSaved] = useState(false);
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return;
      // Load Slack integration
      const { data: slack } = await supabase.from('integrations').select('config, enabled').eq('user_id', session.user.id).eq('provider', 'slack').maybeSingle();
      if (slack) {
        setSlackUrl((slack.config as any)?.webhook_url || '');
        setSlackEnabled(slack.enabled);
        setSlackSaved(true);
      }
      setLoading(false);
    })();
  }, []);

  const handleSaveSlack = async () => {
    if (!slackUrl.startsWith('https://hooks.slack.com/')) { toast(t('toast.slackBadUrl'), 'error'); return; }
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return;
    await supabase.from('integrations').upsert({
      user_id: session.user.id, provider: 'slack',
      config: { webhook_url: slackUrl, notify_on: ['processing_complete'] }, enabled: true,
    }, { onConflict: 'user_id,provider' });
    setSlackSaved(true); setSlackEnabled(true);
    toast(t('toast.slackConnected'));
  };

  const handleGenerateApiKey = async () => {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return;
    const raw = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
    const key = `sk_${raw}`;
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    const keyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    await supabase.from('api_keys').insert({ user_id: session.user.id, key_hash: keyHash, name: 'Web Key', permissions: ['read', 'write'] });
    setApiKey(key);
  };

  // Calendar sub-components
  const [calConnected, setCalConnected] = useState(false);
  const [calEvents, setCalEvents] = useState<{id:string;title:string;start:string;meet_link?:string;attendees:number}[]>([]);
  const [calLoading, setCalLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return;
      const { data: cal } = await supabase.from('integrations').select('enabled').eq('user_id', session.user.id).eq('provider', 'google_calendar').maybeSingle();
      if (cal?.enabled) {
        setCalConnected(true);
        // Fetch events via direct fetch (invoke doesn't support query params)
        setCalLoading(true);
        try {
          const token = session.access_token;
          const res = await fetch(`https://oewjbeqwihhzuvbsfctf.supabase.co/functions/v1/calendar-auth?action=events`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const d = await res.json();
            setCalEvents(d.events || []);
          }
        } catch { /* ignore */ }
        setCalLoading(false);
      }
    })();
  }, []);

  // Check URL for calendar_connected param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar_connected') === 'true') {
      setCalConnected(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  function CalendarStatus() {
    return <span className={`integration-status ${calConnected ? 'active' : ''}`}>{calConnected ? 'Conectado' : 'Disponible'}</span>;
  }

  function CalendarActions() {
    if (calConnected) {
      return (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: 'var(--success)', fontSize: 14 }}>✓ Google Calendar conectado</span>
            <button className="action-btn" style={{ fontSize: 12, color: 'var(--error)' }} onClick={async () => {
              const session = (await supabase.auth.getSession()).data.session;
              if (!session) return;
              await supabase.from('integrations').delete().eq('user_id', session.user.id).eq('provider', 'google_calendar');
              setCalConnected(false);
              setCalEvents([]);
            }}>Desconectar</button>
          </div>
          {calEvents.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {calEvents.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface)', borderRadius: 8, fontSize: 13 }}>
                  <span>📅</span>
                  <span style={{ flex: 1, fontWeight: 500 }}>{e.title}</span>
                  <span style={{ color: 'var(--text3)', fontSize: 12 }}>{new Date(e.start).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  {e.meet_link && <a href={e.meet_link} target="_blank" rel="noopener" style={{ fontSize: 12 }}>🔗 Meet</a>}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    return (
      <button className="action-btn" style={{ background: '#1a73e8', color: '#fff', borderColor: '#1a73e8' }} onClick={async () => {
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) return;
        const returnUrl = window.location.origin + '/integrations';
        window.location.href = `${(window as any).__SUPABASE_URL || 'https://oewjbeqwihhzuvbsfctf.supabase.co'}/functions/v1/calendar-auth?action=authorize&user_id=${session.user.id}&return_url=${encodeURIComponent(returnUrl)}`;
      }}>Conectar Google Calendar</button>
    );
  }

  if (loading) return <div className="container"><div className="loading"><div className="spinner" /></div></div>;

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>⚡ {t('int.title')}</h1>
        <p>{t('int.subtitle')}</p>
      </div>
      <p style={{ marginBottom: 24 }}><Link to="/">{t('int.backHome')}</Link></p>

      <div className="integrations-grid">
        {/* Slack */}
        <div className="integration-card">
          <div className="integration-header">
            <div className="integration-icon" style={{ background: '#4A154B' }}>💬</div>
            <div>
              <h3>Slack</h3>
              <p>Recibe resúmenes automáticos de cada nota procesada directo en tu canal.</p>
            </div>
            {slackSaved && <span className={`integration-status ${slackEnabled ? 'active' : ''}`}>{slackEnabled ? 'Activo' : 'Pausado'}</span>}
          </div>
          <div className="integration-body">
            {slackSaved && slackEnabled ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '10px 14px', background: 'rgba(52,199,89,0.08)', borderRadius: 10 }}>
                  <span style={{ color: 'var(--success)' }}>✓</span>
                  <span style={{ fontSize: 14, color: 'var(--success)', fontWeight: 500 }}>Conectado — cada nota procesada se envía a tu canal de Slack</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="auth-input" style={{ flex: 1, marginBottom: 0, fontSize: 12, color: 'var(--text3)' }} value={slackUrl} onChange={e => setSlackUrl(e.target.value)} />
                  <button className="action-btn" onClick={handleSaveSlack}>Actualizar</button>
                  <button className="action-btn" style={{ color: 'var(--error)' }} onClick={async () => {
                    const session = (await supabase.auth.getSession()).data.session;
                    if (!session) return;
                    await supabase.from('integrations').delete().eq('user_id', session.user.id).eq('provider', 'slack');
                    setSlackSaved(false); setSlackEnabled(false); setSlackUrl('');
                  }}>Desconectar</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="setup-steps">
                  <div className="setup-step">
                    <span className="step-num">1</span>
                    <div>
                      <p>Abre <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer">api.slack.com/apps</a> e inicia sesión en tu workspace</p>
                    </div>
                  </div>
                  <div className="setup-step">
                    <span className="step-num">2</span>
                    <div>
                      <p>Click <strong>"Create New App"</strong> → "From scratch" → Nombre: <strong>Sythio</strong> → selecciona tu workspace</p>
                    </div>
                  </div>
                  <div className="setup-step">
                    <span className="step-num">3</span>
                    <div>
                      <p>En el menú izquierdo: <strong>"Incoming Webhooks"</strong> → Activa el toggle → Click <strong>"Add New Webhook to Workspace"</strong></p>
                    </div>
                  </div>
                  <div className="setup-step">
                    <span className="step-num">4</span>
                    <div>
                      <p>Elige el canal donde quieres recibir los resúmenes → Click <strong>"Allow"</strong></p>
                    </div>
                  </div>
                  <div className="setup-step">
                    <span className="step-num">5</span>
                    <div>
                      <p>Copia la URL del webhook y pégala aquí abajo:</p>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input className="auth-input" style={{ flex: 1, marginBottom: 0 }} placeholder="https://hooks.slack.com/services/T.../B.../xxx" value={slackUrl} onChange={e => setSlackUrl(e.target.value)} />
                  <button className="action-btn" style={{ background: '#4A154B', color: '#fff', borderColor: '#4A154B' }} onClick={handleSaveSlack} disabled={!slackUrl.includes('hooks.slack.com')}>Conectar</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Google Calendar */}
        <div className="integration-card">
          <div className="integration-header">
            <div className="integration-icon" style={{ background: '#1a73e8' }}>📅</div>
            <div>
              <h3>Google Calendar</h3>
              <p>Sincroniza tus reuniones. Ve tus próximos eventos con links de videollamada.</p>
            </div>
            <CalendarStatus />
          </div>
          <div className="integration-body">
            <CalendarActions />
          </div>
        </div>

        {/* API Key */}
        <div className="integration-card">
          <div className="integration-header">
            <div className="integration-icon" style={{ background: 'var(--text)' }}>🔑</div>
            <div>
              <h3>API Pública</h3>
              <p>Accede a tus notas desde cualquier herramienta o script.</p>
            </div>
          </div>
          <div className="integration-body">
            {apiKey ? (
              <div>
                <div style={{ padding: '12px 14px', background: 'rgba(245,158,11,0.08)', borderRadius: 10, marginBottom: 12 }}>
                  <p style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600, marginBottom: 4 }}>Guarda tu API Key — no se mostrará de nuevo</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="auth-input" style={{ flex: 1, marginBottom: 0, fontFamily: 'monospace', fontSize: 12 }} value={apiKey} readOnly onClick={e => (e.target as HTMLInputElement).select()} />
                    <button className="action-btn" onClick={() => { navigator.clipboard.writeText(apiKey); toast(t('common.copied')); }}>{t('note.copy')}</button>
                  </div>
                </div>
                <div className="setup-steps">
                  <div className="setup-step">
                    <span className="step-num">→</span>
                    <p>Listar notas: <code>GET /functions/v1/public-api?action=list_notes</code></p>
                  </div>
                  <div className="setup-step">
                    <span className="step-num">→</span>
                    <p>Ver nota: <code>GET /functions/v1/public-api?action=get_note&id=UUID</code></p>
                  </div>
                  <div className="setup-step">
                    <span className="step-num">→</span>
                    <p>Transcripción: <code>GET /functions/v1/public-api?action=get_transcript&id=UUID</code></p>
                  </div>
                </div>
                <p className="integration-hint" style={{ marginTop: 12 }}>Header: <code>Authorization: Bearer {apiKey.slice(0, 12)}...</code></p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 12 }}>Genera una API key para integrar tus notas con herramientas externas, scripts o automatizaciones.</p>
                <button className="action-btn" style={{ background: 'var(--text)', color: '#fff' }} onClick={handleGenerateApiKey}>Generar API Key</button>
              </div>
            )}
          </div>
        </div>

        {/* MCP Server */}
        <div className="integration-card">
          <div className="integration-header">
            <div className="integration-icon" style={{ background: '#D97706' }}>🤖</div>
            <div>
              <h3>MCP Server</h3>
              <p>Conecta tus notas con Claude Desktop, ChatGPT o Cursor vía IA.</p>
            </div>
          </div>
          <div className="integration-body">
            <div className="setup-steps">
              <div className="setup-step">
                <span className="step-num">1</span>
                <p>Primero genera una API Key arriba si aún no tienes una</p>
              </div>
              <div className="setup-step">
                <span className="step-num">2</span>
                <p>Instala el servidor: <code>npm install -g sythio-mcp</code></p>
              </div>
              <div className="setup-step">
                <span className="step-num">3</span>
                <div>
                  <p>Agrega esto a la configuración de tu asistente de IA:</p>
                  <pre className="code-block">{JSON.stringify({ mcpServers: { sythio: { command: "sythio-mcp", env: { SYTHIO_API_KEY: apiKey || "sk_TU_API_KEY" } } } }, null, 2)}</pre>
                </div>
              </div>
              <div className="setup-step">
                <span className="step-num">4</span>
                <div>
                  <p><strong>Para Claude Desktop:</strong> Archivo → Settings → Developer → Edit config</p>
                  <p><strong>Para Cursor:</strong> Settings → MCP → Add server</p>
                </div>
              </div>
            </div>
            <p className="integration-hint" style={{ marginTop: 12 }}>Una vez conectado, puedes pedirle a tu IA: "busca en mis notas de Sythio sobre el proyecto X" o "dame el resumen de mi última reunión"</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Platform Banner (extracted so it can use useI18n inside provider) ────────

function PlatformBannerUI({ platform, onDismiss }: { platform: string; onDismiss: () => void }) {
  const { t } = useI18n();
  return (
    <div className="container" style={{ paddingTop: 16 }}>
      <div style={{
        padding: '14px 20px', borderRadius: 'var(--radius)',
        background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
        display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: 'var(--text2)',
      }}>
        <span style={{ fontSize: 18 }}>{platform === 'ios' ? '📱' : '🤖'}</span>
        <span>
          {t('platform.activeVia')} <strong>{platform === 'ios' ? 'App Store' : 'Google Play'}</strong>.{' '}
          {t('platform.manageFrom')} {platform === 'ios' ? 'iPhone' : 'Android'}.
        </span>
        <button onClick={onDismiss} style={{ background: 'none', color: 'var(--text3)', fontSize: 18, marginLeft: 'auto', flexShrink: 0 }}>✕</button>
      </div>
    </div>
  );
}

// ── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [platformBanner, setPlatformBanner] = useState<string | null>(null);
  const [sidebarFolders, setSidebarFolders] = useState<Folder[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => { setSession(s); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      // Log platform session and check for cross-platform subscription on login
      if (s?.user?.id) {
        logPlatformSession(s.user.id).catch(() => {});
        Promise.resolve(supabase.from('folders').select('*').order('created_at')).then(({ data }) => { setSidebarFolders((data ?? []) as Folder[]); }).catch(() => {});
        getSubscriptionDetails(s.user.id).then(sub => {
          if (sub.plan !== 'free' && sub.platform && sub.platform !== 'web') {
            setPlatformBanner(sub.platform);
          }
        }).catch(() => {});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="loading" style={{minHeight:'100vh',alignItems:'center'}}><div className="spinner" /></div>;

  return (
    <I18nProvider>
    <ToastProvider>
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public shared note route - no auth required */}
          <Route path="/shared/:token" element={<SharedNotePage />} />

          {/* Password reset (handled outside main app routes — no auth required) */}
          <Route path="/auth/reset" element={<ResetPasswordPage />} />

          {/* Enterprise contact form (public landing) */}
          <Route path="/enterprise" element={<EnterpriseContactPage />} />

          {/* Admin dashboard — requires profiles.is_admin = true (checked inside) */}
          <Route path="/admin" element={<AdminPage />} />

          {/* All other routes */}
          <Route path="*" element={
            session ? (
              <div className="app-layout">
                <Sidebar email={session.user.email ?? ''} onLogout={() => { setPlatformBanner(null); supabase.auth.signOut(); }} folders={sidebarFolders} />
                <main className="app-main">
                  {platformBanner && (
                    <PlatformBannerUI platform={platformBanner} onDismiss={() => setPlatformBanner(null)} />
                  )}
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/note/:id" element={<NoteDetail />} />
                    <Route path="/trash" element={<TrashPage />} />
                    <Route path="/workspaces" element={<WorkspacesPage />} />
                    <Route path="/integrations" element={<IntegrationsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              </div>
            ) : (
              <AuthPage onAuth={() => {}} />
            )
          } />
        </Routes>
      </Suspense>
    </BrowserRouter>
    </ToastProvider>
    </I18nProvider>
  );
}
