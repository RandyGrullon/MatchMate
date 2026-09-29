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
-- add_practice_game, en vivo, envíos sin foto, aprobar y rechazar, lo que lee el ranking, el reclamo «ese jugador
-- sin cuenta soy yo» que aprueba el dueño, los pendientes del organizador y las pistas), pádel (partidos, resultado
-- de un lado, confirmación del rival, reclamo y resolución), fútbol (equipo de temporada y plantilla), golf y
-- natación (lo mínimo), league_announce, bloqueo de cuentas, lo social, @usuario e invitaciones, aceptar los
-- términos y reportar, juegos sueltos y el logo de la liga, las insignias, los premios y los anotadores del torneo,
-- la consola del superadmin y los permisos que TIENEN que fallar (alguien de fuera leyendo una liga privada, un
-- miembro llamando admin_*, escrituras sin cuenta).
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
    '20260927001300', '20260927001400', '20260927001500', '20260928000100', '20260928000200', '20260929000100',
    '20260929000200', '20260929000500', '20260929000510', '20260929000600', '20260929000700', '20260929000900',
    '20260929001000', '20260929001010', '20260929001100', '20260929001110', '20260929001120', '20260929001180',
    '20260929001190', '20260929001200', '20260929001400'];
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
  assert (select string_agg(split_part(o.title, ' en ', 1), ' | ' order by o.title) from public.push_outbox o
           where o.user_id = pg_temp.id('u_ana') and o.tag like 'envio:%')
         = 'Aprobaron tus juegos: serie de 480 | Aprobaron tus juegos: serie de 780',
    'FAIL avisos: a Ana no le llegó el push de sus dos envíos aprobados';
  perform pg_temp.ok('avisos: los envíos aprobados de Ana le llegan al teléfono («Aprobaron tus juegos: serie de 780…»)');
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
  d := public.set_push_prefs(p_prefs => '{"social": false}');
  assert d = '{"liga": true, "social": false, "resultados": true, "recordatorios": true}'::jsonb, format('FAIL avisos: set_push_prefs %s', d);
  assert (select p.push_prefs from public.profiles p) = '{"social": false}'::jsonb, 'FAIL avisos: Ana no lee sus preferencias en su perfil';
  d := public.set_push_prefs(p_prefs => '{"social": true}');
  perform pg_temp.ok('avisos: Ana apaga y prende los avisos sociales (set_push_prefs) y los lee en su perfil');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 2.12 Reclamos: Beto se une diciendo «soy Smoke Invitado» (el jugador sin cuenta que anotó el dueño, con su juego
-- de 150). Queda pendiente con su propio jugador (marca «voy» con él); Luis no lo puede aprobar; el dueño lo aprueba y
-- Beto queda como Smoke Invitado con todo junto (su «voy» y el juego del invitado).
select set_config('request.jwt.claims', pg_temp.jwt('beto'), true);
set local role authenticated;
do $$
declare
  v_guest uuid := pg_temp.id('bowl_p_guest');
  r jsonb;
begin
  r := public.join_league(p_code => pg_temp.val('bowl_code'), p_prefer => v_guest);
  assert (r ->> 'player_id')::uuid <> v_guest and r ->> 'claim_id' is not null, format('FAIL reclamos: join_league %s', r);
  assert (select p.user_id from public.players p where p.id = v_guest) is null, 'FAIL reclamos: se lo llevó sin aprobar';
  assert (select c.status = 'pending' and c.player_id = v_guest from public.player_claims c where c.id = (r ->> 'claim_id')::uuid),
    'FAIL reclamos: Beto no ve su pedido pendiente';
  perform public.set_rsvp(p_event => pg_temp.id('bowl_tour'), p_going => true);
  perform pg_temp.put('bowl_p_beto', r ->> 'player_id');
  perform pg_temp.put('bowl_claim', r ->> 'claim_id');
  perform pg_temp.ok('reclamos: Beto se une eligiendo al invitado: queda pendiente y juega con su propio jugador');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('luis'), true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.player_claims c where c.id = pg_temp.id('bowl_claim')) = 0, 'FAIL reclamos: un miembro lee pedidos ajenos';
  perform pg_temp.must_fail('reclamos: un miembro no aprueba',
    format('select public.decide_player_claim(p_claim => %L, p_approve => true)', pg_temp.id('bowl_claim')), array['no_permitido', '42501']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  v_guest uuid := pg_temp.id('bowl_p_guest');
  v_mine uuid := pg_temp.id('bowl_p_beto');
  v_claim uuid := pg_temp.id('bowl_claim');
begin
  assert (select count(*) from public.player_claims c where c.id = v_claim and c.status = 'pending') = 1, 'FAIL reclamos: el dueño no ve el pedido';
  assert public.player_claim_conflicts(p_claim => v_claim) = '[]'::jsonb, 'FAIL reclamos: conflictos inesperados';
  assert public.decide_player_claim(p_claim => v_claim, p_approve => true) = 'approved', 'FAIL reclamos: aprobar';
  assert (select p.user_id from public.players p where p.id = v_guest) = pg_temp.id('u_beto'), 'FAIL reclamos: el invitado no quedó de Beto';
  assert (select count(*) from public.players p where p.id = v_mine) = 0, 'FAIL reclamos: quedó el jugador propio de Beto';
  assert (select count(*) from public.event_rsvps r where r.event_id = pg_temp.id('bowl_tour') and r.player_id = v_guest and r.going) = 1,
    'FAIL reclamos: el «voy» de Beto no pasó al invitado';
  assert (select count(*) from public.entries e where e.player_id = v_guest and 150 = any (e.scores)) = 1, 'FAIL reclamos: el juego del invitado';
  assert (select m.player_id from public.memberships m where m.league_id = pg_temp.id('bowl') and m.user_id = pg_temp.id('u_beto')) = v_guest,
    'FAIL reclamos: la membresía de Beto no apunta al invitado';
  assert public.decide_player_claim(p_claim => v_claim, p_approve => false) = 'approved', 'FAIL reclamos: decidir dos veces';
  perform pg_temp.ok('reclamos: el dueño ve el pedido, lo aprueba y Beto queda como el invitado con todo junto');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 2.13 Organizador: pendientes, pistas del torneo (por equipo) con su aviso y lo que cambiaría al suspender hoy.
select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  r jsonb;
  v_tour uuid := pg_temp.id('bowl_tour');
begin
  r := public.league_pending(p_league => pg_temp.id('bowl'));
  assert (r ->> 'total')::integer >= 0 and jsonb_typeof(r -> 'submissions' -> 'items') = 'array'
         and (r -> 'claims' ->> 'count')::integer = 0 and jsonb_typeof(r -> 'checklist') = 'object',
    format('FAIL organizador: league_pending (%s)', r);
  r := public.assign_lanes(p_event => v_tour, p_lanes => array[5, 6], p_per_lane => 2, p_mode => 'equipo');
  assert (r ->> 'count')::integer = 4 and jsonb_array_length(r -> 'lanes') = 2
         and (select max(t.n) from (select count(distinct x.lane) as n
                                      from public.event_lanes x
                                      join public.entries e on e.event_id = x.event_id and e.player_id = x.player_id
                                     where x.event_id = v_tour group by e.team_id) t) = 1,
    format('FAIL organizador: assign_lanes por equipo (%s)', r);
  r := public.publish_lanes(p_event => v_tour);
  assert (r ->> 'players')::integer = 4 and (r ->> 'pushed')::integer = 4, format('FAIL organizador: publish_lanes (%s)', r);
  r := public.suspend_day_preview(p_league => pg_temp.id('bowl'), p_date => current_date);
  assert jsonb_typeof(r -> 'counts') = 'object' and jsonb_array_length(r -> 'events') >= 1,
    format('FAIL organizador: suspend_day_preview (%s)', r);
  perform pg_temp.ok('organizador: league_pending, pistas del torneo por equipo con su aviso y suspend_day_preview de hoy');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- 3. Ligas de otros deportes (las crea el superadmin de la prueba: si alguno está en beta, solo él puede)
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

-- 5.3 Temporadas y playoffs: la liga nació con su temporada; el admin arma la final (al mejor de 1), la juegan, cierra
-- la temporada con el campeón (aviso a la liga) y empieza otra copiando los equipos.
select set_config('request.jwt.claims', pg_temp.jwt('super'), true);
set local role authenticated;
do $$
declare
  v_league uuid := pg_temp.id('foot');
  v_season uuid;
  v_po uuid;
  v_game uuid;
  v_next uuid;
begin
  select s.id into v_season from public.seasons s where s.league_id = v_league and s.status = 'active';
  assert v_season is not null, 'FAIL temporadas: la liga no nació con su temporada activa';
  assert (select count(*) from public.teams t where t.league_id = v_league and t.season_id = v_season) = 2, 'FAIL temporadas: los equipos no son de la temporada';
  v_po := public.create_playoffs(p_league => v_league, p_season => v_season, p_teams => array[pg_temp.id('foot_team'),
            (select t.id from public.teams t where t.league_id = v_league and t.name = 'Smoke Rival')], p_best_of => array[1]);
  select m.id into v_game from public.matches m join public.playoff_series x on x.id = m.series_id where x.playoff_id = v_po;
  assert v_game is not null, 'FAIL playoffs: no se programó el juego de la final';
  perform public.finish_match(p_match => v_game, p_score => '{"text": "2-1", "sides": [2, 1]}', p_winner => 1::smallint);
  assert (select p.status = 'finished' and p.winner = pg_temp.id('foot_team') from public.playoffs p where p.id = v_po),
    'FAIL playoffs: la final no dejó campeón';
  perform pg_temp.ok('playoffs: el admin arma la final, se juega y Smoke FC queda campeón');
  perform public.close_season(p_season => v_season, p_standings => '{"rows": []}',
                              p_awards => jsonb_build_array(jsonb_build_object('kind', 'campeon', 'team_id', pg_temp.id('foot_team'))));
  assert (select a.body from public.league_announcements a where a.league_id = v_league) like 'Terminó % campeón Smoke FC',
    'FAIL temporadas: no salió el aviso del campeón';
  v_next := public.start_season(p_league => v_league, p_name => 'Smoke Temporada 2', p_starts_on => current_date + 1, p_copy_teams => true);
  assert (select count(*) from public.teams t where t.season_id = v_next) = 2, 'FAIL temporadas: no se copiaron los equipos';
  perform pg_temp.put('foot_season', v_season::text);
  perform pg_temp.ok('temporadas: el admin cierra la temporada con el campeón (aviso a la liga) y empieza otra con los equipos copiados');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 5.4 Luis (jugador) lee las temporadas y los campeones, y no cierra nada; sin cuenta, la agenda pública responde.
select set_config('request.jwt.claims', pg_temp.jwt('luis'), true);
set local role authenticated;
do $$
declare
  v jsonb := public.league_seasons(p_league => pg_temp.id('foot'));
begin
  assert jsonb_array_length(v) = 2 and v -> 1 -> 'playoffs' -> 0 -> 'champion' ->> 'name' = 'Smoke FC', format('FAIL temporadas: league_seasons %s', v);
  assert public.league_champions(p_league => pg_temp.id('foot')) -> 0 -> 'champion' ->> 'name' = 'Smoke FC', 'FAIL temporadas: league_champions';
  perform pg_temp.ok('temporadas: un jugador lee las temporadas (con la final) y los campeones');
  perform pg_temp.must_fail('permisos: un jugador no cierra la temporada',
    format('select public.close_season(p_season => %L, p_standings => %L)', pg_temp.id('foot_season'), '{}'), array['no_permitido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;
do $$
begin
  assert jsonb_typeof(public.public_agenda(p_days => 7) -> 'items') = 'array', 'FAIL agenda: public_agenda sin cuenta';
  perform pg_temp.ok('agenda: «¿Dónde juego esta semana?» responde sin cuenta');
end $$;
reset role;

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
  perform pg_temp.must_fail('permisos: un miembro no llama admin_storage_usage', 'select public.admin_storage_usage()', array['no_permitido']);
  perform pg_temp.must_fail('permisos: un miembro no toma la cola de fotos por borrar (solo purge-photos)',
    'select * from public.purge_queue_take()', array['42501']);
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
  assert jsonb_typeof(public.public_leagues_feed(p_limit => 5)) = 'array'
     and not exists (select 1 from jsonb_array_elements(public.public_leagues_feed(p_query => pg_temp.val('tag'))) x
                      where (x ->> 'id')::uuid = any (v_leagues)),
    'FAIL permisos: anon no lee las ligas públicas (o ve una privada)';
  perform pg_temp.ok('permisos: anon no ve ligas privadas; sí ve los deportes, las ligas públicas y a qué liga invita un código');
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
  assert (select count(*) from public.event_rsvps r where r.event_id = pg_temp.id('bowl_tour') and r.player_id = pg_temp.id('bowl_p_luis') and r.going) = 1,
    'FAIL bloqueo: desbloqueado no escribe';
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
-- 9c. Usuarios e invitaciones: @usuario, buscar personas e invitar a la liga (todo se deshace con el ROLLBACK)
-- =====================================================================================================================

-- 9c.1 El dueño (ya tiene un @usuario del trigger) se pone otro y lo ve en su perfil; los reservados no.
select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  v text := 'smoke_' || pg_temp.val('tag');
begin
  assert (select p.username from public.profiles p where p.id = pg_temp.id('u_owner')) ~ '^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$',
    'FAIL usuarios: el perfil nuevo no tiene un @usuario válido';
  assert public.username_status(p_username => v) = 'ok', 'FAIL usuarios: username_status (ok)';
  assert public.set_username(p_username => '@' || upper(v)) = v, 'FAIL usuarios: set_username';
  assert public.username_status(p_username => v) = 'mine', 'FAIL usuarios: username_status (mine)';
  assert public.public_profile(p_user => pg_temp.id('u_owner')) ->> 'username' = v, 'FAIL usuarios: public_profile sin el @usuario';
  perform pg_temp.put('owner_username', v);
  perform pg_temp.ok('usuarios: el dueño se pone su @usuario (set_username, username_status) y lo ve en su perfil');
  perform pg_temp.must_fail('usuarios: nadie se pone un @usuario reservado',
    format('select public.set_username(p_username => %L)', 'admin'), array['reservado']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 9c.2 Ana encuentra al dueño por su @usuario.
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  r jsonb;
begin
  assert public.username_status(p_username => pg_temp.val('owner_username')) = 'taken', 'FAIL usuarios: username_status (taken)';
  r := public.search_people(p_query => '@' || pg_temp.val('owner_username'));
  assert r -> 0 ->> 'id' = pg_temp.val('u_owner') and r -> 0 ->> 'username' = pg_temp.val('owner_username'),
    format('FAIL usuarios: Ana no encuentra al dueño por su @usuario (%s)', r);
  perform pg_temp.ok('usuarios: Ana encuentra al dueño por su @usuario (search_people)');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 9c.3 El dueño invita a Beto a la liga del boliche: como ya está, no se manda nada. Beto sale de la liga y el dueño
-- lo vuelve a invitar; Luis (miembro de una liga privada) no puede invitar ni ver la invitación.
select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  r jsonb := public.invite_to_league(p_league => pg_temp.id('bowl'), p_users => array[pg_temp.id('u_beto')]);
begin
  assert (r ->> 'sent')::integer = 0 and r -> 'results' -> 0 ->> 'status' = 'member', format('FAIL invitaciones: Beto ya es miembro (%s)', r);
  perform pg_temp.ok('invitaciones: invitar a quien ya está en la liga no manda nada');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('beto'), true);
set local role authenticated;
do $$
begin
  perform public.leave_league(p_league => pg_temp.id('bowl'));
  assert (select count(*) from public.league_members m where m.league_id = pg_temp.id('bowl') and m.user_id = pg_temp.id('u_beto')) = 0,
    'FAIL invitaciones: Beto no salió de la liga';
  perform pg_temp.ok('invitaciones: Beto sale de la liga del boliche');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  r jsonb := public.invite_to_league(p_league => pg_temp.id('bowl'), p_users => array[pg_temp.id('u_beto')]);
  p jsonb;
  v_id uuid;
begin
  assert (r ->> 'sent')::integer = 1 and r -> 'results' -> 0 ->> 'status' = 'sent', format('FAIL invitaciones: invite_to_league %s', r);
  select i.id into v_id from public.league_invites i
   where i.league_id = pg_temp.id('bowl') and i.user_id = pg_temp.id('u_beto') and i.status = 'pending';
  assert v_id is not null, 'FAIL invitaciones: el dueño no ve la invitación pendiente';
  -- Por su nombre (el dueño no lee el perfil de Beto directo: RLS).
  p := public.search_people(p_query => 'Smoke Beto ' || pg_temp.val('tag'), p_league => pg_temp.id('bowl'));
  assert exists (select 1 from jsonb_array_elements(p) x
                  where x ->> 'id' = pg_temp.val('u_beto') and (x ->> 'invited')::boolean and not (x ->> 'inLeague')::boolean),
    format('FAIL invitaciones: search_people no marca a Beto como invitado (%s)', p);
  perform pg_temp.put('bowl_invite', v_id::text);
  perform pg_temp.ok('invitaciones: el dueño invita a Beto (sale como invitado en la búsqueda de la liga)');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('luis'), true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.league_invites i where i.id = pg_temp.id('bowl_invite')) = 0, 'FAIL invitaciones: un miembro lee invitaciones ajenas';
  assert public.league_invite_details(p_invite => pg_temp.id('bowl_invite')) is null, 'FAIL invitaciones: un miembro ve el detalle ajeno';
  perform pg_temp.must_fail('invitaciones: un miembro no invita a una liga privada',
    format('select public.invite_to_league(p_league => %L, p_users => array[%L]::uuid[])', pg_temp.id('bowl'), pg_temp.id('u_out')),
    array['no_permitido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 9c.4 Beto ve la invitación y la acepta: queda en la liga con su jugador.
select set_config('request.jwt.claims', pg_temp.jwt('beto'), true);
set local role authenticated;
do $$
declare
  v_id uuid := pg_temp.id('bowl_invite');
  d jsonb;
  r jsonb;
begin
  assert exists (select 1 from jsonb_array_elements(public.my_league_invites()) x
                  where x ->> 'id' = v_id::text and x ->> 'leagueId' = pg_temp.val('bowl')), 'FAIL invitaciones: Beto no ve su invitación';
  d := public.league_invite_details(p_invite => v_id);
  assert d ->> 'status' = 'pending' and d -> 'league' ->> 'id' = pg_temp.val('bowl') and d -> 'invitedBy' ->> 'id' = pg_temp.val('u_owner')
     and not (d ->> 'member')::boolean, format('FAIL invitaciones: league_invite_details %s', d);
  r := public.respond_league_invite(p_invite => v_id, p_accept => true);
  assert r ->> 'status' = 'accepted' and r ->> 'leagueId' = pg_temp.val('bowl') and r ->> 'playerId' is not null,
    format('FAIL invitaciones: aceptar %s', r);
  assert (select m.role = 'member' and m.player_id = (r ->> 'playerId')::uuid
            from public.memberships m where m.league_id = pg_temp.id('bowl') and m.user_id = pg_temp.id('u_beto')),
    'FAIL invitaciones: Beto no quedó de miembro con su jugador';
  assert (select i.status from public.league_invites i where i.id = v_id) = 'accepted', 'FAIL invitaciones: la invitación no quedó aceptada';
  assert public.respond_league_invite(p_invite => v_id, p_accept => false) ->> 'status' = 'accepted', 'FAIL invitaciones: responder otra vez';
  perform pg_temp.ok('invitaciones: Beto ve la invitación (my_league_invites, league_invite_details), la acepta y queda en la liga');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- 9d. Legal: aceptar los términos vigentes y reportar contenido (todo se deshace con el ROLLBACK)
-- =====================================================================================================================

-- 9d.1 Las versiones vigentes (como quien corre el archivo: private no lo ejecuta la app).
do $$
begin
  perform pg_temp.guard();
  perform pg_temp.put('legal_terms', private.legal_versions() ->> 'terms');
  perform pg_temp.put('legal_privacy', private.legal_versions() ->> 'privacy');
  perform pg_temp.ok(format('legal: versiones vigentes términos %s, privacidad %s', pg_temp.val('legal_terms'), pg_temp.val('legal_privacy')));
end $$;

-- 9d.2 Ana acepta lo vigente y reporta: el comentario de Luis, el juego del dueño y la cuenta del dueño.
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  v_comment uuid;
  v_id uuid;
begin
  perform public.accept_legal(p_terms => pg_temp.val('legal_terms'), p_privacy => pg_temp.val('legal_privacy'));
  perform public.accept_legal(p_terms => pg_temp.val('legal_terms'), p_privacy => pg_temp.val('legal_privacy'));
  assert (select count(*) from public.legal_acceptances a) = 2, 'FAIL legal: Ana no ve sus dos aceptaciones (o ve ajenas)';
  select c.id into v_comment from public.comments c where c.league_id = pg_temp.id('bowl') and c.user_id = pg_temp.id('u_luis') limit 1;
  assert v_comment is not null, 'FAIL legal: no está el comentario de Luis';
  v_id := public.report_content(p_kind => 'comment', p_target => v_comment, p_reason => 'ofensivo', p_note => 'Smoke');
  assert public.report_content(p_kind => 'comment', p_target => v_comment, p_reason => 'acoso') = v_id, 'FAIL legal: reportar dos veces crea otro';
  perform pg_temp.put('rep_comment', v_id::text);
  perform pg_temp.put('rep_game', public.report_content(p_kind => 'game', p_target => pg_temp.id('bowl_e_owner'), p_reason => 'falso')::text);
  perform pg_temp.put('rep_user', public.report_content(p_kind => 'user', p_target => pg_temp.id('u_owner'), p_reason => 'spam')::text);
  assert (select count(*) from public.reports r where r.status = 'open') = 3, 'FAIL legal: Ana no ve sus reportes';
  assert jsonb_array_length(public.my_reports()) = 3, 'FAIL legal: my_reports («Descargar mis datos») no trae sus 3 reportes';
  perform pg_temp.ok('legal: Ana acepta lo vigente (idempotente) y reporta un comentario (una vez), un juego y una cuenta');
end $$;
select pg_temp.must_fail('legal: aceptar otra versión',
  'select public.accept_legal(p_terms => ''2000-01-01'', p_privacy => ''2000-01-01'')', array['invalido']);
select pg_temp.must_fail('legal: nadie lee quién reportó directo',
  'select reporter_id from public.reports', array['42501']);
reset role;
select set_config('request.jwt.claims', '', true);

-- 9d.3 Alguien de fuera no reporta lo que no ve ni lee reportes.
select set_config('request.jwt.claims', pg_temp.jwt('out'), true);
set local role authenticated;
select pg_temp.must_fail('legal: el de fuera no reporta la liga privada',
  format('select public.report_content(p_kind => %L, p_target => %L::uuid, p_reason => %L)', 'league', pg_temp.val('bowl'), 'spam'),
  array['no_existe']);
select pg_temp.must_fail('legal: el de fuera no lee la lista de la liga',
  format('select public.list_reports(p_league => %L::uuid)', pg_temp.val('bowl')), array['no_permitido', '42501']);
reset role;
select set_config('request.jwt.claims', '', true);

-- 9d.4 El dueño (admin de la liga) ve el comentario (sin quién reportó) y no el de su propio juego; atiende el
-- comentario y no su juego.
select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  r jsonb;
begin
  r := public.list_reports(p_league => pg_temp.id('bowl'));
  assert (r ->> 'total')::integer = 1 and not exists (select 1 from jsonb_array_elements(r -> 'rows') x
                                                       where x ->> 'reporterId' is not null or x ->> 'kind' <> 'comment'),
    format('FAIL legal: list_reports del dueño %s', r);
  perform public.resolve_report(p_report => pg_temp.id('rep_comment'), p_status => 'dismissed', p_note => 'Smoke');
  assert (select r2.status from public.reports r2 where r2.id = pg_temp.id('rep_comment')) = 'dismissed', 'FAIL legal: el dueño no descarta';
  perform pg_temp.ok('legal: el dueño ve los reportes de su liga sin quién reportó (no el de su juego) y descarta el del comentario');
end $$;
select pg_temp.must_fail('legal: el dueño no decide el reporte de su propio juego',
  format('select public.resolve_report(p_report => %L::uuid, p_status => %L)', pg_temp.val('rep_game'), 'dismissed'),
  array['no_permitido', '42501']);
reset role;
select set_config('request.jwt.claims', '', true);

-- 9d.5 El superadmin ve todo con quién reportó, atiende la cuenta (queda en la auditoría) y ve quién aceptó.
select set_config('request.jwt.claims', pg_temp.jwt('super'), true);
set local role authenticated;
do $$
declare
  r jsonb;
  s jsonb;
begin
  r := public.list_reports(p_status => 'all', p_league => pg_temp.id('bowl'));
  assert (r ->> 'all')::integer = 2 and exists (select 1 from jsonb_array_elements(r -> 'rows') x where x ->> 'reporterId' = pg_temp.val('u_ana')),
    format('FAIL legal: list_reports del superadmin %s', r);
  perform public.resolve_report(p_report => pg_temp.id('rep_user'), p_status => 'actioned', p_note => 'Smoke');
  assert exists (select 1 from public.admin_audit a where a.action = 'resolve_report' and a.target_id = pg_temp.val('rep_user')),
    'FAIL legal: resolve_report no quedó en la auditoría';
  s := public.admin_legal_stats();
  assert (s ->> 'accepted')::integer >= 1 and s ->> 'terms' = pg_temp.val('legal_terms'), format('FAIL legal: admin_legal_stats %s', s);
  perform pg_temp.ok('legal: el superadmin ve quién reportó, atiende la cuenta (auditoría) y cuántos aceptaron');
end $$;
select pg_temp.must_fail('legal: lo que descartó el dueño no se vuelve a decidir',
  format('select public.resolve_report(p_report => %L::uuid, p_status => %L)', pg_temp.val('rep_comment'), 'actioned'),
  array['cerrado']);
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- 9e. Juegos sueltos del boliche y el logo de la liga (todo se deshace con el ROLLBACK)
-- =====================================================================================================================

-- 9e.1 Ana anota un juego suelto (idempotente con p_op_id), lo corrige y anota otro que no sale en su perfil.
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  v_op uuid := gen_random_uuid();
  v_today date := (now() at time zone 'America/Santo_Domingo')::date;
  v_id uuid;
  v_hidden uuid;
  r jsonb;
begin
  v_id := public.save_solo_session(p_id => gen_random_uuid(), p_played_on => v_today, p_scores => '[180, 200]'::jsonb,
                                   p_venue => ' Bolera Smoke ', p_op_id => v_op);
  assert public.save_solo_session(p_id => gen_random_uuid(), p_played_on => v_today, p_scores => '[100]'::jsonb, p_op_id => v_op) = v_id,
    'FAIL sueltos: reintentar con el mismo p_op_id no devuelve el mismo juego';
  assert (select count(*) from public.solo_sessions s where s.user_id = pg_temp.id('u_ana')) = 1, 'FAIL sueltos: el reintento creó otro';
  perform public.save_solo_session(p_id => v_id, p_played_on => v_today - 1, p_scores => '[180, 210]'::jsonb, p_venue => 'Bolera Smoke',
                                   p_frames => '{"0": {"rolls": [10]}}'::jsonb);
  v_hidden := public.save_solo_session(p_id => null, p_played_on => v_today, p_scores => '[150]'::jsonb, p_shared => false);
  r := public.solo_sessions_of();
  assert jsonb_array_length(r) = 2 and r -> 1 ->> 'id' = v_id::text and r -> 1 -> 'scores' = '[180, 210]'::jsonb
     and r -> 1 ->> 'venue' = 'Bolera Smoke' and r -> 0 ->> 'id' = v_hidden::text and not (r -> 0 ->> 'shared')::boolean,
    format('FAIL sueltos: solo_sessions_of %s', r);
  perform pg_temp.put('solo_ana', v_id::text);
  perform pg_temp.put('solo_ana_hidden', v_hidden::text);
  perform pg_temp.ok('sueltos: Ana anota un juego suelto (idempotente con p_op_id), lo corrige y otro que no sale en su perfil');
  perform pg_temp.must_fail('sueltos: un juego de 301 pinos no se guarda',
    format('select public.save_solo_session(p_id => null, p_played_on => %L, p_scores => %L)', v_today, '[301]'), array['invalido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 9e.2 El dueño ve solo el compartido de Ana (también en su perfil) y le da me gusta; no lo cambia ni lo borra.
select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  r jsonb;
  g jsonb;
begin
  r := public.solo_sessions_of(p_user => pg_temp.id('u_ana'));
  assert jsonb_array_length(r) = 1 and r -> 0 ->> 'id' = pg_temp.val('solo_ana'), format('FAIL sueltos: el dueño ve %s', r);
  assert (select count(*) from public.solo_sessions) = 0, 'FAIL sueltos: el dueño lee directo los juegos sueltos de Ana';
  g := public.profile_games(p_user => pg_temp.id('u_ana'), p_sport => 'bowling');
  assert exists (select 1 from jsonb_array_elements(g) x
                  where x ->> 'kind' = 'solo' and x ->> 'id' = pg_temp.val('solo_ana') and x ->> 'leagueId' is null
                    and x ->> 'url' is null and (x -> 'detail' ->> 'series')::integer = 390),
    format('FAIL sueltos: profile_games sin el juego suelto (%s)', g);
  assert not exists (select 1 from jsonb_array_elements(g) x where x ->> 'id' = pg_temp.val('solo_ana_hidden')),
    'FAIL sueltos: sale en el perfil uno que no es compartido';
  r := public.set_game_like(p_kind => 'solo', p_id => pg_temp.id('solo_ana'), p_liked => true);
  assert (r ->> 'liked')::boolean and (r ->> 'likes')::integer = 1, format('FAIL sueltos: set_game_like %s', r);
  perform pg_temp.ok('sueltos: el dueño ve solo el compartido de Ana (solo_sessions_of, profile_games) y le da me gusta');
  perform pg_temp.must_fail('sueltos: nadie cambia el juego suelto de otra cuenta',
    format('select public.save_solo_session(p_id => %L, p_played_on => current_date, p_scores => %L)', pg_temp.val('solo_ana'), '[300]'),
    array['no_permitido']);
  perform pg_temp.must_fail('sueltos: nadie borra el juego suelto de otra cuenta',
    format('select public.delete_solo_session(p_id => %L)', pg_temp.val('solo_ana')), array['no_permitido']);
  perform pg_temp.must_fail('sueltos: no se le da me gusta a uno que no es compartido',
    format('select public.set_game_like(p_kind => %L, p_id => %L, p_liked => true)', 'solo', pg_temp.val('solo_ana_hidden')),
    array['no_permitido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 9e.3 Ana ve el aviso del me gusta y borra sus juegos sueltos.
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  r jsonb := public.social_notices();
begin
  assert exists (select 1 from jsonb_array_elements(r) x
                  where x ->> 'kind' = 'like' and x ->> 'gameKind' = 'solo' and x ->> 'id' = pg_temp.val('solo_ana')
                    and x ->> 'userId' = pg_temp.val('u_owner')),
    format('FAIL sueltos: social_notices sin el me gusta del juego suelto (%s)', r);
  perform public.delete_solo_session(p_id => pg_temp.id('solo_ana'));
  perform public.delete_solo_session(p_id => pg_temp.id('solo_ana_hidden'));
  assert public.solo_sessions_of() = '[]'::jsonb, 'FAIL sueltos: quedaron juegos sueltos después de borrarlos';
  assert (select count(*) from public.solo_likes l where l.session_id = pg_temp.id('solo_ana')) = 0, 'FAIL sueltos: quedó el me gusta';
  perform pg_temp.ok('sueltos: Ana ve el aviso del me gusta (social_notices) y borra sus juegos sueltos (con sus me gusta)');
  perform pg_temp.must_fail('sueltos: un guardado viejo (la cola de otro teléfono) no revive el juego borrado',
    format('select public.save_solo_session(p_id => %L, p_played_on => current_date, p_scores => %L)', pg_temp.val('solo_ana'), '[200]'),
    array['no_existe']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 9e.4 El dueño reserva, pone y cambia el logo de su liga (begin_logo_upload, set_league_logo); sale en la invitación.
select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  v_a text := pg_temp.val('bowl') || '/' || gen_random_uuid()::text || '.webp';
  v_b text := pg_temp.val('bowl') || '/' || gen_random_uuid()::text || '.jpg';
begin
  assert not private.can_upload_logo_path(p_path => v_a), 'FAIL logo: se puede subir el logo sin reservar la ruta';
  perform public.begin_logo_upload(p_league => pg_temp.id('bowl'), p_path => v_a);
  perform public.begin_logo_upload(p_league => pg_temp.id('bowl'), p_path => v_b);
  assert private.can_upload_logo_path(p_path => v_a), 'FAIL logo: el dueño no puede subir el logo que reservó (can_upload_logo_path)';
  assert public.set_league_logo(p_league => pg_temp.id('bowl'), p_path => v_a) is null, 'FAIL logo: el primero devolvió algo';
  assert public.set_league_logo(p_league => pg_temp.id('bowl'), p_path => v_b) = v_a, 'FAIL logo: no devolvió el anterior';
  assert private.can_remove_logo_path(p_path => v_a), 'FAIL logo: el anterior no se puede borrar de Storage';
  assert (select l.logo_path from public.leagues l where l.id = pg_temp.id('bowl')) = v_b, 'FAIL logo: la liga no quedó con el logo';
  assert (select x.logo_path from public.invite_preview(p_code => pg_temp.val('bowl_code')) x) = v_b, 'FAIL logo: invite_preview sin el logo';
  assert public.invite_details(p_code => pg_temp.val('bowl_code')) ->> 'logoPath' = v_b, 'FAIL logo: invite_details sin el logo';
  perform pg_temp.put('bowl_logo', v_b);
  perform pg_temp.ok('logo: el dueño pone y cambia el logo (set_league_logo) y sale en invite_preview e invite_details');
  perform pg_temp.must_fail('logo: una ruta de otra liga no sirve',
    format('select public.set_league_logo(p_league => %L, p_path => %L)', pg_temp.val('bowl'),
           pg_temp.val('padel') || '/' || gen_random_uuid()::text || '.webp'),
    array['invalido']);
  perform pg_temp.must_fail('logo: una ruta sin reservar no sirve',
    format('select public.set_league_logo(p_league => %L, p_path => %L)', pg_temp.val('bowl'),
           pg_temp.val('bowl') || '/' || gen_random_uuid()::text || '.webp'),
    array['invalido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 9e.5 Ana (miembro) ve el logo, pero no lo sube ni lo cambia.
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
begin
  assert (select l.logo_path from public.leagues l where l.id = pg_temp.id('bowl')) = pg_temp.val('bowl_logo'), 'FAIL logo: un miembro no ve el logo';
  assert not private.can_upload_logo_path(p_path => pg_temp.val('bowl') || '/' || gen_random_uuid()::text || '.webp'),
    'FAIL logo: un miembro puede subir el logo';
  perform pg_temp.ok('logo: Ana (miembro) ve el logo y no lo puede subir');
  perform pg_temp.must_fail('logo: un miembro no cambia el logo',
    format('select public.set_league_logo(p_league => %L, p_path => null)', pg_temp.val('bowl')), array['no_permitido']);
  perform pg_temp.must_fail('logo: un miembro no reserva dónde subir un logo',
    format('select public.begin_logo_upload(p_league => %L, p_path => %L)', pg_temp.val('bowl'),
           pg_temp.val('bowl') || '/' || gen_random_uuid()::text || '.webp'),
    array['no_permitido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- 9f. Insignias (20260929001100–001190): el motor encola, el creador de la liga da una y Ana la ve
-- =====================================================================================================================

-- 9f.1 Los juegos verificados del boliche de arriba dejaron trabajos para el motor (la Edge Function `insignias` los
-- toma cada 10 minutos; aquí no corre: el ROLLBACK los quita).
do $$
begin
  assert exists (select 1 from private.badge_queue q where q.league_id = pg_temp.id('bowl') and q.kind = 'resultado'),
    'FAIL insignias: los juegos del boliche no encolaron nada para el motor (private.badge_queue)';
  assert private.push_category('insignias') = 'social' and private.push_category('insignia:x') = 'social'
     and private.push_category('insignia-aval:x') is null, 'FAIL insignias: categorías de los avisos (private.push_category)';
  perform pg_temp.ok('insignias: los juegos del boliche encolan trabajos del motor (badge_queue) y sus avisos van en «Social»');
end $$;

-- 9f.2 El dueño diseña una insignia de su liga y se la da a Ana (con su aviso al teléfono).
select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  d jsonb;
  g jsonb;
begin
  d := public.save_league_badge(p_league => pg_temp.id('bowl'), p_id => null,
         p_design => jsonb_build_object('name', 'Smoke Campeón', 'shape', 'shield', 'palette', 'oro', 'icon', 'trophy',
                                        'limit_kind', 'unica', 'period_text', 'TEMP 2026'));
  assert d ->> 'id' is not null, format('FAIL insignias: save_league_badge %s', d);
  g := public.award_league_badge(p_badge => (d ->> 'id')::uuid, p_players => array[pg_temp.id('bowl_p_ana')]);
  assert jsonb_array_length(g -> 'awards') = 1, format('FAIL insignias: award_league_badge %s', g);
  perform pg_temp.put('badge_design', d ->> 'id');
  perform pg_temp.put('badge_award', g -> 'awards' -> 0 ->> 'id');
  perform pg_temp.ok('insignias: el dueño diseña una insignia de la liga (save_league_badge) y se la da a Ana (award_league_badge)');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

do $$
begin
  assert (select count(*) from public.push_outbox o
           where o.user_id = pg_temp.id('u_ana') and o.tag = 'insignia:' || pg_temp.val('badge_award') and o.subscription_id is not null) = 1,
    'FAIL insignias: el aviso «¡Tienes una insignia nueva!» no le llegó al teléfono de Ana';
  perform pg_temp.ok('insignias: el aviso de la insignia le llega al teléfono de Ana');
end $$;

-- 9f.3 Ana la ve en su perfil y en sus avisos y la marca vista; no diseña insignias (es miembro).
select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
declare
  v_award jsonb := jsonb_build_array(jsonb_build_object('id', pg_temp.id('badge_award')));
  p jsonb;
  n jsonb;
begin
  p := public.profile_badges(p_user => pg_temp.id('u_ana'));
  assert (p -> 'leagueAwards') @> v_award, format('FAIL insignias: profile_badges de Ana %s', p);
  n := public.badge_notices();
  assert (n -> 'leagueAwards') @> v_award, format('FAIL insignias: badge_notices de Ana %s', n);
  assert public.mark_league_badges_seen(p_ids => array[pg_temp.id('badge_award')]) = 1, 'FAIL insignias: mark_league_badges_seen';
  perform pg_temp.ok('insignias: Ana ve la insignia en su perfil (profile_badges) y en sus avisos (badge_notices) y la marca vista');
  perform pg_temp.must_fail('insignias: un miembro no diseña insignias de la liga',
    format('select public.save_league_badge(p_league => %L, p_id => null, p_design => %L)', pg_temp.val('bowl'),
           '{"name": "Smoke X", "shape": "shield", "palette": "oro", "icon": "trophy", "limit_kind": "unica"}'),
    array['no_permitido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- 9g. Premios del torneo (20260929001200): un torneo nuevo del boliche nace con individual por handicap y equipos por
-- scratch; el dueño elige la insignia del campeón, ve el podio que calcula el servidor y se entrega el suyo (con el
-- orden verificado el admin que ganó puede); Ana no entrega
-- =====================================================================================================================
select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  v_ev uuid;
  e_owner uuid;
  e_ana uuid;
  v_slot uuid;
  v_units jsonb;
  p jsonb;
  q jsonb;
  d jsonb;
begin
  -- Ayer en UTC: en la zona de la liga es hoy o ayer, así que el torneo ya cuenta.
  v_ev := public.create_event(p_league => pg_temp.id('bowl'), p_type => 'torneo', p_date => current_date - 1,
                              p_name => 'Smoke Premio', p_games => 1, p_hcp_base => 230, p_hcp_percent => 80);
  assert (select e.individual_rank_by = 'hcp' and e.team_rank_by = 'scratch' from public.events e where e.id = v_ev),
    'FAIL premios: un torneo nuevo del boliche no nació con individual por handicap y equipos por scratch';
  perform public.add_entries(p_event => v_ev, p_players => jsonb_build_array(
    jsonb_build_object('player_id', pg_temp.id('bowl_p_owner'), 'average', 180),
    jsonb_build_object('player_id', pg_temp.id('bowl_p_ana'), 'average', 170)));
  select x.id into e_owner from public.entries x where x.event_id = v_ev and x.player_id = pg_temp.id('bowl_p_owner');
  select x.id into e_ana from public.entries x where x.event_id = v_ev and x.player_id = pg_temp.id('bowl_p_ana');
  -- Con handicap: el dueño 250 + 40 = 290, Ana 240 + 48 = 288.
  perform public.save_game(p_entry => e_owner, p_game => 0, p_score => 250);
  perform public.save_game(p_entry => e_ana, p_game => 0, p_score => 240);
  -- La «Smoke Campeón» de 9f (Única, ya dada a Ana): el premio del torneo no usa su cupo.
  p := public.set_tournament_prizes(p_league => pg_temp.id('bowl'), p_scope => 'evento', p_ref => v_ev, p_period => null,
         p_slots => jsonb_build_array(jsonb_build_object('category', 'individual', 'place', 1, 'badge_id', pg_temp.id('badge_design'))));
  v_slot := (p -> 'slots' -> 0 ->> 'id')::uuid;
  assert p -> 'slots' -> 0 ->> 'title' = 'Individual (handicap)', format('FAIL premios: set_tournament_prizes %s', p);
  q := public.tournament_podium(p_prize => (p ->> 'id')::uuid);
  assert q -> 'slots' -> 0 ->> 'status' = 'listo' and q -> 'slots' -> 0 -> 'units' -> 0 ->> 'ref' = 'p:' || pg_temp.val('bowl_p_owner'),
    format('FAIL premios: tournament_podium %s', q);
  v_units := (select jsonb_agg(jsonb_build_object('ref', u ->> 'ref',
                                                  'players', (select jsonb_agg(x -> 'id') from jsonb_array_elements(u -> 'players') x)))
                from jsonb_array_elements(q -> 'slots' -> 0 -> 'units') u);
  d := public.deliver_tournament_prizes(p_prize => (p ->> 'id')::uuid,
         p_podium => jsonb_build_array(jsonb_build_object('slot_id', v_slot, 'units', v_units)));
  assert (d ->> 'added')::integer = 1, format('FAIL premios: deliver_tournament_prizes %s', d);
  d := public.deliver_tournament_prizes(p_prize => (p ->> 'id')::uuid,
         p_podium => jsonb_build_array(jsonb_build_object('slot_id', v_slot, 'units', v_units)));
  assert (d ->> 'added')::integer = 0 and (d ->> 'unchanged')::integer = 1, format('FAIL premios: entregar otra vez %s', d);
  assert (select count(*) from public.league_badge_awards a
           where a.prize_slot_id = v_slot and a.revoked_at is null and a.player_id = pg_temp.id('bowl_p_owner')) = 1,
    'FAIL premios: el dueño no tiene su premio';
  perform pg_temp.put('prize', p ->> 'id');
  perform pg_temp.ok('premios: el dueño elige el premio del campeón (set_tournament_prizes), ve el podio (tournament_podium) y se entrega el suyo (deliver_tournament_prizes, otra vez no cambia nada)');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.tournament_prize_slots s where s.prize_id = pg_temp.id('prize')) = 1,
    'FAIL premios: Ana no lee los premios de su liga';
  perform pg_temp.must_fail('premios: un miembro no entrega premios',
    format('select public.tournament_podium(p_prize => %L)', pg_temp.val('prize')), array['no_permitido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- =====================================================================================================================
-- 9h. Anotadores (20260929001400): el dueño crea el link para anotar el torneo; sin cuenta se ve a dónde lleva; alguien
-- de fuera entra (liga privada, sin el código de la liga) y queda anotador sin jugador: anota el torneo, no la
-- práctica. El dueño le quita el permiso (sale de la liga; el mismo link ya no lo deja volver) y quita el link
-- =====================================================================================================================
select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  k jsonb;
begin
  k := public.create_scorer_link(p_league => pg_temp.id('bowl'), p_scope => 'evento', p_ref => pg_temp.id('bowl_tour'));
  assert k ->> 'code' ~ '^[A-HJ-NP-Z2-9]{10}$' and k ->> 'status' = 'ok' and (k ->> 'uses')::integer = 0
         and k ->> 'path' = '/l/' || pg_temp.val('bowl') || '/e/' || pg_temp.val('bowl_tour'),
    format('FAIL anotadores: create_scorer_link %s', k);
  assert public.create_scorer_link(p_league => pg_temp.id('bowl'), p_scope => 'evento', p_ref => pg_temp.id('bowl_tour')) ->> 'id' = k ->> 'id',
    'FAIL anotadores: crear dos veces no da el mismo link';
  perform pg_temp.put('scorer_link', k ->> 'id');
  perform pg_temp.put('scorer_code', k ->> 'code');
  perform pg_temp.ok('anotadores: el dueño crea el link para anotar el torneo (create_scorer_link; otra vez da el mismo)');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', '{"role": "anon"}', true);
select set_config('request.headers', json_build_object('x-real-ip', 'smoke-' || pg_temp.val('tag'))::text, true);
set local role anon;
do $$
declare
  p jsonb := public.scorer_link_preview(p_code => pg_temp.val('scorer_code'));
begin
  assert p ->> 'status' = 'ok' and p ->> 'leagueId' = pg_temp.val('bowl') and p ->> 'title' = 'Smoke Copa'
         and not (p ->> 'member')::boolean and not (p ->> 'canScore')::boolean,
    format('FAIL anotadores: scorer_link_preview sin cuenta %s', p);
  perform pg_temp.ok('anotadores: sin cuenta se ve a qué torneo lleva el link (scorer_link_preview)');
  perform pg_temp.must_fail('anotadores: sin cuenta no se entra a anotar',
    format('select public.join_as_scorer(p_code => %L)', pg_temp.val('scorer_code')), array['42501']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('ana'), true);
set local role authenticated;
do $$
begin
  perform pg_temp.must_fail('anotadores: un miembro no crea links para anotar',
    format('select public.create_scorer_link(p_league => %L)', pg_temp.val('bowl')), array['no_permitido']);
  perform pg_temp.must_fail('anotadores: un miembro no nombra anotadores',
    format('select public.set_member_scorer(p_league => %L, p_user => %L, p_scorer => true)', pg_temp.val('bowl'), pg_temp.val('u_luis')),
    array['no_permitido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('out'), true);
set local role authenticated;
do $$
declare
  r jsonb := public.join_as_scorer(p_code => pg_temp.val('scorer_code'));
  v_prac_entry uuid;
begin
  assert r ->> 'status' = 'joined' and r ->> 'leagueId' = pg_temp.val('bowl'), format('FAIL anotadores: join_as_scorer %s', r);
  assert (select m.is_scorer and m.scorer_only and m.player_id is null from public.memberships m
           where m.league_id = pg_temp.id('bowl') and m.user_id = pg_temp.id('u_out')),
    'FAIL anotadores: quien entra con el link no quedó anotador sin jugador';
  assert public.ensure_my_player(p_league => pg_temp.id('bowl')) is null, 'FAIL anotadores: ensure_my_player le creó un jugador a quien solo anota';
  perform public.save_game(p_entry => pg_temp.id('bowl_e_owner'), p_game => 2, p_score => 190);
  assert (select x.scores[3] from public.entries x where x.id = pg_temp.id('bowl_e_owner')) = 190, 'FAIL anotadores: el anotador no anotó el torneo';
  perform public.save_game(p_entry => pg_temp.id('bowl_e_owner'), p_game => 2, p_score => null);
  perform pg_temp.ok('anotadores: alguien de fuera entra con el link (join_as_scorer, liga privada): anotador sin jugador que anota el torneo');
  select x.id into v_prac_entry from public.entries x where x.event_id = pg_temp.id('bowl_prac') order by x.id limit 1;
  assert v_prac_entry is not null, 'FAIL anotadores: la práctica no tiene participaciones';
  perform pg_temp.must_fail('anotadores: el anotador no anota las prácticas de la liga',
    format('select public.save_game(p_entry => %L, p_game => 0, p_score => 300)', v_prac_entry), array['no_permitido']);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
declare
  a jsonb := public.scorer_access(p_league => pg_temp.id('bowl'));
begin
  assert exists (select 1 from jsonb_array_elements(a -> 'links') x
                  where x ->> 'id' = pg_temp.val('scorer_link') and (x ->> 'uses')::integer = 1),
    format('FAIL anotadores: scorer_access %s', a);
  perform public.set_member_scorer(p_league => pg_temp.id('bowl'), p_user => pg_temp.id('u_out'), p_scorer => false);
  assert not exists (select 1 from public.league_members m where m.league_id = pg_temp.id('bowl') and m.user_id = pg_temp.id('u_out')),
    'FAIL anotadores: quitarle el permiso a quien solo anota no lo sacó de la liga';
  perform pg_temp.ok('anotadores: el dueño ve el link usado (scorer_access) y le quita el permiso (sale de la liga)');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('out'), true);
set local role authenticated;
do $$
begin
  assert public.join_as_scorer(p_code => pg_temp.val('scorer_code')) ->> 'status' = 'removed',
    'FAIL anotadores: a quien le quitaron el permiso el link lo dejó volver a entrar';
  assert not exists (select 1 from public.memberships m where m.league_id = pg_temp.id('bowl') and m.user_id = pg_temp.id('u_out')),
    'FAIL anotadores: join_as_scorer (removed) lo metió en la liga';
  perform pg_temp.ok('anotadores: a quien le quitaron el permiso, el mismo link ya no lo deja volver (removed)');
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', pg_temp.jwt('owner'), true);
set local role authenticated;
do $$
begin
  perform public.revoke_scorer_link(p_link => pg_temp.id('scorer_link'));
  assert public.scorer_link_preview(p_code => pg_temp.val('scorer_code')) ->> 'status' = 'revoked', 'FAIL anotadores: revoke_scorer_link';
  perform pg_temp.ok('anotadores: el dueño quita el link');
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
  o := public.admin_storage_usage();
  assert (o ->> 'dbLimit')::bigint = 524288000 and (o ->> 'storageLimit')::bigint = 1073741824 and (o ->> 'dbBytes')::bigint > 0
         and o ? 'storagePct' and o ? 'lastAlertAt' and o ? 'purgePending', format('FAIL consola: admin_storage_usage %s', o);
  o := public.admin_badges_engine();
  assert jsonb_typeof(o -> 'queue') = 'object' and (o -> 'queue' ->> 'pending')::integer >= 1, format('FAIL consola: admin_badges_engine %s', o -> 'queue');
  o := public.admin_badge_reports();
  assert o ? 'open' and jsonb_typeof(o -> 'rows') = 'array', 'FAIL consola: admin_badge_reports';
  perform pg_temp.ok('consola: el motor de insignias (admin_badges_engine) y sus reportes (admin_badge_reports)');
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
