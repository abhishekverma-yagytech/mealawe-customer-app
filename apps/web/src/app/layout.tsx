import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';

import { AppBootstrap } from '@/components/AppBootstrap';
import { THEME_INIT_SCRIPT } from '@/lib/theme-init';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Mealawe — fresh home-style meals', template: '%s · Mealawe' },
  description: 'Subscribe to fresh, home-style meals delivered daily. Order bulk, on-demand and dine-in from kitchens near you.',
  openGraph: { title: 'Mealawe', description: 'Fresh home-style meals, delivered.', type: 'website' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#63ab45' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <Script id="mw-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <AppBootstrap>{children}</AppBootstrap>
      </body>
    </html>
  );
}
