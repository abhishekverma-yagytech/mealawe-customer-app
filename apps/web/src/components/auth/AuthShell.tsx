import { Leaf, Truck, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

const PERKS = [
  { Icon: UtensilsCrossed, title: 'Daily meal plans', text: 'Home-style thalis from kitchens near you' },
  { Icon: Truck, title: 'On-demand & bulk', text: 'Order for today, tomorrow or a crowd' },
  { Icon: Leaf, title: 'Fresh, every day', text: 'Cooked in small batches, delivered hot' },
];

/**
 * Brand frame for login / register. Always the dark Mealawe teal (independent of the light/dark theme): logo, tagline and
 * what you get on the left at desktop widths; on phones the logo sits above a card that rises like a bottom sheet.
 * Logging in is optional, so "Browse without logging in" is a first-class action, not a small skip link.
 */
export function AuthShell({ title, subtitle, notice, children, skipHref = '/home' }: { title: string; subtitle?: string; /** Why the user was sent here (e.g. tried to add to cart). */ notice?: string; children: ReactNode; skipHref?: string }) {
  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#042a33] text-white lg:flex-row lg:items-stretch">
      {/* Soft brand glows */}
      <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 -z-10 size-[28rem] rounded-full bg-primary/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 right-0 -z-10 size-[30rem] rounded-full bg-secondary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-[#042a33] via-[#073c36] to-[#0f5a3a]" />

      <section className="flex flex-1 flex-col justify-center px-6 pb-8 pt-12 text-center lg:px-16 lg:pb-12 lg:pt-12 lg:text-left">
        <div className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-xl">
          <Link href="/home" aria-label="Mealawe — home" className="inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mealawe-logo-dark.png" alt="Mealawe" width={1956} height={450} className="mx-auto h-12 w-auto sm:h-14 lg:mx-0 lg:h-16" />
          </Link>
          <h1 className="mt-5 text-3xl font-black leading-tight sm:text-4xl lg:mt-10 lg:text-5xl">
            Fresh home-style meals,<br className="hidden lg:block" /> <span className="text-secondary">delivered daily.</span>
          </h1>
          <p className="mt-3 text-white/75 lg:text-lg">Join thousands of people who eat better with Mealawe.</p>

          <ul className="mt-8 hidden gap-4 lg:grid">
            {PERKS.map(({ Icon, title: t, text }) => (
              <li key={t} className="flex items-center gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Icon className="size-5 text-secondary" aria-hidden /></span>
                <span><span className="block font-bold">{t}</span><span className="block text-sm text-white/70">{text}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex flex-col items-center justify-end lg:w-[34rem] lg:shrink-0 lg:justify-center lg:p-10">
        <div className="w-full rounded-t-3xl bg-card p-6 text-foreground shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-8 lg:max-w-none">
          <h2 className="text-2xl font-black">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          {notice ? <p role="status" className="mt-4 rounded-card border border-secondary/60 bg-secondary/15 p-3 text-sm font-bold">{notice}</p> : null}
          <div className="mt-5">{children}</div>

          <div className="mt-6 border-t border-border pt-5 text-center">
            <Link href={skipHref} className="inline-flex min-h-11 w-full items-center justify-center rounded-card border border-border px-5 font-bold text-foreground transition hover:bg-muted">
              Browse without logging in
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">You can log in later — we only ask when you add a plan to your cart.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
