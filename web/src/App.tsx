import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useParams, useNavigate } from 'react-router-dom';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

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

const MODE_LABELS: Record<string, string> = {
  summary: 'Resumen', tasks: 'Tareas', action_plan: 'Plan de acción',
  clean_text: 'Texto limpio', executive_report: 'Reporte ejecutivo',
  ready_message: 'Mensaje listo', study: 'Estudio', ideas: 'Ideas',
};

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

// ── Testimonials ─────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  { name: 'María G.', role: 'Directora de Operaciones', text: 'Mis reuniones ahora tienen actas automáticas. Sythio me ahorra 2 horas por semana.', stars: 5 },
  { name: 'Carlos M.', role: 'Emprendedor', text: 'Grabo ideas en el carro y cuando llego ya tengo un plan de acción estructurado. Mágico.', stars: 5 },
  { name: 'Ana R.', role: 'Coach Ejecutiva', text: 'La detección de hablantes es increíble. Perfecto para transcribir mis sesiones de coaching.', stars: 5 },
  { name: 'Roberto S.', role: 'Estudiante de Medicina', text: 'El modo Estudio convierte clases de 1 hora en fichas perfectas para repasar. Mi promedio subió.', stars: 5 },
  { name: 'Laura P.', role: 'Gerente de Proyectos', text: 'Exportar a Word directo con las tareas y responsables ya asignados. Un game changer.', stars: 5 },
  { name: 'Diego F.', role: 'Abogado', text: 'Uso Sythio para grabar declaraciones. El reporte ejecutivo ahorra días de trabajo.', stars: 4 },
];

// ── Auth Page ────────────────────────────────────────────────────────────────

function AuthPage({ onAuth }: { onAuth: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRegister, setIsRegister] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: err } = isRegister
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); setLoading(false); return; }
    if (isRegister) { setError('Revisa tu correo para confirmar tu cuenta.'); setLoading(false); return; }
    onAuth();
    setLoading(false);
  };

  return (
    <div className="auth-page-full">
      <div className="auth-left">
        <div className="auth-card">
          <h1 className="auth-title">Sythio</h1>
          <p className="auth-subtitle">{isRegister ? 'Crea tu cuenta' : 'Inicia sesión para ver tus notas'}</p>
          {error && <div className="auth-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <input className="auth-input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input className="auth-input" type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
            <button className="auth-btn" type="submit" disabled={loading}>
              {loading ? 'Cargando...' : isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
            </button>
          </form>
          <p className="auth-link">
            {isRegister ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
            <a href="#" onClick={e => { e.preventDefault(); setIsRegister(!isRegister); setError(''); }}>
              {isRegister ? 'Inicia sesión' : 'Regístrate'}
            </a>
          </p>

          {/* Rating badge */}
          <div className="auth-rating">
            <div className="auth-stars">{'★'.repeat(5)}</div>
            <span>4.8 de 5 — 347 valoraciones</span>
          </div>
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-hero">
          <h2>Tu voz, hecha acción</h2>
          <p>Graba reuniones, ideas o clases y obtén resúmenes, tareas, reportes y más — todo con IA.</p>
          <div className="auth-features">
            <div className="auth-feature">🎤 <span>Transcripción en 90+ idiomas</span></div>
            <div className="auth-feature">👥 <span>Detección de hablantes</span></div>
            <div className="auth-feature">📊 <span>8 modos: resumen, tareas, estudio...</span></div>
            <div className="auth-feature">📄 <span>Exporta a PDF, Word, Excel, SRT</span></div>
            <div className="auth-feature">🤖 <span>AI Chat: pregunta sobre tus notas</span></div>
            <div className="auth-feature">🔗 <span>Comparte notas con un link</span></div>
          </div>
        </div>
        <div className="auth-testimonials">
          {TESTIMONIALS.slice(0, 3).map((t, i) => (
            <div key={i} className="auth-testimonial">
              <div className="testimonial-stars">{'★'.repeat(t.stars)}{'☆'.repeat(5 - t.stars)}</div>
              <p className="testimonial-text">"{t.text}"</p>
              <p className="testimonial-author">{t.name} — <span>{t.role}</span></p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Nav ──────────────────────────────────────────────────────────────────────

function Nav({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link to="/" className="nav-brand">Sythio</Link>
        <div className="nav-right">
          <Link to="/trash" className="btn-logout" title="Papelera">🗑️</Link>
          <span className="nav-email">{email}</span>
          <button className="btn-logout" onClick={onLogout}>Cerrar sesión</button>
        </div>
      </div>
    </nav>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('notes').select('*').eq('status', 'done').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('folders').select('*').order('created_at'),
    ]).then(([notesRes, foldersRes]) => {
      setNotes((notesRes.data ?? []) as Note[]);
      setFolders((foldersRes.data ?? []) as Folder[]);
      setLoading(false);
    });
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
        <h1>Mis notas</h1>
        <p>{notes.length} {notes.length === 1 ? 'nota' : 'notas'} procesadas</p>
      </div>

      {/* Folders */}
      {folders.length > 0 && (
        <div className="folders-bar">
          <button
            className={`folder-chip ${!selectedFolder ? 'active' : ''}`}
            onClick={() => setSelectedFolder(null)}
          >
            Todas
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
        <input className="search-input" placeholder="Buscar notas..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="filters">
        {[['all','Todas'],['meeting','Reuniones'],['tasks','Tareas'],['ideas','Ideas'],['conversations','Conversaciones']].map(([id, label]) => (
          <button key={id} className={`filter-chip ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🎤</div>
          <h3>{search ? 'Sin resultados' : 'No hay notas aún'}</h3>
          <p>{search ? 'Intenta otra búsqueda.' : 'Graba tu primer audio en la app móvil.'}</p>
        </div>
      ) : (
        <div className="note-list">
          {filtered.map(note => (
            <Link to={`/note/${note.id}`} key={note.id} className="note-card">
              <h3>{note.title}</h3>
              <p>{note.summary || note.transcript?.slice(0, 120)}</p>
              <div className="note-meta">
                <span>{formatDate(note.created_at)}</span>
                <span>{formatDuration(note.audio_duration)}</span>
                {note.is_conversation && <span className="note-badge">👥 {note.speakers_detected} hablantes</span>}
                {note.template && <span className="note-badge">{note.template}</span>}
                {note.folder_id && folders.find(f => f.id === note.folder_id) && (
                  <span className="note-badge" style={{ borderLeft: `3px solid ${folders.find(f => f.id === note.folder_id)!.color}` }}>
                    {folders.find(f => f.id === note.folder_id)!.name}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Trash Page ───────────────────────────────────────────────────────────────

function TrashPage() {
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

  const handlePermanentDelete = async (id: string) => {
    if (!confirm('¿Eliminar permanentemente? Esta acción no se puede deshacer.')) return;
    await supabase.from('notes').delete().eq('id', id);
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  if (loading) return <div className="container"><div className="loading"><div className="spinner" /></div></div>;

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>🗑️ Papelera</h1>
        <p>{notes.length} {notes.length === 1 ? 'nota' : 'notas'} · Se eliminan automáticamente después de 30 días</p>
      </div>
      <p style={{ marginBottom: 20 }}><Link to="/">← Volver al inicio</Link></p>

      {notes.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🗑️</div>
          <h3>Papelera vacía</h3>
          <p>Las notas eliminadas aparecen aquí por 30 días.</p>
        </div>
      ) : (
        <div className="note-list">
          {notes.map(note => (
            <div key={note.id} className="trash-card">
              <div className="trash-info">
                <h3>{note.title}</h3>
                <p>Eliminada el {note.deleted_at ? formatDate(note.deleted_at) : ''}</p>
              </div>
              <div className="trash-actions">
                <button className="btn-restore" onClick={() => handleRestore(note.id)}>Restaurar</button>
                <button className="btn-perm-delete" onClick={() => handlePermanentDelete(note.id)}>Eliminar</button>
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
      setLoading(false);
    });
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

  const handleSoftDelete = useCallback(async () => {
    if (!id || !confirm('¿Mover esta nota a la papelera?')) return;
    await supabase.from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    navigate('/');
  }, [id, navigate]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copiado al portapapeles');
  }, []);

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
      alert('Link copiado al portapapeles');
    } catch {
      alert('Error al generar link');
    } finally {
      setShareLoading(false);
    }
  }, [note, id]);

  if (loading) return <div className="container"><div className="loading"><div className="spinner" /></div></div>;
  if (!note) return <div className="container"><div className="empty"><h3>Nota no encontrada</h3><p><a href="#" onClick={e => { e.preventDefault(); navigate('/'); }}>Volver</a></p></div></div>;

  const activeModeResult = modeResults.find(r => r.mode === activeMode);
  const availableModes = [note.primary_mode, ...modeResults.map(r => r.mode)].filter((m, i, a) => a.indexOf(m) === i);

  return (
    <div className="container">
      <div className="note-detail">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <a href="#" className="note-back" onClick={e => { e.preventDefault(); navigate('/'); }} style={{ margin: 0 }}>← Volver</a>
          <button className="action-btn" onClick={handleSoftDelete} style={{ color: 'var(--error)', borderColor: 'rgba(255,59,48,0.3)' }}>🗑️ Papelera</button>
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
            <button className="action-btn" onClick={handleSaveTitle}>Guardar</button>
            <button className="action-btn" onClick={() => setEditingTitle(false)}>Cancelar</button>
          </div>
        ) : (
          <h1 onClick={() => { setTitleDraft(note.title); setEditingTitle(true); }} className="editable-title" title="Click para editar">
            {note.title} <span className="edit-hint">✏️</span>
          </h1>
        )}

        <div className="meta">
          {formatDate(note.created_at)} · {formatDuration(note.audio_duration)}
          {note.is_conversation && ` · ${note.speakers_detected} hablantes`}
          {note.template && ` · ${note.template}`}
        </div>

        {/* Folder selector + Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <select
            className="folder-select"
            value={note.folder_id ?? ''}
            onChange={e => handleMoveToFolder(e.target.value || null)}
          >
            <option value="">📁 Sin carpeta</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>📁 {f.name}</option>
            ))}
          </select>
        </div>

        <div className="actions-bar">
          <button className="action-btn" onClick={handleShareLink} disabled={shareLoading}>
            🔗 {shareLoading ? 'Generando...' : 'Copiar link'}
          </button>
          <button className="action-btn" onClick={() => handleCopy(note.summary || note.transcript)}>📋 Copiar resumen</button>
          <button className="action-btn" onClick={handleDownloadTxt}>📄 TXT</button>
          <button className="action-btn" onClick={() => downloadDOCX(note)}>📝 Word</button>
          {note.segments?.length > 0 && <button className="action-btn" onClick={handleDownloadSrt}>🎬 SRT</button>}
          <button className="action-btn" onClick={() => handleCopy(note.transcript)}>📝 Transcripción</button>
        </div>

        {/* Share link banner */}
        {note.share_token && (
          <div className="share-banner">
            <span>🔗 Link público activo</span>
            <button onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/shared/${note.share_token}`);
              alert('Link copiado');
            }}>Copiar</button>
          </div>
        )}

        {/* Mode tabs */}
        {availableModes.length > 1 && (
          <div className="mode-tabs">
            {availableModes.map(mode => (
              <button key={mode} className={`mode-tab ${activeMode === mode ? 'active' : ''}`} onClick={() => setActiveMode(mode)}>
                {MODE_LABELS[mode] ?? mode}
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
            <h2>Hablantes <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text3)' }}>— click para renombrar</span></h2>
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

        {/* Transcript */}
        <div className="note-section">
          <h2>Transcripción completa</h2>
          {note.is_conversation && note.segments?.length > 0 ? (
            <div className="note-section-content">
              {note.segments.map((seg, i) => {
                const sp = note.speakers?.find(s => s.id === seg.speaker);
                const name = sp?.custom_name ?? sp?.default_name ?? seg.speaker;
                return (
                  <div key={i} className="segment">
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
          setError('Nota no encontrada o link expirado.');
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
      <p style={{ color: '#8A8F98' }}>{error || 'Nota no encontrada'}</p>
    </div>
  );

  const activeModeResult = modeResults.find(r => r.mode === activeMode);
  const availableModes = [note.primary_mode, ...modeResults.map(r => r.mode)].filter((m, i, a) => a.indexOf(m) === i);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#8A8F98', textTransform: 'uppercase', letterSpacing: 1 }}>Compartido via Sythio</span>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{note.title}</h1>
      <p style={{ fontSize: 13, color: '#8A8F98', marginBottom: 24 }}>
        {formatDate(note.created_at)} · {formatDuration(note.audio_duration)}
        {note.is_conversation && ` · ${note.speakers_detected} hablantes`}
      </p>

      {/* Actions */}
      <div className="actions-bar">
        <button className="action-btn" onClick={() => { navigator.clipboard.writeText(note.summary || note.transcript); alert('Copiado'); }}>📋 Copiar resumen</button>
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
              {MODE_LABELS[mode] ?? mode}
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
        <h2>Transcripción completa</h2>
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
          <h3>Hecho con Sythio</h3>
          <p>Transforma tus grabaciones de voz en resúmenes, tareas, reportes y más con IA.</p>
          <div className="shared-rating">
            <span className="shared-stars">★★★★★</span>
            <span>4.8/5 — 347 valoraciones</span>
          </div>
          <a href="https://sythio.com" className="shared-cta-btn">Prueba Sythio gratis</a>
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
  const s = (v: unknown) => typeof v === 'string' ? v : '';
  const arr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const rArr = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];

  switch (mode) {
    case 'summary':
      return (
        <>
          {s(result.summary) && <div className="note-section"><h2>Resumen</h2><div className="note-section-content">{s(result.summary)}</div></div>}
          {arr(result.key_points).length > 0 && <div className="note-section"><h2>Puntos clave</h2><ul className="note-list-items">{arr(result.key_points).map((p,i) => <li key={i}>{p}</li>)}</ul></div>}
        </>
      );
    case 'tasks':
      return (
        <div className="note-section"><h2>Tareas</h2>
          <ul className="note-list-items">{rArr(result.tasks).map((t,i) => <li key={i}>☐ {s(t.text) || s(t.task)} {s(t.priority) && <span className="note-badge">{s(t.priority)}</span>} {s(t.responsible) && <span style={{color:'var(--text3)', fontSize:12}}>→ {s(t.responsible)}</span>}</li>)}</ul>
        </div>
      );
    case 'action_plan':
      return (
        <>
          {s(result.objective) && <div className="note-section"><h2>Objetivo</h2><div className="note-section-content">{s(result.objective)}</div></div>}
          {rArr(result.steps).length > 0 && <div className="note-section"><h2>Pasos</h2><ul className="note-list-items">{rArr(result.steps).map((st,i) => <li key={i}><strong>{i+1}.</strong> {s(st.action) || s(st.step)}</li>)}</ul></div>}
        </>
      );
    case 'clean_text':
      return <div className="note-section"><h2>Texto limpio</h2><div className="note-section-content" style={{whiteSpace:'pre-wrap'}}>{s(result.clean_text)}</div></div>;
    case 'executive_report':
      return (
        <>
          {s(result.executive_summary) && <div className="note-section"><h2>Resumen ejecutivo</h2><div className="note-section-content">{s(result.executive_summary)}</div></div>}
          {arr(result.key_points).length > 0 && <div className="note-section"><h2>Puntos clave</h2><ul className="note-list-items">{arr(result.key_points).map((p,i) => <li key={i}>{p}</li>)}</ul></div>}
          {arr(result.next_steps).length > 0 && <div className="note-section"><h2>Próximos pasos</h2><ul className="note-list-items">{arr(result.next_steps).map((p,i) => <li key={i}>{p}</li>)}</ul></div>}
        </>
      );
    case 'ready_message': {
      const msgs = typeof result.messages === 'object' && result.messages ? result.messages as Record<string, unknown> : {};
      return (
        <div className="note-section"><h2>Mensajes listos</h2>
          {(['professional','friendly','firm','brief'] as const).map(tone => {
            const text = s(msgs[tone]); if (!text) return null;
            const labels: Record<string, string> = { professional: 'Profesional', friendly: 'Amigable', firm: 'Firme', brief: 'Breve' };
            return <div key={tone} style={{marginBottom:16}}><div style={{fontSize:12,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',marginBottom:4}}>{labels[tone]}</div><div className="note-section-content">{text}</div></div>;
          })}
        </div>
      );
    }
    case 'study':
      return (
        <>
          {s(result.summary) && <div className="note-section"><h2>Resumen</h2><div className="note-section-content">{s(result.summary)}</div></div>}
          {rArr(result.key_concepts).length > 0 && <div className="note-section"><h2>Conceptos clave</h2>{rArr(result.key_concepts).map((c,i) => <div key={i} style={{borderLeft:'3px solid var(--text)',padding:'8px 12px',margin:'8px 0',background:'var(--surface)',borderRadius:'0 8px 8px 0'}}><strong>{s(c.concept)}</strong><br/><span style={{color:'var(--text2)',fontSize:13}}>{s(c.explanation)}</span></div>)}</div>}
          {rArr(result.probable_questions).length > 0 && <div className="note-section"><h2>Preguntas probables</h2><ul className="note-list-items">{rArr(result.probable_questions).map((q,i) => <li key={i}><strong>{s(q.question)}</strong>{s(q.answer_hint) && <><br/><em style={{color:'var(--text2)'}}>{s(q.answer_hint)}</em></>}</li>)}</ul></div>}
        </>
      );
    case 'ideas':
      return (
        <>
          {s(result.core_idea) && <div className="note-section"><h2>Idea central</h2><div className="note-section-content">{s(result.core_idea)}</div></div>}
          {rArr(result.opportunities).length > 0 && <div className="note-section"><h2>Oportunidades</h2><ul className="note-list-items">{rArr(result.opportunities).map((o,i) => <li key={i}>{s(o.opportunity)} {s(o.potential) && <span className="note-badge">{s(o.potential)}</span>}</li>)}</ul></div>}
          {s(result.structured_version) && <div className="note-section"><h2>Versión estructurada</h2><div className="note-section-content" style={{whiteSpace:'pre-wrap'}}>{s(result.structured_version)}</div></div>}
        </>
      );
    default:
      return <div className="note-section"><div className="note-section-content"><pre style={{whiteSpace:'pre-wrap',fontSize:13}}>{JSON.stringify(result, null, 2)}</pre></div></div>;
  }
}

// ── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => { setSession(s); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="loading" style={{minHeight:'100vh',alignItems:'center'}}><div className="spinner" /></div>;

  return (
    <BrowserRouter>
      <Routes>
        {/* Public shared note route - no auth required */}
        <Route path="/shared/:token" element={<SharedNotePage />} />

        {/* Auth-protected routes */}
        <Route path="*" element={
          !session ? <AuthPage onAuth={() => {}} /> : (
            <div className="app">
              <Nav email={session.user.email ?? ''} onLogout={() => supabase.auth.signOut()} />
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/note/:id" element={<NoteDetail />} />
                <Route path="/trash" element={<TrashPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          )
        } />
      </Routes>
    </BrowserRouter>
  );
}
