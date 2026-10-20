import { useEffect } from 'react';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Loading } from '@/components/ui';

// Si Android abre la app con matchmate://auth (la vuelta de Google), termina la sesión del navegador seguro.
WebBrowser.maybeCompleteAuthSession();

/** La vuelta de «Entrar con Google» (`matchmate://auth`): la sesión ya la tomó el login; aquí solo se sigue a Hoy. */
export default function AuthReturn() {
  useEffect(() => {
    const t = setTimeout(() => router.replace('/'), 300);
    return () => clearTimeout(t);
  }, []);
  return <Loading label="Entrando" />;
}
