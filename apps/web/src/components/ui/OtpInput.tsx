'use client';

import { useRef } from 'react';

import { cn } from '@/lib/cn';

/** 6-box one-time-code input with paste, backspace navigation and browser autofill (WebOTP-friendly). */
export function OtpInput({ value, onChange, length = 6, disabled, hasError }: { value: string; onChange: (v: string) => void; length?: number; disabled?: boolean; hasError?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const setAt = (i: number, raw: string) => {
    const clean = raw.replace(/\D/g, '');
    if (!clean) return;
    const next = (value.slice(0, i) + clean).slice(0, length);
    onChange(next);
    refs.current[Math.min(next.length, length - 1)]?.focus();
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="One-time password">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          value={d}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault();
              onChange(value.slice(0, d ? i : Math.max(0, i - 1)));
              refs.current[Math.max(0, d ? i : i - 1)]?.focus();
            }
          }}
          onFocus={(e) => e.currentTarget.select()}
          className={cn('size-12 rounded-card border border-border bg-card text-center text-xl font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/30', hasError && 'border-destructive')}
        />
      ))}
    </div>
  );
}
