'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** 'sheet' slides up from the bottom on phones (replaces mobile bottom sheets); centred on desktop. */
  className?: string;
}

export function Dialog({ open, onOpenChange, title, description, children, className }: Props) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <RadixDialog.Content
          className={cn(
            'fixed z-50 flex max-h-[90dvh] flex-col overflow-hidden bg-card shadow-xl',
            'inset-x-0 bottom-0 rounded-t-3xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[28rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl',
            className,
          )}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <RadixDialog.Title className="text-lg font-bold">{title}</RadixDialog.Title>
            <RadixDialog.Close aria-label="Close" className="rounded-full p-2 hover:bg-muted">
              <X className="size-5" />
            </RadixDialog.Close>
          </div>
          {description ? <RadixDialog.Description className="px-4 pt-3 text-sm text-muted-foreground">{description}</RadixDialog.Description> : <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>}
          <div className="overflow-y-auto p-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
