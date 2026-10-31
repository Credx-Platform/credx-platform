import React, { type ReactNode, type RefObject, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type PlatformPageChromeOption = {
  value: string;
  label: string;
};

type Props = {
  rootRef: RefObject<HTMLElement>;
  title: string;
  accent: string;
  actions: ReactNode;
  options?: PlatformPageChromeOption[];
  value?: string;
  onChange?: (value: string) => void;
  selectLabel?: string;
  refreshKey: string;
};

type Targets = {
  header: HTMLElement;
  navigation: HTMLElement | null;
};

const heroSelector = [
  '.page-grid > .hero-card',
  '.page-grid > .mc-overview-hero',
  '.page-grid > .mc-hero',
  '.page-grid > .privacy-security-hero',
  '.page-grid > .client-workspace-header',
  '.page-grid > .panel',
  '.hero-card',
  '.mc-overview-hero',
  '.mc-hero',
  '.privacy-security-hero',
  '.client-workspace-header',
  '.panel'
].join(', ');

/** Places authenticated page controls inside the active page hero and navigation directly after it. */
export function PlatformPageChrome({
  rootRef,
  title,
  accent,
  actions,
  options = [],
  value,
  onChange,
  selectLabel = 'Section',
  refreshKey
}: Props) {
  const [targets, setTargets] = useState<Targets | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    let hero = root.querySelector<HTMLElement>(heroSelector);
    let fallback: HTMLElement | null = null;
    if (!hero) {
      fallback = document.createElement('section');
      fallback.className = 'hero-card platform-hero-fallback';
      root.prepend(fallback);
      hero = fallback;
    }

    const header = document.createElement('div');
    header.className = 'platform-hero-chrome-anchor';
    hero.prepend(header);
    hero.classList.add('platform-hero--with-chrome');

    let navigation: HTMLElement | null = null;
    if (options.length && value && onChange) {
      navigation = document.createElement('div');
      navigation.className = 'platform-section-nav-anchor';
      hero.insertAdjacentElement('afterend', navigation);
    }

    setTargets({ header, navigation });
    return () => {
      setTargets(null);
      header.remove();
      navigation?.remove();
      hero?.classList.remove('platform-hero--with-chrome');
      fallback?.remove();
    };
  }, [rootRef, refreshKey, options.length]);

  if (!targets) return null;

  return (
    <>
      {createPortal(
        <header className="platform-hero-header" style={{ ['--section-accent' as string]: accent } as React.CSSProperties}>
          <h1 className="top-title">{title}</h1>
          <div className="topbar-actions">{actions}</div>
        </header>,
        targets.header
      )}
      {targets.navigation && value && onChange ? createPortal(
        <select
          className="platform-section-select"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={selectLabel}
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>,
        targets.navigation
      ) : null}
    </>
  );
}
