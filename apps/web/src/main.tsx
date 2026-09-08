import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initErrorReporting } from './errorReporting';
import App from './App';
import './styles.css';

initErrorReporting();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/adminportal">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);