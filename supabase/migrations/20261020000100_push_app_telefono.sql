-- MatchMate · Avisos push en la app del teléfono (movil/, Expo).
--
-- La app no usa Web Push: el teléfono da un token de Expo («ExponentPushToken[…]») y los avisos salen por el servicio
-- de push de Expo (que los pasa a APNs en el iPhone y a FCM en Android). El token se guarda en push_subscriptions como
-- un teléfono más (kind = 'expo', sin claves de cifrado), así todo lo demás sigue igual: push_outbox_fanout lo reparte
-- (los 5 más nuevos de la cuenta), push_outbox_prefs aplica las preferencias, claim/finish_push_batch lo toman y lo
-- borran si ya no existe, y borrar la cuenta lo cuenta y lo borra. send-push (core.ts) ve el token y lo manda a Expo.

alter table public.push_subscriptions
  add column kind text not null default 'web' check (kind in ('web', 'expo')),
  alter column p256dh drop not null,
  alter column auth drop not null;

-- El endpoint: un servicio de Web Push conocido (como antes) o un token de Expo.
alter table public.push_subscriptions drop constraint push_subscriptions_endpoint_check;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_check check (
  char_length(endpoint) < 1000
  and case kind
        when 'web' then endpoint ~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/'
        else endpoint ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$'
      end);

-- Web Push necesita las dos claves; la app no lleva ninguna.
alter table public.push_subscriptions add constraint push_subscriptions_keys_check
  check ((kind = 'web') = (p256dh is not null and auth is not null));

-- Guarda (o actualiza) el token de este teléfono para la cuenta. Si era de otra cuenta en el mismo teléfono, pasa a
-- esta (es quien tiene la sesión abierta), igual que upsert_push_subscription. Se quita con delete_push_subscription
-- (p_endpoint = el token).
create function public.upsert_app_push(p_token text, p_platform text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
begin
  if p_platform is null or p_platform not in ('ios', 'android') then
    perform private.fail('invalido');
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$' then
    perform private.fail('invalido');
  end if;
  insert into public.push_subscriptions as s (user_id, endpoint, kind, p256dh, auth, ua)
  values (v_uid, p_token, 'expo', null, null, 'App ' || p_platform)
  on conflict (endpoint) do update set user_id = excluded.user_id, kind = 'expo', p256dh = null, auth = null,
                                       ua = excluded.ua, fail_count = 0
  returning s.id into v_id;
  return v_id;
end $$;

do $$
declare
  f record;
begin
  for f in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'upsert_app_push' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
