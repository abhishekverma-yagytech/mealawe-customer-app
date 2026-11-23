import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import {
  AddressForm,
  getGps,
  LocationPicker,
  type Address,
  type GeoPoint,
  type ResolvedPlace,
} from '@/features/location';
import { useScreenTracking } from '@/services/netcore';
import { palette } from '@/theme';
import { useLocationStore } from '@/store';

export default function AddressFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ index?: string }>();
  const editIndex = params.index != null ? Number(params.index) : null;
  const isEdit = editIndex != null && !Number.isNaN(editIndex);
  useScreenTracking(isEdit ? 'address_edit' : 'address_add');

  const saved = useLocationStore((s) => s.saved);
  const current = useLocationStore((s) => s.current);
  const addAddress = useLocationStore((s) => s.addAddress);
  const updateAddress = useLocationStore((s) => s.updateAddress);

  const editing = isEdit ? saved[editIndex] : undefined;

  const [initialGeo, setInitialGeo] = useState<GeoPoint | null>(
    editing?.geolocation ?? current?.geolocation ?? null,
  );
  // Seed the resolved location from the address being edited so the form is
  // valid before the map re-geocodes.
  const [resolved, setResolved] = useState<ResolvedPlace | null>(
    editing
      ? {
          geolocation: editing.geolocation,
          location: editing.location,
          pincode: editing.pincode,
          city: editing.city,
          state: editing.state,
        }
      : null,
  );
  const [centering, setCentering] = useState(!isEdit && !current);
  const [submitting, setSubmitting] = useState(false);

  // For a brand-new address with no known point, center the map on GPS once.
  useEffect(() => {
    if (isEdit || initialGeo) {
      return;
    }
    let cancelled = false;
    (async () => {
      const point = await getGps();
      if (!cancelled) {
        if (point) setInitialGeo(point);
        setCentering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, initialGeo]);

  async function onSubmit(addr: Address) {
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateAddress(editIndex, addr);
      } else {
        await addAddress(addr);
      }
      if (router.canGoBack()) router.back();
      else router.replace('/addresses');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{ headerShown: true, title: isEdit ? 'Edit address' : 'Add address' }}
      />
      <StatusBar style="auto" />

      {centering ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator color={palette.brand.green} />
          <AppText variant="body" className="text-muted-foreground">
            Finding your location…
          </AppText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 16 }}
          keyboardShouldPersistTaps="handled">
          <LocationPicker initial={initialGeo} onResolved={setResolved} />
          <AddressForm
            resolved={resolved}
            initial={editing}
            submitting={submitting}
            submitLabel={isEdit ? 'Update address' : 'Save address'}
            onSubmit={onSubmit}
          />
        </ScrollView>
      )}
    </View>
  );
}
