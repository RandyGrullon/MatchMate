-- MatchMate · datos de desarrollo (`supabase db reset` los carga después de las migraciones; el backend local
-- de PGlite también puede cargarlos). NUNCA en producción: las cuentas tienen contraseña conocida.
--
-- Cuentas (contraseña matchmate123; en PGlite no hay contraseña, se entra como la cuenta):
--   admin@matchmate.local  superadmin (sembrado por SQL, como en producción)
--   org@matchmate.local    dueño de la «Liga de Referencia»
--   luis@matchmate.local   miembro con jugador y un envío pendiente
--   ana@matchmate.local    miembro con jugador
--
-- Caso de referencia del boliche (el de la paridad con BowlingX): 2 prácticas y 1 torneo con equipos,
-- handicap y categorías, un empate en el ranking y un jugador sin juegos. Todo se crea con las RPC de
-- verdad, actuando como cada cuenta (request.jwt.claims), para que valga lo mismo que en la app.
do $seed$
declare
  v_admin constant uuid := '00000000-0000-4000-8000-000000000001';
  v_org constant uuid := '00000000-0000-4000-8000-000000000002';
  v_luis constant uuid := '00000000-0000-4000-8000-000000000003';
  v_ana constant uuid := '00000000-0000-4000-8000-000000000004';
  v_pass text;
  v_league jsonb;
  v_lid uuid;
  v_code text;
  p_org uuid;
  p_luis uuid;
  p_ana uuid;
  p_pedro uuid;
  p_marta uuid;
  p_juan uuid;
  p_carla uuid;
  e_p1 uuid;
  e_p2 uuid;
  e_t uuid;
  v_teams uuid[];
  u record;
begin
  if exists (select 1 from auth.users where id = v_admin) then
    raise notice 'seed: ya estaba cargado';
    return;
  end if;

  -- ---------- Cuentas ----------
  -- En Supabase la contraseña va con pgcrypto (esquema extensions); en PGlite no hay, y no hace falta.
  if to_regprocedure('extensions.crypt(text,text)') is not null then
    execute $q$ select extensions.crypt('matchmate123', extensions.gen_salt('bf')) $q$ into v_pass;
  end if;
  for u in select * from (values
      (v_admin, 'admin@matchmate.local', 'Admin MatchMate'),
      (v_org, 'org@matchmate.local', 'Organizador'),
      (v_luis, 'luis@matchmate.local', 'Luis'),
      (v_ana, 'ana@matchmate.local', 'Ana')) as x (id, email, name) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
                            raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
                            email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, v_pass, now(),
            '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name, 'adult', true), now(), now(), '', '', '', '');
    -- GoTrue busca la identidad de correo para entrar con contraseña.
    if to_regclass('auth.identities') is not null then
      begin
        execute $q$
          insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          values (gen_random_uuid(), $1, $1::text, jsonb_build_object('sub', $1::text, 'email', $2, 'email_verified', true), 'email', now(), now(), now())
        $q$ using u.id, u.email;
      exception when others then
        raise warning 'seed: identidad de %: %', u.email, sqlerrm;
      end;
    end if;
  end loop;
  update public.profiles set is_superadmin = true where id = v_admin;

  -- ---------- Liga de Referencia (como el dueño) ----------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_org, 'role', 'authenticated')::text, true);
  v_league := public.create_league(p_name => 'Liga de Referencia', p_visibility => 'private', p_venue => 'Bowling Center',
                                   p_schedule => 'Martes 7:00 pm', p_season_start => '2026-01-01', p_season_end => '2026-12-31',
                                   p_contact_name => 'Organizador', p_contact_phone => '18095550000', p_require_photo => false);
  v_lid := (v_league ->> 'league_id')::uuid;
  p_org := (v_league ->> 'player_id')::uuid;
  v_code := v_league ->> 'invite_code';
  p_pedro := public.create_player(p_league => v_lid, p_name => 'Pedro');
  p_marta := public.create_player(p_league => v_lid, p_name => 'Marta', p_average_override => 180);
  p_juan := public.create_player(p_league => v_lid, p_name => 'Juan');
  -- Carla no juega nada: sale en la lista pero no en los rankings.
  p_carla := public.create_player(p_league => v_lid, p_name => 'Carla');

  -- ---------- Se unen con el código ----------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_luis, 'role', 'authenticated')::text, true);
  p_luis := (public.join_league(p_code => v_code) ->> 'player_id')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_ana, 'role', 'authenticated')::text, true);
  p_ana := (public.join_league(p_code => v_code) ->> 'player_id')::uuid;

  -- ---------- Eventos y juegos (como el dueño) ----------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_org, 'role', 'authenticated')::text, true);
  e_p1 := public.create_event(p_league => v_lid, p_type => 'practica', p_date => '2026-09-01', p_individual_rank_by => 'scratch',
                              p_team_rank_by => 'scratch');
  e_p2 := public.create_event(p_league => v_lid, p_type => 'practica', p_date => '2026-09-08', p_individual_rank_by => 'scratch',
                              p_team_rank_by => 'scratch');
  e_t := public.create_event(p_league => v_lid, p_type => 'torneo', p_date => '2026-09-15', p_name => 'Copa de Referencia',
                             p_hcp_base => 230, p_hcp_percent => 80, p_individual_rank_by => 'hcp', p_team_rank_by => 'scratch',
                             p_category_cuts => array[200, 175, 160], p_team_size => 2,
                             p_announcement => 'Copa de la liga: 3 juegos con handicap.');

  -- Práctica 1: 'sin-foto' = cuenta (la liga no exige foto).
  perform public.add_entries(e_p1, jsonb_build_array(
    jsonb_build_object('player_id', p_org, 'average', 0), jsonb_build_object('player_id', p_luis, 'average', 0),
    jsonb_build_object('player_id', p_pedro, 'average', 0), jsonb_build_object('player_id', p_marta, 'average', 180)));
  perform public.update_entries(jsonb_build_array(
    jsonb_build_object('id', (select id from public.entries where event_id = e_p1 and player_id = p_org),
      'patch', jsonb_build_object('scores', jsonb_build_array(190, 205, 178), 'photos', jsonb_build_array('sin-foto', 'sin-foto', 'sin-foto'))),
    jsonb_build_object('id', (select id from public.entries where event_id = e_p1 and player_id = p_luis),
      'patch', jsonb_build_object('scores', jsonb_build_array(160, 171, 155), 'photos', jsonb_build_array('sin-foto', 'sin-foto', 'sin-foto'))),
    jsonb_build_object('id', (select id from public.entries where event_id = e_p1 and player_id = p_pedro),
      'patch', jsonb_build_object('scores', jsonb_build_array(145, 150, 162), 'photos', jsonb_build_array('importado', 'importado', 'importado'))),
    -- Marta: el tercer juego quedó en borrador (sin verificar): no cuenta en estadísticas.
    jsonb_build_object('id', (select id from public.entries where event_id = e_p1 and player_id = p_marta),
      'patch', jsonb_build_object('scores', jsonb_build_array(182, 176, 199), 'photos', jsonb_build_array('sin-foto', 'sin-foto', null)))));

  -- Práctica 2 (con un juego anotado tiro por tiro: 300).
  perform public.add_entries(e_p2, jsonb_build_array(
    jsonb_build_object('player_id', p_org, 'average', 0), jsonb_build_object('player_id', p_luis, 'average', 0),
    jsonb_build_object('player_id', p_ana, 'average', 0), jsonb_build_object('player_id', p_juan, 'average', 0)));
  perform public.save_game(p_entry => (select id from public.entries where event_id = e_p2 and player_id = p_org), p_game => 0,
                           p_score => 300, p_frames => '{"rolls":[10,10,10,10,10,10,10,10,10,10,10,10]}');
  perform public.save_game((select id from public.entries where event_id = e_p2 and player_id = p_org), 1, 188);
  perform public.save_game((select id from public.entries where event_id = e_p2 and player_id = p_org), 2, 201);
  perform public.save_game((select id from public.entries where event_id = e_p2 and player_id = p_luis), 0, 168);
  perform public.save_game((select id from public.entries where event_id = e_p2 and player_id = p_luis), 1, 177);
  perform public.save_game((select id from public.entries where event_id = e_p2 and player_id = p_luis), 2, 159);
  perform public.save_game((select id from public.entries where event_id = e_p2 and player_id = p_ana), 0, 134);
  perform public.save_game((select id from public.entries where event_id = e_p2 and player_id = p_ana), 1, 141);
  perform public.save_game((select id from public.entries where event_id = e_p2 and player_id = p_ana), 2, 150);
  perform public.save_game((select id from public.entries where event_id = e_p2 and player_id = p_juan), 0, 171);
  perform public.save_game((select id from public.entries where event_id = e_p2 and player_id = p_juan), 1, 165);
  perform public.save_game((select id from public.entries where event_id = e_p2 and player_id = p_juan), 2, 179);

  -- Torneo: inscritos con el promedio de hoy y dos equipos de 2. Empate con handicap (230 − prom.) × 80 %:
  -- Luis 515 + 3 × 52 = 671 y Juan 530 + 3 × 47 = 671.
  perform public.add_entries(e_t, jsonb_build_array(
    jsonb_build_object('player_id', p_org, 'average', 210), jsonb_build_object('player_id', p_luis, 'average', 164),
    jsonb_build_object('player_id', p_pedro, 'average', 152), jsonb_build_object('player_id', p_juan, 'average', 171)));
  v_teams := public.apply_teams(e_t, jsonb_build_array(
    jsonb_build_object('team_id', null, 'name', 'Los Strikes', 'entry_ids', jsonb_build_array(
      (select id from public.entries where event_id = e_t and player_id = p_org), (select id from public.entries where event_id = e_t and player_id = p_pedro))),
    jsonb_build_object('team_id', null, 'name', 'Los Spares', 'entry_ids', jsonb_build_array(
      (select id from public.entries where event_id = e_t and player_id = p_luis), (select id from public.entries where event_id = e_t and player_id = p_juan)))));
  perform public.update_entries(jsonb_build_array(
    jsonb_build_object('id', (select id from public.entries where event_id = e_t and player_id = p_org),
      'patch', jsonb_build_object('scores', jsonb_build_array(215, 198, 222), 'photos', jsonb_build_array('sin-foto', 'sin-foto', 'sin-foto'))),
    jsonb_build_object('id', (select id from public.entries where event_id = e_t and player_id = p_luis),
      'patch', jsonb_build_object('scores', jsonb_build_array(170, 180, 165), 'photos', jsonb_build_array('sin-foto', 'sin-foto', 'sin-foto'))),
    jsonb_build_object('id', (select id from public.entries where event_id = e_t and player_id = p_pedro),
      'patch', jsonb_build_object('scores', jsonb_build_array(150, 158, 149), 'photos', jsonb_build_array('sin-foto', 'sin-foto', 'sin-foto'))),
    jsonb_build_object('id', (select id from public.entries where event_id = e_t and player_id = p_juan),
      'patch', jsonb_build_object('scores', jsonb_build_array(180, 170, 180), 'photos', jsonb_build_array('sin-foto', 'sin-foto', 'sin-foto')))));

  -- ---------- Luis: «voy» a la próxima práctica y un envío pendiente por fecha ----------
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_luis, 'role', 'authenticated')::text, true);
  perform public.set_rsvp(e_p2, true);
  perform public.submit_games(p_op_id => '00000000-0000-4000-8000-0000000000a1', p_league => v_lid, p_date => '2026-09-22',
                              p_scores => '[181, 169, 190]');

  perform set_config('request.jwt.claims', '', true);
  raise notice 'seed: Liga de Referencia % (código %)', v_lid, v_code;
end $seed$;
