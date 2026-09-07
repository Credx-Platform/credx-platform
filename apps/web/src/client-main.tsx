import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initErrorReporting } from './errorReporting';
import ClientPortalApp from './clientPortal';
import SetPassword from './SetPassword';
import AffiliateOnboarding from './AffiliateOnboarding';
import './styles.css';

const normalizedPath = window.location.pathname.replace(/\/+$/, '');
const isSetPasswordRoute = normalizedPath === '/portal/set-password';
const isAffiliateOnboardingRoute = normalizedPath === '/affiliate-onboarding';
const isOnboardingRoute = normalizedPath === '/start';
const basename = isAffiliateOnboardingRoute ? '/affiliate-onboarding' : isOnboardingRoute ? '/start' : '/portal';

initErrorReporting();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      {isAffiliateOnboardingRoute ? <AffiliateOnboarding /> : isSetPasswordRoute ? <SetPassword /> : <ClientPortalApp onboardingOnly={isOnboardingRoute} />}
    </BrowserRouter>
  </React.StrictMode>
);
