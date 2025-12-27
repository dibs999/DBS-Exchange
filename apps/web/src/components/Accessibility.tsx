import React, { useEffect, useRef, ReactNode } from 'react';

// Focus trap for modals
export function FocusTrap({ children, isActive }: { children: ReactNode; isActive: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    }

    // Focus first element when trap activates
    firstElement?.focus();

    container.addEventListener('keydown', handleTab);
    return () => container.removeEventListener('keydown', handleTab);
  }, [isActive]);

  return <div ref={containerRef}>{children}</div>;
}

// ARIA live region for announcements
export function AriaLive({ message, priority = 'polite' }: { message: string; priority?: 'polite' | 'assertive' }) {
  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic="true"
      className="sr-only"
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        borderWidth: 0,
      }}
    >
      {message}
    </div>
  );
}

// Skip to main content link
export function SkipToMain() {
  return (
    <a
      href="#terminal"
      className="skip-to-main"
      style={{
        position: 'absolute',
        top: '-40px',
        left: 0,
        background: 'var(--gold)',
        color: '#241d12',
        padding: '8px 16px',
        textDecoration: 'none',
        zIndex: 10000,
        borderRadius: '0 0 4px 0',
      }}
      onFocus={(e) => {
        e.currentTarget.style.top = '0';
      }}
      onBlur={(e) => {
        e.currentTarget.style.top = '-40px';
      }}
    >
      Zum Hauptinhalt springen
    </a>
  );
}

