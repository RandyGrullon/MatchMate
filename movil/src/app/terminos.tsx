import { useLocalSearchParams } from 'expo-router';
import { LegalDocScreen } from '@/components/legal/LegalDoc';

/** Términos de uso (`/terminos`, TermsPage de la web, con el mismo texto). `?seccion=` baja a esa sección. */
export default function TermsScreen() {
  const { seccion } = useLocalSearchParams<{ seccion?: string }>();
  return <LegalDocScreen doc="terminos" section={seccion} />;
}
