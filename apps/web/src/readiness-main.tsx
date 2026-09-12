import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initErrorReporting } from './errorReporting';
import FinancialReadinessWorkspace from './FinancialReadinessWorkspace';
import './styles.css';
import './platform-theme.css';
import { PlatformPageFade } from './platformMotion';

initErrorReporting();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/financial-readiness">
      <PlatformPageFade />
      <FinancialReadinessWorkspace />
    </BrowserRouter>
  </React.StrictMode>
);
