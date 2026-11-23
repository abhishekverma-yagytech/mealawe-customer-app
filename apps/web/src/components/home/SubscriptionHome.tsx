'use client';

import { ArrowRight, Search, Star, Utensils } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { loadSubscriptionReviews } from '@mealawe/api';
import { cheapestPriceLabels, packageImageUri, trackCategoryViewed, type ServerReview, type SubCategory } from '@mealawe/core';
import { useSubscriptionCatalog } from '@mealawe/hooks';
import { useSubscriptionBrowseStore } from '@mealawe/state';

import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Img, imgUri } from '@/lib/img';

export function SubscriptionHome() {
  const router = useRouter();
  const setCategory = useSubscriptionBrowseStore((s) => s.setCategory);
  const { loading, error, categories, packagesFor, reload } = useSubscriptionCatalog({ includeUnmanaged: true });
  const [search, setSearch] = useState('');
  const [reviews, setReviews] = useState<ServerReview[]>([]);

  useEffect(() => {
    let active = true;
    loadSubscriptionReviews()
      .then((r) => active && setReviews(r.slice(0, 6)))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => (q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories), [q, categories]);
  const featured = categories.find((c) => c.isBestseller);

  const priceFor = (c: SubCategory) => cheapestPriceLabels(packagesFor(c.param), c.homeTilePackageId);
  const open = (c: SubCategory) => {
    trackCategoryViewed(c.name);
    setCategory(c);
    router.push(`/subscription-detail?categoryParam=${encodeURIComponent(c.param)}`);
  };

  return (
    <div className="space-y-6">
      <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
        <Search className="size-5 text-muted-foreground" aria-hidden />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search category" aria-label="Search category" className="flex-1 bg-transparent text-base outline-none" />
      </label>

      {error ? (
        <Card className="text-center">
          <p>{error}</p>
          <button className="mt-2 font-bold text-primary" onClick={reload}>Retry</button>
        </Card>
      ) : null}

      {featured && !q ? (
        <button
          onClick={() => open(featured)}
          className="group grid w-full overflow-hidden rounded-3xl border border-border bg-card text-left shadow-sm transition hover:shadow-md lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* The showcase photo already carries its own headline, so the card text sits beside/below it. */}
          <Img src={imgUri(featured.showcaseImage ?? featured.detailImage ?? featured.image)} alt={featured.name} className="aspect-[16/9] w-full object-left lg:aspect-auto lg:h-full lg:max-h-72 lg:min-h-56" />
          <span className="flex flex-col justify-center gap-2 p-4 sm:p-6 lg:p-8">
            <span className="w-fit rounded-full bg-offer px-3 py-1 text-xs font-black tracking-wide text-white">BESTSELLER</span>
            <span className="text-2xl font-black lg:text-3xl">{featured.name}</span>
            {featured.tagline ? <span className="text-muted-foreground">{featured.tagline}</span> : null}
            <span className="flex items-baseline gap-2">
              <span className="text-xl font-black text-primary">{priceFor(featured)?.current ?? 'View plans'}</span>
              {priceFor(featured)?.original ? <s className="text-sm text-muted-foreground">{priceFor(featured)?.original}</s> : null}
            </span>
            <span className="mt-1 inline-flex w-fit items-center gap-2 rounded-card bg-primary px-5 py-2.5 font-bold text-primary-foreground transition group-hover:bg-primary-dark">
              View plans <ArrowRight className="size-4" />
            </span>
          </span>
        </button>
      ) : null}

      <section aria-labelledby="meals-for-you">
        <h2 id="meals-for-you" className="mb-3 text-xl font-black">Meals for you</h2>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground">{q ? 'No categories match your search.' : 'No meals available for this location yet.'}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filtered.map((c) => {
              const price = priceFor(c);
              // Managed tile image first; groups without a category record fall back to their first package's photo.
              const pic = imgUri(c.image ?? c.detailImage ?? c.showcaseImage) ?? packageImageUri(packagesFor(c.param).find((p) => p.imageUrl));
              return (
                <li key={c.param}>
                  <button onClick={() => open(c)} className="block w-full overflow-hidden rounded-card border border-border bg-card text-left shadow-sm transition hover:shadow-md">
                    {pic ? (
                      <Img src={pic} alt={c.name} className="h-28 w-full sm:h-36 lg:h-44" />
                    ) : (
                      <span aria-hidden className="flex h-16 w-full items-center justify-center bg-primary/10 text-primary"><Utensils className="size-7" /></span>
                    )}
                    <span className="block p-3">
                      <span className="block truncate font-bold">{c.name}</span>
                      {c.offerText ? <span className="text-xs font-bold text-offer">{c.offerText}</span> : null}
                      <span className="mt-1 block text-sm">
                        {price ? price.current : 'View plans'}{' '}
                        {price?.original ? <s className="text-xs text-muted-foreground">{price.original}</s> : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {reviews.length > 0 ? (
        <section aria-labelledby="loved">
          <h2 id="loved" className="mb-3 text-xl font-black">Loved by customers</h2>
          <ul className="flex gap-3 overflow-x-auto pb-2">
            {reviews.map((r) => (
              <li key={r._id} className="w-72 shrink-0">
                <Card className="h-full">
                  <div className="flex items-center gap-1 text-rating" aria-label={`${r.rating} out of 5 stars`}>
                    {Array.from({ length: Math.round(r.rating) }, (_, i) => <Star key={i} className="size-4 fill-current" />)}
                  </div>
                  <p className="mt-2 text-sm">{r.quote}</p>
                  <p className="mt-2 text-xs font-bold">{r.customerName}{r.place ? ` · ${r.place}` : ''}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
