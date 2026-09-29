-- MatchMate · Reclamos: «ese jugador soy yo». El admin crea jugadores sin cuenta (por nombre, con su promedio,
-- nivel, índice o datos de nadador, según el deporte); si esa persona se hace una cuenta, lo reclama y el dueño
-- o un admin de la liga lo aprueba. Antes el vínculo era inmediato (claim_player, join_league con p_prefer y el
-- «mismo nombre» de ensure_player); ahora siempre queda un pedido por aprobar.
--
-- 1. public.player_claims: los pedidos. Estados 'pending' → 'approved' | 'rejected' | 'cancelled'. Uno pendiente
--    por jugador y uno pendiente por cuenta y liga. Lo lee quien lo pidió y los admins de la liga (y el
--    superadmin); nadie escribe directo. Tiempo real 'claims' en 'league:<liga>' y 'user:<cuenta>'.
-- 2. request_player_claim(p_player, p_note): la cuenta (miembro de la liga, también justo después de
--    join_league) pide ser ese jugador: libre, no menor, de su liga. Pedirlo otra vez devuelve el mismo; pedir
--    otro jugador cancela el anterior; si otra cuenta ya lo pidió, 'duplicado'. 10 pedidos por día
--    ('rate_limited'). Si quien pide es dueño o admin de la liga, se aprueba al momento. Push a los admins:
--    «<nombre> dice que es <jugador>». Devuelve el id del pedido (null si el jugador ya es suyo).
-- 3. cancel_player_claim(p_claim): quien lo pidió lo retira.
-- 4. decide_player_claim(p_claim, p_approve, p_note): dueño, admin o superadmin. Aprobar vincula el jugador a la
--    cuenta y le pasa todo lo del jugador propio de la cuenta en esa liga (juegos, envíos, «voy», en vivo,
--    partidos, plantillas, tarjetas de golf, natación, escalera, inscripciones, sanciones, me gusta) y lo borra.
--    Si los dos jugaron el mismo evento o partido: 'conflicto: <qué choca>' (el admin lo arregla y aprueba
--    otra vez). Push a la cuenta: «Te aprobaron: ahora eres <jugador>» o «No se aprobó…». Devuelve el estado.
-- 5. player_claim_conflicts(p_claim): lo que chocaría al aprobar (para avisarle al admin antes).
-- 6. Cambian (misma firma): claim_player(p_player) = request_player_claim(p_player) y devuelve el id del
--    PEDIDO (antes, el jugador). private.ensure_player (join_league, ensure_my_player, join_signup) ya no
--    vincula al preferido ni al del mismo nombre: crea el jugador propio de la cuenta y deja el pedido de ese
--    jugador (un admin queda aprobado al momento y se devuelve el jugador reclamado). join_league devuelve
--    además 'claim_id' (el pedido pendiente, o null).
-- Los menores nunca se reclaman (no tienen cuenta). Salir de la liga cancela el pedido pendiente; si el admin vincula
-- el jugador con una cuenta por otro camino (link_account_to_player), su pedido pendiente se cierra solo.
--
-- Contrato del cliente: src/lib/data/claims.ts.

-- =====================================================================
-- Tabla
-- =====================================================================
-- claimant_name / player_name: cómo se llamaban al pedirlo (para la lista del admin y los avisos sin más
-- lecturas). decided_at también marca cuándo se canceló.
create table public.player_claims (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  player_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note text check (char_length(note) <= 300),
  claimant_name text not null default '' check (char_length(claimant_name) <= 60),
  player_name text not null default '' check (char_length(player_name) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 300),
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  check ((status = 'pending') = (decided_at is null))
);
create unique index player_claims_pending_player_key on public.player_claims (player_id) where status = 'pending';
create unique index player_claims_pending_user_key on public.player_claims (user_id, league_id) where status = 'pending';
create index player_claims_league_idx on public.player_claims (league_id, created_at desc);
create index player_claims_user_idx on public.player_claims (user_id, created_at desc);
create index player_claims_sync_idx on public.player_claims (league_id, updated_at);

create trigger player_claims_touch before update on public.player_claims
  for each row execute function private.touch_updated_at();
create trigger player_claims_tombstone after delete on public.player_claims
  for each row execute function private.tombstone('id');

alter table public.player_claims enable row level security;
create policy player_claims_read on public.player_claims for select to authenticated
  using (user_id = (select auth.uid()) or league_id in (select private.admin_leagues()));
grant select on public.player_claims to authenticated;

-- Tiempo real: solo dice cuál cambió (la pantalla vuelve a leer con su RLS).
create function private.emit_player_claims() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.player_claims;
begin
  if tg_op = 'DELETE' then
    r := old;
  else
    r := new;
  end if;
  perform private.emit('league:' || r.league_id::text, 'claims', jsonb_build_object('id', r.id, 'status', r.status));
  perform private.emit('user:' || r.user_id::text, 'claims', jsonb_build_object('id', r.id, 'status', r.status, 'league_id', r.league_id));
  return null;
end $$;
create trigger player_claims_emit after insert or update or delete on public.player_claims
  for each row execute function private.emit_player_claims();

-- Salir de la liga (o que lo saquen) cancela su pedido pendiente.
create function private.cancel_claims_on_leave() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Se borra la liga o la cuenta: los pedidos se van con ellas (cascada).
  if not exists (select 1 from public.leagues l where l.id = old.league_id)
     or not exists (select 1 from public.profiles p where p.id = old.user_id) then
    return null;
  end if;
  update public.player_claims c set status = 'cancelled', decided_at = now()
   where c.league_id = old.league_id and c.user_id = old.user_id and c.status = 'pending';
  return null;
end $$;
create trigger league_members_cancel_claims after delete on public.league_members
  for each row execute function private.cancel_claims_on_leave();

-- El jugador queda con una cuenta por otro camino (el admin la vincula con link_account_to_player): el pedido
-- pendiente de esa misma cuenta queda aprobado y el de otra, rechazado (no queda colgado en la lista del admin).
create function private.settle_claims_on_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.player_claims c
     set status = case when c.user_id = new.user_id then 'approved' else 'rejected' end,
         decided_at = now(),
         decision_note = case when c.user_id = new.user_id then c.decision_note else 'Ese jugador ya quedó con otra cuenta.' end
   where c.player_id = new.id and c.status = 'pending';
  return null;
end $$;
create trigger players_settle_claims after update of user_id on public.players
  for each row when (old.user_id is null and new.user_id is not null)
  execute function private.settle_claims_on_link();

-- =====================================================================
-- Ayudas
-- =====================================================================

-- Dueño o admin de la liga (o superadmin) por cuenta (is_admin mira la sesión).
create function private.user_is_admin(p_league uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.league_members m
                  where m.league_id = p_league and m.user_id = p_user and m.role in ('owner', 'admin'))
      or coalesce((select p.is_superadmin from public.profiles p where p.id = p_user), false)
$$;

-- Lo que chocaría al juntar p_from con p_into: los dos en el mismo evento, partido, ronda, prueba o escalera, o
-- (baloncesto y fútbol) en equipos distintos de la temporada, donde cada jugador es de un solo equipo.
-- [{what, label, count}] (vacío = se pueden juntar).
create function private.claim_conflicts(p_from uuid, p_into uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('what', x.what, 'label', x.label, 'count', x.n) order by x.ord), '[]'::jsonb)
    from (
      select 1 as ord, 'entries' as what, 'Juegos en el mismo evento' as label, count(*) as n
        from public.entries a join public.entries c on c.event_id = a.event_id
       where a.player_id = p_from and c.player_id = p_into
      union all
      select 2, 'matches', 'Partidos donde juegan los dos', count(*)
        from public.match_players a join public.match_players c on c.match_id = a.match_id
       where a.player_id = p_from and c.player_id = p_into
      union all
      select 3, 'golf_cards', 'Tarjetas de golf de la misma ronda', count(*)
        from public.golf_cards a join public.golf_cards c on c.event_id = a.event_id
       where a.player_id = p_from and c.player_id = p_into
      union all
      select 4, 'swim_entries', 'La misma prueba de natación', count(*)
        from public.swim_entries a join public.swim_entries c on c.swim_event_id = a.swim_event_id
       where a.player_id = p_from and c.player_id = p_into
      union all
      select 5, 'ladder_rungs', 'La misma escalera', count(*)
        from public.ladder_rungs a join public.ladder_rungs c on c.event_id = a.event_id
       where a.player_id = p_from and c.player_id = p_into
      union all
      select 6, 'event_signups', 'Inscritos en el mismo evento', count(*)
        from public.event_signups a join public.event_signups c on c.event_id = a.event_id
       where a.player_id = p_from and c.player_id = p_into
      union all
      select 7, 'team_players', 'Equipos distintos de la temporada', count(*)
        from public.team_players a
        join public.teams ta on ta.id = a.team_id and ta.event_id is null
        join public.team_players c on c.league_id = a.league_id and c.team_id <> a.team_id and c.player_id = p_into
        join public.teams tc on tc.id = c.team_id and tc.event_id is null
       where a.player_id = p_from
         and not exists (select 1 from public.team_players x where x.team_id = a.team_id and x.player_id = p_into)
         and private.league_family(a.league_id) = 'team'
    ) x
   where x.n > 0
$$;

-- Pasa todo lo de p_from (el jugador propio de la cuenta) a p_into (el reclamado) y borra p_from. Si algo choca,
-- 'conflicto: <qué>' y no cambia nada. Al final revisa en el catálogo que ninguna tabla con FK a players quede
-- apuntando a p_from (una tabla nueva que no esté aquí frena la unión en vez de perder datos al borrarlo).
create function private.merge_players(p_from uuid, p_into uuid, p_league uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_conf jsonb := private.claim_conflicts(p_from, p_into);
  v_list text;
  v_from text := p_from::text;
  v_into text := p_into::text;
  v_left boolean;
  f record;
begin
  if jsonb_array_length(v_conf) > 0 then
    select string_agg((x ->> 'label') || ' (' || (x ->> 'count') || ')', ', ') into v_list from jsonb_array_elements(v_conf) x;
    raise exception 'conflicto: %', v_list using errcode = 'P0001';
  end if;

  -- Boliche: participaciones con sus felicitaciones y comentarios en UNA sentencia (la FK compuesta de
  -- reactions/comments a entries se revisa al final de la sentencia).
  with r as (update public.reactions x set player_id = p_into where x.player_id = p_from returning 1),
       c as (update public.comments x set player_id = p_into where x.player_id = p_from returning 1)
  update public.entries e set player_id = p_into where e.player_id = p_from;
  update public.submissions s set player_id = p_into where s.player_id = p_from;
  -- «Voy» y en vivo: si los dos tienen, queda el del reclamado.
  delete from public.event_rsvps a where a.player_id = p_from
     and exists (select 1 from public.event_rsvps c where c.event_id = a.event_id and c.player_id = p_into);
  update public.event_rsvps r set player_id = p_into where r.player_id = p_from;
  delete from public.live_states a where a.player_id = p_from
     and exists (select 1 from public.live_states c where c.event_id = a.event_id and c.player_id = p_into);
  update public.live_states s set player_id = p_into, subject_key = 'p:' || v_into where s.player_id = p_from;
  -- Datos privados (año, sexo, tutor) y ficha de nadador: se queda la del reclamado si tiene.
  if exists (select 1 from public.player_private x where x.player_id = p_into) then
    delete from public.player_private x where x.player_id = p_from;
  else
    update public.player_private x set player_id = p_into where x.player_id = p_from;
  end if;
  if exists (select 1 from public.swim_swimmers x where x.player_id = p_into) then
    delete from public.swim_swimmers x where x.player_id = p_from;
  else
    update public.swim_swimmers x set player_id = p_into where x.player_id = p_from;
  end if;
  -- Partidos y equipos (las plantillas antes que las sanciones: su trigger mira la plantilla).
  update public.match_players x set player_id = p_into where x.player_id = p_from;
  delete from public.match_rsvps a where a.player_id = p_from
     and exists (select 1 from public.match_rsvps c where c.match_id = a.match_id and c.player_id = p_into);
  update public.match_rsvps x set player_id = p_into where x.player_id = p_from;
  delete from public.team_players a where a.player_id = p_from
     and exists (select 1 from public.team_players c where c.team_id = a.team_id and c.player_id = p_into);
  update public.team_players x set player_id = p_into where x.player_id = p_from;
  update public.football_sanctions x set player_id = p_into where x.player_id = p_from;
  -- Golf, natación, escalera e inscripciones (entrant_id = el jugador).
  update public.golf_cards x set player_id = p_into where x.player_id = p_from;
  update public.swim_entries x set player_id = p_into where x.player_id = p_from;
  update public.ladder_rungs x set player_id = p_into, entrant_id = p_into where x.player_id = p_from;
  update public.ladder_challenges x set
    challenger = case when x.challenger = p_from then p_into else x.challenger end,
    challenged = case when x.challenged = p_from then p_into else x.challenged end,
    winner = case when x.winner = p_from then p_into else x.winner end
   where x.league_id = p_league and p_from in (x.challenger, x.challenged, x.winner);
  update public.event_signups x set player_id = p_into, entrant_id = p_into where x.player_id = p_from;
  update public.game_likes x set player_id = p_into where x.player_id = p_from;
  -- Ids dentro de jsonb (anotador, historial, rondas de las noches, competencia del golf).
  update public.matches m set state = replace(m.state::text, v_from, v_into)::jsonb,
                              history = replace(m.history::text, v_from, v_into)::jsonb,
                              score = replace(m.score::text, v_from, v_into)::jsonb
   where m.league_id = p_league
     and (coalesce(m.state::text, '') || m.history::text || coalesce(m.score::text, '')) like '%' || v_from || '%';
  update public.events e set config = replace(e.config::text, v_from, v_into)::jsonb
   where e.league_id = p_league and e.config::text like '%' || v_from || '%';
  update public.golf_rounds g set competition = replace(g.competition::text, v_from, v_into)::jsonb
   where g.league_id = p_league and g.competition::text like '%' || v_from || '%';
  -- Pedidos viejos del jugador propio (p. ej. la cuenta ya había reclamado otro jugador y ahora junta un
  -- duplicado que el admin anotó dos veces): son historia de un jugador que se borra.
  delete from public.player_claims x where x.player_id = p_from;

  for f in
    select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute pid on pid.attrelid = c.confrelid and pid.attname = 'id'
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[array_position(c.confkey, pid.attnum)]
     where c.contype = 'f' and c.confrelid = 'public.players'::regclass
  loop
    execute format('select exists (select 1 from %s where %I = $1)', f.tbl, f.col) into v_left using p_from;
    if v_left then
      raise exception 'conflicto: %', f.tbl::text using errcode = 'P0001';
    end if;
  end loop;
  delete from public.players p where p.id = p_from;
end $$;

-- Push a los admins de la liga (menos quien pidió): «<nombre> dice que es <jugador>».
create function private.claim_push_admins(p_claim uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.player_claims;
  v_league text;
begin
  select * into c from public.player_claims x where x.id = p_claim;
  select l.name into v_league from public.leagues l where l.id = c.league_id;
  insert into public.push_outbox (user_id, title, body, url, tag, ttl)
  select m.user_id,
         left(c.claimant_name || ' dice que es ' || c.player_name, 200),
         left('En ' || coalesce(v_league, 'tu liga') || '. Toca para aprobar o rechazar.'
              || coalesce(' «' || c.note || '»', ''), 1000),
         '/l/' || c.league_id::text || '/admin?tab=reclamos',
         'claim:' || c.id::text,
         86400
    from public.league_members m join public.profiles p on p.id = m.user_id
   where m.league_id = c.league_id and m.role in ('owner', 'admin') and m.user_id <> c.user_id and p.blocked_at is null;
end $$;

-- Push a quien pidió cuando se decide.
create function private.claim_push_claimant(p_claim uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.player_claims;
  v_league text;
begin
  select * into c from public.player_claims x where x.id = p_claim;
  select l.name into v_league from public.leagues l where l.id = c.league_id;
  insert into public.push_outbox (user_id, title, body, url, tag, ttl)
  values (
    c.user_id,
    left(case when c.status = 'approved' then 'Te aprobaron: ahora eres ' || c.player_name
              else 'No se aprobó: no quedaste como ' || c.player_name end, 200),
    left(case when c.status = 'approved' then 'En ' || coalesce(v_league, 'tu liga') || '. Tus juegos quedaron juntos.'
              else coalesce(c.decision_note, 'En ' || coalesce(v_league, 'tu liga') || '. Si es un error, habla con el admin.') end, 1000),
    '/l/' || c.league_id::text,
    'claim:' || c.id::text,
    86400);
end $$;

-- Aprueba (sin mirar permisos: lo hacen las RPC). Devuelve el jugador reclamado.
create function private.approve_claim(p_claim uuid, p_by uuid, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.player_claims;
  v_owner uuid;
  v_minor boolean;
  v_mine uuid;
begin
  select * into c from public.player_claims x where x.id = p_claim for update;
  select p.user_id, p.is_minor into v_owner, v_minor from public.players p where p.id = c.player_id for update;
  if v_owner is not null then
    perform private.fail('duplicado');
  end if;
  if v_minor then
    perform private.fail('invalido');
  end if;
  perform 1 from public.league_members m where m.league_id = c.league_id and m.user_id = c.user_id for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  select p.id into v_mine from public.players p where p.league_id = c.league_id and p.user_id = c.user_id for update;
  if v_mine is not null then
    perform private.merge_players(v_mine, c.player_id, c.league_id);
  end if;
  update public.players p set user_id = c.user_id where p.id = c.player_id;
  update public.player_claims x set status = 'approved', decided_by = p_by, decided_at = now(), decision_note = p_note
   where x.id = p_claim;
  return c.player_id;
end $$;

-- Deja el pedido (ya validado): admin de la liga → aprobado al momento; si no, push a los admins.
create function private.file_claim(p_league uuid, p_user uuid, p_player uuid, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.player_claims (league_id, player_id, user_id, note, claimant_name, player_name)
  select p_league, p_player, p_user, p_note,
         left(coalesce((select m.display_name from public.league_members m where m.league_id = p_league and m.user_id = p_user), ''), 60),
         left(p.name, 60)
    from public.players p where p.id = p_player
  returning id into v_id;
  if private.user_is_admin(p_league, p_user) then
    perform private.approve_claim(v_id, p_user, null);
  else
    perform private.claim_push_admins(v_id);
  end if;
  return v_id;
end $$;

-- =====================================================================
-- RPC
-- =====================================================================

-- La cuenta pide ser ese jugador. Ver el encabezado.
create function public.request_player_claim(p_player uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_key text := 'claim:' || v_uid::text;
  v_league uuid;
  v_owner uuid;
  v_minor boolean;
  v_id uuid;
begin
  if char_length(v_note) > 300 then
    perform private.fail('invalido');
  end if;
  select p.league_id, p.user_id, p.is_minor into v_league, v_owner, v_minor from public.players p where p.id = p_player for update;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform 1 from public.league_members m where m.league_id = v_league and m.user_id = v_uid for update;
  if not found then
    perform private.deny();
  end if;
  if v_owner = v_uid then
    return null;
  end if;
  if v_owner is not null then
    perform private.fail('duplicado');
  end if;
  if v_minor then
    perform private.fail('invalido');
  end if;
  select c.id into v_id from public.player_claims c where c.player_id = p_player and c.status = 'pending' and c.user_id = v_uid;
  if v_id is not null then
    return v_id;
  end if;
  if exists (select 1 from public.player_claims c where c.player_id = p_player and c.status = 'pending') then
    perform private.fail('duplicado');
  end if;
  if private.rate_blocked(v_key, 10, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  perform private.rate_hit(v_key, interval '1 day');
  -- Cambió de idea: el pedido anterior en esta liga se cancela.
  update public.player_claims c set status = 'cancelled', decided_at = now()
   where c.league_id = v_league and c.user_id = v_uid and c.status = 'pending';
  return private.file_claim(v_league, v_uid, p_player, v_note);
end $$;

-- Quien pidió lo retira (ya cancelado: nada).
create function public.cancel_player_claim(p_claim uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_status text;
begin
  select c.status into v_status from public.player_claims c where c.id = p_claim and c.user_id = v_uid for update;
  if v_status is null then
    perform private.fail('no_existe');
  elsif v_status = 'cancelled' then
    return;
  elsif v_status <> 'pending' then
    perform private.fail('invalido');
  end if;
  update public.player_claims c set status = 'cancelled', decided_at = now() where c.id = p_claim;
end $$;

-- Dueño, admin o superadmin: aprueba o rechaza. Ya decidido: devuelve cómo quedó (dos teléfonos a la vez).
create function public.decide_player_claim(p_claim uuid, p_approve boolean, p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  c public.player_claims;
begin
  select * into c from public.player_claims x where x.id = p_claim for update;
  if c.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(c.league_id) then
    perform private.deny();
  end if;
  if p_approve is null or char_length(v_note) > 300 then
    perform private.fail('invalido');
  end if;
  if c.status <> 'pending' then
    return c.status;
  end if;
  if p_approve then
    perform private.approve_claim(p_claim, v_uid, v_note);
  else
    update public.player_claims x set status = 'rejected', decided_by = v_uid, decided_at = now(), decision_note = v_note
     where x.id = p_claim;
  end if;
  perform private.claim_push_claimant(p_claim);
  return case when p_approve then 'approved' else 'rejected' end;
end $$;

-- Admin: lo que chocaría al aprobar ([] si nada o si la cuenta no tiene jugador propio en la liga).
create function public.player_claim_conflicts(p_claim uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.player_claims;
  v_mine uuid;
begin
  perform private.require_uid();
  select * into c from public.player_claims x where x.id = p_claim;
  if c.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(c.league_id) then
    perform private.deny();
  end if;
  select p.id into v_mine from public.players p where p.league_id = c.league_id and p.user_id = c.user_id;
  if v_mine is null then
    return '[]'::jsonb;
  end if;
  return private.claim_conflicts(v_mine, c.player_id);
end $$;

-- =====================================================================
-- Lo que antes vinculaba al momento
-- =====================================================================

-- Antes vinculaba el jugador libre; ahora deja el pedido. Devuelve el id del PEDIDO (null si ya era suyo).
create or replace function public.claim_player(p_player uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_uid();
  return public.request_player_claim(p_player, null);
end $$;

-- El jugador de la cuenta en la liga: 1) si ya tiene, ese; 2) si no, se crea el suyo y, si eligió un jugador
-- libre (p_prefer) o hay un único libre con su mismo nombre normalizado, queda el pedido de ese jugador (sin
-- pedido pendiente de otra cuenta; 10 por día). Un dueño o admin queda aprobado al momento y se devuelve el
-- reclamado. Bloquea la membresía: dos teléfonos a la vez no crean dos jugadores.
create or replace function private.ensure_player(p_league uuid, p_user uuid, p_prefer uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_player uuid;
  v_target uuid;
  v_same uuid[];
  v_claim uuid;
  v_key text := 'claim:' || p_user::text;
begin
  select m.display_name into v_name from public.league_members m where m.league_id = p_league and m.user_id = p_user for update;
  if v_name is null then
    perform private.deny();
  end if;
  select p.id into v_player from public.players p where p.league_id = p_league and p.user_id = p_user;
  if v_player is not null then
    return v_player;
  end if;
  if p_prefer is not null then
    select p.id into v_target from public.players p
     where p.id = p_prefer and p.league_id = p_league and p.user_id is null and not p.is_minor
       and not exists (select 1 from public.player_claims c where c.player_id = p.id and c.status = 'pending');
  end if;
  if v_target is null then
    select array_agg(p.id) into v_same from public.players p
     where p.league_id = p_league and p.user_id is null and not p.is_minor
       and private.normalize_name(p.name) = private.normalize_name(v_name);
    if cardinality(v_same) = 1 and not exists (
         select 1 from public.player_claims c where c.player_id = v_same[1] and c.status = 'pending') then
      v_target := v_same[1];
    end if;
  end if;
  insert into public.players (league_id, user_id, name) values (p_league, p_user, v_name) returning id into v_player;
  if v_target is not null and not private.rate_blocked(v_key, 10, interval '1 day') then
    perform private.rate_hit(v_key, interval '1 day');
    update public.player_claims c set status = 'cancelled', decided_at = now()
     where c.league_id = p_league and c.user_id = p_user and c.status = 'pending';
    v_claim := private.file_claim(p_league, p_user, v_target, null);
    if exists (select 1 from public.player_claims c where c.id = v_claim and c.status = 'approved') then
      return v_target;
    end if;
  end if;
  return v_player;
end $$;

-- Igual que antes (20260926000500_rpc.sql) y además 'claim_id': el pedido pendiente de la cuenta en la liga.
create or replace function public.join_league(p_league uuid default null, p_code text default null, p_prefer uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_league uuid := p_league;
  v_code text := nullif(upper(btrim(coalesce(p_code, ''))), '');
  v_key text := 'join:' || v_uid::text;
  v_visibility text;
  v_found uuid;
  v_name text := (select p.name from public.profiles p where p.id = v_uid);
  v_player uuid;
begin
  if v_league is null and v_code is null then
    perform private.fail('invalido');
  end if;
  if v_name is null then
    perform private.fail('no_existe');
  end if;
  if v_league is not null then
    select l.visibility into v_visibility from public.leagues l where l.id = v_league;
    if v_visibility is null then
      perform private.fail('no_existe');
    end if;
  end if;
  if v_league is null or (v_visibility <> 'public' and not exists (
        select 1 from public.league_members m where m.league_id = v_league and m.user_id = v_uid)) then
    if v_code is null then
      perform private.deny();
    end if;
    if private.rate_blocked(v_key, 10, interval '1 hour') then
      perform private.fail('rate_limited');
    end if;
    select s.league_id into v_found from public.league_secrets s where s.invite_code = v_code;
    if v_found is null or (v_league is not null and v_found <> v_league) then
      perform private.rate_hit(v_key, interval '1 hour');
      return null;
    end if;
    v_league := v_found;
  end if;
  insert into public.league_members (league_id, user_id, role, display_name) values (v_league, v_uid, 'member', v_name)
  on conflict (league_id, user_id) do nothing;
  v_player := private.ensure_player(v_league, v_uid, p_prefer);
  return jsonb_build_object('league_id', v_league, 'player_id', v_player,
    'claim_id', (select c.id from public.player_claims c where c.league_id = v_league and c.user_id = v_uid and c.status = 'pending'));
end $$;

-- =====================================================================
-- Permisos: las RPC solo con sesión; las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['request_player_claim', 'cancel_player_claim', 'decide_player_claim', 'player_claim_conflicts',
                                 'claim_player', 'join_league'];
  v_private constant text[] := array['emit_player_claims', 'cancel_claims_on_leave', 'settle_claims_on_link', 'user_is_admin', 'claim_conflicts',
                                     'merge_players', 'claim_push_admins', 'claim_push_claimant', 'approve_claim', 'file_claim',
                                     'ensure_player'];
begin
  for f in select p.oid::regprocedure as sig, n.nspname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and p.proname = any (v_rpc))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
