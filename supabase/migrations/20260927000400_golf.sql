-- MatchMate · Fase 6 · Golf: campos, rondas (eventos), torneos de varias rondas, tarjetas por grupo.
--
-- Tablas (todas con RLS, solo lectura; se escribe por RPC):
-- - golf_courses: campos del club (9 o 18 hoyos, par y SI por hoyo) con sus salidas en JSON
--   (rating, slope, par y, si cambian, pares/SI propios y el rating de cada vuelta de 9).
-- - golf_tournaments: agrupa las rondas de un torneo (una ronda = un evento).
-- - golf_rounds: lo del golf de cada evento: COPIA del campo al crear la ronda (editar el campo después no
--   cambia las rondas pasadas), qué 9 hoyos, la competencia (formato, neto/bruto, %), salida simultánea,
--   torneo y número de ronda, y si ya se cerró.
-- - golf_cards: una tarjeta por jugador y ronda: salida elegida, Index congelado al inscribirse (el que el
--   jugador escribe, «no oficial»), handicap de campo y de juego, grupo y hoyo de salida, golpes por hoyo
--   (1–20), putts y «recogió» (un hoyo recogido va con golpes null, nunca con 0), firma y descalificación.
--
-- Quién escribe la tarjeta (golf_save_hole_scores): el admin o un anotador de la liga, o un inscrito del
-- MISMO grupo en ese evento (así cada grupo anota en un solo teléfono). Firmar: el jugador o el admin (la
-- firma puede llevar los hoyos tal como se revisaron: no depende del orden de la cola).
-- Desde el primer golpe o «recogió» (golf_cards.scored_at, que no se borra aunque se vacíe la tarjeta) el
-- jugador ya no cambia su salida ni su Index ni se sale: solo el admin.
-- Las fórmulas del WHS son las de src/sports/golf/course.ts (las pruebas comparan las dos).
--
-- Tiempo real (se reutilizan los avisos que la app ya escucha):
-- - cambios en tarjetas y en la ronda -> 'event:<id>' 'entries' {op, ids, sport: 'golf'}
-- - rondas creadas, cambiadas o borradas -> 'league:<id>' 'events' {op, ids}

-- =====================================================================
-- Tablas
-- =====================================================================

create table public.golf_courses (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60 and btrim(name) <> ''),
  -- [{par, si}] en orden (el índice 0 es el hoyo 1): 9 o 18 hoyos.
  holes jsonb not null check (jsonb_typeof(holes) = 'array'),
  -- [{id, name, rating, slope, par, pars?, sis?, front9?, back9?}]: de 1 a 10 salidas.
  tees jsonb not null check (jsonb_typeof(tees) = 'array' and pg_column_size(tees) < 16384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id)
);
create index golf_courses_sync_idx on public.golf_courses (league_id, updated_at);

create table public.golf_tournaments (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60 and btrim(name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id)
);
create index golf_tournaments_sync_idx on public.golf_tournaments (league_id, updated_at);

create table public.golf_rounds (
  event_id uuid primary key,
  league_id uuid not null,
  -- Campo del que salió la copia (null si ese campo se borró; la copia se queda).
  course_id uuid,
  -- Copia del campo al crear la ronda: {id, name, holes, tees}.
  course jsonb not null check (jsonb_typeof(course) = 'object' and pg_column_size(course) < 20000),
  -- Para las listas (sin bajar la copia entera). Los llena el trigger.
  course_name text not null default '',
  holes smallint not null default 18 check (holes in (9, 18)),
  -- Qué hoyos se juegan: todo el campo o la ida (1–9) / la vuelta (10–18) de un campo de 18.
  nine text not null default 'all' check (nine in ('all', 'front', 'back')),
  -- {format: 'stroke'|'stableford'|'maxScore', basis: 'net'|'gross', allowance: 0–100, maxScore?}
  competition jsonb not null check (jsonb_typeof(competition) = 'object'),
  -- Salida simultánea: cada grupo sale por su hoyo (golf_cards.start_hole).
  shotgun boolean not null default false,
  tournament_id uuid,
  round_no smallint check (round_no between 1 and 10),
  status text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, league_id),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  foreign key (course_id, league_id) references public.golf_courses (id, league_id) on delete set null (course_id),
  foreign key (tournament_id, league_id) references public.golf_tournaments (id, league_id) on delete set null (tournament_id)
);
create index golf_rounds_tournament_idx on public.golf_rounds (tournament_id);
create index golf_rounds_course_idx on public.golf_rounds (course_id);
create index golf_rounds_sync_idx on public.golf_rounds (league_id, updated_at);

create table public.golf_cards (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  event_id uuid not null,
  player_id uuid not null,
  -- Salida elegida (id de una salida de la copia del campo de la ronda).
  tee_id text not null check (char_length(tee_id) between 1 and 40),
  -- Handicap Index escrito a mano (FEDOGOLF/GHIN), congelado al inscribirse. null = sin Index (juega con 0).
  hcp_index double precision check (hcp_index between -10 and 54),
  -- Handicap de campo SIN redondear y de juego (con el % de la competencia). Los calcula la base.
  course_hcp double precision not null default 0,
  playing_hcp smallint not null default 0 check (playing_hcp between -60 and 150),
  group_no smallint check (group_no between 1 and 99),
  -- Hoyo por el que sale (número real 1–18): el primero de la ronda, o el de su grupo en salida simultánea.
  start_hole smallint not null default 1 check (start_hole between 1 and 18),
  -- Por hoyo de la ronda, en orden: golpes 1–20 (null = sin jugar o recogió), putts 0–10, recogió.
  strokes smallint[] not null default '{}',
  putts smallint[] not null default '{}',
  picked_up boolean[] not null default '{}',
  status text not null default 'abierta' check (status in ('abierta', 'firmada')),
  signed_at timestamptz,
  signed_by uuid references public.profiles (id) on delete set null,
  -- Cuándo se anotó el primer golpe o «recogió». No se borra aunque después se vacíen los hoyos: desde ahí el
  -- jugador ya no cambia su salida ni su Index (congelado) ni se sale de la ronda (el admin sí).
  scored_at timestamptz,
  -- Descalificado por el comité (p. ej. tarjeta sin firmar).
  dq boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, player_id),
  unique (id, league_id),
  foreign key (event_id, league_id) references public.golf_rounds (event_id, league_id) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade
);
create index golf_cards_player_idx on public.golf_cards (player_id);
create index golf_cards_event_idx on public.golf_cards (event_id, group_no);
create index golf_cards_sync_idx on public.golf_cards (league_id, updated_at);

-- =====================================================================
-- Validaciones (las mismas de src/sports/golf/course.ts y scoring.ts)
-- =====================================================================

-- Entero de un JSON dentro de un rango (12.0 cuenta como 12); si no, 'invalido'.
create function private.golf_int(p jsonb, p_min integer, p_max integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  n numeric;
begin
  if p is null or jsonb_typeof(p) <> 'number' then
    perform private.fail('invalido');
  end if;
  n := (p #>> '{}')::numeric;
  if n <> trunc(n) or n < p_min or n > p_max then
    perform private.fail('invalido');
  end if;
  return n::integer;
end $$;

-- Número (decimal o entero) de un JSON dentro de un rango; si no, 'invalido'.
create function private.golf_num(p jsonb, p_min double precision, p_max double precision) returns double precision
language plpgsql immutable set search_path = '' as $$
declare
  n double precision;
begin
  if p is null or jsonb_typeof(p) <> 'number' then
    perform private.fail('invalido');
  end if;
  n := (p #>> '{}')::double precision;
  if n < p_min or n > p_max then
    perform private.fail('invalido');
  end if;
  return n;
end $$;

-- Texto obligatorio de un JSON (recortado, de 1 a p_max letras).
create function private.golf_text(p jsonb, p_max integer) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text;
begin
  if p is null or jsonb_typeof(p) <> 'string' then
    perform private.fail('invalido');
  end if;
  v := btrim(p #>> '{}');
  if char_length(v) not between 1 and p_max then
    perform private.fail('invalido');
  end if;
  return v;
end $$;

-- Rating de una salida o de una vuelta de 9: slope 55–155, par = la suma de sus hoyos, rating a ±20 del par.
create function private.golf_rating(p jsonb, p_par integer) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_slope integer;
  v_par integer;
  v_rating double precision;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    perform private.fail('invalido');
  end if;
  v_slope := private.golf_int(p -> 'slope', 55, 155);
  v_par := private.golf_int(p -> 'par', 27, 90);
  if v_par <> p_par then
    perform private.fail('invalido');
  end if;
  v_rating := private.golf_num(p -> 'rating', 0, 120);
  if abs(v_rating - v_par) > 20 then
    perform private.fail('invalido');
  end if;
  return jsonb_build_object('rating', v_rating, 'slope', v_slope, 'par', v_par);
end $$;

-- Lista de SI: del 1 al 18 sin repetir (con 9 hoyos vale 1–9, impares o pares).
create function private.golf_sis(p jsonb, p_n integer) returns integer[]
language plpgsql immutable set search_path = '' as $$
declare
  v integer[];
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> p_n then
    perform private.fail('invalido');
  end if;
  v := (select array_agg(private.golf_int(x, 1, 18) order by i) from jsonb_array_elements(p) with ordinality as a (x, i));
  if (select count(distinct s) from unnest(v) s) <> p_n then
    perform private.fail('invalido');
  end if;
  return v;
end $$;

-- Campo validado y limpio (sin claves desconocidas): {holes, tees}. Si algo no sirve: 'invalido'.
create function private.golf_clean_course(p_holes jsonb, p_tees jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  n integer;
  v_pars integer[];
  v_sis integer[];
  v_tees jsonb := '[]';
  v_ids text[] := '{}';
  t jsonb;
  v_tee jsonb;
  v_id text;
  v_tpars integer[];
  v_tsis integer[];
  v_key text;
  v_nine jsonb;
begin
  if p_holes is null or jsonb_typeof(p_holes) <> 'array' then
    perform private.fail('invalido');
  end if;
  n := jsonb_array_length(p_holes);
  if n not in (9, 18) or exists (select 1 from jsonb_array_elements(p_holes) h where jsonb_typeof(h) <> 'object') then
    perform private.fail('invalido');
  end if;
  v_pars := (select array_agg(private.golf_int(h -> 'par', 3, 6) order by i) from jsonb_array_elements(p_holes) with ordinality as a (h, i));
  v_sis := private.golf_sis((select jsonb_agg(h -> 'si' order by i) from jsonb_array_elements(p_holes) with ordinality as a (h, i)), n);

  if p_tees is null or jsonb_typeof(p_tees) <> 'array' or jsonb_array_length(p_tees) not between 1 and 10 then
    perform private.fail('invalido');
  end if;
  for t in select x from jsonb_array_elements(p_tees) with ordinality as a (x, i) order by i loop
    if jsonb_typeof(t) <> 'object' then
      perform private.fail('invalido');
    end if;
    v_id := private.golf_text(t -> 'id', 40);
    if v_id = any (v_ids) then
      perform private.fail('invalido');
    end if;
    v_ids := v_ids || v_id;
    v_tee := jsonb_build_object('id', v_id, 'name', private.golf_text(t -> 'name', 40));
    v_tpars := v_pars;
    if jsonb_typeof(t -> 'pars') is distinct from 'null' and t ? 'pars' then
      if jsonb_typeof(t -> 'pars') <> 'array' or jsonb_array_length(t -> 'pars') <> n then
        perform private.fail('invalido');
      end if;
      v_tpars := (select array_agg(private.golf_int(x, 3, 6) order by i) from jsonb_array_elements(t -> 'pars') with ordinality as a (x, i));
      v_tee := v_tee || jsonb_build_object('pars', to_jsonb(v_tpars));
    end if;
    if jsonb_typeof(t -> 'sis') is distinct from 'null' and t ? 'sis' then
      v_tsis := private.golf_sis(t -> 'sis', n);
      v_tee := v_tee || jsonb_build_object('sis', to_jsonb(v_tsis));
    end if;
    v_tee := v_tee || private.golf_rating(t, (select sum(x)::integer from unnest(v_tpars) x));
    foreach v_key in array array['front9', 'back9'] loop
      v_nine := t -> v_key;
      if v_nine is null or jsonb_typeof(v_nine) = 'null' then
        continue;
      end if;
      -- Un campo de 9 hoyos no lleva rating por vuelta.
      if n <> 18 then
        perform private.fail('invalido');
      end if;
      v_tee := v_tee || jsonb_build_object(v_key, private.golf_rating(v_nine,
        (select sum(v_tpars[i])::integer from generate_series(case v_key when 'front9' then 1 else 10 end,
                                                              case v_key when 'front9' then 9 else 18 end) i)));
    end loop;
    v_tees := v_tees || jsonb_build_array(v_tee);
  end loop;
  return jsonb_build_object(
    'holes', (select jsonb_agg(jsonb_build_object('par', v_pars[i], 'si', v_sis[i]) order by i) from generate_series(1, n) i),
    'tees', v_tees);
end $$;

-- Competencia validada y limpia. null = stroke play neto al 95 %.
create function private.golf_clean_competition(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_format text;
  v_basis text;
  v jsonb;
  m jsonb;
  v_kind text;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return jsonb_build_object('format', 'stroke', 'basis', 'net', 'allowance', 95);
  end if;
  if jsonb_typeof(p) <> 'object' then
    perform private.fail('invalido');
  end if;
  v_format := p ->> 'format';
  v_basis := coalesce(p ->> 'basis', 'net');
  if jsonb_typeof(p -> 'format') is distinct from 'string' or v_format not in ('stroke', 'stableford', 'maxScore')
     or v_basis not in ('net', 'gross') then
    perform private.fail('invalido');
  end if;
  v := jsonb_build_object('format', v_format, 'basis', v_basis,
    'allowance', case when jsonb_typeof(p -> 'allowance') is distinct from 'null' and p ? 'allowance'
                      then private.golf_num(p -> 'allowance', 0, 100) else 95 end);
  m := p -> 'maxScore';
  if v_format = 'maxScore' and m is not null and jsonb_typeof(m) <> 'null' then
    if jsonb_typeof(m) <> 'object' then
      perform private.fail('invalido');
    end if;
    v_kind := m ->> 'kind';
    v := v || jsonb_build_object('maxScore', case v_kind
      when 'netDoubleBogey' then jsonb_build_object('kind', v_kind)
      when 'doublePar' then jsonb_build_object('kind', v_kind)
      when 'parPlus' then jsonb_build_object('kind', v_kind, 'n', private.golf_int(m -> 'n', 1, 10))
      when 'fixed' then jsonb_build_object('kind', v_kind, 'value', private.golf_int(m -> 'value', 2, 20))
    end);
    if v -> 'maxScore' is null or jsonb_typeof(v -> 'maxScore') = 'null' then
      perform private.fail('invalido');
    end if;
  end if;
  return v;
end $$;

-- Hoyos que se juegan en la ronda (9 o 18) y el número del primero.
create function private.golf_round_holes(p_course jsonb, p_nine text) returns integer
language sql immutable set search_path = '' as $$
  select case when jsonb_array_length(p_course -> 'holes') = 18 and p_nine in ('front', 'back') then 9
              else jsonb_array_length(p_course -> 'holes') end
$$;

create function private.golf_first_hole(p_course jsonb, p_nine text) returns integer
language sql immutable set search_path = '' as $$
  select case when jsonb_array_length(p_course -> 'holes') = 18 and p_nine = 'back' then 10 else 1 end
$$;

-- La tarjeta ya tiene algo anotado (golpes o «recogió»).
create function private.golf_started(p_strokes smallint[], p_picked boolean[]) returns boolean
language sql immutable set search_path = '' as $$
  select exists (select 1 from unnest(p_strokes) s where s is not null) or coalesce(true = any (p_picked), false)
$$;

-- Handicap de campo (sin redondear) y de juego, como handicapFor de course.ts:
-- 18 hoyos: Index × Slope/113 + (Rating − Par); 9 hoyos: (Index/2) × Slope9/113 + (Rating9 − Par9), con el
-- rating de la vuelta o, si no está, estimado (rating/2, el mismo slope y el par de esos 9 hoyos).
-- De juego: el de campo × % de la competencia, y ahí se redondea (0,5 sube). Sin Index: 0 y 0.
create function private.golf_hcp(
  p_course jsonb, p_nine text, p_tee text, p_index double precision, p_allowance double precision,
  out course_hcp double precision, out playing_hcp integer
)
language plpgsql immutable set search_path = '' as $$
declare
  t jsonb;
  r jsonb;
  n integer := jsonb_array_length(p_course -> 'holes');
  v_nine_holes boolean := false;
  v_idx double precision;
begin
  select x into t from jsonb_array_elements(p_course -> 'tees') x where x ->> 'id' = p_tee limit 1;
  if t is null then
    perform private.fail('invalido');
  end if;
  if p_index is null then
    course_hcp := 0;
    playing_hcp := 0;
    return;
  end if;
  if n = 9 then
    r := t;
    v_nine_holes := true;
  elsif p_nine = 'all' then
    r := t;
  else
    v_nine_holes := true;
    r := t -> (case p_nine when 'front' then 'front9' else 'back9' end);
    if r is null or jsonb_typeof(r) = 'null' then
      r := jsonb_build_object(
        'rating', (t ->> 'rating')::double precision / 2,
        'slope', t -> 'slope',
        'par', (select sum(coalesce((t -> 'pars' ->> (i - 1))::integer, (p_course -> 'holes' -> (i - 1) ->> 'par')::integer))
                  from generate_series(case p_nine when 'front' then 1 else 10 end, case p_nine when 'front' then 9 else 18 end) i));
    end if;
  end if;
  v_idx := case when v_nine_holes then p_index / 2 else p_index end;
  course_hcp := v_idx * (r ->> 'slope')::double precision / 113 + ((r ->> 'rating')::double precision - (r ->> 'par')::double precision);
  playing_hcp := floor(course_hcp * coalesce(p_allowance, 95) / 100 + 0.5 + 1e-9)::integer;
end $$;

-- Vuelve a calcular el handicap de las tarjetas de la ronda (o de una sola) con su Index congelado.
create function private.golf_refresh_hcp(p_event uuid, p_card uuid default null) returns void
language sql security definer set search_path = '' as $$
  update public.golf_cards c set (course_hcp, playing_hcp) = (
    select h.course_hcp, h.playing_hcp
      from public.golf_rounds r,
           private.golf_hcp(r.course, r.nine, c.tee_id, c.hcp_index, (r.competition ->> 'allowance')::double precision) h
     where r.event_id = c.event_id)
   where c.event_id = p_event and (p_card is null or c.id = p_card);
$$;

-- La liga existe y es de golf.
create function private.golf_require_league(p_league uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v text := (select l.sport from public.leagues l where l.id = p_league);
begin
  if v is null then
    perform private.fail('no_existe');
  elsif v <> 'golf' then
    perform private.fail('invalido');
  end if;
end $$;

-- Competencia por defecto de la liga (leagues.rules.competition); si no sirve, stroke play neto al 95 %.
create function private.golf_league_competition(p_league uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return private.golf_clean_competition((select l.rules -> 'competition' from public.leagues l where l.id = p_league));
exception when others then
  return private.golf_clean_competition(null);
end $$;

-- Copia del campo para una ronda: {id, name, holes, tees}. 'no_existe' si no es de esa liga.
create function private.golf_course_copy(p_course uuid, p_league uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  select jsonb_build_object('id', c.id, 'name', c.name, 'holes', c.holes, 'tees', c.tees) into v
    from public.golf_courses c where c.id = p_course and c.league_id = p_league;
  if v is null then
    perform private.fail('no_existe');
  end if;
  return v;
end $$;

-- Index que el jugador guardó en su perfil de la liga (players.attrs.golf.index), o null.
create function private.golf_player_index(p_player uuid) returns double precision
language sql stable security definer set search_path = '' as $$
  select case when jsonb_typeof(p.attrs -> 'golf' -> 'index') = 'number'
                   and (p.attrs -> 'golf' ->> 'index')::double precision between -10 and 54
              then (p.attrs -> 'golf' ->> 'index')::double precision end
    from public.players p where p.id = p_player
$$;

-- Guarda en la tarjeta (quien llama ya la bloqueó y revisó el permiso) los hoyos que manda:
-- [{i, s, p, u}] como en golf_save_hole_scores; solo cambia esos hoyos. Con algún golpe o «recogió» queda
-- scored_at (la primera vez; no se borra). Devuelve cuántos hoyos guardó. Si algo no sirve: 'invalido'.
create function private.golf_write_holes(p_card uuid, p_holes jsonb, p_n integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c public.golf_cards;
  h jsonb;
  i integer;
  s integer;
  p integer;
  u boolean;
  v_strokes smallint[];
  v_putts smallint[];
  v_picked boolean[];
  v_scored boolean := false;
  v_count integer := 0;
begin
  select * into c from public.golf_cards k where k.id = p_card;
  if c.id is null or jsonb_typeof(p_holes) is distinct from 'array' or jsonb_array_length(p_holes) > p_n then
    perform private.fail('invalido');
  end if;
  v_strokes := c.strokes;
  v_putts := c.putts;
  v_picked := c.picked_up;
  for h in select value from jsonb_array_elements(p_holes) loop
    if jsonb_typeof(h) <> 'object' then
      perform private.fail('invalido');
    end if;
    i := private.golf_int(h -> 'i', 0, p_n - 1) + 1;
    s := case when jsonb_typeof(h -> 's') is distinct from 'null' and h ? 's' then private.golf_int(h -> 's', 1, 20) end;
    p := case when jsonb_typeof(h -> 'p') is distinct from 'null' and h ? 'p' then private.golf_int(h -> 'p', 0, 10) end;
    if h ? 'u' and jsonb_typeof(h -> 'u') not in ('boolean', 'null') then
      perform private.fail('invalido');
    end if;
    u := coalesce((h ->> 'u')::boolean, false);
    if (u and (s is not null or p is not null)) or (p is not null and s is not null and p >= s) then
      perform private.fail('invalido');
    end if;
    v_strokes[i] := s;
    v_putts[i] := p;
    v_picked[i] := u;
    v_scored := v_scored or s is not null or u;
    v_count := v_count + 1;
  end loop;
  update public.golf_cards k set
    strokes = v_strokes,
    putts = v_putts,
    picked_up = v_picked,
    scored_at = coalesce(k.scored_at, case when v_scored or private.golf_started(v_strokes, v_picked) then now() end)
  where k.id = p_card;
  return v_count;
end $$;

-- =====================================================================
-- Triggers (valen para todos, también service_role)
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array['golf_courses', 'golf_tournaments', 'golf_rounds', 'golf_cards'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

create trigger golf_courses_tombstone after delete on public.golf_courses for each row execute function private.tombstone('id');
create trigger golf_tournaments_tombstone after delete on public.golf_tournaments for each row execute function private.tombstone('id');
create trigger golf_rounds_tombstone after delete on public.golf_rounds for each row execute function private.tombstone('event_id');
create trigger golf_cards_tombstone after delete on public.golf_cards for each row execute function private.tombstone('id');

-- Solo en ligas de golf.
create function private.golf_check_league() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select l.sport from public.leagues l where l.id = new.league_id) is distinct from 'golf' then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Solo en ligas de golf.';
  end if;
  return new;
end $$;

create trigger golf_tournaments_check before insert or update of league_id on public.golf_tournaments
  for each row execute function private.golf_check_league();

-- Campo: validado y guardado limpio.
create function private.golf_check_course() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb;
begin
  if (select l.sport from public.leagues l where l.id = new.league_id) is distinct from 'golf' then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Solo en ligas de golf.';
  end if;
  c := private.golf_clean_course(new.holes, new.tees);
  new.holes := c -> 'holes';
  new.tees := c -> 'tees';
  new.name := btrim(new.name);
  return new;
end $$;

create trigger golf_courses_check before insert or update of league_id, holes, tees, name on public.golf_courses
  for each row execute function private.golf_check_course();

-- Ronda: copia del campo válida, 9 hoyos solo en un campo de 18, competencia válida.
create function private.golf_check_round() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb;
  v_name text;
begin
  if (select l.sport from public.leagues l where l.id = new.league_id) is distinct from 'golf' then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Solo en ligas de golf.';
  end if;
  c := private.golf_clean_course(new.course -> 'holes', new.course -> 'tees');
  v_name := private.golf_text(new.course -> 'name', 60);
  new.course := jsonb_build_object('id', new.course -> 'id', 'name', v_name, 'holes', c -> 'holes', 'tees', c -> 'tees');
  if new.nine <> 'all' and jsonb_array_length(c -> 'holes') <> 18 then
    raise exception 'invalido' using errcode = 'P0001', detail = 'La ida o la vuelta solo en un campo de 18 hoyos.';
  end if;
  new.course_name := v_name;
  new.holes := private.golf_round_holes(new.course, new.nine);
  new.competition := private.golf_clean_competition(new.competition);
  return new;
end $$;

create trigger golf_rounds_check before insert or update of league_id, course, nine, competition on public.golf_rounds
  for each row execute function private.golf_check_round();

-- Tarjeta: del tamaño de la ronda, golpes 1–20, putts 0–10 (menos que los golpes), «recogió» sin golpes,
-- la salida existe en la copia del campo y el hoyo de salida es de la ronda.
create function private.golf_check_card() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_course jsonb;
  v_nine text;
  n integer;
  v_first integer;
begin
  select r.course, r.nine into v_course, v_nine from public.golf_rounds r where r.event_id = new.event_id;
  if v_course is null then
    raise exception 'invalido' using errcode = 'P0001';
  end if;
  n := private.golf_round_holes(v_course, v_nine);
  v_first := private.golf_first_hole(v_course, v_nine);
  if not exists (select 1 from jsonb_array_elements(v_course -> 'tees') x where x ->> 'id' = new.tee_id) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Esa salida no existe en el campo de la ronda.';
  end if;
  if coalesce(array_ndims(new.strokes), 1) <> 1 or coalesce(array_ndims(new.putts), 1) <> 1 or coalesce(array_ndims(new.picked_up), 1) <> 1
     or coalesce(cardinality(new.strokes), 0) <> n or coalesce(cardinality(new.putts), 0) <> n
     or coalesce(cardinality(new.picked_up), 0) <> n then
    raise exception 'invalido' using errcode = 'P0001', detail = 'La tarjeta no tiene los hoyos de la ronda.';
  end if;
  if exists (
    select 1 from generate_series(1, n) i
     where new.strokes[i] not between 1 and 20
        or new.putts[i] not between 0 and 10
        or new.picked_up[i] is null
        or (new.picked_up[i] and (new.strokes[i] is not null or new.putts[i] is not null))
        or new.putts[i] >= new.strokes[i]) then
    raise exception 'invalido' using errcode = 'P0001';
  end if;
  if new.start_hole < v_first or new.start_hole >= v_first + n then
    raise exception 'invalido' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger golf_cards_check before insert or update on public.golf_cards
  for each row execute function private.golf_check_card();

-- Inscritos de la ronda (events.player_count), como hace entries en el boliche.
create function private.golf_count_players() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
begin
  update public.events e set player_count = (select count(*) from public.golf_cards c where c.event_id = v_event)
   where e.id = v_event;
  return null;
end $$;

create trigger golf_cards_count after insert or delete on public.golf_cards
  for each row execute function private.golf_count_players();

-- Eventos de una liga de golf: rondas (y el torneo que crea create_tournament).
create function private.golf_check_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.type not in ('ronda', 'torneo')
     and (select l.sport from public.leagues l where l.id = new.league_id) = 'golf' then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Tipo de evento de golf: ronda.';
  end if;
  return new;
end $$;

create trigger events_golf_check before insert or update of type, league_id on public.events
  for each row execute function private.golf_check_event();

-- ---------- Tiempo real ----------

create function private.golf_emit_cards() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    for r in select o.event_id, o.league_id, jsonb_agg(o.id) as ids from old_rows o group by o.event_id, o.league_id loop
      if not private.deleting(r.league_id) then
        perform private.emit('event:' || r.event_id::text, 'entries', jsonb_build_object('op', 'delete', 'ids', r.ids, 'sport', 'golf'));
      end if;
    end loop;
  else
    for r in select n.event_id, jsonb_agg(n.id) as ids from new_rows n group by n.event_id loop
      perform private.emit('event:' || r.event_id::text, 'entries', jsonb_build_object('op', lower(tg_op), 'ids', r.ids, 'sport', 'golf'));
    end loop;
  end if;
  return null;
end $$;

create trigger golf_cards_emit_insert after insert on public.golf_cards referencing new table as new_rows
  for each statement execute function private.golf_emit_cards();
create trigger golf_cards_emit_update after update on public.golf_cards referencing new table as new_rows
  for each statement execute function private.golf_emit_cards();
create trigger golf_cards_emit_delete after delete on public.golf_cards referencing old table as old_rows
  for each statement execute function private.golf_emit_cards();

create function private.golf_emit_rounds() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    for r in select o.league_id, jsonb_agg(o.event_id) as ids from old_rows o group by o.league_id loop
      if not private.deleting(r.league_id) then
        perform private.emit('league:' || r.league_id::text, 'events', jsonb_build_object('op', 'delete', 'ids', r.ids));
      end if;
    end loop;
    return null;
  end if;
  for r in select n.league_id, jsonb_agg(n.event_id) as ids from new_rows n group by n.league_id loop
    perform private.emit('league:' || r.league_id::text, 'events', jsonb_build_object('op', lower(tg_op), 'ids', r.ids));
  end loop;
  -- Quien mira la ronda (tarjetas, leaderboard) se entera de que cambió o se cerró.
  for r in select n.event_id from new_rows n loop
    perform private.emit('event:' || r.event_id::text, 'entries', jsonb_build_object('op', 'update', 'ids', '[]'::jsonb, 'sport', 'golf', 'round', true));
  end loop;
  return null;
end $$;

create trigger golf_rounds_emit_insert after insert on public.golf_rounds referencing new table as new_rows
  for each statement execute function private.golf_emit_rounds();
create trigger golf_rounds_emit_update after update on public.golf_rounds referencing new table as new_rows
  for each statement execute function private.golf_emit_rounds();
create trigger golf_rounds_emit_delete after delete on public.golf_rounds referencing old table as old_rows
  for each statement execute function private.golf_emit_rounds();

-- =====================================================================
-- RLS: lo ve quien ve la liga (como entries). Nadie escribe directo.
-- =====================================================================

alter table public.golf_courses enable row level security;
alter table public.golf_tournaments enable row level security;
alter table public.golf_rounds enable row level security;
alter table public.golf_cards enable row level security;

create policy golf_courses_read on public.golf_courses for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy golf_tournaments_read on public.golf_tournaments for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy golf_rounds_read on public.golf_rounds for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy golf_cards_read on public.golf_cards for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));

grant select on public.golf_courses, public.golf_tournaments, public.golf_rounds, public.golf_cards to anon, authenticated;

-- =====================================================================
-- RPC
-- =====================================================================

-- ---------- Campos (admin) ----------

-- Crea o cambia un campo de la liga. Las rondas ya creadas guardan su copia: no cambian.
create function public.golf_save_course(p_league uuid, p_name text, p_holes jsonb, p_tees jsonb, p_id uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb;
  v_owner uuid;
  v_id uuid;
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  perform private.golf_require_league(p_league);
  c := private.golf_clean_course(p_holes, p_tees);
  if p_id is not null then
    select g.league_id into v_owner from public.golf_courses g where g.id = p_id for update;
  end if;
  if v_owner is not null then
    if v_owner <> p_league then
      perform private.fail('no_existe');
    end if;
    update public.golf_courses set name = private.clean_name(p_name), holes = c -> 'holes', tees = c -> 'tees' where id = p_id;
    return p_id;
  end if;
  if (select count(*) from public.golf_courses g where g.league_id = p_league) >= 30 then
    perform private.fail('invalido');
  end if;
  insert into public.golf_courses (id, league_id, name, holes, tees)
  values (coalesce(p_id, gen_random_uuid()), p_league, private.clean_name(p_name), c -> 'holes', c -> 'tees')
  returning id into v_id;
  return v_id;
end $$;

create function public.golf_delete_course(p_course uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select g.league_id from public.golf_courses g where g.id = p_course);
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  delete from public.golf_courses where id = p_course;
end $$;

-- ---------- Rondas y torneos (admin) ----------

-- Crea la ronda: el evento (tipo 'ronda') y lo del golf, con la copia del campo. p_competition null = la de
-- la liga (rules.competition). Con p_tournament, la ronda es la siguiente de ese torneo.
create function public.golf_create_round(
  p_league uuid,
  p_date date,
  p_course uuid,
  p_name text default '',
  p_nine text default 'all',
  p_start_time time default null,
  p_competition jsonb default null,
  p_shotgun boolean default false,
  p_tournament uuid default null,
  p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_copy jsonb;
  v_no integer;
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  perform private.golf_require_league(p_league);
  if p_date is null or coalesce(p_nine, 'all') not in ('all', 'front', 'back') then
    perform private.fail('invalido');
  end if;
  v_copy := private.golf_course_copy(p_course, p_league);
  if p_tournament is not null then
    if not exists (select 1 from public.golf_tournaments t where t.id = p_tournament and t.league_id = p_league) then
      perform private.fail('no_existe');
    end if;
    v_no := (select count(*) from public.golf_rounds r where r.tournament_id = p_tournament) + 1;
    if v_no > 10 then
      perform private.fail('invalido');
    end if;
  end if;
  insert into public.events (id, league_id, type, name, date, start_time, games, config, created_by)
  values (v_id, p_league, 'ronda', btrim(coalesce(p_name, '')), p_date, p_start_time, 1, '{}', auth.uid());
  insert into public.golf_rounds (event_id, league_id, course_id, course, nine, competition, shotgun, tournament_id, round_no)
  values (v_id, p_league, p_course, v_copy, coalesce(p_nine, 'all'),
          case when p_competition is null or jsonb_typeof(p_competition) = 'null' then private.golf_league_competition(p_league)
               else private.golf_clean_competition(p_competition) end,
          coalesce(p_shotgun, false), p_tournament, v_no);
  return v_id;
end $$;

-- Torneo de varias rondas (una por fecha, de 1 a 6), todas en el mismo campo y con la misma competencia.
-- Devuelve {tournament_id, event_ids}. p_event_ids: los ids de las rondas si los generó el teléfono.
create function public.golf_create_tournament(
  p_league uuid,
  p_name text,
  p_dates date[],
  p_course uuid,
  p_nine text default 'all',
  p_competition jsonb default null,
  p_shotgun boolean default false,
  p_id uuid default null,
  p_event_ids uuid[] default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_name text;
  v_events uuid[] := '{}';
  v_comp jsonb;
  n integer := coalesce(cardinality(p_dates), 0);
begin
  perform private.require_uid();
  perform private.require_admin(p_league);
  perform private.golf_require_league(p_league);
  v_name := private.clean_name(p_name);
  if n not between 1 and 6 or array_position(p_dates, null) is not null
     or (p_event_ids is not null and cardinality(p_event_ids) <> n) then
    perform private.fail('invalido');
  end if;
  v_comp := case when p_competition is null or jsonb_typeof(p_competition) = 'null' then private.golf_league_competition(p_league)
                 else private.golf_clean_competition(p_competition) end;
  insert into public.golf_tournaments (id, league_id, name) values (v_id, p_league, v_name);
  for i in 1..n loop
    v_events := v_events || public.golf_create_round(
      p_league => p_league, p_date => p_dates[i], p_course => p_course,
      p_name => case when n = 1 then v_name else v_name || ' · Ronda ' || i end,
      p_nine => p_nine, p_competition => v_comp, p_shotgun => p_shotgun, p_tournament => v_id, p_id => p_event_ids[i]);
  end loop;
  return jsonb_build_object('tournament_id', v_id, 'event_ids', to_jsonb(v_events));
end $$;

-- Borra el torneo con sus rondas (eventos, tarjetas: cascada).
create function public.golf_delete_tournament(p_tournament uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select t.league_id from public.golf_tournaments t where t.id = p_tournament);
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  delete from public.events e where e.id in (select r.event_id from public.golf_rounds r where r.tournament_id = p_tournament);
  delete from public.golf_tournaments where id = p_tournament;
end $$;

-- Cambia lo del golf de una ronda. Claves: course (id de un campo de la liga: copia nueva), nine,
-- competition, shotgun. Campo y hoyos solo mientras nadie anotó nada. Un evento de golf creado sin campo
-- (create_event, create_tournament) recibe aquí su campo (hace falta la clave course).
create function public.golf_update_round(p_event uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select e.league_id from public.events e where e.id = p_event);
  v public.golf_rounds;
  k text;
  v_copy jsonb;
  v_nine text;
  n integer;
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  perform private.golf_require_league(v_league);
  if jsonb_typeof(p_patch) is distinct from 'object' then
    perform private.fail('invalido');
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (array['course', 'nine', 'competition', 'shotgun']) then
      perform private.fail('invalido');
    end if;
  end loop;
  if p_patch ? 'course' then
    v_copy := private.golf_course_copy((p_patch ->> 'course')::uuid, v_league);
  end if;
  select * into v from public.golf_rounds r where r.event_id = p_event for update;
  if v.event_id is null then
    if v_copy is null then
      perform private.fail('invalido');
    end if;
    insert into public.golf_rounds (event_id, league_id, course_id, course, nine, competition, shotgun)
    values (p_event, v_league, (p_patch ->> 'course')::uuid, v_copy, coalesce(p_patch ->> 'nine', 'all'),
            case when p_patch ? 'competition' then private.golf_clean_competition(p_patch -> 'competition')
                 else private.golf_league_competition(v_league) end,
            coalesce((p_patch ->> 'shotgun')::boolean, false));
    return;
  end if;
  if v.status <> 'abierta' then
    perform private.fail('cerrado');
  end if;
  v_nine := coalesce(case when p_patch ? 'nine' then p_patch ->> 'nine' end, v.nine);
  if (v_copy is not null or v_nine <> v.nine)
     and exists (select 1 from public.golf_cards c where c.event_id = p_event and private.golf_started(c.strokes, c.picked_up)) then
    perform private.fail('invalido');
  end if;
  update public.golf_rounds r set
    course_id = case when v_copy is not null then (p_patch ->> 'course')::uuid else r.course_id end,
    course = coalesce(v_copy, r.course),
    nine = v_nine,
    competition = case when p_patch ? 'competition' then private.golf_clean_competition(p_patch -> 'competition') else r.competition end,
    shotgun = case when p_patch ? 'shotgun' then coalesce((p_patch ->> 'shotgun')::boolean, false) else r.shotgun end
  where r.event_id = p_event
  returning * into v;
  if v_copy is not null or p_patch ? 'nine' then
    -- Campo u hoyos nuevos: tarjetas vacías del tamaño nuevo (como recién inscritas, también scored_at) y, si
    -- su salida ya no existe, la primera.
    n := private.golf_round_holes(v.course, v.nine);
    update public.golf_cards c set
      tee_id = case when exists (select 1 from jsonb_array_elements(v.course -> 'tees') x where x ->> 'id' = c.tee_id)
                    then c.tee_id else v.course -> 'tees' -> 0 ->> 'id' end,
      strokes = array_fill(null::smallint, array[n]),
      putts = array_fill(null::smallint, array[n]),
      picked_up = array_fill(false, array[n]),
      start_hole = private.golf_first_hole(v.course, v.nine),
      status = 'abierta', signed_at = null, signed_by = null, scored_at = null
    where c.event_id = p_event;
  end if;
  perform private.golf_refresh_hcp(p_event);
end $$;

-- Cierra la ronda (resultados finales: nadie anota más) o la vuelve a abrir.
create function public.golf_close_round(p_event uuid, p_closed boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select r.league_id from public.golf_rounds r where r.event_id = p_event);
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  update public.golf_rounds set
    status = case when coalesce(p_closed, true) then 'cerrada' else 'abierta' end,
    closed_at = case when coalesce(p_closed, true) then now() end,
    closed_by = case when coalesce(p_closed, true) then auth.uid() end
  where event_id = p_event;
end $$;

-- ---------- Inscripciones ----------

-- Inscribe al jugador (p_player null = el mío; otro: solo el admin) con su salida y su Index, que queda
-- congelado en la tarjeta. p_tee null = la primera salida del campo; p_index null = el de su perfil.
-- Si ya estaba: cambia la salida o el Index (el jugador, solo si nunca se anotó nada en su tarjeta, aunque
-- después se haya vaciado: scored_at; el admin, siempre).
create function public.golf_register(p_event uuid, p_player uuid default null, p_tee text default null, p_index double precision default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select e.league_id from public.events e where e.id = p_event);
  v_round public.golf_rounds;
  v_card public.golf_cards;
  v_admin boolean;
  v_mine uuid;
  v_player uuid;
  v_id uuid;
  n integer;
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  select * into v_round from public.golf_rounds r where r.event_id = p_event;
  if v_round.event_id is null then
    perform private.fail('invalido');
  end if;
  v_admin := private.is_admin(v_league);
  v_mine := private.my_player(v_league);
  v_player := coalesce(p_player, v_mine);
  if v_player is null or (v_player is distinct from v_mine and not v_admin) then
    perform private.deny();
  end if;
  if v_round.status <> 'abierta' then
    perform private.fail('cerrado');
  end if;
  if not exists (select 1 from public.players p where p.id = v_player and p.league_id = v_league) then
    perform private.fail('no_existe');
  end if;
  if p_index is not null and not (p_index between -10 and 54) then
    perform private.fail('invalido');
  end if;
  if p_tee is not null and not exists (select 1 from jsonb_array_elements(v_round.course -> 'tees') x where x ->> 'id' = p_tee) then
    perform private.fail('invalido');
  end if;
  select * into v_card from public.golf_cards c where c.event_id = p_event and c.player_id = v_player for update;
  if v_card.id is null then
    n := private.golf_round_holes(v_round.course, v_round.nine);
    insert into public.golf_cards (league_id, event_id, player_id, tee_id, hcp_index, start_hole, strokes, putts, picked_up)
    values (v_league, p_event, v_player, coalesce(p_tee, v_round.course -> 'tees' -> 0 ->> 'id'),
            round(coalesce(p_index, private.golf_player_index(v_player))::numeric, 1)::double precision,
            private.golf_first_hole(v_round.course, v_round.nine),
            array_fill(null::smallint, array[n]), array_fill(null::smallint, array[n]), array_fill(false, array[n]))
    returning id into v_id;
  else
    if not v_admin and (v_card.status = 'firmada' or v_card.scored_at is not null
                        or private.golf_started(v_card.strokes, v_card.picked_up)) then
      perform private.fail('cerrado');
    end if;
    update public.golf_cards set
      tee_id = coalesce(p_tee, tee_id),
      hcp_index = coalesce(round(p_index::numeric, 1)::double precision, hcp_index)
    where id = v_card.id;
    v_id := v_card.id;
  end if;
  perform private.golf_refresh_hcp(p_event, v_id);
  return v_id;
end $$;

-- Admin: inscribe varios a la vez. p_players = [{player_id, tee_id?, index?}]. Quien ya estaba no se toca.
-- Devuelve cuántos entraron.
create function public.golf_add_players(p_event uuid, p_players jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select e.league_id from public.events e where e.id = p_event);
  x jsonb;
  v_player uuid;
  v_count integer := 0;
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  if jsonb_typeof(p_players) is distinct from 'array' or jsonb_array_length(p_players) > 200 then
    perform private.fail('invalido');
  end if;
  for x in select value from jsonb_array_elements(p_players) loop
    v_player := (x ->> 'player_id')::uuid;
    if v_player is null then
      perform private.fail('invalido');
    end if;
    if exists (select 1 from public.golf_cards c where c.event_id = p_event and c.player_id = v_player) then
      continue;
    end if;
    perform public.golf_register(p_event, v_player, nullif(x ->> 'tee_id', ''),
      case when jsonb_typeof(x -> 'index') = 'number' then (x ->> 'index')::double precision end);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Saca la tarjeta: el jugador la suya (si nunca se anotó nada en ella: scored_at) o el admin.
create function public.golf_unregister(p_card uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.golf_cards;
  v_admin boolean;
begin
  perform private.require_uid();
  select * into c from public.golf_cards x where x.id = p_card for update;
  if c.id is null then
    perform private.fail('no_existe');
  end if;
  v_admin := private.is_admin(c.league_id);
  if not v_admin and c.player_id is distinct from private.my_player(c.league_id) then
    perform private.deny();
  end if;
  if (select r.status from public.golf_rounds r where r.event_id = c.event_id) <> 'abierta' then
    perform private.fail('cerrado');
  end if;
  if not v_admin and (c.status = 'firmada' or c.scored_at is not null or private.golf_started(c.strokes, c.picked_up)) then
    perform private.fail('cerrado');
  end if;
  delete from public.golf_cards where id = p_card;
end $$;

-- Admin: arma los grupos. p_groups = [{card_id, group_no (1–99 | null = sin grupo), start_hole?}].
-- start_hole: hoyo real por el que sale (salida simultánea); null = el primero de la ronda. Máximo 4 por grupo.
create function public.golf_set_groups(p_event uuid, p_groups jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_round public.golf_rounds;
  x jsonb;
  v_card uuid;
begin
  perform private.require_uid();
  select * into v_round from public.golf_rounds r where r.event_id = p_event;
  if v_round.event_id is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_round.league_id);
  if v_round.status <> 'abierta' then
    perform private.fail('cerrado');
  end if;
  if jsonb_typeof(p_groups) is distinct from 'array' then
    perform private.fail('invalido');
  end if;
  for x in select value from jsonb_array_elements(p_groups) loop
    v_card := (x ->> 'card_id')::uuid;
    if not exists (select 1 from public.golf_cards c where c.id = v_card and c.event_id = p_event) then
      perform private.fail('invalido');
    end if;
    update public.golf_cards c set
      group_no = case when x ? 'group_no' then
                   case when jsonb_typeof(x -> 'group_no') = 'null' then null else private.golf_int(x -> 'group_no', 1, 99) end
                 else c.group_no end,
      start_hole = case when x ? 'start_hole' then
                     case when jsonb_typeof(x -> 'start_hole') = 'null' then private.golf_first_hole(v_round.course, v_round.nine)
                          else private.golf_int(x -> 'start_hole', 1, 18) end
                   else c.start_hole end
    where c.id = v_card;
  end loop;
  if exists (select 1 from public.golf_cards c where c.event_id = p_event and c.group_no is not null
              group by c.group_no having count(*) > 4) then
    perform private.fail('invalido');
  end if;
end $$;

-- ---------- Tarjeta en el campo (va por la cola del teléfono: p_op_id obligatorio) ----------

-- Guarda hoyos de una o varias tarjetas del evento. p_cards = [{card_id, holes: [{i, s, p, u}]}]:
-- i = hoyo de la ronda (desde 0, en el orden de la tarjeta), s = golpes 1–20 | null, p = putts 0–10 | null,
-- u = recogió (entonces s y p van null). Solo cambia los hoyos que manda.
-- Quién: admin o anotador de la liga (cualquier tarjeta); un inscrito, la suya y las de su mismo grupo.
-- Una tarjeta firmada solo la cambia el admin. Ronda cerrada: 'cerrado'. Devuelve cuántos hoyos guardó.
-- Todo o nada: la app manda una llamada por tarjeta (una tarjeta rechazada no frena las demás).
create function public.golf_save_hole_scores(p_op_id uuid, p_event uuid, p_cards jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_prev jsonb;
  v_round public.golf_rounds;
  v_admin boolean;
  v_staff boolean;
  v_mine public.golf_cards;
  c public.golf_cards;
  x jsonb;
  n integer;
  v_count integer := 0;
begin
  perform private.require_uid();
  if p_op_id is null then
    perform private.fail('invalido');
  end if;
  v_prev := private.op_begin(p_op_id, 'golf_save_hole_scores');
  if v_prev is not null then
    return (v_prev #>> '{}')::integer;
  end if;
  select * into v_round from public.golf_rounds r where r.event_id = p_event;
  if v_round.event_id is null then
    perform private.fail('no_existe');
  end if;
  v_admin := private.is_admin(v_round.league_id);
  v_staff := v_admin or private.is_scorer(v_round.league_id);
  if not v_staff then
    select * into v_mine from public.golf_cards m where m.event_id = p_event and m.player_id = private.my_player(v_round.league_id);
    if v_mine.id is null then
      perform private.deny();
    end if;
  end if;
  if v_round.status <> 'abierta' then
    perform private.fail('cerrado');
  end if;
  if jsonb_typeof(p_cards) is distinct from 'array' or jsonb_array_length(p_cards) > 8 then
    perform private.fail('invalido');
  end if;
  n := private.golf_round_holes(v_round.course, v_round.nine);
  for x in select value from jsonb_array_elements(p_cards) loop
    select * into c from public.golf_cards k where k.id = (x ->> 'card_id')::uuid and k.event_id = p_event for update;
    if c.id is null then
      perform private.fail('invalido');
    end if;
    if not v_staff and c.id <> v_mine.id and (v_mine.group_no is null or c.group_no is distinct from v_mine.group_no) then
      perform private.deny();
    end if;
    if c.status = 'firmada' and not v_admin then
      perform private.fail('cerrado');
    end if;
    v_count := v_count + private.golf_write_holes(c.id, x -> 'holes', n);
  end loop;
  perform private.op_end(p_op_id, to_jsonb(v_count));
  return v_count;
end $$;

-- Firma la tarjeta (completa: cada hoyo con golpes o «recogió»): el jugador o el admin.
-- p_holes (opcional): los hoyos tal como los revisó quien firma, [{i, s, p, u}] como en golf_save_hole_scores.
-- Se guardan justo antes de firmar (si la tarjeta todavía no está firmada), así la firma no depende de que
-- los hoyos lleguen antes por la cola del teléfono.
-- p_signed = false la vuelve a abrir (solo el admin; p_holes no se usa).
create function public.golf_sign_card(p_card uuid, p_signed boolean default true, p_op_id uuid default null, p_holes jsonb default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.golf_cards;
  v_round public.golf_rounds;
  v_admin boolean;
  v_own boolean;
begin
  perform private.require_uid();
  if private.op_begin(p_op_id, 'golf_sign_card') is not null then
    return;
  end if;
  select * into c from public.golf_cards x where x.id = p_card for update;
  if c.id is null then
    perform private.fail('no_existe');
  end if;
  v_admin := private.is_admin(c.league_id);
  v_own := exists (select 1 from public.players p where p.id = c.player_id and p.user_id = auth.uid());
  if coalesce(p_signed, true) then
    if not v_own and not v_admin then
      perform private.deny();
    end if;
  elsif not v_admin then
    perform private.deny();
  end if;
  select * into v_round from public.golf_rounds r where r.event_id = c.event_id;
  if v_round.status <> 'abierta' then
    perform private.fail('cerrado');
  end if;
  if coalesce(p_signed, true) then
    if c.status <> 'firmada' then
      if p_holes is not null and jsonb_typeof(p_holes) <> 'null' then
        perform private.golf_write_holes(c.id, p_holes, private.golf_round_holes(v_round.course, v_round.nine));
        select * into c from public.golf_cards x where x.id = p_card;
      end if;
      if exists (select 1 from generate_series(1, cardinality(c.strokes)) i where c.strokes[i] is null and not c.picked_up[i]) then
        perform private.fail('invalido');
      end if;
      update public.golf_cards set status = 'firmada', signed_at = now(), signed_by = auth.uid() where id = p_card;
    end if;
  else
    update public.golf_cards set status = 'abierta', signed_at = null, signed_by = null where id = p_card;
  end if;
  perform private.op_end(p_op_id, null);
end $$;

-- Admin: descalifica (o no) una tarjeta mientras la ronda está abierta.
create function public.golf_set_dq(p_card uuid, p_dq boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.golf_cards;
begin
  perform private.require_uid();
  select * into c from public.golf_cards x where x.id = p_card;
  if c.id is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(c.league_id);
  if (select r.status from public.golf_rounds r where r.event_id = c.event_id) <> 'abierta' then
    perform private.fail('cerrado');
  end if;
  update public.golf_cards set dq = coalesce(p_dq, false) where id = p_card;
end $$;

-- ---------- Handicap Index del perfil ----------

-- El jugador (su cuenta) o el admin guarda el Index (FEDOGOLF/GHIN, «no oficial») en players.attrs.golf.
-- Sirve para las próximas inscripciones; las tarjetas ya creadas no cambian. null = lo quita.
create function public.golf_set_index(p_player uuid, p_index double precision) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
  v_user uuid;
begin
  perform private.require_uid();
  select p.league_id, p.user_id into v_league, v_user from public.players p where p.id = p_player;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  if v_user is distinct from auth.uid() and not private.is_admin(v_league) then
    perform private.deny();
  end if;
  perform private.golf_require_league(v_league);
  if p_index is not null and not (p_index between -10 and 54) then
    perform private.fail('invalido');
  end if;
  update public.players p set attrs = case
      when p_index is null then p.attrs - 'golf'
      else p.attrs || jsonb_build_object('golf', jsonb_build_object('index', round(p_index::numeric, 1), 'at', current_date))
    end
  where p.id = p_player;
end $$;

-- =====================================================================
-- Permisos: todo lo del golf cerrado salvo estas RPC (con sesión)
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'golf_save_course', 'golf_delete_course',
    'golf_create_round', 'golf_create_tournament', 'golf_delete_tournament', 'golf_update_round', 'golf_close_round',
    'golf_register', 'golf_add_players', 'golf_unregister', 'golf_set_groups',
    'golf_save_hole_scores', 'golf_sign_card', 'golf_set_dq', 'golf_set_index'
  ];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'private') and p.prokind = 'f' and p.proname like 'golf\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' and f.proname = any (v_rpc) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
