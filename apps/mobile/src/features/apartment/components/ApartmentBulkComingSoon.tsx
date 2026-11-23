import { Image, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';

import type { ResolvedApartment } from '../api';

const COMING_SOON_IMAGE = require('../../../../assets/images/apartment-images/Coming Soon.png');

interface ApartmentBulkComingSoonProps {
  apartment: ResolvedApartment;
  topInset: number;
}

export function ApartmentBulkComingSoon({ apartment, topInset }: ApartmentBulkComingSoonProps) {
  const name = apartment.apartmentName ?? 'your apartment complex';
  return (
    <View className="flex-1 items-center px-6" style={{ paddingTop: topInset + 40 }}>
      <Image source={COMING_SOON_IMAGE} style={{ width: 180, height: 180 }} resizeMode="contain" />
      <AppText variant="title" className="text-foreground" style={{ marginTop: 8, textAlign: 'center' }}>
        Bulk ordering is coming soon
      </AppText>
      <AppText variant="bodySm" className="text-muted-foreground" style={{ marginTop: 4, textAlign: 'center' }}>
        {name} is a registered apartment complex and its kitchens are already assigned — bulk
        ordering here will open shortly. Tap Apartment below to order Instant, Today or Advance
        meals right now.
      </AppText>
    </View>
  );
}
