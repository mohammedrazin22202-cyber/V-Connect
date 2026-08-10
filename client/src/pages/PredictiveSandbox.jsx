import React, { useState, useEffect } from 'react';
import { fetchCorrelationData } from '../api';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function PredictiveSandbox() {
  const [activeTab, setActiveTab] = useState('correlation');
  const [matrix, setMatrix] = useState({});
  const [scatterData, setScatterData] = useState([]);

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
        <h3>Bivariate Linear Regression Scatter</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart>
            <CartesianGrid />
            <XAxis dataKey="x" type="number" />
            <YAxis dataKey="y" type="number" />
            <Tooltip />
            <Scatter name="Villages" data={scatterData} fill="#818cf8" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
