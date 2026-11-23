import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconMapPin, IconSearch } from '@/components/ui/icons';
import {
  AddressCard,
  InlineLocationSearch,
  LocationGate,
  addressLabel,
  isSameAddress,
} from '@/features/location';
import type { Address } from '@/features/location';
import { useScreenTracking } from '@/services/netcore';
import { palette } from '@/theme';
import { useLocationStore } from '@/store';

export default function AddressesScreen() {
  useScreenTracking('addresses');

  const router = useRouter();
  const current = useLocationStore((s) => s.current);
  const saved = useLocationStore((s) => s.saved);
  const gettingLocation = useLocationStore((s) => s.gettingLocation);
  const useCurrentLocation = useLocationStore((s) => s.useCurrentLocation);
  const setCurrent = useLocationStore((s) => s.setCurrent);
  const removeAddress = useLocationStore((s) => s.removeAddress);
  const [searchOpen, setSearchOpen] = useState(false);

  const isCurrent = (a: Address): boolean => isSameAddress(current, a);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  async function detect() {
    const addr = await useCurrentLocation();
    if (!addr) {
      Alert.alert(
        'Location unavailable',
        'Allow location access or add an address manually.',
      );
      return;
    }
    goBack();
  }

  async function onSelect(addr: Address) {
    await setCurrent(addr);
    goBack();
  }

  function onDelete(index: number) {
    Alert.alert('Delete address', 'Remove this saved address?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const error = await removeAddress(index);
          if (error) {
            Alert.alert('Cannot delete', error);
          }
        },
      },
    ]);
  }

  const hasAny = saved.length > 0 || current != null;
  // Only show a standalone "current location" line when it isn't already one
  // of the saved cards below (those get their own "Current" badge instead —
  // this covers the GPS-only case where the active location was never saved).
  const currentIsUnsaved = current != null && !saved.some((a) => isCurrent(a));

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Delivery address' }} />
      <StatusBar style="auto" />

      {!hasAny ? (
        <LocationGate gettingLocation={gettingLocation} onDetect={detect} onSearch={onSelect} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
          <Pressable
            onPress={detect}
            disabled={gettingLocation}
            className="flex-row items-center gap-2 rounded-2xl border border-primary bg-muted px-4 py-3.5 active:opacity-80 disabled:opacity-60"
            accessibilityRole="button">
            <IconMapPin size={18} color={palette.brand.green} />
            <AppText variant="label" className="text-primary">
              {gettingLocation ? 'Detecting…' : 'Use my current location'}
            </AppText>
          </Pressable>

          {searchOpen ? (
            <InlineLocationSearch onUseAddress={onSelect} />
          ) : (
            <Pressable
              onPress={() => setSearchOpen(true)}
              className="flex-row items-center gap-2 rounded-2xl border border-border px-4 py-3.5 active:opacity-70"
              accessibilityRole="button">
              <IconSearch size={18} color={palette.brand.green} />
              <AppText variant="label" className="text-foreground">
                Search a location to check availability
              </AppText>
            </Pressable>
          )}

          {currentIsUnsaved && (
            <View className="flex-row items-start gap-2 px-1">
              <IconMapPin size={14} color={palette.neutral.gray500} style={{ marginTop: 2 }} />
              <AppText variant="bodySm" className="flex-1 text-muted-foreground">
                Current: {addressLabel(current)}
              </AppText>
            </View>
          )}

          {saved.length > 0 && (
            <AppText variant="overline" className="mt-2 text-muted-foreground">
              Saved addresses
            </AppText>
          )}

          {saved.map((addr, i) => (
            <AddressCard
              key={addr._id ?? `${addr.geolocation.lat},${addr.geolocation.lng},${i}`}
              address={addr}
              isCurrent={isCurrent(addr)}
              onSelect={() => onSelect(addr)}
              onEdit={() => router.push({ pathname: '/address-form', params: { index: String(i) } })}
              onDelete={() => onDelete(i)}
            />
          ))}

          <Pressable
            onPress={() => router.push('/address-form')}
            className="mt-2 items-center rounded-2xl border border-dashed border-border py-3.5 active:opacity-80"
            accessibilityRole="button">
            <AppText variant="label" className="text-foreground">
              + Add new address
            </AppText>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}
