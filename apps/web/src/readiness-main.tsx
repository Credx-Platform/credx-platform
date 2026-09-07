import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initErrorReporting } from './errorReporting';
import FinancialReadinessWorkspace from './FinancialReadinessWorkspace';
import './styles.css';

initErrorReporting();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/financial-readiness">
      <FinancialReadinessWorkspace />
    </BrowserRouter>
  </React.StrictMode>
);
