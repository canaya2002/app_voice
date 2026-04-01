import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { verifyAdmin } from './adminApi';

export default function AdminLayout() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [adminRole, setAdminRole] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    verifyAdmin()
      .then((res) => {
        setAuthorized(true);
        setAdminRole(res.role);
      })
      .catch(() => {
        setAuthorized(false);
        navigate('/', { replace: true });
      });
  }, [navigate]);

  if (authorized === null) {
    return (
      <div className="admin-loading">
        <div className="spinner" />
        <p>Verificando acceso...</p>
      </div>
    );
  }

  if (!authorized) return null;

  const navItems = [
    { path: '/admin', label: 'Overview', icon: '📊' },
    { path: '/admin/organizations', label: 'Organizaciones', icon: '🏢' },
    { path: '/admin/users', label: 'Usuarios', icon: '👥' },
    { path: '/admin/billing', label: 'Billing', icon: '💰' },
  ];

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <Link to="/" className="admin-logo">← Sythio</Link>
          <h2 className="admin-title">Admin</h2>
          <span className="admin-role-badge">{adminRole}</span>
        </div>
        <nav className="admin-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`admin-nav-item ${isActive(item.path) ? 'active' : ''}`}
            >
              <span className="admin-nav-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
