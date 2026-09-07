import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initErrorReporting } from './errorReporting';
import TeamDashboard from './TeamDashboard';
import './styles.css';

initErrorReporting();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/team">
      <TeamDashboard />
    </BrowserRouter>
  </React.StrictMode>
);
