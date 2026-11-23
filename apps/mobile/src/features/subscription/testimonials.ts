import { useEffect, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';

import { useClusterStore } from '@/store/clusterStore';

import { loadSubscriptionReviews } from './api';
import { imageUri, type ServerReview } from '@mealawe/core';
export type { ServerReview };

/** A single customer testimonial shown in the Home screen social-proof carousel. */
export interface Testimonial {
  name: string;
  /** Designation/locality shown under the name (e.g. "IT Analyst – Hinjewadi"). */
  place: string;
  /** 1–5 stars. */
  stars: number;
  quote: string;
  /** Profile photo. Falls back to an initial-circle avatar when absent. */
  image?: ImageSourcePropType;
}


function fromServerReview(r: ServerReview): Testimonial {
  const uri = imageUri(r.photo);
  return {
    name: r.customerName,
    place: r.place ?? '',
    stars: r.rating,
    quote: r.quote,
    image: uri ? { uri } : undefined,
  };
}

export interface SubscriptionReviewsResult {
  testimonials: Testimonial[];
  /** Re-fetch (e.g. pull-to-refresh on `SubscriptionHome`) — bumps an
   * internal nonce so the load effect below fires again. */
  reload: () => void;
}

/**
 * Live, admin-managed testimonials for the current cluster
 * (`SubscriptionReview`, sorted pinned-first by the server). `[]` while
 * loading or if none are configured yet for this cluster — same
 * empty-hides-the-section behavior `SubscriptionHome` already had.
 */
export function useSubscriptionReviews(): SubscriptionReviewsResult {
  const clusters = useClusterStore((s) => s.clusters);
  const clusterKey = clusters.map((c) => c.clusterId).join(',');
  const [reviews, setReviews] = useState<ServerReview[]>([]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    loadSubscriptionReviews().then((list) => {
      if (active) {
        setReviews(list);
      }
    });
    return () => {
      active = false;
    };
  }, [clusterKey, nonce]);

  return {
    testimonials: reviews.map(fromServerReview),
    reload: () => setNonce((n) => n + 1),
  };
}
