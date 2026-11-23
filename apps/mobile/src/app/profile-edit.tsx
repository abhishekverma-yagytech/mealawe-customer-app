import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconCamera, IconUser } from '@/components/ui/icons';
import type { CustomerProfile } from '@/features/auth/types';
import { EditProfileForm, profileApi, resolveProfileImage, type EditProfileValues } from '@/features/profile';
import { HttpError } from '@/services/http';
import { updateProfile as updateNetcoreProfile, useScreenTracking } from '@/services/netcore';
import { useAuthStore } from '@/store';
import { palette } from '@/theme';

/** A locally-picked photo pending upload — not yet the server's own
 * `imageUrl`. Kept separate from `profile` so the preview is instant (no
 * round-trip needed to see the crop) while the actual upload only happens on
 * Save, same moment the rest of the form's edits are persisted. */
interface PickedPhoto {
  uri: string;
  name: string;
  type: string;
}

/** First letter of up to the first two words of a name, e.g. "Apurv Patole" → "AP". */
function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export default function ProfileEditScreen() {
  useScreenTracking('profile_edit');

  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [submitting, setSubmitting] = useState(false);
  const [pickedPhoto, setPickedPhoto] = useState<PickedPhoto | null>(null);

  const phone = profile?.phoneNo ? `+91-${profile.phoneNo}` : undefined;
  const referral =
    (profile?.['referralCode'] as string | undefined) ??
    (profile?.['myReferralCode'] as string | undefined);
  const initials = getInitials(profile?.userName ?? '');
  const avatarUri = pickedPhoto?.uri ?? resolveProfileImage(profile?.imageUrl);

  /**
   * Square-crop picker for the profile photo — mirrors mealaweApp's own
   * `takePicture()` (`Camera.getPhoto` → an image-cropper modal at
   * `aspectRatio: 1`); `allowsEditing` + `aspect: [1, 1]` gets the same square
   * crop out of Expo's own built-in editor instead of a bespoke cropper
   * component. Only stores the LOCAL uri — nothing uploads until Save.
   */
  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to change your profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    setPickedPhoto({
      uri: asset.uri,
      name: asset.fileName ?? 'profile.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    });
  }

  async function onSubmit(values: EditProfileValues) {
    if (!profile?._id) {
      Alert.alert('Not signed in', 'Please log in again to update your profile.');
      return;
    }
    setSubmitting(true);
    const merged: CustomerProfile = {
      ...profile,
      userName: values.userName,
      email: values.email,
    };
    try {
      // A picked photo needs the multipart upload path (the server route
      // always runs multer's `upload.single('image')`) — everything else
      // keeps posting the plain merged profile exactly as before.
      const res = pickedPhoto
        ? await profileApi.saveProfileWithPhoto(
            profile._id,
            { ...values, registeredPlatform: profile.registeredPlatform as string | undefined },
            pickedPhoto,
          )
        : await profileApi.saveProfile(profile._id, merged);
      await setProfile(res ?? merged);
      updateNetcoreProfile({ name: values.userName, email: values.email || undefined });
      if (router.canGoBack()) router.back();
      else router.replace('/profile');
    } catch (error) {
      if (error instanceof HttpError) {
        console.error('profile-edit: save failed', error.status, error.message, error.payload);
      } else {
        console.error('profile-edit: save failed', error);
      }
      Alert.alert('Could not save', 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Edit profile' }} />
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        {/* Borrows the profile screen's gradient avatar so this form reads as
            the same identity, not a generic settings form. A real photo
            (freshly picked, or already saved) replaces the initials/icon
            fallback entirely rather than sitting inside the gradient. */}
        <View className="mb-6 items-center">
          <Pressable onPress={pickPhoto} accessibilityRole="button" accessibilityLabel="Change profile photo">
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={{ height: 76, width: 76, borderRadius: 38 }} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={['#2B2A4E', '#122A3A', palette.brand.teal]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ height: 76, width: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' }}>
                {initials ? (
                  <AppText variant="h2" className="text-white">
                    {initials}
                  </AppText>
                ) : (
                  <IconUser size={38} color="#ffffff" />
                )}
              </LinearGradient>
            )}
            <View
              className="items-center justify-center rounded-full bg-primary"
              style={{ position: 'absolute', right: -2, bottom: -2, height: 28, width: 28, borderWidth: 2, borderColor: palette.neutral.white }}>
              <IconCamera size={14} color="#ffffff" />
            </View>
          </Pressable>
        </View>
        <EditProfileForm
          initial={{ userName: profile?.userName ?? '', email: profile?.email ?? '' }}
          phone={phone}
          referral={referral}
          submitting={submitting}
          onSubmit={onSubmit}
        />
      </ScrollView>
    </View>
  );
}
