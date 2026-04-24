import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import ClientPortalApp from './clientPortal';
import SetPassword from './SetPassword';
import './styles.css';

const isSetPasswordRoute =
  window.location.pathname.replace(/\/+$/, '') === '/portal/set-password';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/portal">
      {isSetPasswordRoute ? <SetPassword /> : <ClientPortalApp />}
    </BrowserRouter>
  </React.StrictMode>
);
