import { useLocalSearchParams } from 'expo-router';
import { LegalDocScreen } from '@/components/legal/LegalDoc';

/** Política de privacidad (`/privacidad`, PrivacyPage de la web, con el mismo texto). `?seccion=fotos` baja a esa sección. */
export default function PrivacyScreen() {
  const { seccion } = useLocalSearchParams<{ seccion?: string }>();
  return <LegalDocScreen doc="privacidad" section={seccion} />;
}
