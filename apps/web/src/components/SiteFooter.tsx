import React from 'react';

const BRAND_LOGO = '/images/credx-logo-1.jpg';

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <img src={BRAND_LOGO} alt="CredX" className="site-footer__logo" />
          <span className="site-footer__tagline">Smart credit strategy, stronger next steps.</span>
        </div>
        <div className="site-footer__meta">
          <span>© {year} CredX. All rights reserved.</span>
          <a href="mailto:contact@credxme.com">contact@credxme.com</a>
        </div>
      </div>
    </footer>
  );
}
