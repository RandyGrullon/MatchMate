import { Redirect } from 'expo-router';
import { ScoreEditor } from '@/components/bowling/ScoreEditor';

/**
 * Solo en desarrollo: el editor de un juego sin cuenta ni liga (para probarlo en la vista previa web). En la app
 * publicada (__DEV__ falso) lleva a Hoy.
 */
export default function DevScore() {
  if (!__DEV__) return <Redirect href="/" />;
  return <ScoreEditor lid="prueba" eventId="prueba" index={0} playerId="prueba" place="juego:prueba" />;
}
