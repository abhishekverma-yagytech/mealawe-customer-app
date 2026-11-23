'use client';

import { CloudRain, MapPin, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useClusterStore } from '@mealawe/state';

const RAIN_SHOWN_KEY = 'mw.rain.shown';
const RAIN_HOLD_MS = 8000;

function rainAlreadyShown(): boolean {
  try {
    return window.sessionStorage.getItem(RAIN_SHOWN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * "It's raining near this location": shown when the current cluster's admin config has `showRainyNotification` on.
 * Like mobile it informs once per session instead of nagging (mobile slides it away after 2 s; a web reader needs longer,
 * so it holds 8 s and has a close button).
 */
export function RainBanner() {
  const active = useClusterStore((s) => s.showRainyNotification);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active !== true || rainAlreadyShown()) return;
    setVisible(true);
    const t = setTimeout(() => dismiss(), RAIN_HOLD_MS);
    return () => clearTimeout(t);
  }, [active]);

  function dismiss() {
    setVisible(false);
    try {
      window.sessionStorage.setItem(RAIN_SHOWN_KEY, '1');
    } catch {
      // ignore: the banner may simply show again next load
    }
  }

  if (!visible) return null;
  return (
    <div role="status" className="relative border-b border-location/30 bg-location/10 px-4 py-3 text-center">
      <p className="flex items-center justify-center gap-2 font-black text-location"><CloudRain className="size-5" aria-hidden />It&apos;s raining near this location</p>
      <p className="mt-0.5 text-sm text-muted-foreground">Our delivery partners may take longer to reach you</p>
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
    </div>
  );
}

/**
 * Persistent notice while the delivery address is outside every serviceable cluster (and has no apartment either) —
 * stays up as long as that is true, with a direct way to change the address.
 */
export function OutsideServiceAreaBanner({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div role="status" className="border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-center">
      <p className="flex items-center justify-center gap-2 font-black text-destructive"><MapPin className="size-5" aria-hidden />You&apos;re outside our delivery area</p>
      <p className="mt-0.5 text-sm text-muted-foreground">We&apos;re expanding fast — we&apos;ll be reaching your area soon</p>
      <Link href="/addresses" className="mt-1 inline-block text-sm font-bold text-destructive underline">Change location →</Link>
    </div>
  );
}
