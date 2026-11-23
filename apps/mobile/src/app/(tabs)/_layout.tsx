import { Stack } from 'expo-router';

/**
 * No bottom tab bar — the home screen owns full-height layout so the
 * subscription Subscribe bar can pin to the very bottom of the screen.
 */
export default function TabsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
