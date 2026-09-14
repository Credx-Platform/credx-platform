import React from 'react';

const BRAND_LOGO = '/images/credx-logo-1.jpg';

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <img src={BRAND_LOGO} alt="CredX" className="site-footer__logo" />
          <span className="site-footer__tagline">Credit intelligence and financial readiness software for clearer next steps.</span>
        </div>
        <nav className="site-footer__nav" aria-label="CredX footer navigation">
          <a href="/product">Product</a>
          <a href="/pricing">Pricing</a>
          <a href="/signup">Get started</a>
          <a href="/portal">Client portal</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/refund-policy">Refunds</a>
          <a href="/croa-disclosure">Disclosures</a>
        </nav>
        <div className="site-footer__meta">
          <span>© {year} CredX. All rights reserved.</span>
          <a href="mailto:contact@credxme.com">contact@credxme.com</a>
        </div>
      </div>
    </footer>
  );
}
