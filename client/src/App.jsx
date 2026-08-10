import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import RankingDashboard from './pages/RankingDashboard';
import VillageDetail from './pages/VillageDetail';
import StateComparison from './pages/StateComparison';
import VillageComparison from './pages/VillageComparison';
import PolicySandbox from './pages/PolicySandbox';
import SpatialAnalytics from './pages/SpatialAnalytics';
import PredictiveSandbox from './pages/PredictiveSandbox';
import ReportBuilder from './pages/ReportBuilder';
import AdminPortal from './pages/AdminPortal';
import Sidebar from './components/Sidebar';
import './index.css';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <Router>
      <div className="app-layout">
        {/* Mobile hamburger */}
        <button
          className="hamburger-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation"
          id="hamburger-btn"
        >
          ☰
        </button>

        {/* Mobile overlay */}
        <div
          className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />

        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="main-content">
          <Routes>
            <Route path="/" element={<RankingDashboard />} />
            <Route path="/village/:id" element={<VillageDetail />} />
            <Route path="/compare" element={<StateComparison />} />
            <Route path="/compare-villages" element={<VillageComparison />} />
            <Route path="/sandbox" element={<PolicySandbox />} />
            <Route path="/analytics" element={<SpatialAnalytics />} />
            <Route path="/predictive" element={<PredictiveSandbox />} />
            <Route path="/reports" element={<ReportBuilder />} />
            <Route path="/admin" element={<AdminPortal />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
