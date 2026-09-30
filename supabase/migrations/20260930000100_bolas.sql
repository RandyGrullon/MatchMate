-- MatchMate · Mis bolas del boliche: las bolas de cada cuenta y con cuál tiró cada juego (diseño en docs/arquitectura.md,
-- «Mis bolas»).
--
-- 1. public.bowling_balls: las bolas de una cuenta (nombre, marca, peso en libras, color, cubierta, cuándo se perforó,
--    cuándo se pulió por última vez y si ya la retiró). Hasta 30 por cuenta. Solo las lee su dueño (tampoco el
--    superadmin: son de la cuenta); nadie escribe directo.
-- 2. public.ball_games: con qué bola tiró cada juego. Una fila por juego, de uno de tres lugares:
--    - solo_id + juego (desde 0): un juego suelto suyo (public.solo_sessions, la posición en scores);
--    - event_id + juego del evento: un juego suyo en un evento de su liga, lo que anota él mismo en la hoja del evento
--      (dueño, admin o anotador que también juega), o un juego de un envío suyo que el admin ya aprobó;
--    - sub_id + juego dentro del envío: un envío suyo («Subir mis juegos») mientras espera la revisión. Al aprobarlo el
--      admin puede ponerlo en otro número de juego del evento, cambiar el puntaje o dejar juegos fuera: approve_submission
--      pasa cada bola al juego del evento donde quedó (y quita las de los juegos que no aprobó), así el puntaje, la foto
--      y los cuadros salen de la participación, como en la liga. private.sub_games guarda en qué juego del evento quedó
--      cada juego del envío, por si la bola llega después de aprobado (la cola sin conexión).
--    Se borra sola con la bola, el juego suelto, el evento o el envío (on delete cascade): delete_solo_session,
--    delete_event y lo demás no cambian. Solo la lee su dueño.
-- 3. El teléfono llama set_game_balls después de guardar el juego, en el mismo grupo de la cola sin conexión
--    (save_solo_session → 'solo'; submit_games y save_game → la liga), así sale después. Se redefine approve_submission
--    (la de 20260926000500_rpc.sql, con p_start: el juego del evento donde cae el J1 del envío) para lo del punto 2.
-- 4. RPC: save_ball (crea o cambia), retire_ball, resurface_ball, delete_ball, set_game_balls y las lecturas my_balls
--    (las bolas y la última que usó) y my_ball_games (cada juego con su bola, su fecha, su puntaje y sus cuadros).
-- 5. Datos de la cuenta: export_my_data las trae solas (tablas de public con user_id: bowling_balls y ball_games). Al
--    borrar la cuenta se van con el perfil (on delete cascade) y forget_user ya borra sus límites (claves que terminan
--    en ':<uid>'). Sin tiempo real: cada teléfono vuelve a leer al guardar y al volver a la pantalla.
-- Contrato del cliente: src/lib/data/balls.ts (y las cuentas en src/lib/balls.ts).

-- =====================================================================
-- 1. Las bolas
-- =====================================================================
-- id: lo puede poner el teléfono. color: '#rrggbb' en minúsculas (el color de la bola, para reconocerla). cover: la
-- cubierta ('solida', 'perlada', 'hibrida', 'uretano', 'poliester') o null si no la puso. drilled_on: cuándo se
-- perforó; resurfaced_on: la última vez que se pulió (los juegos desde entonces avisan cuándo toca otra vez).
create table public.bowling_balls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  brand text not null default '' check (char_length(brand) <= 40),
  weight smallint not null check (weight between 6 and 16),
  color text not null default '#1d4ed8' check (color ~ '^#[0-9a-f]{6}$'),
  cover text check (cover in ('solida', 'perlada', 'hibrida', 'uretano', 'poliester')),
  drilled_on date,
  resurfaced_on date,
  retired boolean not null default false,
  -- La hora de verdad (no la de la transacción): el orden de la lista es el de cuando se agregaron.
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  -- Para que ball_games solo apunte a bolas de la misma cuenta.
  unique (id, user_id)
);
create index bowling_balls_user_idx on public.bowling_balls (user_id, retired, created_at);

create trigger bowling_balls_touch before update on public.bowling_balls
  for each row execute function private.touch_updated_at();

alter table public.bowling_balls enable row level security;
create policy bowling_balls_read on public.bowling_balls for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.bowling_balls from public, anon, authenticated;
grant select on public.bowling_balls to authenticated;

-- =====================================================================
-- 2. Con qué bola tiró cada juego
-- =====================================================================
create table public.ball_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  ball_id uuid not null,
  solo_id uuid references public.solo_sessions (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  sub_id uuid references public.submissions (id) on delete cascade,
  game smallint not null check (game between 0 and 9),
  -- La hora de verdad (no la de la transacción): la última marcada es la «última que usó».
  created_at timestamptz not null default clock_timestamp(),
  foreign key (ball_id, user_id) references public.bowling_balls (id, user_id) on delete cascade,
  check (num_nonnulls(solo_id, event_id, sub_id) = 1)
);
-- Un juego, una bola (un juego suelto y un envío son de una sola cuenta; un evento, de muchas).
create unique index ball_games_solo_key on public.ball_games (solo_id, game) where solo_id is not null;
create unique index ball_games_event_key on public.ball_games (event_id, user_id, game) where event_id is not null;
create unique index ball_games_sub_key on public.ball_games (sub_id, game) where sub_id is not null;
create index ball_games_user_idx on public.ball_games (user_id, created_at desc);
create index ball_games_ball_idx on public.ball_games (ball_id, user_id);

alter table public.ball_games enable row level security;
create policy ball_games_read on public.ball_games for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.ball_games from public, anon, authenticated;
grant select on public.ball_games to authenticated;

-- En qué juego del evento quedó cada juego de un envío aprobado: {"<juego del envío>": <juego del evento>} (solo los que
-- aprobó el admin). Lo escribe approve_submission; lo lee set_game_balls para la bola que llega después de aprobado.
create table private.sub_games (
  sub_id uuid primary key references public.submissions (id) on delete cascade,
  games jsonb not null check (jsonb_typeof(games) = 'object')
);

-- =====================================================================
-- 3. Escrituras
-- =====================================================================

-- Las fechas de una bola: de hace 30 años hasta mañana (hora de RD), y no se pulió antes de perforarla.
create function private.ball_dates_ok(p_drilled date, p_resurfaced date) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(p_drilled between ((now() at time zone 'America/Santo_Domingo')::date - interval '30 years')::date
                                and (now() at time zone 'America/Santo_Domingo')::date + 1, true)
     and coalesce(p_resurfaced between ((now() at time zone 'America/Santo_Domingo')::date - interval '30 years')::date
                                   and (now() at time zone 'America/Santo_Domingo')::date + 1, true)
     and coalesce(p_resurfaced >= p_drilled, true)
$$;

-- Crea o cambia una bola de la cuenta (p_id: el del teléfono, o null para una nueva; lo reemplaza todo). Devuelve su
-- id. Nombre de 1 a 40 y marca hasta 40 (recortados), peso de 6 a 16 libras, color '#rrggbb' (en mayúsculas también),
-- cubierta de la lista o null, fechas con private.ball_dates_ok. 'invalido'; 'no_permitido' si el id es de otra
-- cuenta; 'cupo_lleno' con 30 bolas (las retiradas cuentan: se pueden borrar); 'rate_limited' (100 cambios por día a
-- sus bolas). Con p_op_id, reintentar devuelve el mismo id sin repetir nada.
create function public.save_ball(p_id uuid, p_name text, p_weight integer, p_color text, p_brand text default '',
                                 p_cover text default null, p_drilled_on date default null, p_resurfaced_on date default null,
                                 p_retired boolean default false, p_op_id uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_done jsonb;
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_name text := btrim(coalesce(p_name, ''));
  v_brand text := btrim(coalesce(p_brand, ''));
  v_color text := lower(btrim(coalesce(p_color, '')));
  v_cover text := nullif(btrim(coalesce(p_cover, '')), '');
  v_owner uuid;
begin
  v_done := private.op_begin(p_op_id, 'save_ball');
  if v_done is not null then
    return (v_done #>> '{}')::uuid;
  end if;
  if char_length(v_name) not between 1 and 40 or char_length(v_brand) > 40 or p_weight is null or p_weight not between 6 and 16
     or v_color !~ '^#[0-9a-f]{6}$' or (v_cover is not null and v_cover not in ('solida', 'perlada', 'hibrida', 'uretano', 'poliester'))
     or not private.ball_dates_ok(p_drilled_on, p_resurfaced_on) then
    perform private.fail('invalido');
  end if;
  -- Una cuenta a la vez (el cupo de 30 no se pasa con dos teléfonos guardando juntos).
  perform 1 from public.profiles p where p.id = v_uid for update;
  select b.user_id into v_owner from public.bowling_balls b where b.id = v_id for update;
  if v_owner is not null and v_owner <> v_uid then
    perform private.deny();
  end if;
  if not private.rate_take('balls:' || v_uid::text, 100, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  if v_owner is null then
    if (select count(*) from public.bowling_balls b where b.user_id = v_uid) >= 30 then
      perform private.fail('cupo_lleno');
    end if;
    insert into public.bowling_balls (id, user_id, name, brand, weight, color, cover, drilled_on, resurfaced_on, retired)
    values (v_id, v_uid, v_name, v_brand, p_weight, v_color, v_cover, p_drilled_on, p_resurfaced_on, coalesce(p_retired, false));
  else
    update public.bowling_balls b set
      name = v_name, brand = v_brand, weight = p_weight, color = v_color, cover = v_cover, drilled_on = p_drilled_on,
      resurfaced_on = p_resurfaced_on, retired = coalesce(p_retired, false)
    where b.id = v_id;
  end if;
  perform private.op_end(p_op_id, to_jsonb(v_id));
  return v_id;
end $$;

-- La bola de la cuenta (para cambiarla): 'no_existe' si no está, 'no_permitido' si es de otra.
create function private.my_ball(p_id uuid) returns public.bowling_balls
language plpgsql security definer set search_path = '' as $$
declare
  b public.bowling_balls;
begin
  select * into b from public.bowling_balls x where x.id = p_id for update;
  if b.id is null then
    perform private.fail('no_existe');
  end if;
  if b.user_id <> auth.uid() then
    perform private.deny();
  end if;
  return b;
end $$;

-- Retira la bola (ya no sale al anotar; sus números quedan) o, con p_retired = false, la vuelve a usar. Mismo límite
-- que save_ball. Con p_op_id, reintentar no repite nada.
create function public.retire_ball(p_id uuid, p_retired boolean default true, p_op_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  if private.op_begin(p_op_id, 'retire_ball') is not null then
    return;
  end if;
  perform private.my_ball(p_id);
  if not private.rate_take('balls:' || v_uid::text, 100, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  update public.bowling_balls b set retired = coalesce(p_retired, true) where b.id = p_id;
  perform private.op_end(p_op_id, null);
end $$;

-- La pulió (o la mandó a pulir) ese día: p_on, o hoy en RD si es null. Sus juegos se vuelven a contar desde ese día
-- (los de ese mismo día también: src/lib/balls.ts ballStats).
-- 'invalido' si la fecha no vale (futuro, de hace más de 30 años o antes de perforarla). Mismo límite que save_ball.
create function public.resurface_ball(p_id uuid, p_on date default null, p_op_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_on date := coalesce(p_on, (now() at time zone 'America/Santo_Domingo')::date);
  b public.bowling_balls;
begin
  if private.op_begin(p_op_id, 'resurface_ball') is not null then
    return;
  end if;
  b := private.my_ball(p_id);
  if not private.ball_dates_ok(b.drilled_on, v_on) then
    perform private.fail('invalido');
  end if;
  if not private.rate_take('balls:' || v_uid::text, 100, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  update public.bowling_balls x set resurfaced_on = v_on where x.id = p_id;
  perform private.op_end(p_op_id, null);
end $$;

-- Borra una bola de la cuenta y con cuál juego se usó (los juegos quedan). 'no_existe', 'no_permitido'.
create function public.delete_ball(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_uid();
  perform private.my_ball(p_id);
  delete from public.bowling_balls b where b.id = p_id;
end $$;

-- Pasa las bolas de un envío aprobado a los juegos del evento donde quedaron (p_map: {"<juego del envío>": <juego del
-- evento>}). Si ese juego del evento ya tenía bola (de la hoja del evento), se queda la del envío: el envío lo pisó. Las
-- de los juegos que el admin no aprobó se quitan (no cuentan en ningún lado). Cada fila sigue siendo de su cuenta y con
-- su hora (la «última que usó» no cambia).
create function private.move_sub_balls(p_sub uuid, p_event uuid, p_map jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.ball_games e
   using public.ball_games g
   where g.sub_id = p_sub and p_map ? g.game::text
     and e.event_id = p_event and e.user_id = g.user_id and e.game = (p_map ->> g.game::text)::smallint;
  update public.ball_games g set sub_id = null, event_id = p_event, game = (p_map ->> g.game::text)::smallint
   where g.sub_id = p_sub and p_map ? g.game::text;
  delete from public.ball_games g where g.sub_id = p_sub;
end $$;

-- Con qué bola tiró cada juego de un juego suelto ('solo'), de un evento de su liga ('event') o de un envío suyo
-- ('sub'). p_balls = {"<juego desde 0>": "<bola>" | null | <juego desde 0>}: cada juego que viene cambia (null = sin
-- bola) y los que no vienen se quedan como estaban; los juegos que ya no existen (el juego suelto quedó con menos) se
-- quitan. Un número (solo en un juego suelto) es «la bola que tiene ahora ese otro juego»: el teléfono sin señal no
-- sabe las bolas pero sí cómo se movieron los juegos (se borró uno del medio). Un juego que no existe en p_balls (más
-- allá de los que tiene) es 'invalido', y un evento o envío de otro deporte también. Una bola que no es de la cuenta (o
-- que ya se borró) se salta. Un juego cuya bola no cambia se deja como está (con su hora: no pasa a ser «la última que
-- usó»). Si el juego suelto, el evento o el envío ya no está, no hace nada (la cola pudo llegar tarde); de otra
-- cuenta, 'no_permitido' (el evento y el envío: la cuenta tiene que ser su jugador en la liga). Un envío ya aprobado:
-- cada juego va a su juego del evento (private.sub_games); uno rechazado no hace nada. 500 por día ('rate_limited').
-- Devuelve cuántos juegos quedaron con bola en ese lugar (el evento, en un envío aprobado). Con p_op_id, reintentar no
-- repite nada.
create function public.set_game_balls(p_kind text, p_ref uuid, p_balls jsonb, p_op_id uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_done jsonb;
  v_balls jsonb := coalesce(nullif(p_balls, 'null'::jsonb), '{}'::jsonb);
  v_kind text := p_kind;
  v_ref uuid := p_ref;
  v_owner uuid;
  v_league uuid;
  v_sport text;
  v_status text;
  v_event uuid;
  v_games integer;
  v_map jsonb;
  v_target jsonb;
  v_n integer;
begin
  v_done := private.op_begin(p_op_id, 'set_game_balls');
  if v_done is not null then
    return (v_done #>> '{}')::integer;
  end if;
  if p_kind is null or p_kind not in ('solo', 'event', 'sub') or p_ref is null or jsonb_typeof(v_balls) <> 'object'
     or exists (select 1 from jsonb_each(v_balls) x
                 where x.key !~ '^[0-9]$'
                    or not (jsonb_typeof(x.value) = 'null'
                            or (jsonb_typeof(x.value) = 'string'
                                and x.value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
                            or (p_kind = 'solo' and jsonb_typeof(x.value) = 'number' and x.value #>> '{}' ~ '^[0-9]$'))) then
    perform private.fail('invalido');
  end if;

  if p_kind = 'solo' then
    select s.user_id, cardinality(s.scores) into v_owner, v_games from public.solo_sessions s where s.id = p_ref;
    if v_owner is not null and v_owner <> v_uid then
      perform private.deny();
    end if;
  elsif p_kind = 'event' then
    select e.league_id, e.games, l.sport into v_league, v_games, v_sport
      from public.events e join public.leagues l on l.id = e.league_id where e.id = p_ref;
    if v_league is not null then
      if v_sport <> 'bowling' then
        perform private.fail('invalido');
      end if;
      v_owner := v_uid;
      if private.my_player(v_league) is null then
        perform private.deny();
      end if;
    end if;
  else
    select s.league_id, cardinality(s.scores), l.sport, s.status, s.event_id into v_league, v_games, v_sport, v_status, v_event
      from public.submissions s join public.leagues l on l.id = s.league_id where s.id = p_ref;
    if v_league is not null then
      if v_sport <> 'bowling' then
        perform private.fail('invalido');
      end if;
      v_owner := v_uid;
      if (select s.player_id from public.submissions s where s.id = p_ref) is distinct from private.my_player(v_league) then
        perform private.deny();
      end if;
    end if;
  end if;
  -- Ya no está (se borró antes de que llegara esto): nada que marcar.
  if v_owner is null then
    perform private.op_end(p_op_id, to_jsonb(0));
    return 0;
  end if;
  if exists (select 1 from jsonb_object_keys(v_balls) k where k::integer >= v_games) then
    perform private.fail('invalido');
  end if;
  if not private.rate_take('ballgames:' || v_uid::text, 500, interval '1 day') then
    perform private.fail('rate_limited');
  end if;

  -- Un envío ya revisado: rechazado no cuenta en ningún lado; aprobado, sus juegos ya son juegos del evento.
  if p_kind = 'sub' and v_status <> 'pendiente' then
    select m.games into v_map from private.sub_games m where m.sub_id = p_ref;
    select ev.games into v_games from public.events ev where ev.id = v_event;
    if v_status <> 'aprobado' or v_map is null or v_games is null then
      perform private.op_end(p_op_id, to_jsonb(0));
      return 0;
    end if;
    select coalesce(jsonb_object_agg(v_map ->> x.key, x.value), '{}'::jsonb) into v_balls
      from jsonb_each(v_balls) x
     where v_map ? x.key and (v_map ->> x.key)::integer < v_games;
    v_kind := 'event';
    v_ref := v_event;
  end if;

  -- Cómo queda cada juego que viene (antes de cambiar nada: un número lee la bola que tiene ahora ese juego).
  select coalesce(jsonb_object_agg(x.key, case jsonb_typeof(x.value)
           when 'string' then (select to_jsonb(b.id) from public.bowling_balls b
                                where b.id = (x.value #>> '{}')::uuid and b.user_id = v_uid)
           when 'number' then (select to_jsonb(g.ball_id) from public.ball_games g
                                where g.user_id = v_uid and g.solo_id = v_ref and g.game = (x.value #>> '{}')::integer)
         end), '{}'::jsonb)
    into v_target from jsonb_each(v_balls) x;

  -- Se quitan los que cambian (y los juegos que ya no existen); después se ponen los que traen bola y no la tenían.
  delete from public.ball_games g
   where g.user_id = v_uid
     and case v_kind when 'solo' then g.solo_id when 'event' then g.event_id else g.sub_id end = v_ref
     and (g.game >= v_games or (v_target ? g.game::text and (v_target ->> g.game::text) is distinct from g.ball_id::text));
  insert into public.ball_games (user_id, ball_id, solo_id, event_id, sub_id, game)
  select v_uid, t.value::uuid, case when v_kind = 'solo' then v_ref end, case when v_kind = 'event' then v_ref end,
         case when v_kind = 'sub' then v_ref end, t.key::smallint
    from jsonb_each_text(v_target) t
   where t.value is not null
     and not exists (select 1 from public.ball_games g
                      where g.user_id = v_uid and g.game = t.key::smallint
                        and case v_kind when 'solo' then g.solo_id when 'event' then g.event_id else g.sub_id end = v_ref);

  select count(*)::integer into v_n from public.ball_games g
   where g.user_id = v_uid and case v_kind when 'solo' then g.solo_id when 'event' then g.event_id else g.sub_id end = v_ref;
  perform private.op_end(p_op_id, to_jsonb(v_n));
  return v_n;
end $$;

-- =====================================================================
-- 3b. Aprobar un envío (la de 20260926000500_rpc.sql, con las bolas)
-- =====================================================================
-- Igual que antes, más p_start (el juego del evento donde cae el J1 del envío: ApprovalsPage). Al aprobar guarda en
-- private.sub_games en qué juego del evento quedó cada juego del envío que se aprobó y le pasa sus bolas
-- (private.move_sub_balls): así los números de cada bola usan el puntaje que aprobó el admin. Sin p_start (un teléfono
-- con la versión de antes), cada juego va en su mismo número y solo si el admin aprobó el puntaje que envió el jugador.
drop function public.approve_submission(uuid, jsonb, jsonb, uuid, double precision, integer);

-- Admin: aprueba el envío. Copia los juegos a la participación del jugador como verificados (foto o
-- 'sin-foto'), inscribe al jugador si no estaba (con p_average), marca el envío y quién lo revisó.
-- p_values = {"<juego del evento>": pinos}; p_frames = {"<juego>": {rolls, masks}} solo con los cuadros que
-- dan el mismo total (el teléfono lo comprueba con scoreGame); los demás juegos aprobados quedan sin cuadros.
-- p_event: por defecto el del envío; si el envío es por fecha, la práctica de ese día (se crea si no hay,
-- con greatest(3, p_games) juegos). p_start: de 0 a 9 ('invalido' si no). Devuelve {entry_id, event_id}.
create function public.approve_submission(
  p_submission uuid,
  p_values jsonb,
  p_frames jsonb default null,
  p_event uuid default null,
  p_average double precision default null,
  p_games integer default null,
  p_start integer default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  s public.submissions;
  v_event uuid;
  v_games integer;
  v_sport text;
  v_max integer;
  e public.entries;
  v_scores smallint[];
  v_photos text[];
  v_frames jsonb;
  v_mark text;
  v_entry uuid;
  v_start integer := coalesce(p_start, 0);
  v_map jsonb;
  k text;
begin
  select * into s from public.submissions x where x.id = p_submission for update;
  if s.id is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(s.league_id);
  if jsonb_typeof(p_values) is distinct from 'object' or (p_frames is not null and jsonb_typeof(p_frames) not in ('object', 'null'))
     or (p_start is not null and p_start not between 0 and 9) then
    perform private.fail('invalido');
  end if;
  v_max := (select max(k2::integer) from jsonb_object_keys(p_values) k2);
  v_sport := (select l.sport from public.leagues l where l.id = s.league_id);
  v_event := coalesce(p_event, s.event_id);
  if v_event is null then
    select ev.id into v_event from public.events ev
     where ev.league_id = s.league_id and ev.type = 'practica' and ev.date = s.date order by ev.created_at limit 1;
    if v_event is null then
      insert into public.events (league_id, type, name, date, games, hcp_base, hcp_percent, individual_rank_by, team_rank_by,
                                 category_cuts, team_size, created_by)
      values (s.league_id, 'practica', '', s.date, least(10, greatest(3, coalesce(p_games, cardinality(s.scores)), coalesce(v_max + 1, 0))),
              0, 0, 'scratch', 'scratch', array[200, 175, 160], 0, v_uid)
      returning id into v_event;
    end if;
  end if;
  select ev.games into v_games from public.events ev where ev.id = v_event and ev.league_id = s.league_id for update;
  if v_games is null then
    perform private.fail('no_existe');
  end if;
  select * into e from public.entries x where x.event_id = v_event and x.player_id = s.player_id for update;
  v_scores := private.slots(e.scores, v_games);
  v_photos := private.slots(e.photos, v_games);
  v_frames := coalesce(e.frames, '{}'::jsonb);
  v_mark := coalesce(s.photo_id::text, 'sin-foto');
  for k in select jsonb_object_keys(p_values) loop
    if k::integer < 0 or k::integer >= v_games then
      perform private.fail('invalido');
    end if;
    v_scores[k::integer + 1] := private.one_score(p_values -> k, v_sport);
    v_photos[k::integer + 1] := v_mark;
    v_frames := case when jsonb_typeof(p_frames -> k) = 'object' then jsonb_set(v_frames, array[k], p_frames -> k) else v_frames - k end;
  end loop;
  if e.id is null then
    insert into public.entries (league_id, event_id, player_id, average, scores, photos, frames)
    values (s.league_id, v_event, s.player_id, coalesce(p_average, 0), v_scores, v_photos, v_frames)
    returning id into v_entry;
  else
    update public.entries set scores = v_scores, photos = v_photos, frames = v_frames where id = e.id;
    v_entry := e.id;
  end if;
  update public.submissions set status = 'aprobado', event_id = v_event, reviewed_at = now(), reviewed_by = v_uid where id = s.id;
  -- La foto de un envío por fecha queda con el evento (se borra con él).
  if s.photo_id is not null then
    update public.photos set event_id = v_event where id = s.photo_id and event_id is null;
  end if;
  -- Mis bolas: en qué juego del evento quedó cada juego aprobado del envío, y sus bolas pasan ahí.
  select coalesce(jsonb_object_agg((k2::integer - v_start)::text, k2::integer), '{}'::jsonb) into v_map
    from jsonb_object_keys(p_values) k2
   where k2::integer - v_start between 0 and 9
     and (p_start is not null or s.scores[k2::integer - v_start + 1] = v_scores[k2::integer + 1]);
  insert into private.sub_games (sub_id, games) values (s.id, v_map)
    on conflict (sub_id) do update set games = excluded.games;
  perform private.move_sub_balls(s.id, v_event, v_map);
  return jsonb_build_object('entry_id', v_entry, 'event_id', v_event);
end $$;

-- =====================================================================
-- 4. Lecturas
-- =====================================================================

-- Mis bolas: {balls: [{id, name, brand, weight, color, cover, drilledOn, resurfacedOn, retired, createdAt, updatedAt}],
-- lastUsed: la bola del último juego que marqué (null si ninguno)}. Las que uso primero, cada grupo de la más vieja a
-- la más nueva.
create function public.my_balls() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  return jsonb_build_object(
    'balls', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id,
               'name', b.name,
               'brand', b.brand,
               'weight', b.weight,
               'color', b.color,
               'cover', b.cover,
               'drilledOn', to_char(b.drilled_on, 'YYYY-MM-DD'),
               'resurfacedOn', to_char(b.resurfaced_on, 'YYYY-MM-DD'),
               'retired', b.retired,
               'createdAt', private.iso(b.created_at),
               'updatedAt', private.iso(b.updated_at))
               order by b.retired, b.created_at, b.id)
        from public.bowling_balls b where b.user_id = v_uid), '[]'::jsonb),
    'lastUsed', (select g.ball_id from public.ball_games g where g.user_id = v_uid order by g.created_at desc, g.game desc limit 1));
end $$;

-- Mis juegos con bola, del más nuevo al más viejo (fecha y cuándo se marcó), hasta p_limit (1 a 5000, 3000 si no se
-- dice); con p_ref, solo los de ese juego suelto, evento o envío (para abrir la hoja con las bolas que tenía):
-- [{ball, kind ('solo'|'event'|'sub'), ref, game, date, score, frames, counted}]. score: los pinos de ese juego (null si
-- todavía no tiene); frames: sus cuadros si se anotaron tiro por tiro; counted: si cuenta en los promedios (el juego
-- suelto siempre; el del evento con su marca de foto, como en la liga). Un envío solo sale mientras espera la revisión
-- (con lo que envió, sin contar todavía): al aprobarlo sus juegos pasan a ser del evento (con lo que aprobó el admin).
create function public.my_ball_games(p_ref uuid default null, p_limit integer default 3000) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 5000, 3000);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'ball', x.ball_id, 'kind', x.kind, 'ref', x.ref, 'game', x.game, 'date', to_char(x.day, 'YYYY-MM-DD'),
             'score', x.score, 'frames', x.frames, 'counted', x.counted)
             order by x.day desc nulls last, x.created_at desc, x.game desc)
      from (
        select y.* from (
          select g.ball_id, 'solo'::text as kind, g.solo_id as ref, g.game, s.played_on as day, s.scores[g.game + 1] as score,
                 s.frames -> g.game::text as frames, true as counted, g.created_at
            from public.ball_games g join public.solo_sessions s on s.id = g.solo_id
           where g.user_id = v_uid and (p_ref is null or g.solo_id = p_ref)
          union all
          select g.ball_id, 'event', g.event_id, g.game, ev.date, e.scores[g.game + 1], e.frames -> g.game::text,
                 coalesce(e.photos[g.game + 1] is not null and e.scores[g.game + 1] is not null, false), g.created_at
            from public.ball_games g
            join public.events ev on ev.id = g.event_id
            left join public.players p on p.league_id = ev.league_id and p.user_id = v_uid
            left join public.entries e on e.event_id = ev.id and e.player_id = p.id
           where g.user_id = v_uid and (p_ref is null or g.event_id = p_ref)
          union all
          select g.ball_id, 'sub', g.sub_id, g.game, coalesce(ev.date, s.date), s.scores[g.game + 1], s.frames -> g.game::text,
                 false, g.created_at
            from public.ball_games g
            join public.submissions s on s.id = g.sub_id
            left join public.events ev on ev.id = s.event_id
           where g.user_id = v_uid and (p_ref is null or g.sub_id = p_ref) and s.status = 'pendiente'
        ) y
        order by y.day desc nulls last, y.created_at desc, y.game desc
        limit v_limit) x), '[]'::jsonb);
end $$;

-- =====================================================================
-- Permisos: las RPC solo con sesión; las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['save_ball', 'retire_ball', 'resurface_ball', 'delete_ball', 'set_game_balls', 'my_balls',
                                 'my_ball_games', 'approve_submission'];
  v_private constant text[] := array['ball_dates_ok', 'my_ball', 'move_sub_balls'];
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
