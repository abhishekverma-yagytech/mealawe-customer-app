import { useRouter } from 'expo-router';

import { LoginRequiredScreen } from '@/components/ui/LoginRequiredScreen';
import { useApartmentColors } from '@/theme';

export default function ApartmentOrderLoginRequiredScreen() {
  const router = useRouter();
  const { colors } = useApartmentColors();

  return (
    <LoginRequiredScreen
      headerTitle="Apartment Order"
      message="Log in to place an Apartment order"
      onBack={() => router.back()}
      onLogin={() => router.replace('/login')}
      page={colors.page}
      ink={colors.ink}
      border={colors.border}
    />
  );
}
