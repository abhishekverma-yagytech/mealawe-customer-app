'use client';

import { DotLottieReact, setWasmUrl } from '@lottiefiles/dotlottie-react';

// Self-hosted player runtime (no third-party CDN request).
setWasmUrl('/lottie/dotlottie-player.wasm');

/** The dotLottie player (+ its WASM runtime). Loaded on demand by LottieHero so it stays out of the first-load JS. */
export default function LottiePlayer({ src, autoplay }: { src: string; autoplay: boolean }) {
  return <DotLottieReact src={src} loop autoplay={autoplay} layout={{ fit: 'cover', align: [0.5, 0.5] }} className="h-full w-full" />;
}
