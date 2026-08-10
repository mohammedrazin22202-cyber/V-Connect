import React, { useState, useEffect } from 'react';
import { fetchCorrelationData } from '../api';

export default function PredictiveSandbox() {
  const [activeTab, setActiveTab] = useState('correlation');
  const [matrix, setMatrix] = useState({});

  useEffect(() => {
    fetchCorrelationData().then(res => {
      if (res.type === 'matrix') setMatrix(res.matrix);
    });
  }, []);

  return (
    <div className="dashboard animate-in">
      <header className="dashboard-header">
        <h2 className="page-title">Predictive & Correlation Analytics Sandbox</h2>
      </header>
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3>Domain Score Correlation Heatmap</h3>
        <pre style={{ fontSize: '11px', color: '#cbd5e1' }}>{JSON.stringify(matrix, null, 2)}</pre>
      </div>
    </div>
  );
}
