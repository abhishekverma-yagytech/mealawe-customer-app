'use client';

import { MapPin, Wallet } from 'lucide-react';
import Link from 'next/link';

import { addressLabel } from '@mealawe/api';
import { formatINR } from '@mealawe/core';
import { useBalances } from '@mealawe/hooks';
import { useAuthStore, useLocationStore } from '@mealawe/state';

import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * Top navigation: logo (icon on phones, full logo on larger screens) · delivery address · wallet · theme · account.
 * Sticky, same centred max width as the page content.
 */
export function TopNav() {
  const current = useLocationStore((s) => s.current);
  const profile = useAuthStore((s) => s.profile);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { cashback } = useBalances();
  const label = addressLabel(current);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-8 lg:px-12">
        <Logo />
        <Link
          href="/addresses"
          aria-label="Change delivery address"
          title={label}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 transition hover:border-primary sm:max-w-md sm:flex-none sm:flex-1 lg:ml-4">
          <MapPin className="size-5 shrink-0 text-primary" />
          <span className="min-w-0 leading-tight">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Deliver to</span>
            <span className="block truncate text-sm font-bold">{label}</span>
          </span>
        </Link>
        <span className="hidden flex-1 sm:block" />
        {isAuthenticated ? (
          <Link href="/wallet" aria-label="Wallet and cashback" className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-sm font-bold transition hover:border-primary">
            <Wallet className="size-4 text-reward" />
            <span className="hidden sm:inline">{formatINR(cashback)}</span>
          </Link>
        ) : null}
        <ThemeToggle className="bg-muted text-foreground hover:bg-border" />
        <Link
          href={isAuthenticated ? '/profile' : '/login'}
          aria-label={isAuthenticated ? 'Profile' : 'Log in'}
          className="flex h-9 min-w-9 items-center justify-center rounded-full bg-primary px-3 text-sm font-bold text-primary-foreground transition hover:bg-primary-dark">
          {isAuthenticated ? (profile?.userName?.[0]?.toUpperCase() ?? 'U') : 'Login'}
        </Link>
      </div>
    </header>
  );
}
