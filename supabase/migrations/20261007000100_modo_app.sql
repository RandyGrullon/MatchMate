-- MatchMate · El modo de la app (el rediseño: Lite o Pro, «como Binance»): cómo quiere ver la app cada cuenta, guardado
-- en su cuenta (así le sale igual en todos sus teléfonos). Lite trae solo lo esencial (lo de hoy, anotar, su promedio y
-- sus fechas); Pro, todo (aprobar juegos, la planilla, la tabla completa, estadísticas y Excel). Es la misma app con más
-- o menos detalle: el modo no da ni quita permisos (los de cada liga siguen aquí, en la base) y ninguna RPC lo mira.
--
-- 1. public.profiles.ui_mode: 'lite', 'pro' o null (null = automático: no lo ha elegido y la app decide; hoy Lite, y a
--    quien organiza una liga se le sugiere Pro una sola vez). CHECK de la columna: ni con la clave secreta se guarda
--    otro valor.
-- 2. public.set_ui_mode(p_mode): la cuenta elige su modo ('lite' o 'pro', en minúsculas y tal cual) o vuelve a
--    automático (null). Devuelve cómo quedó. Sin límite de cambios, como set_push_prefs (la otra preferencia del
--    perfil): el mismo que ya tiene no escribe nada (reintentar es seguro). Una cuenta bloqueada no lo cambia
--    (private.require_uid).
-- 3. Leerlo: con el perfil propio, como push_prefs (`select …, username, push_prefs, ui_mode` de fetchProfile en
--    src/lib/auth.tsx). La RLS de profiles (profiles_read) ya deja ver solo la fila propia (y todas al superadmin, como
--    el correo); un visitante sin cuenta no tiene ni el GRANT. Ninguna lectura de otras cuentas lo trae (public_profile,
--    follow_list, search_people, la consola: todas arman su JSON clave por clave).
-- 4. public.export_my_data: la de 20260929001100_insignias.sql, con `uiMode` en account.
-- Pruebas: tests/sql/modo-app.test.ts.

-- =====================================================================
-- 1. La columna
-- =====================================================================
alter table public.profiles
  add column ui_mode text constraint profiles_ui_mode_check check (ui_mode in ('lite', 'pro'));

-- =====================================================================
-- 2. Escritura
-- =====================================================================

-- La cuenta elige cómo ver la app: 'lite' o 'pro', o null para volver a automático (la app decide). Devuelve el modo que
-- quedó (null = automático). 'invalido' con cualquier otro valor (también '' o 'Pro'); 'no_existe' si la cuenta todavía
-- no tiene perfil (raro: la app lo crea con ensure_profile). El mismo que ya tiene no escribe nada.
create function public.set_ui_mode(p_mode text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_now text;
begin
  if p_mode is not null and p_mode not in ('lite', 'pro') then
    perform private.fail('invalido');
  end if;
  select p.ui_mode into v_now from public.profiles p where p.id = v_uid;
  if not found then
    perform private.fail('no_existe');
  end if;
  if v_now is distinct from p_mode then
    update public.profiles p set ui_mode = p_mode where p.id = v_uid;
  end if;
  return p_mode;
end $$;

-- =====================================================================
-- 3. Bajar mis datos: con el modo (la de 20260929001100_insignias.sql)
-- =====================================================================

-- Igual que en 20260929001100_insignias.sql, con el modo de la app (uiMode: 'lite', 'pro' o null) en account.
create or replace function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_key text := 'export:u:' || v_uid::text;
  v_players uuid[];
  v_tables jsonb := '{}'::jsonb;
  v_truncated text[] := '{}';
  v_rows jsonb;
  v_n integer;
  r record;
  c_max constant integer := 5000;
begin
  if private.rate_blocked(v_key, 5, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  perform private.rate_hit(v_key, interval '1 hour');

  v_players := array(select p.id from public.players p where p.user_id = v_uid order by p.created_at, p.id);

  for r in
    select c.relname as t,
           case when bool_or(a.attname = 'holder') then 'holder'
                when bool_or(a.attname = 'user_id') then 'user_id'
                else 'player_id' end as col
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and a.attname in ('user_id', 'player_id', 'holder')
       and c.relname not in ('players', 'league_members', 'push_outbox')
     group by c.relname
     order by c.relname
  loop
    if r.col = 'player_id' and cardinality(v_players) = 0 then
      continue;
    end if;
    -- Las insignias de la liga (…1120): el jugador ve las vigentes y su nota, nunca quién la dio ni por qué se la
    -- quitaron (eso es del dueño y los admins, §5.2), ni las retiradas.
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]''::jsonb), count(*)::integer
         from (select * from public.%I t where t.%I = any ($1)%s limit %s) x',
      r.t, r.col, case when r.t = 'league_badge_awards' then ' and t.revoked_at is null' else '' end, c_max + 1)
      using case r.col when 'user_id' then array[v_uid] when 'holder' then v_uid || v_players else v_players end,
            private.export_hidden_columns()
              || case when r.t = 'league_badge_awards' then array['awarded_by', 'revoked_by', 'revoke_reason', 'revoked_at']
                      else '{}'::text[] end
      into v_rows, v_n;
    if v_n > c_max then
      v_rows := v_rows - c_max;
      v_truncated := v_truncated || r.t::text;
    end if;
    if v_n > 0 then
      v_tables := v_tables || jsonb_build_object(r.t::text, v_rows);
    end if;
  end loop;

  return jsonb_build_object(
    'format', 'matchmate-mis-datos',
    'version', 1,
    'generatedAt', private.iso(now()),
    'account', (
      select jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'name', p.name,
        'createdAt', private.iso(p.created_at),
        'adultConfirmedAt', private.iso(p.adult_confirmed_at),
        'lastSeenAt', private.iso(p.last_seen_at),
        'superadmin', p.is_superadmin,
        'blockedAt', private.iso(p.blocked_at),
        'blockedReason', p.blocked_reason,
        'bowlingxId', p.firebase_uid,
        'username', p.username,
        'pushPrefs', p.push_prefs,
        'uiMode', p.ui_mode,
        'featuredBadges', to_jsonb(p.featured_badges),
        'provider', nullif(a.raw_app_meta_data ->> 'provider', ''),
        'emailConfirmedAt', private.iso(a.email_confirmed_at),
        'lastSignInAt', private.iso(a.last_sign_in_at))
        from public.profiles p left join auth.users a on a.id = p.id
       where p.id = v_uid),
    'leagues', coalesce((
      select jsonb_agg(jsonb_build_object(
               'leagueId', m.league_id, 'name', l.name, 'sport', l.sport, 'kind', l.kind, 'visibility', l.visibility,
               'role', m.role, 'scorer', m.is_scorer, 'displayName', m.display_name, 'joinedAt', private.iso(m.joined_at),
               'badgesAuto', l.badges_auto)
               order by m.joined_at, m.league_id)
        from public.league_members m join public.leagues l on l.id = m.league_id
       where m.user_id = v_uid), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'leagueId', p.league_id, 'leagueName', l.name, 'name', p.name,
               'averageOverride', p.average_override, 'attrs', p.attrs, 'createdAt', private.iso(p.created_at))
               order by p.created_at, p.id)
        from public.players p join public.leagues l on l.id = p.league_id
       where p.id = any (v_players)), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'leagueId', m.league_id, 'eventId', m.event_id, 'scheduledAt', private.iso(m.scheduled_at),
               'status', m.status, 'format', m.format, 'score', m.score, 'winnerSide', m.winner_side,
               'side', mp.side, 'playerId', mp.player_id)
               order by m.scheduled_at nulls last, m.id)
        from public.match_players mp join public.matches m on m.id = mp.match_id
       where mp.player_id = any (v_players)), '[]'::jsonb),
    'tables', v_tables,
    'daysSeen', coalesce((
      select jsonb_agg(to_char(s.day, 'YYYY-MM-DD') order by s.day) from private.daily_seen s where s.user_id = v_uid), '[]'::jsonb),
    'scanUsage', coalesce((
      select jsonb_agg(jsonb_build_object('day', to_char(s.day, 'YYYY-MM-DD'), 'photos', s.n) order by s.day)
        from private.scan_usage s where s.user_id = v_uid), '[]'::jsonb),
    'badgeReports', private.my_badge_reports(v_uid),
    'truncated', to_jsonb(v_truncated));
end $$;

-- =====================================================================
-- Permisos: set_ui_mode solo con sesión (export_my_data conserva los suyos: se dejan igual para asegurarlo)
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['set_ui_mode', 'export_my_data'];
begin
  for f in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = any (v_rpc) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
