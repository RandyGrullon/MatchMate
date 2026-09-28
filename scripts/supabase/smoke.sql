begin;

-- =====================================================================================================================
-- MatchMate · Prueba de humo de la base REAL de Supabase. NO GUARDA NADA: todo va en esta transacción y el archivo
-- termina en ROLLBACK (no hay ningún COMMIT). Cómo correrla y qué esperar: scripts/supabase/README.md.
--
-- Crea sus propias cuentas de prueba (auth.users, correos smoke-<uuid>@example.invalid; el perfil lo crea el trigger)
-- y actúa como cada una bajo la RLS, igual que PostgREST y tests/sql/harness.ts: set local role authenticated (o anon)
-- + request.jwt.claims, y reset role entre pasos. Cada paso es un bloque DO con ASSERT; cada acierto deja un NOTICE
-- «OK <paso>» y el resumen del final los lista. El primer fallo corta todo con «FAIL <paso>: …».
--
-- Recorre: boliche de punta a punta (liga, código, unirse, práctica y torneo con equipos, save_game,
-- add_practice_game, en vivo, envíos sin foto, aprobar y rechazar, lo que lee el ranking), pádel (partidos, resultado
-- de un lado, confirmación del rival, reclamo y resolución), fútbol (equipo de temporada y plantilla), golf y
-- natación (lo mínimo), league_announce, bloqueo de cuentas, la consola del superadmin y los permisos que TIENEN
-- que fallar (alguien de fuera leyendo una liga privada, un miembro llamando admin_*, escrituras sin cuenta).
--
-- Efectos de afuera: ninguno. pg_net solo manda sus pedidos después de un COMMIT y realtime.send escribe en
-- realtime.messages (también se deshace). Lo único que no vuelve atrás son las secuencias (ids de push_outbox,
-- tombstones, admin_audit): quedan huecos en la numeración, nada más.
-- =====================================================================================================================

set local plpgsql.check_asserts = on;
-- No esperar detrás de la app en vivo: si algo está bloqueado más de 10 s, mejor fallar.
set local lock_timeout = '10s';

-- ---------- Ayudas (en pg_temp: solo existen en esta sesión y el ROLLBACK las quita) ----------

-- Todo tiene que correr en UNA transacción. Si un cliente mandara las sentencias por separado (cada una con su
-- COMMIT), esto corta antes de crear la primera cuenta.
create function pg_temp.guard() returns void language plpgsql as $$
begin
  if coalesce(current_setting('smoke.tx', true), '') is distinct from txid_current()::text then
    raise exception 'SMOKE ABORTADO: no corre dentro de una sola transacción (el cliente partió el archivo). No se escribió nada.';
  end if;
end $$;

create function pg_temp.put(p_key text, p_value text) returns void language plpgsql as $$
begin
  perform set_config('smoke.' || p_key, coalesce(p_value, ''), true);
end $$;

create function pg_temp.val(p_key text) returns text language plpgsql as $$
declare
  v text := current_setting('smoke.' || p_key, true);
begin
  if coalesce(v, '') = '' then
    raise exception 'SMOKE: falta el dato smoke.% (falló un paso anterior)', p_key;
  end if;
  return v;
end $$;

create function pg_temp.id(p_key text) returns uuid language plpgsql as $$
begin
  return pg_temp.val(p_key)::uuid;
end $$;

-- Claims del JWT de una cuenta de prueba (lo que PostgREST deja en request.jwt.claims).
create function pg_temp.jwt(p_user text) returns text language plpgsql as $$
begin
  return json_build_object('sub', pg_temp.id('u_' || p_user), 'role', 'authenticated')::text;
end $$;

create function pg_temp.ok(p_step text) returns void language plpgsql as $$
begin
  perform pg_temp.guard();
  perform set_config('smoke.log', coalesce(current_setting('smoke.log', true), '') || p_step || E'\n', true);
  raise notice 'OK %', p_step;
end $$;

-- Lo que TIENE que fallar: corre p_sql (como el rol de ese momento, en un subtransacción que se deshace) y exige
-- uno de los errores esperados (SQLSTATE, p. ej. '42501', o el mensaje corto de la RPC, p. ej. 'no_permitido').
create function pg_temp.must_fail(p_step text, p_sql text, p_expect text[]) returns void language plpgsql as $$
declare
  v_state text;
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    assert v_state = any (p_expect) or v_msg = any (p_expect),
      format('FAIL %s: esperaba %s y llegó %s «%s»', p_step, p_expect, v_state, v_msg);
    perform pg_temp.ok(format('%s [falla como debe: %s]', p_step, v_msg));
    return;
  end;
  raise exception 'FAIL %: tenía que fallar y pasó (%)', p_step, p_sql;
end $$;

grant execute on function pg_temp.guard(), pg_temp.put(text, text), pg_temp.val(text), pg_temp.id(text), pg_temp.ok(text),
  pg_temp.must_fail(text, text, text[]) to anon, authenticated;

do $$
begin
  perform set_config('smoke.tx', txid_current()::text, true);
  perform set_config('smoke.log', '', true);
end $$;

-- =====================================================================================================================
-- 0. Previo (como quien corre el archivo)
-- =====================================================================================================================
do $$
declare
  -- Las migraciones de supabase/migrations al escribir esta prueba (si se agrega una, se suma aquí).
  v_expected text[] := array[
    '20260926000100', '20260926000200', '20260926000300', '20260926000400', '20260926000500', '20260926000600',
    '20260926000700', '20260926001000', '20260926001100', '20260926001200', '20260926001300', '20260927000100',
    '20260927000400', '20260927000500', '20260927000600', '20260927000690', '20260927000700', '20260927000790',
    '20260927000800', '20260927000900', '20260927001100', '20260927001190', '20260927001200', '20260927001290',
    '20260927001300', '20260927001400', '20260927001500', '20260928000100', '20260928000200'];
  v_missing text[];
  v_bowling text;
begin
  perform pg_temp.guard();
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    begin
      execute 'select coalesce(array_agg(v order by v), ''{}'') from unnest($1::text[]) v
                where v not in (select m.version from supabase_migrations.schema_migrations m)'
        into v_missing using v_expected;
    exception when insufficient_privilege then
      v_missing := null;
    end;
    if v_missing is null then
      perform pg_temp.ok('previo: no se pudo leer supabase_migrations (sin permiso); se sigue con lo demás');
    else
      assert cardinality(v_missing) = 0, format('FAIL previo: faltan migraciones en la base: %s', v_missing);
      perform pg_temp.ok(format('previo: las %s migraciones del repo están aplicadas', cardinality(v_expected)));
    end if;
  else
    perform pg_temp.ok('previo: base local (sin supabase_migrations); no se revisan migraciones');
  end if;
  select s.status into v_bowling from public.sport_status s where s.id = 'bowling';
  assert v_bowling = 'open', format('FAIL previo: el boliche no está abierto (%s): nadie podría crear su liga', v_bowling);
  perform pg_temp.ok('previo: deportes ' || (select string_agg(s.id || '=' || s.status, ', ' order by s.sort_order) from public.sport_status s));
  perform pg_temp.ok(case when to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null
                          then 'previo: Supabase (realtime.send y pg_net se deshacen con el ROLLBACK)'
                          else 'previo: base local (PGlite)' end);
end $$;

-- =====================================================================================================================
-- 1. Cuentas de prueba (como quien corre el archivo: auth.users como lo hace GoTrue; el trigger crea el perfil)
-- =====================================================================================================================
do $$
declare
  v_name text;
  v_id uuid;
  v_tag text := left(replace(gen_random_uuid()::text, '-', ''), 8);
begin
  perform pg_temp.guard();
  perform pg_temp.put('tag', v_tag);
  foreach v_name in array array['owner', 'ana', 'luis', 'beto', 'out', 'super'] loop
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', 'smoke-' || v_id || '@example.invalid',
            '{"provider": "email", "providers": ["email"]}',
            jsonb_build_object('name', 'Smoke ' || initcap(v_name) || ' ' || v_tag, 'adult', true), now(), now(), '', '', '', '');
    assert exists (select 1 from public.profiles p
                    where p.id = v_id and p.email = 'smoke-' || v_id || '@example.invalid'
                      and p.name = 'Smoke ' || initcap(v_name) || ' ' || v_tag and p.adult_confirmed_at is not null
                      and not p.is_superadmin and p.blocked_at is null),
      format('FAIL cuentas: el trigger no creó bien el perfil de %s', v_name);
    perform pg_temp.put('u_' || v_name, v_id::text);
  end loop;
  -- El superadmin se siembra por SQL (como en producción).
  update public.profiles set is_superadmin = true where id = pg_temp.id('u_super');
  assert (select p.is_superadmin from public.profiles p where p.id = pg_temp.id('u_super')), 'FAIL cuentas: superadmin';
  perform pg_temp.ok(format('cuentas: 6 cuentas de prueba (tag %s) con su perfil por trigger y un superadmin', v_tag));
end $$;

-- =====================================================================================================================
-- 2. Boliche de punta a punta
-- =====================================================================================================================

-- 2.1 El dueño (cuenta normal) crea la liga privada.
select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  r jsonb;
  v_league uuid;
  v_code text;
  v_guest uuid;
begin
  r := public.create_league(p_name => 'Smoke Boliche ' || pg_temp.val('tag'), p_visibility => 'private', p_sport => 'bowling',
                            p_venue => 'Bolera Smoke', p_schedule => 'Martes 7:00 pm', p_season_start => current_date - 30,
                            p_season_end => current_date + 180, p_contact_name => 'Smoke', p_contact_phone => '18095550000',
                            p_require_photo => false);
  v_league := (r ->> 'league_id')::uuid;
  v_code := r ->> 'invite_code';
  assert v_code ~ '^[A-HJ-NP-Z2-9]{8}$', format('FAIL boliche: código de invitación raro (%s)', v_code);
  assert (select count(*) from public.leagues l
           where l.id = v_league and l.owner_id = pg_temp.id('u_owner') and l.sport = 'bowling' and l.visibility = 'private') = 1,
    'FAIL boliche: el dueño no ve su liga';
  assert (select s.invite_code from public.league_secrets s where s.league_id = v_league) = v_code, 'FAIL boliche: el dueño no ve el código';
  assert (select m.role = 'owner' and m.player_id = (r ->> 'player_id')::uuid
            from public.memberships m where m.league_id = v_league and m.user_id = pg_temp.id('u_owner')),
    'FAIL boliche: membresía del dueño con su jugador';
  v_guest := public.create_player(p_league => v_league, p_name => 'Smoke Invitado');
  perform pg_temp.put('bowl', v_league::text);
  perform pg_temp.put('bowl_code', v_code);
  perform pg_temp.put('bowl_p_owner', r ->> 'player_id');
  perform pg_temp.put('bowl_p_guest', v_guest::text);
  perform pg_temp.ok('boliche: el dueño crea la liga privada (código, membresía y su jugador) y un jugador sin cuenta');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 2.2 Ana ve la invitación y se une con el código.
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  v_league uuid := pg_temp.id('bowl');
  v_code text := pg_temp.val('bowl_code');
  d jsonb;
  r jsonb;
begin
  assert (select count(*) from public.invite_preview(p_code => v_code) x where x.league_id = v_league and x.sport = 'bowling') = 1,
    'FAIL boliche: invite_preview';
  d := public.invite_details(p_code => v_code);
  assert (d ->> 'leagueId')::uuid = v_league and not (d ->> 'member')::boolean
     and (d -> 'players') @> jsonb_build_array(jsonb_build_object('id', pg_temp.id('bowl_p_guest'), 'name', 'Smoke Invitado')),
    format('FAIL boliche: invite_details %s', d);
  assert (select count(*) from public.leagues l where l.id = v_league) = 0, 'FAIL boliche: Ana ve la liga privada antes de unirse';
  r := public.join_league(p_code => lower(v_code));
  assert (r ->> 'league_id')::uuid = v_league and r ->> 'player_id' is not null, format('FAIL boliche: join_league %s', r);
  assert public.join_league(p_code => v_code) = r, 'FAIL boliche: unirse otra vez no es idempotente';
  assert (select count(*) from public.leagues l where l.id = v_league) = 1, 'FAIL boliche: Ana no ve la liga después de unirse';
  assert (select m.role = 'member' and m.player_id = (r ->> 'player_id')::uuid
            from public.memberships m where m.league_id = v_league and m.user_id = pg_temp.id('u_ana')),
    'FAIL boliche: membresía de Ana con su jugador';
  assert (select count(*) from public.league_secrets s where s.league_id = v_league) = 0, 'FAIL boliche: un miembro ve el código';
  perform pg_temp.put('bowl_p_ana', r ->> 'player_id');
  -- Su teléfono con avisos (para league_announce más abajo).
  perform public.upsert_push_subscription(p_endpoint => 'https://fcm.googleapis.com/fcm/send/smoke-' || gen_random_uuid(),
                                          p_p256dh => 'smoke-p256dh', p_auth => 'smoke-auth', p_ua => 'smoke');
  perform pg_temp.ok('boliche: Ana ve la invitación (preview y detalles) y se une con el código; queda con su jugador');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 2.3 Luis prueba un código malo y se une con el bueno.
select set_config('request.jwt.claims', pg_temp.jwt('luis'), true);
set local role authenticated;
do $$
declare
  r jsonb;
begin
  assert public.join_league(p_code => 'ZZZZZZZZ') is null, 'FAIL boliche: un código malo no devuelve null';
  r := public.join_league(p_code => pg_temp.val('bowl_code'));
  assert (r ->> 'league_id')::uuid = pg_temp.id('bowl'), 'FAIL boliche: Luis no se une';
  perform pg_temp.put('bowl_p_luis', r ->> 'player_id');
  perform pg_temp.ok('boliche: Luis (código malo = null) se une con el bueno');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 2.4 Alguien de fuera no ve nada de la liga privada ni entra sin código.
select set_config('request.jwt.claims', pg_temp.jwt('out'), true);
set local role authenticated;
do $$
declare
  v_league uuid := pg_temp.id('bowl');
begin
  assert (select count(*) from public.leagues where id = v_league) = 0, 'FAIL permisos: alguien de fuera ve la liga privada';
  assert (select count(*) from public.players where league_id = v_league) = 0, 'FAIL permisos: alguien de fuera ve los jugadores';
  assert (select count(*) from public.league_members where league_id = v_league) = 0, 'FAIL permisos: alguien de fuera ve los miembros';
  assert (select count(*) from public.memberships where league_id = v_league) = 0, 'FAIL permisos: alguien de fuera ve memberships';
  assert (select count(*) from public.league_secrets where league_id = v_league) = 0, 'FAIL permisos: alguien de fuera ve el código';
  perform pg_temp.ok('permisos: alguien de fuera no ve la liga privada (ni jugadores, miembros ni código)');
  perform pg_temp.must_fail('permisos: alguien de fuera no entra a una liga privada sin código',
    format('select public.join_league(p_league => %L)', v_league), array['no_permitido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 2.5 El dueño arma la práctica y el torneo con equipos y anota juegos.
select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  v_league uuid := pg_temp.id('bowl');
  v_prac uuid;
  v_tour uuid;
  v_teams uuid[];
  e_owner uuid;
  e_ana uuid;
  e_luis uuid;
  e_guest uuid;
begin
  v_prac := public.create_event(p_league => v_league, p_type => 'practica', p_date => current_date, p_games => 3);
  v_tour := public.create_event(p_league => v_league, p_type => 'torneo', p_date => current_date + 7, p_name => 'Smoke Copa',
                                p_games => 3, p_hcp_base => 230, p_hcp_percent => 80, p_individual_rank_by => 'hcp',
                                p_team_rank_by => 'scratch', p_category_cuts => array[200, 175, 160], p_team_size => 2);
  assert public.add_entries(p_event => v_tour, p_players => jsonb_build_array(
           jsonb_build_object('player_id', pg_temp.id('bowl_p_owner'), 'average', 180),
           jsonb_build_object('player_id', pg_temp.id('bowl_p_ana'), 'average', 170),
           jsonb_build_object('player_id', pg_temp.id('bowl_p_luis'), 'average', 160),
           jsonb_build_object('player_id', pg_temp.id('bowl_p_guest'), 'average', 150))) = 4,
    'FAIL boliche: add_entries';
  assert (select e.player_count from public.events e where e.id = v_tour) = 4, 'FAIL boliche: player_count del torneo';
  select x.id into e_owner from public.entries x where x.event_id = v_tour and x.player_id = pg_temp.id('bowl_p_owner');
  select x.id into e_ana from public.entries x where x.event_id = v_tour and x.player_id = pg_temp.id('bowl_p_ana');
  select x.id into e_luis from public.entries x where x.event_id = v_tour and x.player_id = pg_temp.id('bowl_p_luis');
  select x.id into e_guest from public.entries x where x.event_id = v_tour and x.player_id = pg_temp.id('bowl_p_guest');
  v_teams := public.apply_teams(p_event => v_tour, p_groups => jsonb_build_array(
    jsonb_build_object('name', 'Smoke A', 'entry_ids', jsonb_build_array(e_owner, e_ana)),
    jsonb_build_object('name', 'Smoke B', 'entry_ids', jsonb_build_array(e_luis, e_guest))));
  assert cardinality(v_teams) = 2
     and (select count(*) from public.entries x where x.event_id = v_tour and x.team_id = v_teams[1]) = 2
     and (select count(*) from public.entries x where x.event_id = v_tour and x.team_id = v_teams[2]) = 2,
    'FAIL boliche: apply_teams';
  perform public.save_game(p_entry => e_owner, p_game => 0, p_score => 200, p_op_id => gen_random_uuid());
  perform public.save_game(p_entry => e_owner, p_game => 1, p_score => 210);
  perform public.save_game(p_entry => e_guest, p_game => 0, p_score => 150);
  assert (select x.scores is not distinct from array[200, 210, null]::smallint[]
             and x.photos is not distinct from array['sin-foto', 'sin-foto', null]::text[]
            from public.entries x where x.id = e_owner),
    'FAIL boliche: save_game (sin foto obligatoria el juego cuenta de una)';
  perform pg_temp.put('bowl_prac', v_prac::text);
  perform pg_temp.put('bowl_tour', v_tour::text);
  perform pg_temp.put('bowl_e_owner', e_owner::text);
  perform pg_temp.ok('boliche: práctica y torneo (handicap, categorías), 4 inscritos, 2 equipos y save_game del admin');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 2.6 Ana: «voy», suma un juego a la práctica, publica en vivo y envía sus juegos sin foto.
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  v_league uuid := pg_temp.id('bowl');
  v_prac uuid := pg_temp.id('bowl_prac');
  v_tour uuid := pg_temp.id('bowl_tour');
  v_me uuid := pg_temp.id('bowl_p_ana');
  v_op uuid := gen_random_uuid();
  v_sub uuid;
  v_sub_date uuid;
begin
  perform public.set_rsvp(p_event => v_tour, p_going => true, p_op_id => gen_random_uuid());
  assert (select count(*) from public.event_rsvps r where r.event_id = v_tour and r.player_id = v_me and r.going) = 1, 'FAIL boliche: set_rsvp';
  assert public.add_practice_game(p_event => v_prac, p_expected => 3) = 4, 'FAIL boliche: add_practice_game';
  assert public.add_practice_game(p_event => v_prac, p_expected => 3) = 4, 'FAIL boliche: add_practice_game sumó dos veces';
  perform public.publish_live(p_event => v_prac, p_scores => '[180, 190]');
  assert (select s.state -> 'scores' from public.live_states s where s.event_id = v_prac and s.player_id = v_me) = '[180, 190]'::jsonb,
    'FAIL boliche: publish_live';
  v_sub := public.submit_games(p_op_id => v_op, p_league => v_league, p_scores => '[180, 190, 200, 210]', p_event => v_prac);
  assert public.submit_games(p_op_id => v_op, p_league => v_league, p_scores => '[180, 190, 200, 210]', p_event => v_prac) = v_sub,
    'FAIL boliche: reintentar submit_games con el mismo op_id no devuelve el mismo envío';
  assert not exists (select 1 from public.live_states s where s.event_id = v_prac and s.player_id = v_me),
    'FAIL boliche: lo enviado no salió de «en vivo»';
  v_sub_date := public.submit_games(p_op_id => gen_random_uuid(), p_league => v_league, p_scores => '[150, 160, 170]',
                                    p_date => current_date - 1);
  assert (select count(*) from public.submissions s
           where s.league_id = v_league and s.player_id = v_me and s.status = 'pendiente' and s.photo_id is null) = 2,
    'FAIL boliche: los 2 envíos sin foto de Ana';
  perform pg_temp.put('bowl_sub_ana', v_sub::text);
  perform pg_temp.put('bowl_sub_date', v_sub_date::text);
  perform pg_temp.ok('boliche: Ana marca «voy», suma un juego a la práctica (una sola vez), publica en vivo y envía sin foto (por evento y por fecha, idempotente)');

  perform pg_temp.must_fail('permisos: un miembro no aprueba envíos',
    format('select public.approve_submission(p_submission => %L, p_values => %L)', v_sub, '{"0": 300}'), array['no_permitido']);
  perform pg_temp.must_fail('permisos: un miembro no crea eventos',
    format('select public.create_event(p_league => %L, p_type => %L, p_date => current_date)', v_league, 'practica'), array['no_permitido']);
  perform pg_temp.must_fail('permisos: un miembro no anota juegos (liga, no torneo sin liga)',
    format('select public.save_game(p_entry => %L, p_game => 0, p_score => 300)', pg_temp.id('bowl_e_owner')), array['no_permitido']);
  perform pg_temp.must_fail('permisos: un miembro no renueva el código',
    format('select public.renew_invite_code(p_league => %L)', v_league), array['no_permitido']);
  perform pg_temp.must_fail('permisos: un miembro no manda avisos a la liga',
    format('select public.league_announce(p_league => %L, p_body => %L)', v_league, 'hola'), array['no_permitido']);
  perform pg_temp.must_fail('permisos: un miembro no borra la liga',
    format('select public.delete_league(p_league => %L)', v_league), array['no_permitido']);
  perform pg_temp.must_fail('permisos: nadie escribe directo en las tablas (insert)',
    format('insert into public.entries (league_id, event_id, player_id) values (%L, %L, %L)', v_league, v_prac, v_me), array['42501']);
  perform pg_temp.must_fail('permisos: nadie escribe directo en las tablas (update)',
    format('update public.leagues set name = %L where id = %L', 'hack', v_league), array['42501']);
  perform pg_temp.must_fail('permisos: nadie escribe directo en las tablas (delete)',
    format('delete from public.submissions where id = %L', v_sub), array['42501']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 2.7 Luis envía algo que se va a rechazar y felicita al dueño.
select set_config('request.jwt.claims', pg_temp.jwt('luis'), true);
set local role authenticated;
do $$
declare
  v_sub uuid;
begin
  v_sub := public.submit_games(p_op_id => gen_random_uuid(), p_league => pg_temp.id('bowl'), p_scores => '[100, 120, 130]',
                               p_event => pg_temp.id('bowl_prac'));
  perform pg_temp.put('bowl_sub_luis', v_sub::text);
  perform public.set_reaction(p_entry => pg_temp.id('bowl_e_owner'), p_type => 'felicitar');
  perform public.add_comment(p_entry => pg_temp.id('bowl_e_owner'), p_text => 'Smoke: ¡buen juego!');
  perform pg_temp.ok('boliche: Luis envía sus juegos, felicita y comenta el juego del dueño');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 2.8 El dueño revisa: aprueba (por evento y por fecha), rechaza y manda un aviso a la liga.
select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  v_league uuid := pg_temp.id('bowl');
  v_prac uuid := pg_temp.id('bowl_prac');
  r jsonb;
  d jsonb;
begin
  -- Lo que lee la portada del admin (feeds.ts): envíos pendientes de la liga.
  assert (select count(*) from public.submissions s where s.league_id = v_league and s.status = 'pendiente') = 3,
    'FAIL boliche: el admin no ve los 3 envíos pendientes';
  r := public.approve_submission(p_submission => pg_temp.id('bowl_sub_ana'), p_values => '{"0": 180, "1": 190, "2": 200, "3": 210}');
  assert (r ->> 'event_id')::uuid = v_prac, 'FAIL boliche: aprobado en otro evento';
  assert (select x.scores is not distinct from array[180, 190, 200, 210]::smallint[]
             and x.photos is not distinct from array['sin-foto', 'sin-foto', 'sin-foto', 'sin-foto']::text[]
            from public.entries x where x.id = (r ->> 'entry_id')::uuid and x.player_id = pg_temp.id('bowl_p_ana')),
    'FAIL boliche: los juegos aprobados no quedaron verificados (sin-foto)';
  r := public.approve_submission(p_submission => pg_temp.id('bowl_sub_date'), p_values => '{"0": 150, "1": 160, "2": 170}', p_average => 170);
  assert (select e.type = 'practica' and e.date = current_date - 1 and e.games = 3 from public.events e where e.id = (r ->> 'event_id')::uuid),
    'FAIL boliche: aprobar un envío por fecha no creó la práctica de ese día';
  perform pg_temp.put('bowl_prac_date', r ->> 'event_id');
  perform public.reject_submission(p_submission => pg_temp.id('bowl_sub_luis'), p_note => 'Smoke: foto borrosa');
  assert (select string_agg(s.status, ',' order by s.status) from public.submissions s where s.league_id = v_league) = 'aprobado,aprobado,rechazado',
    'FAIL boliche: estados de los envíos';
  perform pg_temp.ok('boliche: el dueño aprueba (evento y fecha: crea la práctica), rechaza con nota');

  assert public.league_announce(p_league => v_league, p_body => 'Smoke: el martes se juega a las 7') = 1,
    'FAIL avisos: league_announce no llegó a la única cuenta con avisos (Ana)';
  d := public.league_announce_reach(p_league => v_league);
  assert (d ->> 'members')::integer = 3 and (d ->> 'reach')::integer = 1 and (d ->> 'sentToday')::integer = 1,
    format('FAIL avisos: league_announce_reach %s', d);
  perform pg_temp.ok('avisos: league_announce del dueño (1 cuenta con avisos) y league_announce_reach');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 2.9 La cola de push quedó con el aviso para el teléfono de Ana (como quien corre el archivo; nadie de la app la lee).
do $$
begin
  assert (select count(*) from public.push_outbox o
           where o.user_id = pg_temp.id('u_ana') and o.tag like 'aviso:%' and o.subscription_id is not null and o.urgency = 'high') = 1,
    'FAIL avisos: el aviso no quedó en push_outbox para el teléfono de Ana';
  perform pg_temp.ok('avisos: el aviso quedó en push_outbox, repartido al teléfono (pg_net solo lo mandaría con COMMIT)');
end $$;

-- 2.10 Luis ve el ranking: las mismas lecturas que hace la app (events.ts, entries.ts, players.ts, members.ts, feeds.ts).
select set_config('request.jwt.claims', pg_temp.jwt('luis'), true);
set local role authenticated;
do $$
declare
  v_league uuid := pg_temp.id('bowl');
  v_tour uuid := pg_temp.id('bowl_tour');
  v_games integer;
  v_total integer;
  v_first uuid;
begin
  assert (select count(*) from (select * from public.events where league_id = v_league order by date desc) x) = 3,
    'FAIL ranking: eventos de la liga';
  assert (select count(*) from (select id, event_id, name, sort_order, color from public.teams where league_id = v_league) x) = 2,
    'FAIL ranking: equipos';
  assert (select count(*) from (select event_id, player_id, going from public.event_rsvps where league_id = v_league) x) = 1,
    'FAIL ranking: «voy»';
  assert (select count(*) from (select * from public.players where league_id = v_league order by name) x) = 4, 'FAIL ranking: jugadores';
  assert (select count(*) from (select league_id, user_id, role, is_scorer, display_name, player_id from public.memberships
                                 where league_id = v_league order by display_name) x) = 3, 'FAIL ranking: miembros';
  assert (select count(*) from public.entries where league_id = v_league) = 6, 'FAIL ranking: participaciones';
  -- Promedio de Ana con sus juegos verificados (los que tienen marca de foto): 180+190+200+210+150+160+170 = 1260 / 7.
  select count(*), sum(g.s) into v_games, v_total
    from public.entries e cross join lateral unnest(e.scores, e.photos) as g (s, ph)
   where e.league_id = v_league and e.player_id = pg_temp.id('bowl_p_ana') and g.s is not null and g.ph is not null;
  assert v_games = 7 and v_total = 1260, format('FAIL ranking: Ana tiene %s juegos y %s pinos verificados (esperaba 7 y 1260)', v_games, v_total);
  -- Torneo (scratch): el dueño va primero con 410.
  select x.player_id into v_first
    from (select e.player_id, sum(g.s) as t
            from public.entries e cross join lateral unnest(e.scores, e.photos) as g (s, ph)
           where e.event_id = v_tour and g.ph is not null
           group by e.player_id order by t desc) x
   limit 1;
  assert v_first = pg_temp.id('bowl_p_owner'), 'FAIL ranking: el primero del torneo';
  assert (select count(*) from public.reactions where league_id = v_league) = 1
     and (select count(*) from public.comments where league_id = v_league) = 1, 'FAIL ranking: me gusta y comentarios';
  assert (select s.status = 'rechazado' and s.note = 'Smoke: foto borrosa' from public.submissions s
           where s.league_id = v_league and s.player_id = pg_temp.id('bowl_p_luis')), 'FAIL ranking: Luis no ve su envío rechazado con la nota';
  assert (select count(*) from public.league_announcements a where a.league_id = v_league) = 1, 'FAIL ranking: el aviso no sale en la portada';
  assert (select count(*) from public.submissions s where s.league_id = v_league and s.status = 'pendiente') = 0, 'FAIL ranking: quedaron pendientes';
  perform pg_temp.ok('ranking: un miembro lee eventos, equipos, «voy», jugadores, miembros, juegos (Ana 7 juegos = 180 de promedio), social y avisos');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 2.11 Ana: sus ligas y su promedio global (members.ts: memberships por cuenta) y sus datos.
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  v_avg numeric;
  d jsonb;
begin
  select round(avg(g.s), 2) into v_avg
    from public.memberships m
    join public.entries e on e.player_id = m.player_id
    cross join lateral unnest(e.scores, e.photos) as g (s, ph)
   where m.user_id = pg_temp.id('u_ana') and g.s is not null and g.ph is not null;
  assert v_avg = 180, format('FAIL ranking: promedio global de Ana %s (esperaba 180)', v_avg);
  d := public.export_my_data();
  assert d ->> 'format' = 'matchmate-mis-datos' and (d -> 'account' ->> 'id')::uuid = pg_temp.id('u_ana'), 'FAIL cuenta: export_my_data';
  perform pg_temp.ok('ranking: promedio global de Ana por sus membresías = 180; export_my_data');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- 3. Ligas de otros deportes (en beta solo las crea el superadmin)
-- =====================================================================================================================
select set_config('request.jwt.claims', pg_temp.jwt('super'), true);
set local role authenticated;
do $$
declare
  v_sport text;
  r jsonb;
  v_tag text := pg_temp.val('tag');
begin
  foreach v_sport in array array['padel', 'football', 'golf', 'swimming'] loop
    if (select s.status from public.sport_status s where s.id = v_sport) = 'closed' then
      perform public.set_sport_status(p_sport => v_sport, p_status => 'beta');
      raise notice 'AVISO: % estaba cerrado; se pone en beta solo dentro de esta prueba (el ROLLBACK lo deja como estaba)', v_sport;
    end if;
  end loop;
  r := public.create_league(p_name => 'Smoke Pádel ' || v_tag, p_sport => 'padel', p_rules => '{"match": {"sport": "padel", "deuce": "golden"}}');
  perform pg_temp.put('padel', r ->> 'league_id');
  perform pg_temp.put('padel_code', r ->> 'invite_code');
  r := public.create_league(p_name => 'Smoke Fútbol ' || v_tag, p_sport => 'football');
  perform pg_temp.put('foot', r ->> 'league_id');
  perform pg_temp.put('foot_code', r ->> 'invite_code');
  r := public.create_league(p_name => 'Smoke Golf ' || v_tag, p_sport => 'golf');
  perform pg_temp.put('golf', r ->> 'league_id');
  perform pg_temp.put('golf_code', r ->> 'invite_code');
  r := public.create_league(p_name => 'Smoke Natación ' || v_tag, p_sport => 'swimming');
  perform pg_temp.put('swim', r ->> 'league_id');
  perform pg_temp.put('swim_code', r ->> 'invite_code');
  assert (select count(*) from public.leagues l where l.owner_id = pg_temp.id('u_super') and l.name like 'Smoke % ' || v_tag) = 4,
    'FAIL deportes: el superadmin no ve sus 4 ligas';
  perform pg_temp.ok('deportes: el superadmin crea ligas privadas de pádel, fútbol, golf y natación');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 3.1 Cada cuenta se une con el código a las ligas donde juega.
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  k text;
  r jsonb;
begin
  foreach k in array array['padel', 'foot', 'golf', 'swim'] loop
    r := public.join_league(p_code => pg_temp.val(k || '_code'));
    assert (r ->> 'league_id')::uuid = pg_temp.id(k) and r ->> 'player_id' is not null, format('FAIL deportes: Ana no se une a %s', k);
    perform pg_temp.put(k || '_p_ana', r ->> 'player_id');
  end loop;
  perform pg_temp.ok('deportes: Ana se une a pádel, fútbol, golf y natación');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  r jsonb := public.join_league(p_code => pg_temp.val('padel_code'));
begin
  assert (r ->> 'league_id')::uuid = pg_temp.id('padel'), 'FAIL deportes: el dueño del boliche no se une al pádel';
  perform pg_temp.put('padel_p_owner', r ->> 'player_id');
  perform pg_temp.ok('deportes: el dueño del boliche se une al pádel');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('beto'), true);
set local role authenticated;
do $$
declare
  k text;
  r jsonb;
begin
  foreach k in array array['padel', 'foot'] loop
    r := public.join_league(p_code => pg_temp.val(k || '_code'));
    assert (r ->> 'league_id')::uuid = pg_temp.id(k), format('FAIL deportes: Beto no se une a %s', k);
    perform pg_temp.put(k || '_p_beto', r ->> 'player_id');
  end loop;
  perform pg_temp.ok('deportes: Beto se une a pádel y fútbol');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('luis'), true);
set local role authenticated;
do $$
declare
  k text;
  r jsonb;
begin
  foreach k in array array['padel', 'foot'] loop
    r := public.join_league(p_code => pg_temp.val(k || '_code'));
    assert (r ->> 'league_id')::uuid = pg_temp.id(k), format('FAIL deportes: Luis no se une a %s', k);
    perform pg_temp.put(k || '_p_luis', r ->> 'player_id');
  end loop;
  perform pg_temp.ok('deportes: Luis se une a pádel y fútbol');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- 4. Pádel: partidos, resultado de un lado, confirmación del rival, reclamo y resolución del admin
-- =====================================================================================================================
select set_config('request.jwt.claims', pg_temp.jwt('super'), true);
set local role authenticated;
do $$
declare
  v_league uuid := pg_temp.id('padel');
  v_sides jsonb;
  v_ids uuid[];
begin
  v_sides := jsonb_build_array(
    jsonb_build_object('side', 1, 'players', jsonb_build_array(
      jsonb_build_object('player_id', pg_temp.id('padel_p_ana'), 'position', 'drive'),
      jsonb_build_object('player_id', pg_temp.id('padel_p_owner'), 'position', 'reves'))),
    jsonb_build_object('side', 2, 'players', jsonb_build_array(
      jsonb_build_object('player_id', pg_temp.id('padel_p_beto')),
      jsonb_build_object('player_id', pg_temp.id('padel_p_luis')))));
  v_ids := public.create_matches(p_league => v_league, p_matches => jsonb_build_array(
    jsonb_build_object('format', 'sets', 'round', 1, 'court', 'Cancha Smoke 1', 'scheduled_at', now() + interval '1 day', 'sides', v_sides),
    jsonb_build_object('format', 'sets', 'round', 2, 'court', 'Cancha Smoke 2', 'scheduled_at', now() + interval '2 days', 'sides', v_sides)));
  assert cardinality(v_ids) = 2, 'FAIL pádel: create_matches';
  assert (select count(*) from public.match_players mp where mp.match_id = any (v_ids)) = 8
     and (select count(*) from public.match_sides ms where ms.match_id = any (v_ids) and ms.label like 'Smoke % / Smoke %') = 4,
    'FAIL pádel: lados y jugadores de los partidos';
  assert (select bool_and(m.status = 'scheduled' and m.require_confirm and m.rules -> 'match' ->> 'deuce' = 'golden')
            from public.matches m where m.id = any (v_ids)), 'FAIL pádel: estado o reglas copiadas de la liga';
  perform pg_temp.put('padel_m1', v_ids[1]::text);
  perform pg_temp.put('padel_m2', v_ids[2]::text);
  perform pg_temp.ok('pádel: el admin crea 2 partidos (parejas, posiciones, reglas de la liga copiadas)');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 4.1 Ana (lado 1) anota los dos resultados: quedan propuestos.
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  m1 uuid := pg_temp.id('padel_m1');
  m2 uuid := pg_temp.id('padel_m2');
  r jsonb;
begin
  assert (select count(*) from public.my_matches()) = 2, 'FAIL pádel: my_matches de Ana';
  r := public.finish_match(p_match => m1, p_score => '{"text": "6-4 6-3", "sides": [2, 0]}', p_winner => 1::smallint, p_op_id => gen_random_uuid());
  assert (r ->> 'ok')::boolean and r ->> 'status' = 'finished', format('FAIL pádel: finish_match %s', r);
  r := public.finish_match(p_match => m2, p_score => '{"text": "6-2 6-2", "sides": [2, 0]}', p_winner => 1::smallint);
  assert r ->> 'status' = 'finished', format('FAIL pádel: finish_match 2 %s', r);
  assert (select bool_and(m.proposed_side = 1 and m.proposed_by = pg_temp.id('u_ana') and m.winner_side = 1)
            from public.matches m where m.id in (m1, m2)), 'FAIL pádel: propuesta del lado 1';
  perform pg_temp.ok('pádel: Ana (lado 1) anota los resultados y quedan propuestos (finished)');
  perform pg_temp.must_fail('permisos: quien propone no confirma su propio resultado',
    format('select public.confirm_result(p_match => %L)', m1), array['no_permitido']);
  perform pg_temp.must_fail('permisos: quien propone no reclama su propio resultado',
    format('select public.dispute_result(p_match => %L)', m1), array['no_permitido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 4.2 Beto (lado 2) confirma el primero y reclama el segundo.
select set_config('request.jwt.claims', pg_temp.jwt('beto'), true);
set local role authenticated;
do $$
declare
  m1 uuid := pg_temp.id('padel_m1');
  m2 uuid := pg_temp.id('padel_m2');
begin
  perform public.confirm_result(p_match => m1, p_op_id => gen_random_uuid());
  assert (select m.status = 'confirmed' and m.confirmed_by = pg_temp.id('u_beto') from public.matches m where m.id = m1),
    'FAIL pádel: el rival confirma';
  perform public.dispute_result(p_match => m2, p_note => 'Smoke: fue 6-2 6-4');
  assert (select m.status = 'disputed' and m.dispute_note = 'Smoke: fue 6-2 6-4' from public.matches m where m.id = m2),
    'FAIL pádel: el rival reclama';
  perform pg_temp.ok('pádel: Beto (lado 2) confirma el primero y reclama el segundo');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 4.3 Alguien de fuera no ve los partidos de una liga privada.
select set_config('request.jwt.claims', pg_temp.jwt('out'), true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.matches where league_id = pg_temp.id('padel')) = 0
     and (select count(*) from public.match_players where league_id = pg_temp.id('padel')) = 0,
    'FAIL permisos: alguien de fuera ve los partidos de una liga privada';
  perform pg_temp.ok('permisos: alguien de fuera no ve los partidos del pádel privado');
  perform pg_temp.must_fail('permisos: alguien de fuera no confirma un resultado',
    format('select public.confirm_result(p_match => %L)', pg_temp.id('padel_m2')), array['no_permitido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 4.4 El admin resuelve el reclamo.
select set_config('request.jwt.claims', pg_temp.jwt('super'), true);
set local role authenticated;
do $$
declare
  m2 uuid := pg_temp.id('padel_m2');
begin
  perform public.resolve_dispute(p_match => m2, p_score => '{"text": "6-2 6-4", "sides": [2, 0]}', p_winner => 1::smallint,
                                 p_note => 'Smoke: revisado');
  assert (select m.status = 'confirmed' and m.score ->> 'text' = '6-2 6-4' and m.history @> '[{"a": "resolve"}]'
            from public.matches m where m.id = m2), 'FAIL pádel: resolve_dispute';
  perform pg_temp.ok('pádel: el admin resuelve el reclamo con su marcador (queda confirmado)');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- 5. Fútbol: equipo de temporada y plantilla
-- =====================================================================================================================
select set_config('request.jwt.claims', pg_temp.jwt('super'), true);
set local role authenticated;
do $$
declare
  v_league uuid := pg_temp.id('foot');
  v_team uuid;
  v_rival uuid;
begin
  v_team := public.create_season_team(p_league => v_league, p_name => 'Smoke FC', p_color => '#1E88E5', p_players => jsonb_build_array(
    jsonb_build_object('player_id', pg_temp.id('foot_p_ana'), 'role', 'captain', 'jersey', 10, 'position', 'MC')));
  v_rival := public.create_season_team(p_league => v_league, p_name => 'Smoke Rival', p_players => jsonb_build_array(
    jsonb_build_object('player_id', pg_temp.id('foot_p_beto'), 'role', 'captain', 'jersey', 9)));
  assert (select count(*) from public.teams t where t.league_id = v_league and t.event_id is null) = 2, 'FAIL fútbol: equipos de temporada';
  perform pg_temp.put('foot_team', v_team::text);
  perform pg_temp.ok('fútbol: el admin crea 2 equipos de temporada con su capitán');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 5.1 Ana (capitana) suma a Luis; no le da roles ni se lleva a alguien de otro equipo.
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  v_team uuid := pg_temp.id('foot_team');
begin
  perform public.set_team_player(p_team => v_team, p_player => pg_temp.id('foot_p_luis'), p_jersey => 7, p_position => 'DC');
  perform pg_temp.ok('fútbol: la capitana suma a Luis a la plantilla (dorsal y posición)');
  perform pg_temp.must_fail('permisos: la capitana no nombra capitanes',
    format('select public.set_team_player(p_team => %L, p_player => %L, p_role => %L)', v_team, pg_temp.id('foot_p_luis'), 'captain'),
    array['no_permitido']);
  perform pg_temp.must_fail('fútbol: la capitana no se lleva a un jugador de otro equipo',
    format('select public.set_team_player(p_team => %L, p_player => %L)', v_team, pg_temp.id('foot_p_beto')), array['invalido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 5.2 Luis ve la plantilla (seasonTeams.ts) y no la maneja.
select set_config('request.jwt.claims', pg_temp.jwt('luis'), true);
set local role authenticated;
do $$
declare
  v_team uuid := pg_temp.id('foot_team');
begin
  assert (select count(*) from (select team_id, player_id, jersey, position, role from public.team_players
                                 where league_id = pg_temp.id('foot')) x) = 3, 'FAIL fútbol: plantillas de la liga';
  assert (select tp.role = 'player' and tp.jersey = 7 and tp.position = 'DC' from public.team_players tp
           where tp.team_id = v_team and tp.player_id = pg_temp.id('foot_p_luis')), 'FAIL fútbol: Luis en la plantilla';
  perform pg_temp.ok('fútbol: un jugador lee las plantillas de la liga');
  perform pg_temp.must_fail('permisos: un jugador (no capitán) no maneja la plantilla',
    format('select public.set_roster(p_team => %L, p_players => %L)', v_team, '[]'), array['no_permitido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- 6. Golf (lo mínimo): campo de 9 hoyos, ronda, inscripción, tarjeta y firma
-- =====================================================================================================================
select set_config('request.jwt.claims', pg_temp.jwt('super'), true);
set local role authenticated;
do $$
declare
  v_league uuid := pg_temp.id('golf');
  v_course uuid;
  v_round uuid;
begin
  v_course := public.golf_save_course(p_league => v_league, p_name => 'Smoke Campo 9',
    p_holes => (select jsonb_agg(jsonb_build_object('par', 4, 'si', i * 2 - 1) order by i) from generate_series(1, 9) i),
    p_tees => '[{"id": "b", "name": "Blancas", "rating": 35.1, "slope": 120, "par": 36}]');
  v_round := public.golf_create_round(p_league => v_league, p_date => current_date, p_course => v_course, p_name => 'Smoke Ronda');
  assert (select count(*) from public.golf_rounds r where r.event_id = v_round and r.status = 'abierta') = 1, 'FAIL golf: ronda';
  perform pg_temp.put('golf_round', v_round::text);
  perform pg_temp.ok('golf: el admin guarda un campo de 9 hoyos y crea la ronda');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  v_round uuid := pg_temp.id('golf_round');
  v_card uuid;
begin
  v_card := public.golf_register(p_event => v_round, p_tee => 'b', p_index => 12.4);
  assert public.golf_save_hole_scores(p_op_id => gen_random_uuid(), p_event => v_round, p_cards => jsonb_build_array(jsonb_build_object(
           'card_id', v_card,
           'holes', (select jsonb_agg(jsonb_build_object('i', i, 's', case when i = 8 then 5 else 4 end, 'p', 2) order by i)
                       from generate_series(0, 8) i)))) = 9,
    'FAIL golf: golf_save_hole_scores';
  perform public.golf_sign_card(p_card => v_card);
  assert (select c.status = 'firmada' and (select sum(s) from unnest(c.strokes) s) = 37 and c.hcp_index = 12.4
            from public.golf_cards c where c.id = v_card), 'FAIL golf: tarjeta firmada con 37 golpes';
  perform pg_temp.ok('golf: Ana se inscribe (Index 12.4), anota los 9 hoyos (37) y firma su tarjeta');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- 7. Natación (lo mínimo): encuentro, prueba, club, nadador, inscripciones, series y tiempos
-- =====================================================================================================================
select set_config('request.jwt.claims', pg_temp.jwt('super'), true);
set local role authenticated;
do $$
declare
  v_league uuid := pg_temp.id('swim');
  v_meet uuid;
  v_event uuid;
  v_club uuid;
  v_swimmer uuid;
begin
  v_meet := public.swim_create_meet(p_league => v_league, p_date => current_date + 3, p_name => 'Smoke Encuentro');
  v_event := (public.swim_save_events(p_meet => v_meet, p_events => '[{"distance": 50, "stroke": "libre", "gender": "X"}]'))[1];
  v_club := public.swim_save_club(p_league => v_league, p_name => 'Smoke Club', p_short => 'SMK');
  v_swimmer := public.swim_register_swimmer(p_league => v_league, p_name => 'Smoke Nadador', p_club => v_club);
  assert public.swim_enter(p_swim_event => v_event, p_entries => jsonb_build_array(
           jsonb_build_object('player_id', v_swimmer, 'seed_cs', 3200))) = 1, 'FAIL natación: swim_enter del admin';
  perform pg_temp.put('swim_meet', v_meet::text);
  perform pg_temp.put('swim_event', v_event::text);
  perform pg_temp.put('swim_swimmer', v_swimmer::text);
  perform pg_temp.ok('natación: el admin crea el encuentro, la prueba (50 libre), un club y un nadador inscrito');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
begin
  assert public.swim_enter(p_swim_event => pg_temp.id('swim_event'), p_entries => jsonb_build_array(
           jsonb_build_object('player_id', pg_temp.id('swim_p_ana'), 'seed_cs', null))) = 1, 'FAIL natación: Ana se inscribe';
  perform pg_temp.ok('natación: Ana se inscribe sola en la prueba');
  perform pg_temp.must_fail('permisos: una nadadora no inscribe a otro',
    format('select public.swim_enter(p_swim_event => %L, p_entries => %L)', pg_temp.id('swim_event'),
           jsonb_build_array(jsonb_build_object('player_id', pg_temp.id('swim_swimmer'), 'seed_cs', 3000))), array['no_permitido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('super'), true);
set local role authenticated;
do $$
declare
  v_event uuid := pg_temp.id('swim_event');
  e_swimmer uuid;
  e_ana uuid;
begin
  select x.id into e_swimmer from public.swim_entries x where x.swim_event_id = v_event and x.player_id = pg_temp.id('swim_swimmer');
  select x.id into e_ana from public.swim_entries x where x.swim_event_id = v_event and x.player_id = pg_temp.id('swim_p_ana');
  assert public.swim_publish_heats(p_meet => pg_temp.id('swim_meet'), p_heats => jsonb_build_array(jsonb_build_object(
           'swim_event_id', v_event, 'lanes', jsonb_build_array(
             jsonb_build_object('entry_id', e_swimmer, 'heat', 1, 'lane', 4),
             jsonb_build_object('entry_id', e_ana, 'heat', 1, 'lane', 5))))) = 2, 'FAIL natación: swim_publish_heats';
  assert public.swim_record_heat(p_swim_event => v_event, p_heat => 1, p_op_id => gen_random_uuid(), p_results => jsonb_build_array(
           jsonb_build_object('entry_id', e_swimmer, 'time_cs', 3150, 'status', 'ok'),
           jsonb_build_object('entry_id', e_ana, 'time_cs', 3520, 'status', 'ok'))) = 2, 'FAIL natación: swim_record_heat';
  perform pg_temp.ok('natación: el admin publica la serie y anota los tiempos');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
begin
  assert (select x.time_cs = 3520 and x.heat = 1 and x.lane = 5 from public.swim_entries x
           where x.swim_event_id = pg_temp.id('swim_event') and x.player_id = pg_temp.id('swim_p_ana')), 'FAIL natación: Ana ve su tiempo';
  assert (select count(*) from public.golf_cards c where c.league_id = pg_temp.id('golf')) = 1, 'FAIL golf: Ana ve la tarjeta';
  perform pg_temp.ok('natación y golf: Ana lee su tiempo (31.50 del otro, 35.20 el suyo) y la tarjeta de la ronda');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- 8. Permisos que TIENEN que fallar
-- =====================================================================================================================

-- 8.1 Un miembro normal llama la consola del superadmin.
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  v_beta text := (select s.id from public.sport_status s where s.status = 'beta' order by s.sort_order limit 1);
begin
  perform pg_temp.must_fail('permisos: un miembro no llama admin_overview', 'select public.admin_overview()', array['no_permitido']);
  perform pg_temp.must_fail('permisos: un miembro no llama admin_users', 'select public.admin_users()', array['no_permitido']);
  perform pg_temp.must_fail('permisos: un miembro no llama admin_system', 'select public.admin_system()', array['no_permitido']);
  perform pg_temp.must_fail('permisos: un miembro no llama admin_audit_log', 'select public.admin_audit_log()', array['no_permitido']);
  perform pg_temp.must_fail('permisos: un miembro no bloquea cuentas',
    format('select public.admin_block_user(p_user => %L)', pg_temp.id('u_luis')), array['no_permitido']);
  perform pg_temp.must_fail('permisos: un miembro no manda anuncios a toda la app',
    format('select public.admin_announce(p_title => %L, p_body => %L)', 'x', 'y'), array['no_permitido']);
  perform pg_temp.must_fail('permisos: un miembro no se hace superadmin',
    format('select public.set_superadmin(p_user => %L, p_value => true)', pg_temp.id('u_ana')), array['no_permitido']);
  perform pg_temp.must_fail('permisos: un miembro no abre ni cierra deportes',
    format('select public.set_sport_status(p_sport => %L, p_status => %L)', 'golf', 'open'), array['no_permitido']);
  if v_beta is not null then
    perform pg_temp.must_fail(format('permisos: un miembro no crea ligas de un deporte en beta (%s)', v_beta),
      format('select public.create_league(p_name => %L, p_sport => %L)', 'Smoke Beta', v_beta), array['no_permitido']);
  else
    perform pg_temp.ok('permisos: no hay deportes en beta (todos abiertos o cerrados): nada que probar');
  end if;
  assert (select count(*) from public.profiles) = 1, 'FAIL permisos: un miembro lee perfiles ajenos (correos)';
  assert (select count(*) from public.admin_audit) = 0, 'FAIL permisos: un miembro lee la auditoría';
  perform pg_temp.ok('permisos: un miembro solo lee su perfil y nada de la auditoría');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 8.2 Sin cuenta (anon): lee lo público y nada más; no escribe nada.
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select set_config('request.headers', json_build_object('x-real-ip', 'smoke-' || pg_temp.val('tag'))::text, true);
set local role anon;
do $$
declare
  v_leagues uuid[] := array[pg_temp.id('bowl'), pg_temp.id('padel'), pg_temp.id('foot'), pg_temp.id('golf'), pg_temp.id('swim')];
begin
  assert (select count(*) from public.leagues where id = any (v_leagues)) = 0, 'FAIL permisos: anon ve ligas privadas';
  assert (select count(*) from public.entries where league_id = any (v_leagues)) = 0, 'FAIL permisos: anon ve juegos de ligas privadas';
  assert (select count(*) from public.sport_status) >= 9, 'FAIL permisos: anon no ve los deportes';
  assert (select count(*) from public.invite_preview(p_code => pg_temp.val('bowl_code'))) = 1, 'FAIL permisos: anon no ve la invitación';
  perform pg_temp.ok('permisos: anon no ve ligas privadas; sí ve los deportes y a qué liga invita un código');
  perform pg_temp.must_fail('permisos: anon no crea ligas', format('select public.create_league(p_name => %L)', 'Smoke Anon'), array['42501']);
  perform pg_temp.must_fail('permisos: anon no se une', format('select public.join_league(p_code => %L)', pg_temp.val('bowl_code')), array['42501']);
  perform pg_temp.must_fail('permisos: anon no envía juegos',
    format('select public.submit_games(p_op_id => %L, p_league => %L, p_scores => %L, p_date => current_date)',
           gen_random_uuid(), pg_temp.id('bowl'), '[100]'), array['42501']);
  perform pg_temp.must_fail('permisos: anon no publica en vivo',
    format('select public.publish_live(p_event => %L, p_scores => %L)', pg_temp.id('bowl_prac'), '[100]'), array['42501']);
  perform pg_temp.must_fail('permisos: anon no escribe directo en las tablas',
    format('insert into public.leagues (name, owner_id) values (%L, %L)', 'Smoke Anon', pg_temp.id('u_owner')), array['42501']);
  perform pg_temp.must_fail('permisos: anon no lee perfiles (correos)', 'select count(*) from public.profiles', array['42501']);
  perform pg_temp.must_fail('permisos: anon no llama la consola', 'select public.admin_overview()', array['42501']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);

-- =====================================================================================================================
-- 9. Bloqueo de cuentas (superadmin de la prueba)
-- =====================================================================================================================
select set_config('request.jwt.claims', pg_temp.jwt('super'), true);
set local role authenticated;
do $$
begin
  perform public.admin_block_user(p_user => pg_temp.id('u_luis'), p_reason => 'Smoke: prueba de bloqueo');
  assert (select p.blocked_at is not null from public.profiles p where p.id = pg_temp.id('u_luis')), 'FAIL bloqueo: admin_block_user';
  perform pg_temp.ok('bloqueo: el superadmin bloquea a Luis');
  perform pg_temp.must_fail('bloqueo: nadie se bloquea a sí mismo',
    format('select public.admin_block_user(p_user => %L)', pg_temp.id('u_super')), array['invalido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('luis'), true);
set local role authenticated;
do $$
begin
  perform pg_temp.must_fail('bloqueo: una cuenta bloqueada no envía juegos',
    format('select public.submit_games(p_op_id => %L, p_league => %L, p_scores => %L, p_event => %L)',
           gen_random_uuid(), pg_temp.id('bowl'), '[200]', pg_temp.id('bowl_prac')), array['bloqueada']);
  perform pg_temp.must_fail('bloqueo: una cuenta bloqueada no marca «voy»',
    format('select public.set_rsvp(p_event => %L, p_going => true)', pg_temp.id('bowl_tour')), array['bloqueada']);
  perform pg_temp.must_fail('bloqueo: una cuenta bloqueada no se une a ligas',
    format('select public.join_league(p_code => %L)', pg_temp.val('golf_code')), array['bloqueada']);
  perform pg_temp.must_fail('bloqueo: una cuenta bloqueada no comenta',
    format('select public.add_comment(p_entry => %L, p_text => %L)', pg_temp.id('bowl_e_owner'), 'hola'), array['bloqueada']);
  assert (select count(*) from public.leagues where id = pg_temp.id('bowl')) = 1
     and (select count(*) from public.entries where league_id = pg_temp.id('bowl')) = 6,
    'FAIL bloqueo: una cuenta bloqueada tiene que poder leer';
  assert (select p.blocked_at is not null and p.blocked_reason = 'Smoke: prueba de bloqueo' from public.profiles p
           where p.id = pg_temp.id('u_luis')), 'FAIL bloqueo: la cuenta no ve que está bloqueada';
  perform pg_temp.ok('bloqueo: Luis bloqueado todavía lee su liga y ve que está bloqueado');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('super'), true);
set local role authenticated;
do $$
declare
  a jsonb;
begin
  perform public.admin_unblock_user(p_user => pg_temp.id('u_luis'));
  a := public.admin_audit_log(p_limit => 100);
  assert (select count(*) from jsonb_array_elements(a -> 'rows') x
           where x ->> 'targetId' = pg_temp.val('u_luis') and x ->> 'action' in ('block_user', 'unblock_user')) = 2,
    'FAIL bloqueo: la auditoría no tiene el bloqueo y el desbloqueo';
  perform pg_temp.ok('bloqueo: el superadmin desbloquea a Luis y los dos quedan en la auditoría');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('luis'), true);
set local role authenticated;
do $$
begin
  perform public.set_rsvp(p_event => pg_temp.id('bowl_tour'), p_going => true);
  assert (select count(*) from public.event_rsvps r where r.event_id = pg_temp.id('bowl_tour')) = 2, 'FAIL bloqueo: desbloqueado no escribe';
  perform pg_temp.ok('bloqueo: Luis desbloqueado vuelve a escribir');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- 9b. Social: seguir, perfil, me gusta y avisos (todo se deshace con el ROLLBACK)
-- =====================================================================================================================

-- 9b.1 Ana sigue al dueño (comparten la liga privada) y le da me gusta a su juego del torneo; lo ve en su perfil.
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  r jsonb;
  g jsonb;
begin
  r := public.follow_user(p_user => pg_temp.id('u_owner'));
  assert (r ->> 'following')::boolean and (r ->> 'followers')::integer = 1, format('FAIL social: follow_user %s', r);
  assert public.follow_user(p_user => pg_temp.id('u_owner')) ->> 'followers' = '1', 'FAIL social: seguir dos veces no es idempotente';
  r := public.set_game_like(p_kind => 'bowling', p_id => pg_temp.id('bowl_e_owner'), p_liked => true);
  assert (r ->> 'liked')::boolean and (r ->> 'likes')::integer >= 1, format('FAIL social: set_game_like %s', r);
  r := public.public_profile(p_user => pg_temp.id('u_owner'));
  assert (r ->> 'isFollowing')::boolean and (r ->> 'followers')::integer = 1 and r -> 'sports' ? 'bowling',
    format('FAIL social: public_profile %s', r);
  g := public.profile_games(p_user => pg_temp.id('u_owner'), p_sport => 'bowling');
  assert exists (select 1 from jsonb_array_elements(g) x
                  where x ->> 'id' = pg_temp.val('bowl_e_owner') and (x ->> 'likedByMe')::boolean and x ->> 'kind' = 'bowling'),
    format('FAIL social: profile_games no trae el juego del dueño con el me gusta (%s)', g);
  perform pg_temp.ok('social: Ana sigue al dueño (idempotente), le da me gusta a su juego y lo ve en su perfil');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 9b.2 El dueño ve a su seguidora, el aviso «te empezó a seguir» y sus números.
select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  r jsonb;
begin
  r := public.follow_list(p_user => pg_temp.id('u_owner'), p_kind => 'followers');
  assert jsonb_array_length(r) = 1 and r -> 0 ->> 'id' = pg_temp.val('u_ana'), format('FAIL social: follow_list %s', r);
  r := public.social_notices();
  assert exists (select 1 from jsonb_array_elements(r) x where x ->> 'kind' = 'follow' and x ->> 'userId' = pg_temp.val('u_ana')),
    format('FAIL social: social_notices sin el «te empezó a seguir» (%s)', r);
  assert (select count(*) from public.follows f where f.followee_id = pg_temp.id('u_owner')) = 1, 'FAIL social: el dueño no lee sus filas';
  r := public.profile_stats(p_user => pg_temp.id('u_owner'));
  assert jsonb_typeof(r) = 'object', format('FAIL social: profile_stats %s', r);
  perform pg_temp.ok('social: el dueño ve su seguidora, el aviso «te empezó a seguir» y sus números');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 9b.3 Alguien de fuera no ve nada social de la liga privada ni de quien solo está en ella.
select set_config('request.jwt.claims', pg_temp.jwt('out'), true);
set local role authenticated;
do $$
begin
  assert public.public_profile(p_user => pg_temp.id('u_owner')) is null
      or not exists (select 1 from jsonb_array_elements(public.profile_games(p_user => pg_temp.id('u_owner'))) x
                      where x ->> 'leagueId' = pg_temp.val('bowl')),
    'FAIL social: el de fuera ve juegos de la liga privada';
  assert (select count(*) from public.follows f where f.followee_id = pg_temp.id('u_owner')) = 0, 'FAIL social: el de fuera lee follows ajenos';
  assert (select count(*) from public.game_likes) = 0, 'FAIL social: el de fuera lee me gusta';
  perform pg_temp.ok('social: el de fuera no ve juegos, seguidores ni me gusta de la liga privada');
end $$;
select pg_temp.must_fail('social: el de fuera no da me gusta en la liga privada',
  format('select public.set_game_like(p_kind => %L, p_id => %L::uuid, p_liked => true)', 'bowling', pg_temp.val('bowl_e_owner')),
  array['42501', 'no_permitido']);
select pg_temp.must_fail('social: nadie se sigue a sí mismo',
  format('select public.follow_user(p_user => %L::uuid)', pg_temp.val('u_out')), array['invalido', '23514']);
reset role;
select set_config('request.jwt.claims', '', true);

-- 9b.4 Ana quita el me gusta y deja de seguir (idempotente).
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  r jsonb;
begin
  r := public.set_game_like(p_kind => 'bowling', p_id => pg_temp.id('bowl_e_owner'), p_liked => false);
  assert not (r ->> 'liked')::boolean, format('FAIL social: quitar el me gusta %s', r);
  r := public.unfollow_user(p_user => pg_temp.id('u_owner'));
  assert not (r ->> 'following')::boolean and (r ->> 'followers')::integer = 0, format('FAIL social: unfollow_user %s', r);
  assert public.unfollow_user(p_user => pg_temp.id('u_owner')) ->> 'followers' = '0', 'FAIL social: dejar de seguir dos veces';
  perform pg_temp.ok('social: Ana quita el me gusta y deja de seguir (idempotente)');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- 10. Consola del superadmin (lecturas de toda la app; en Supabase leen también cron, migraciones y Storage)
-- =====================================================================================================================
select set_config('request.jwt.claims', pg_temp.jwt('super'), true);
set local role authenticated;
do $$
declare
  o jsonb;
  s jsonb;
  u jsonb;
  l jsonb;
begin
  o := public.admin_overview();
  assert (o -> 'users' ->> 'total')::integer >= 6 and (o -> 'leagues' ->> 'total')::integer >= 5, format('FAIL consola: admin_overview %s', o);
  s := public.admin_system();
  assert s ->> 'backend' in ('supabase', 'local') and jsonb_typeof(s -> 'sportStatus') = 'array', 'FAIL consola: admin_system';
  u := public.admin_users(p_search => pg_temp.val('tag'));
  assert (u ->> 'total')::integer = 6, format('FAIL consola: admin_users encontró %s cuentas de la prueba (esperaba 6)', u ->> 'total');
  l := public.admin_leagues(p_search => pg_temp.val('tag'));
  assert (l ->> 'total')::integer >= 5, format('FAIL consola: admin_leagues encontró %s ligas de la prueba', l ->> 'total');
  assert (select count(*) from public.profiles p where p.email like 'smoke-%@example.invalid') >= 6, 'FAIL consola: el superadmin no lee los perfiles';
  perform pg_temp.ok(format('consola: admin_overview, admin_system (backend %s, %s migraciones, %s tareas de cron), admin_users y admin_leagues',
                            s ->> 'backend',
                            case when jsonb_typeof(s -> 'migrations') = 'array' then jsonb_array_length(s -> 'migrations')::text else '-' end,
                            case when jsonb_typeof(s -> 'cron') = 'array' then jsonb_array_length(s -> 'cron')::text else '-' end));
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- Fin: resumen y ROLLBACK (no queda nada)
-- =====================================================================================================================
do $$
declare
  n integer := (select count(*) from regexp_split_to_table(current_setting('smoke.log'), E'\n') s where s <> '');
begin
  perform pg_temp.guard();
  assert n >= 70, format('FAIL fin: solo %s pasos', n);
  raise notice 'SMOKE OK: % pasos. Ahora ROLLBACK: no queda nada guardado.', n;
end $$;

select t.n as paso, t.step as ok
  from regexp_split_to_table(current_setting('smoke.log'), E'\n') with ordinality as t (step, n)
 where t.step <> ''
 order by t.n;

rollback;
