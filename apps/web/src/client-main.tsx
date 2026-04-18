import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import ClientPortalApp from './clientPortal';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/portal">
      <ClientPortalApp />
    </BrowserRouter>
  </React.StrictMode>
);
