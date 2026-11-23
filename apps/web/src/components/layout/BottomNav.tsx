'use client';

import { Home, LifeBuoy, ReceiptText, UserRound, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '/home', label: 'Home', Icon: Home },
  { href: '/orders', label: 'Orders', Icon: ReceiptText },
  { href: '/wallet', label: 'Wallet', Icon: Wallet },
  { href: '/help', label: 'Help', Icon: LifeBuoy },
  { href: '/profile', label: 'Profile', Icon: UserRound },
] as const;

/** Floating pill navigation, centred at the bottom on every screen size. */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
      <ul className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-card/90 p-1.5 shadow-2xl backdrop-blur-xl">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = path === href || (href !== '/home' && path.startsWith(href));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                aria-label={label}
                className={cn('flex items-center gap-2 rounded-full px-3.5 py-2.5 text-sm font-bold transition', active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <Icon className="size-5 shrink-0" />
                <span className={cn(active ? 'inline' : 'hidden md:inline')}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
