import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';

// ── Animation Variants ──────────────────────────────────────────────────
const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: easeOut },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: easeOut } },
};

// ── Animated Counter ────────────────────────────────────────────────────
function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 1500;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * value));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, value]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ── Hero Waveform ───────────────────────────────────────────────────────
function HeroWaveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      ctx.scale(2, 2);
    };
    resize();
    window.addEventListener('resize', resize);

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
    };
    window.addEventListener('mousemove', onMouse);

    let running = true;
    const draw = () => {
      if (!running) return;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);
      frameRef.current++;

      const { x: mx } = mouseRef.current;
      const bars = 80;
      const barW = w / bars;
      const time = frameRef.current * 0.02;

      for (let i = 0; i < bars; i++) {
        const norm = i / bars;
        const distFromMouse = Math.abs(norm - mx);
        const mouseInfluence = Math.max(0, 1 - distFromMouse * 3);

        const baseHeight = (Math.sin(norm * 6 + time) * 0.3 + 0.3) * h * 0.6;
        const height = baseHeight * (0.5 + mouseInfluence * 0.8);

        const alpha = 0.15 + mouseInfluence * 0.25;
        const hue = 240 + norm * 30;
        ctx.fillStyle = `hsla(${hue}, 80%, 65%, ${alpha})`;
        ctx.fillRect(i * barW + 2, h - height, barW - 4, height);
      }

      requestAnimationFrame(draw);
    };
    draw();

    return () => {
      running = false;
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-waveform-canvas" style={{ width: '100%', height: '100%' }} />;
}

// ── Feature Data ────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: '🎤',
    title: 'Transcripcion con IA',
    desc: 'Transcribe audio en 90+ idiomas con deteccion automatica de hablantes.',
    expanded: 'Usa Whisper de OpenAI para transcripcion de alta precision. Detecta automaticamente cuantas personas hablan y atribuye cada segmento.',
    bullets: ['90+ idiomas soportados', 'Deteccion automatica de hablantes', 'Timestamps precisos por segmento', 'Vocabulario personalizado'],
  },
  {
    icon: '✨',
    title: 'Resumenes inteligentes',
    desc: '8 modos de resultado: resumen, tareas, plan de accion, reporte ejecutivo y mas.',
    expanded: 'Claude AI analiza tu transcripcion y genera exactamente el formato que necesitas. Desde notas de estudio hasta mensajes listos para enviar.',
    bullets: ['Resumen ejecutivo', 'Tareas con responsables', 'Plan de accion estructurado', 'Ideas y oportunidades'],
  },
  {
    icon: '🔄',
    title: 'Sync multiplataforma',
    desc: 'Tus notas en iOS, Android y web. Siempre sincronizadas, siempre accesibles.',
    expanded: 'Una sola cuenta, todas tus plataformas. Graba en tu iPhone, revisa en la web, exporta desde cualquier dispositivo.',
    bullets: ['Sync automatico en tiempo real', 'Exporta a PDF, Word, Excel, SRT', 'Comparte via link publico', 'API publica para integraciones'],
  },
];

const TESTIMONIALS = [
  { name: 'Maria G.', role: 'Directora de Operaciones', text: 'Mis reuniones ahora tienen actas automaticas. Sythio me ahorra 2 horas por semana.', stars: 5 },
  { name: 'Carlos M.', role: 'Emprendedor', text: 'Grabo ideas en el carro y cuando llego ya tengo un plan de accion estructurado. Magico.', stars: 5 },
  { name: 'Ana R.', role: 'Coach Ejecutiva', text: 'La deteccion de hablantes es increible. Perfecto para transcribir mis sesiones de coaching.', stars: 5 },
  { name: 'Roberto S.', role: 'Estudiante de Medicina', text: 'El modo Estudio convierte clases de 1 hora en fichas perfectas para repasar.', stars: 5 },
  { name: 'Laura P.', role: 'Gerente de Proyectos', text: 'Exportar a Word directo con las tareas y responsables ya asignados. Un game changer.', stars: 5 },
  { name: 'Diego F.', role: 'Abogado', text: 'Uso Sythio para grabar declaraciones. El reporte ejecutivo ahorra dias de trabajo.', stars: 4 },
];

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    desc: 'Para probar sin compromiso',
    features: ['2 notas por dia', 'Audio hasta 10 min', '3 modos de resultado', 'Exportar a TXT'],
    featured: false,
  },
  {
    name: 'Pro',
    price: '$7.99',
    period: '/mes',
    desc: 'Para profesionales y equipos',
    features: ['Notas ilimitadas', 'Audio hasta 120 min', '8 modos de resultado', 'Exportar a PDF, Word, SRT', 'AI Chat sobre tus notas', 'Vocabulario personalizado', 'Prioridad en procesamiento'],
    featured: true,
    badge: 'Mas popular',
  },
  {
    name: 'Enterprise',
    price: '$14.99',
    period: '/mes',
    desc: 'Para organizaciones',
    features: ['Todo en Pro', 'Workspaces ilimitados', 'Admin dashboard', 'API access', 'Integraciones: Slack, Calendar', 'Soporte prioritario'],
    featured: false,
  },
];

// ── Landing Page Component ──────────────────────────────────────────────
export default function LandingPage({ onNavigateAuth }: { onNavigateAuth: (mode: 'login' | 'signup') => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [expandedFeature, setExpandedFeature] = useState<number | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const testimonialsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-scroll testimonials
  useEffect(() => {
    const el = testimonialsRef.current;
    if (!el) return;
    let paused = false;
    const interval = setInterval(() => {
      if (paused) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= maxScroll - 10) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: 380, behavior: 'smooth' });
      }
    }, 4000);
    const pause = () => { paused = true; };
    const resume = () => { setTimeout(() => { paused = false; }, 2000); };
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);
    el.addEventListener('touchstart', pause);
    el.addEventListener('touchend', resume);
    return () => {
      clearInterval(interval);
      el.removeEventListener('mouseenter', pause);
      el.removeEventListener('mouseleave', resume);
      el.removeEventListener('touchstart', pause);
      el.removeEventListener('touchend', resume);
    };
  }, []);

  const scrollTestimonials = useCallback((dir: number) => {
    testimonialsRef.current?.scrollBy({ left: dir * 380, behavior: 'smooth' });
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.toggle('light');
    localStorage.setItem('sythio-theme',
      document.documentElement.classList.contains('light') ? 'light' : 'dark'
    );
  };

  return (
    <div className="landing-page" style={{ minHeight: '100vh' }}>
      {/* ── Nav ──────────────────────────────────────────────── */}
      <motion.nav
        className={`landing-nav ${scrolled ? 'scrolled' : ''}`}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="landing-nav-inner">
          <span className="landing-brand">Sythio</span>
          <div className="landing-nav-links">
            <a href="#features" className="landing-nav-link">Features</a>
            <a href="#pricing" className="landing-nav-link">Pricing</a>
            <a href="#testimonials" className="landing-nav-link">Reviews</a>
            <button className="theme-toggle" onClick={toggleTheme} title="Cambiar tema" aria-label="Toggle theme">
              <span>◐</span>
            </button>
            <button className="landing-nav-ghost" onClick={() => onNavigateAuth('login')}>Iniciar sesion</button>
            <button className="landing-nav-cta" onClick={() => onNavigateAuth('signup')}>Comenzar gratis</button>
          </div>
          <button className="hamburger" onClick={() => setMobileMenu(true)} aria-label="Menu">☰</button>
        </div>
      </motion.nav>

      {/* ── Mobile Menu ──────────────────────────────────────── */}
      <AnimatePresence>
        {mobileMenu && (
          <motion.div
            className="mobile-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <button className="mobile-overlay-close" onClick={() => setMobileMenu(false)}>✕</button>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              {['Features', 'Pricing', 'Reviews'].map((item, i) => (
                <motion.a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  variants={fadeUp}
                  custom={i}
                  onClick={() => setMobileMenu(false)}
                >
                  {item}
                </motion.a>
              ))}
              <motion.div variants={fadeUp} custom={3} style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setMobileMenu(false); onNavigateAuth('signup'); }}>Comenzar gratis</button>
                <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setMobileMenu(false); onNavigateAuth('login'); }}>Iniciar sesion</button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="hero">
        <HeroWaveform />

        <motion.div className="hero-badge" variants={fadeUp} initial="hidden" animate="visible" custom={0}>
          <span className="hero-badge-dot" />
          Ahora con transcripcion IA en 90+ idiomas
        </motion.div>

        <motion.h1 className="hero-title" variants={fadeUp} initial="hidden" animate="visible" custom={1}>
          Tu voz, <em>perfectamente</em> capturada.
        </motion.h1>

        <motion.p className="hero-sub" variants={fadeUp} initial="hidden" animate="visible" custom={2}>
          Sythio transcribe, resume y conecta tus notas de voz con precision de IA. Piensa mas rapido. Recuerda todo.
        </motion.p>

        <motion.div className="hero-buttons" variants={fadeUp} initial="hidden" animate="visible" custom={3}>
          <button className="btn-primary" onClick={() => onNavigateAuth('signup')}>
            Comenzar gratis
          </button>
          <button className="btn-secondary" onClick={() => onNavigateAuth('login')}>
            Ya tengo cuenta →
          </button>
        </motion.div>

        <motion.div className="hero-proof" variants={fadeUp} initial="hidden" animate="visible" custom={4}>
          <div className="hero-avatars">
            {['MG', 'CM', 'AR', 'RS', 'LP'].map((initials, i) => (
              <div key={i} className="hero-avatar" style={{ zIndex: 5 - i }}>{initials}</div>
            ))}
          </div>
          <span className="hero-proof-text">
            <strong>★ 4.8</strong> — Usado por <strong>12,400+</strong> profesionales
          </span>
        </motion.div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <SectionWrapper id="features">
        <div className="section-label">Features</div>
        <h2 className="section-title">Todo lo que necesitas para capturar ideas brillantes</h2>
        <p className="section-sub">Graba, transcribe, resume y exporta — todo impulsado por IA.</p>

        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <motion.div
              key={i}
              className={`feature-card ${expandedFeature === i ? 'expanded' : ''}`}
              onClick={() => setExpandedFeature(expandedFeature === i ? null : i)}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
              custom={i}
              whileHover={{ y: expandedFeature === i ? 0 : -4 }}
            >
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
              <div className="feature-expand-label">
                {expandedFeature === i ? 'Cerrar' : 'Ver mas'} <span>▾</span>
              </div>

              <AnimatePresence>
                {expandedFeature === i && (
                  <motion.div
                    className="feature-expanded"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="feature-expanded-inner">
                      <p>{f.expanded}</p>
                      <ul className="feature-bullets">
                        {f.bullets.map((b, j) => <li key={j}>{b}</li>)}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </SectionWrapper>

      {/* ── How It Works ─────────────────────────────────────── */}
      <SectionWrapper id="how-it-works" center>
        <div className="section-label">Como funciona</div>
        <h2 className="section-title">Tres pasos. Cero friccion.</h2>
        <p className="section-sub" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
          De audio a accion en menos de un minuto.
        </p>

        <div className="how-steps-grid">
          {[
            { icon: '🎙️', title: 'Graba', desc: 'Abre la app y presiona grabar. Reunion, clase, idea — cualquier momento.' },
            { icon: '⚡', title: 'Procesa con IA', desc: 'Sythio transcribe, detecta hablantes y genera tus resultados automaticamente.' },
            { icon: '📊', title: 'Usa y exporta', desc: 'Resumen, tareas, reporte — exporta a Word, PDF o comparte con un link.' },
          ].map((step, i) => (
            <motion.div
              key={i}
              className="how-step"
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
              custom={i}
            >
              <div className="how-step-icon">{step.icon}</div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </SectionWrapper>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <SectionWrapper id="pricing" center>
        <div className="section-label">Precios</div>
        <h2 className="section-title">Simple. Transparente. Sin sorpresas.</h2>
        <p className="section-sub" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
          Empieza gratis, escala cuando lo necesites.
        </p>

        <div className="pricing-grid">
          {PLANS.map((plan, i) => (
            <motion.div
              key={i}
              className={`pricing-card ${plan.featured ? 'featured' : ''}`}
              variants={scaleIn}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
              whileHover={{ y: -8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              {plan.badge && <div className="pricing-badge">{plan.badge}</div>}
              <h3>{plan.name}</h3>
              <div className="pricing-price">{plan.price}<span>{plan.period}</span></div>
              <p className="pricing-desc">{plan.desc}</p>
              <ul className="pricing-features">
                {plan.features.map((f, j) => <li key={j}>{f}</li>)}
              </ul>
              <button
                className={`pricing-btn ${plan.featured ? 'primary' : 'secondary'}`}
                onClick={() => onNavigateAuth('signup')}
              >
                {plan.price === '$0' ? 'Comenzar gratis' : 'Elegir plan'}
              </button>
            </motion.div>
          ))}
        </div>
      </SectionWrapper>

      {/* ── Testimonials ─────────────────────────────────────── */}
      <SectionWrapper id="testimonials">
        <div className="section-label">Opiniones</div>
        <h2 className="section-title">Lo que dicen nuestros usuarios</h2>
        <p className="section-sub">Miles de profesionales ya usan Sythio todos los dias.</p>

        <div className="testimonials-track" ref={testimonialsRef}>
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={i}
              className="testimonial-card"
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
            >
              <div className="tc-stars">{'★'.repeat(t.stars)}{'☆'.repeat(5 - t.stars)}</div>
              <p className="tc-quote">"{t.text}"</p>
              <div>
                <div className="tc-author">{t.name}</div>
                <div className="tc-role">{t.role}</div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="testimonials-nav">
          <button onClick={() => scrollTestimonials(-1)} aria-label="Previous">←</button>
          <button onClick={() => scrollTestimonials(1)} aria-label="Next">→</button>
        </div>
      </SectionWrapper>

      {/* ── Stats ────────────────────────────────────────────── */}
      <SectionWrapper center>
        <div className="stats-row">
          {[
            { value: 12400, suffix: '+', label: 'Usuarios activos' },
            { value: 850000, suffix: '+', label: 'Notas procesadas' },
            { value: 90, suffix: '+', label: 'Idiomas soportados' },
            { value: 4.8, suffix: '', label: 'Rating promedio' },
          ].map((stat, i) => (
            <motion.div
              key={i}
              className="stat-item"
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
            >
              <div className="stat-number">
                {stat.value === 4.8 ? '4.8' : <AnimatedCounter value={stat.value} suffix={stat.suffix} />}
              </div>
              <div className="stat-label">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </SectionWrapper>

      {/* ── Final CTA ────────────────────────────────────────── */}
      <section className="cta-section">
        <motion.h2
          className="cta-title"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={0}
        >
          Empieza a capturar<br />tus mejores ideas
        </motion.h2>
        <motion.p
          className="cta-sub"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={1}
        >
          Gratis. Sin tarjeta. Listo en 30 segundos.
        </motion.p>
        <motion.div
          style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={2}
        >
          <button className="btn-primary" onClick={() => onNavigateAuth('signup')}>Crear cuenta gratis</button>
          <button className="btn-ghost" onClick={() => onNavigateAuth('login')}>Iniciar sesion →</button>
        </motion.div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">Sythio</div>
            <p className="footer-brand-desc">Transforma tu voz en accion con inteligencia artificial.</p>
          </div>
          <div className="footer-col">
            <h4>Producto</h4>
            <a href="#features">Features</a>
            <a href="#pricing">Precios</a>
            <a href="#testimonials">Reviews</a>
          </div>
          <div className="footer-col">
            <h4>Soporte</h4>
            <a href="mailto:soporte@sythio.com">Contacto</a>
            <a href="#">FAQ</a>
            <a href="#">Guia de inicio</a>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <a href="#">Privacidad</a>
            <a href="#">Terminos</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>&copy; 2026 Sythio. Todos los derechos reservados.</span>
          <div className="footer-bottom-links">
            <a href="#">Twitter</a>
            <a href="#">LinkedIn</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Section Wrapper with InView Animation ───────────────────────────────
function SectionWrapper({ children, id, center }: { children: React.ReactNode; id?: string; center?: boolean }) {
  return (
    <section className={`section ${center ? 'section-center' : ''}`} id={id}>
      {children}
    </section>
  );
}
