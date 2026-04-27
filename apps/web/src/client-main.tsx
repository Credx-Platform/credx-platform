import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import ClientPortalApp from './clientPortal';
import SetPassword from './SetPassword';
import './styles.css';

const normalizedPath = window.location.pathname.replace(/\/+$/, '');
const isSetPasswordRoute = normalizedPath === '/portal/set-password';
const isOnboardingRoute = normalizedPath === '/start';
const basename = isOnboardingRoute ? '/start' : '/portal';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      {isSetPasswordRoute ? <SetPassword /> : <ClientPortalApp onboardingOnly={isOnboardingRoute} />}
    </BrowserRouter>
  </React.StrictMode>
);
