import { ComingSoonScreen } from '@/components/ui/ComingSoonScreen';
import { IconSearch } from '@/components/ui/icons';
import { useScreenTracking } from '@/services/netcore';

export default function ExploreScreen() {
  useScreenTracking('explore');

  return (
    <ComingSoonScreen
      title="Explore"
      icon={IconSearch}
      message="Discovery and search land here as the migration continues."
    />
  );
}
