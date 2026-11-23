import { Clock, Star } from 'lucide-react';

import { isNearby, offerBadgeText, speedTag, type OnDemandKitchen } from '@mealawe/core';

import { cn } from '@/lib/cn';
import { Img, imgUri } from '@/lib/img';

export function KitchenCard({ kitchen, onOpen }: { kitchen: OnDemandKitchen; onOpen: () => void }) {
  const offer = offerBadgeText(kitchen);
  const speed = speedTag(kitchen);
  return (
    <button onClick={onOpen} className={cn('block w-full overflow-hidden rounded-card border border-border bg-card text-left shadow-sm transition hover:shadow-md', !kitchen.kitchenOpened && 'opacity-70')}>
      <div className="relative">
        <Img src={imgUri(kitchen.imageUrl ? (kitchen.imageUrl.startsWith('http') ? kitchen.imageUrl : undefined) : undefined)} alt={kitchen.kitchenName} className="h-32 w-full" />
        {offer ? <span className="absolute bottom-2 left-2 rounded bg-offer px-2 py-0.5 text-xs font-bold text-white">{offer}</span> : null}
        {!kitchen.kitchenOpened ? <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs font-bold text-white">Closed</span> : null}
      </div>
      <div className="p-3">
        <p className="truncate font-bold">{kitchen.kitchenName}</p>
        <p className="truncate text-xs text-muted-foreground">{kitchen.mainSpeciality ?? kitchen.speciality}</p>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          {kitchen.rating ? <span className="flex items-center gap-1 font-bold text-rating"><Star className="size-3.5 fill-current" />{kitchen.rating.toFixed(1)}</span> : null}
          {speed ? <span className="flex items-center gap-1"><Clock className="size-3.5" />{speed}</span> : null}
          {typeof kitchen.distance === 'number' ? <span>{kitchen.distance.toFixed(1)} km{isNearby(kitchen) ? '' : ' · far'}</span> : null}
        </p>
      </div>
    </button>
  );
}
