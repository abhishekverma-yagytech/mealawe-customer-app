import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Script from 'next/script';
import type { ReactNode } from 'react';

import { AppBootstrap } from '@/components/AppBootstrap';
import { ENV } from '@/lib/env';
import { THEME_INIT_SCRIPT } from '@/lib/theme-init';

import './globals.css';

// Self-hosted woff2 via next/font: preloaded in <head>, hashed + immutable-cached, and a size-adjusted Arial
// fallback so headings don't jump when Metropolis swaps in (was a CLS source with plain @font-face .ttf).
const metropolis = localFont({
  src: [
    { path: './fonts/Metropolis-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Metropolis-Bold.woff2', weight: '700', style: 'normal' },
    { path: './fonts/Metropolis-Black.woff2', weight: '900', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-metropolis',
});

export const metadata: Metadata = {
  title: { default: 'Mealawe — fresh home-style meals', template: '%s · Mealawe' },
  description: 'Subscribe to fresh, home-style meals delivered daily. Order bulk, on-demand and dine-in from kitchens near you.',
  openGraph: { title: 'Mealawe', description: 'Fresh home-style meals, delivered.', type: 'website' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#63ab45' };

// Every page's data comes from the API right after hydration: open that connection while the JS downloads.
// The http client sends credentials, so the preconnect must too or the browser can't reuse it.
const apiOrigin = (() => {
  try {
    return ENV.apiUrl ? new URL(ENV.apiUrl).origin : null;
  } catch {
    return null;
  }
})();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={metropolis.variable} suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        {apiOrigin ? <link rel="preconnect" href={apiOrigin} crossOrigin="use-credentials" /> : null}
        <Script id="mw-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <AppBootstrap>{children}</AppBootstrap>
      </body>
    </html>
  );
}
