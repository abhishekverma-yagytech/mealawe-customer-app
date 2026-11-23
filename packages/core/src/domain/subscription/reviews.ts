/** The `SubscriptionReview` shape returned by `getSubscriptionReviewListByClusterConfig`. */
export interface ServerReview {
  _id: string;
  customerName: string;
  place?: string;
  rating: number;
  quote: string;
  photo?: string;
  /** Cluster CONFIG group names this review is scoped to, not raw cluster
   * zone ids — unused client-side (the fetch itself is already config-scoped
   * server-side), kept only for parity with the server doc shape. */
  clusterConfigNames?: string[];
  category?: string;
  isVerified?: boolean;
  isPinned?: boolean;
  order?: number;
}
