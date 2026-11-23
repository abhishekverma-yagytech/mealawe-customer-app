import { IconFeatureStrip } from './IconFeatureStrip';
import { PROMISES } from '../promises';

/**
 * "Our promise" strip — straight under the hero photo on the subscription
 * detail screen. Reads its 4 entries from `promises.ts` — fully self-contained,
 * no props, mirroring `ReasonsGrid`'s data-file convention but for this
 * lighter, top-of-page trust strip instead of the dark mid-page tile grid.
 */
export function PromiseStrip() {
  return <IconFeatureStrip items={PROMISES} />;
}
