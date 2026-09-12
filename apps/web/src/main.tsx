import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initErrorReporting } from './errorReporting';
import App from './App';
import './styles.css';
import './platform-theme.css';
import { PlatformPageFade } from './platformMotion';

initErrorReporting();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/adminportal">
      <PlatformPageFade />
      <App />
    </BrowserRouter>
  </React.StrictMode>
);