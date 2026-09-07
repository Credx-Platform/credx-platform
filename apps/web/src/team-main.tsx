import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import TeamDashboard from './TeamDashboard';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/team">
      <TeamDashboard />
    </BrowserRouter>
  </React.StrictMode>
);
