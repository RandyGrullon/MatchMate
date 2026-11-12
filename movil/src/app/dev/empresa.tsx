import { useState } from 'react';
import { Platform } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useAuth } from '@mm/lib/auth';
import { invalidate, rpc } from '@mm/lib/data/client';
import { adminSetPromotionPrice, businessTags, useMyBusiness, usePromotionPrices, type BusinessStatus } from '@mm/lib/data/business';
import { toast } from '@/components/feedback';
import { Button, Card, Loading, Screen, SectionHeader, Txt } from '@/components/ui';
import { demoOn, setDemo } from '@/platform/demoBackend';

/**
 * Solo en desarrollo: prende la demostración de Mi empresa y Dónde jugar (movil/src/platform/demoBackend.ts: una cuenta
 * de prueba y canchas de ejemplo en memoria, sin Supabase) y hace lo del superadmin (aprobar o rechazar la empresa).
 * Solo en la vista previa web. En la app publicada (__DEV__ falso) lleva a Hoy.
 */
export default function DevEmpresa() {
  if (!__DEV__) return <Redirect href="/" />;
  if (Platform.OS !== 'web') {
    return (
      <Screen>
        <Txt>La demostración es solo para la vista previa web.</Txt>
      </Screen>
    );
  }
  return demoOn() ? <DemoPanel /> : <DemoOff />;
}

/** Días y RD$ (ITBIS incluido) de prueba para destacar un espacio. */
const DEMO_PRICES = [
  [7, 1500],
  [15, 2800],
  [30, 5000],
] as const;

function go(path: string) {
  // Al recargar, getBackend elige el de la demostración (o el de siempre).
  globalThis.location?.assign(path);
}

function DemoOff() {
  return (
    <Screen>
      <Txt variant="title">Demostración de empresas</Txt>
      <Txt tone="fg2">Entra con una cuenta de prueba (en memoria, sin Supabase) para registrar una empresa, agregar canchas con fotos, cambiar de modo y buscar en Dónde jugar.</Txt>
      <Button
        variant="primary"
        size="xl"
        full
        onPress={() => {
          setDemo(true);
          go('/empresa');
        }}
      >
        Entrar a la demostración
      </Button>
    </Screen>
  );
}

function DemoPanel() {
  // Con la sesión ya leída (useMyBusiness la necesita para saber de quién es).
  const auth = useAuth();
  return auth.loading ? <Loading /> : <DemoBusiness />;
}

function DemoBusiness() {
  const business = useMyBusiness();
  const prices = usePromotionPrices();
  const [busy, setBusy] = useState(false);
  const b = business.data;

  /** Los precios de destacar (consola › Empresas › Cobrar con Azul en la web), de prueba. */
  async function setPrices(on: boolean) {
    setBusy(true);
    try {
      for (const [days, amount] of DEMO_PRICES) await adminSetPromotionPrice(days, on ? amount : null);
      toast(on ? 'Precios puestos' : 'Precios quitados');
    } finally {
      setBusy(false);
    }
  }

  async function review(status: BusinessStatus, note: string | null = null) {
    if (!b) return;
    setBusy(true);
    try {
      await rpc('admin_set_business_status', { p_business: b.id, p_status: status, p_note: note });
      invalidate(businessTags.all);
      toast(`Empresa: ${status}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Txt variant="title">Demostración de empresas</Txt>
      <Txt tone="fg2">Cuenta de prueba en memoria (se guarda en esta pestaña hasta salir de la demostración).</Txt>
      <SectionHeader title="Como el superadmin" />
      <Card style={{ gap: 10 }}>
        <Txt tone="fg2">{b ? `${b.name}: ${b.status}` : 'Todavía no hay empresa: regístrala en Mi empresa.'}</Txt>
        <Button variant="primary" full disabled={!b || busy} onPress={() => void review('approved')}>
          Aprobar mi empresa
        </Button>
        <Button full disabled={!b || busy} onPress={() => void review('rejected', 'Falta una foto de la entrada (prueba).')}>
          Rechazarla con motivo
        </Button>
      </Card>
      <Card style={{ gap: 10 }}>
        <Txt tone="fg2">
          {prices.data.length
            ? `Cobrar con Azul: ${prices.data.map((p) => `${p.days} días RD$${p.amount}`).join(' · ')}`
            : 'Cobrar con Azul: sin precios (la empresa pide destacar y se cobra aparte).'}
        </Txt>
        <Button full disabled={busy} onPress={() => void setPrices(!prices.data.length)}>
          {prices.data.length ? 'Quitar los precios' : 'Poner precios de prueba'}
        </Button>
      </Card>
      <Button full onPress={() => router.navigate('/empresa')}>
        Ir a Mi empresa
      </Button>
      <Button
        variant="ghost"
        full
        onPress={() => {
          setDemo(false);
          go('/');
        }}
      >
        Salir de la demostración
      </Button>
    </Screen>
  );
}
