'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/cn';

/** Inner-page header with back button (mobile stack header equivalent). Full width; theme switch at the right. */
export function PageHeader({ title, right }: { title: string; right?: ReactNode }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-8 lg:px-12">
        <button type="button" aria-label="Go back" onClick={() => router.back()} className="-ml-2 rounded-full p-2 hover:bg-muted">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="flex-1 truncate text-lg font-black">{title}</h1>
        {right}
        <ThemeToggle className="bg-muted text-foreground hover:bg-border" />
      </div>
    </header>
  );
}

/** Page body: full width with responsive gutters. `narrow` = a focused reading/form column, centred. */
export function Page({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return <main className={cn('mx-auto w-full px-4 pb-28 pt-5 sm:px-8 lg:px-12', narrow ? 'max-w-3xl' : 'max-w-7xl')}>{children}</main>;
}
