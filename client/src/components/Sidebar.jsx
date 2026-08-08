import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Rankings', icon: '📊' },
  { path: '/compare', label: 'State Comparison', icon: '🗺️' },
  { path: '/compare-villages', label: 'Village Comparison', icon: '🏘️' },
  { path: '/sandbox', label: 'Policy Sandbox', icon: '🧪' },
  { path: '/analytics', label: 'Spatial Analytics', icon: '🌍' },
  { path: '/reports', label: 'Report Builder', icon: '📋' },
  { path: '/admin', label: 'Admin Portal', icon: '⚙️' },
];

export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    onClose?.();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-icon">🏘</div>
        <div>
          <h1 className="brand-title">VConnect</h1>
          <p className="brand-subtitle">Village Ranking System</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'nav-item--active' : ''}`
            }
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-stat">
          <span className="stat-label">Data Engine</span>
          <span className="stat-value">VCONNECT AI</span>
        </div>
        <div className="sidebar-stat">
          <span className="stat-label">Coverage</span>
          <span className="stat-value">670K+ Villages</span>
        </div>
      </div>
    </aside>
  );
}
