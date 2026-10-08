-- MatchMate · Esports: el deporte nuevo (familia propia 'esports'), sus 15 juegos, los IDs de juego, los equipos que
-- duran, los torneos por juego (solo equipos o libres), las inscripciones, los cuadros (simple, doble, grupos, liga) y
-- el battle royale. Diseño completo y contrato: docs/esports.md (§9). Pruebas: tests/sql/esports.test.ts y
-- tests/sql/esports-ids.test.ts.
--
-- El ID de juego se comprueba solo donde es automático (private.esp_verify_kind, como verify.kind de catalog.ts):
-- - 'login' (Rocket League y Fortnite con Epic, CS2 con Steam; LoL y VALORANT también con Riot si hay RSO): «Conectar
--   con…» lo deja 'confirmado' con ownership 'login'. Es lo único exclusivo: un login nuevo se lleva el ID de la cuenta
--   que lo tenía conectado (aviso en la app con public.esports_id_moves, push y auditoría 'esports_id_login').
-- - 'lookup' (LoL y VALORANT): la búsqueda de Riot (esports-verify) lo deja 'confirmado' con ownership 'busqueda' (no
--   exclusivo); en LoL trae el rango verificado (private.esp_rank_verifiable).
-- - 'none' (los otros 10 juegos): el ID y el rango solo se declaran, y varias cuentas pueden declarar el mismo.
-- Sin códigos de prueba, capturas ni reclamos de ID.
--
-- 1. public.sport_status: la familia nueva 'esports' (en el check de family) y el deporte 'esports' (abierto, orden 11).
-- 2. Las ayudas puras private.esp_* (el catálogo que la base necesita para validar: juegos, modos, mejor de, la regla
--    del marcador de cada juego, la normalización del ID, la verificación de cada juego, los rangos y los ajustes del
--    torneo). Son las mismas reglas de src/sports/esports (catalog.ts, gameIds.ts, series.ts, settings.ts): las pruebas
--    SQL repiten los casos del motor.
-- 3. Tablas: esports_game_ids, esports_id_moves (sin lectura directa), private.esports_lookups,
--    private.esports_link_states, esports_teams, esports_team_members, esports_team_secrets, esports_tournaments (1:1
--    con un evento 'torneo'), esports_entries, esports_entry_members (la foto de la plantilla), esports_matches (los
--    enlaces del cuadro), esports_br_games y esports_br_results. RLS solo de lectura; nadie escribe directo.
-- 4. Triggers: leagues_esp_check (rules.game), events_esp_check (solo 'torneo'), matches_esp_check (formato, reglas y el
--    marcador de la serie con private.esp_series_ok), matches_esp_advance (el cuadro avanza solo), el conteo y el
--    capitán de los equipos, la cola de Storage del logo del equipo y el tiempo real ('esports' en league:/event:).
-- 5. Cambian (misma firma, cuerpo copiado de su última versión con el cambio):
--    - private.require_match_league, private.check_match y private.check_season_team (…0100 partidos): la familia
--      'esports' también tiene partidos y equipos de temporada.
--    - private.can_upload_logo_path y private.can_remove_logo_path (…1000 sueltos_logos): el logo de un equipo de
--      esports va en el mismo bucket 'logos' con la carpeta = id del equipo.
--    - public.purge_queue_take (…1000 sueltos_logos): en 'logos' tampoco se borra el logo de un equipo en uso.
--    - private.push_category (…1400 anotadores): 'esports' y 'esports-id' en 'liga' («Tus ligas»).
--    - public.export_my_data (20261007000100_modo_app.sql, al final de este archivo): + esportsIds, esportsTeams,
--      esportsEntries y esportsIdMoves.
--    Una migración posterior que redefina alguna tiene que copiar esta.
-- 6. RPC de IDs de juego (y los avisos de «tu ID pasó a otra cuenta»), equipos, torneos, inscripciones, fases, battle
--    royale y el hub por juego.
-- 7. Insignias: 'esports' en los checks de deporte de badge_awards, badge_progress y badge_stats (sin evaluadores).
-- 8. No cambian (revisado): private.match_side_of (lo que no es raqueta ya es capitán o delegado), push_result_to_confirm,
--    push_result_confirmed, remind_missing_results, check_winner, match_reminders, prize_comp, badge_activity,
--    badge_apply_decisions, create_tournament, create_event, signup_kind, la escalera, las noches y los playoffs.

-- =====================================================================
-- 1. La familia y el deporte
-- =====================================================================

alter table public.sport_status drop constraint sport_status_family_check,
  add constraint sport_status_family_check check (family in ('series', 'racket', 'team', 'esports'));

insert into public.sport_status (id, family, status, sort_order) values
  ('esports', 'esports', 'open', 11);

-- =====================================================================
-- 2. El catálogo que la base necesita (puro, igual que src/sports/esports)
-- =====================================================================

-- Los 15 juegos (§2.1), en el orden del catálogo.
create function private.esp_game_ok(p_game text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_game = any (array['valorant', 'cs2', 'lol', 'mlbb', 'rocket_league', 'ea_fc', 'nba_2k', 'sf6', 'tekken8',
                                      'smash', 'clash_royale', 'free_fire', 'fortnite', 'warzone', 'pubg_mobile']), false)
$$;

-- 'team' | 'duel' | 'br' (null si el juego no existe).
create function private.esp_game_kind(p_game text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_game in ('valorant', 'cs2', 'lol', 'mlbb', 'rocket_league') then 'team'
    when p_game in ('ea_fc', 'nba_2k', 'sf6', 'tekken8', 'smash', 'clash_royale') then 'duel'
    when p_game in ('free_fire', 'fortnite', 'warzone', 'pubg_mobile') then 'br'
  end
$$;

-- La regla del marcador de cada mapa o juego (§2.3): 'val' | 'cs' | 'win' | 'goals_ot' | 'goals_pen' | 'points' | 'fight'
-- | 'stocks' | 'crowns' | 'br'.
create function private.esp_scoring(p_game text) returns text
language sql immutable set search_path = '' as $$
  select case p_game
    when 'valorant' then 'val'
    when 'cs2' then 'cs'
    when 'lol' then 'win'
    when 'mlbb' then 'win'
    when 'rocket_league' then 'goals_ot'
    when 'ea_fc' then 'goals_pen'
    when 'nba_2k' then 'points'
    when 'sf6' then 'fight'
    when 'tekken8' then 'fight'
    when 'smash' then 'stocks'
    when 'clash_royale' then 'crowns'
    when 'free_fire' then 'br'
    when 'fortnite' then 'br'
    when 'warzone' then 'br'
    when 'pubg_mobile' then 'br'
  end
$$;

-- El nombre que se ve en los avisos («VALORANT», «Rocket League»…).
create function private.esp_game_name(p_game text) returns text
language sql immutable set search_path = '' as $$
  select case p_game
    when 'valorant' then 'VALORANT'
    when 'cs2' then 'Counter-Strike 2'
    when 'lol' then 'League of Legends'
    when 'mlbb' then 'Mobile Legends: Bang Bang'
    when 'rocket_league' then 'Rocket League'
    when 'ea_fc' then 'EA SPORTS FC'
    when 'nba_2k' then 'NBA 2K'
    when 'sf6' then 'Street Fighter 6'
    when 'tekken8' then 'TEKKEN 8'
    when 'smash' then 'Super Smash Bros. Ultimate'
    when 'clash_royale' then 'Clash Royale'
    when 'free_fire' then 'Free Fire'
    when 'fortnite' then 'Fortnite'
    when 'warzone' then 'Call of Duty: Warzone'
    when 'pubg_mobile' then 'PUBG Mobile'
    else coalesce(p_game, '')
  end
$$;

-- Los modos de cada juego (§2.1).
create function private.esp_modes(p_game text) returns text[]
language sql immutable set search_path = '' as $$
  select case
    when p_game in ('valorant', 'cs2', 'lol', 'mlbb') then array['5v5']
    when p_game = 'rocket_league' then array['1v1', '2v2', '3v3']
    when p_game in ('ea_fc', 'nba_2k', 'sf6', 'tekken8', 'smash', 'clash_royale') then array['1v1']
    when p_game in ('free_fire', 'pubg_mobile') then array['solo', 'duo', 'squad']
    when p_game = 'fortnite' then array['solo', 'duo', 'trio', 'squad']
    when p_game = 'warzone' then array['solo', 'duo', 'trio', 'quad']
    else '{}'::text[]
  end
$$;

create function private.esp_mode_ok(p_game text, p_mode text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_mode = any (private.esp_modes(p_game)), false)
$$;

-- Titulares de un modo (modeSize de catalog.ts). 0 si el modo no existe.
create function private.esp_mode_size(p_mode text) returns integer
language sql immutable set search_path = '' as $$
  select case p_mode
    when '1v1' then 1 when 'solo' then 1
    when '2v2' then 2 when 'duo' then 2
    when '3v3' then 3 when 'trio' then 3
    when 'squad' then 4 when 'quad' then 4
    when '5v5' then 5
    else 0
  end
$$;

-- Suplentes máximos de un juego en un modo (subsMax de §2.2). 0 si el modo no es del juego.
create function private.esp_subs_max(p_game text, p_mode text) returns integer
language sql immutable set search_path = '' as $$
  select case
    when not private.esp_mode_ok(p_game, p_mode) then 0
    when p_mode in ('1v1', 'solo') then 0
    when p_game = 'rocket_league' then case p_mode when '2v2' then 1 when '3v3' then 2 else 0 end
    when p_mode = '5v5' then 2
    else 1
  end
$$;

-- Suplentes por defecto de un modo (la tabla de §2.1), sin pasar del máximo del juego.
create function private.esp_subs_default(p_game text, p_mode text) returns integer
language sql immutable set search_path = '' as $$
  select least(case p_mode when '5v5' then 2 when '1v1' then 0 when 'solo' then 0 else 1 end, private.esp_subs_max(p_game, p_mode))
$$;

-- El tope de miembros de un equipo de esports del juego: la plantilla más grande de sus modos (5v5 7, RL 5, BR 5).
create function private.esp_team_max(p_game text) returns integer
language sql immutable set search_path = '' as $$
  select coalesce(max(private.esp_mode_size(m) + private.esp_subs_max(p_game, m)), 0)::integer
    from unnest(private.esp_modes(p_game)) m
$$;

-- Lobby de battle royale (§2.1): el máximo de inscritos de un torneo BR. null fuera de BR.
create function private.esp_lobby(p_game text, p_mode text) returns integer
language sql immutable set search_path = '' as $$
  select case p_game
    when 'free_fire' then case p_mode when 'solo' then 48 when 'duo' then 24 when 'squad' then 12 end
    when 'fortnite' then case p_mode when 'solo' then 100 when 'duo' then 50 when 'trio' then 33 when 'squad' then 25 end
    when 'warzone' then case p_mode when 'solo' then 100 when 'duo' then 75 when 'trio' then 50 when 'quad' then 37 end
    when 'pubg_mobile' then case p_mode when 'solo' then 100 when 'duo' then 50 when 'squad' then 25 end
  end
$$;

-- Mejor de permitido en cada juego (§2.1; vacío en BR).
create function private.esp_best_of_ok(p_game text, p_bo integer) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_bo = any (case
    when p_game in ('valorant', 'cs2', 'lol', 'sf6', 'tekken8', 'smash', 'clash_royale') then array[1, 3, 5]
    when p_game in ('mlbb', 'rocket_league', 'nba_2k') then array[1, 3, 5, 7]
    when p_game = 'ea_fc' then array[1, 3]
    else '{}'::integer[]
  end), false)
$$;

-- (bo + 1) / 2: los mapas o juegos que hay que ganar.
create function private.esp_need(p_bo integer) returns integer
language sql immutable set search_path = '' as $$
  select (p_bo + 1) / 2
$$;

-- Plataforma del ID: '' salvo NBA 2K, donde es obligatoria (psn, xbox, steam, switch).
create function private.esp_platform_ok(p_game text, p_platform text) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p_game = 'nba_2k' then coalesce(p_platform in ('psn', 'xbox', 'steam', 'switch'), false)
    else coalesce(p_platform, '') = ''
  end
$$;

-- Región del ID (solo para buscar el rango; no entra en la identidad): '' o una de §2.4 (idInfo.regions del catálogo).
create function private.esp_region_ok(p_game text, p_region text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_region, '') = '' or case p_game
    when 'valorant' then p_region in ('latam', 'na', 'br', 'eu', 'ap', 'kr')
    when 'lol' then p_region in ('la1', 'la2', 'na1', 'br1', 'euw1', 'eun1', 'kr', 'jp1', 'oc1')
    when 'free_fire' then p_region in ('na', 'sa', 'br')
    else false
  end
$$;

-- La forma del ID de cada juego (IdKind de §2.2).
create function private.esp_id_kind(p_game text) returns text
language sql immutable set search_path = '' as $$
  select case p_game
    when 'valorant' then 'riot' when 'lol' then 'riot'
    when 'cs2' then 'steam'
    when 'mlbb' then 'mlbb'
    when 'rocket_league' then 'epic' when 'fortnite' then 'epic'
    when 'ea_fc' then 'ea'
    when 'nba_2k' then 'console'
    when 'sf6' then 'buckler'
    when 'tekken8' then 'tekken'
    when 'smash' then 'nintendo'
    when 'clash_royale' then 'cr'
    when 'free_fire' then 'digits' when 'pubg_mobile' then 'digits'
    when 'warzone' then 'activision'
  end
$$;

-- «Conectar con…» de cada juego (§8.3): Steam → CS2; Epic → Rocket League y Fortnite; Riot → LoL y VALORANT.
create function private.esp_link_provider(p_game text) returns text
language sql immutable set search_path = '' as $$
  select case p_game
    when 'cs2' then 'steam'
    when 'rocket_league' then 'epic' when 'fortnite' then 'epic'
    when 'lol' then 'riot' when 'valorant' then 'riot'
  end
$$;

-- Cómo se comprueba el ID de cada juego (verify.kind de catalog.ts): 'login' (Epic: Rocket League y Fortnite; Steam:
-- CS2), 'lookup' (la búsqueda de Riot: LoL y VALORANT; con RSO también se conectan) o 'none' (los otros 10: solo se
-- declara). null si el juego no existe.
create function private.esp_verify_kind(p_game text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_game in ('rocket_league', 'fortnite', 'cs2') then 'login'
    when p_game in ('lol', 'valorant') then 'lookup'
    when private.esp_game_ok(p_game) then 'none'
  end
$$;

-- El rango se puede verificar (verify.rank de catalog.ts): solo LoL (el que da Riot). En los demás, el rango solo se
-- declara (VALORANT: la búsqueda dice que existe, sin rango).
create function private.esp_rank_verifiable(p_game text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_game = 'lol', false)
$$;

-- La clave del rango para un modo (rankKeyFor de ranks.ts): Rocket League por modo; el resto 'main'.
create function private.esp_rank_key(p_game text, p_mode text) returns text
language sql immutable set search_path = '' as $$
  select case when p_game = 'rocket_league' and p_mode in ('1v1', '2v2', '3v3') then p_mode else 'main' end
$$;

-- Minúsculas y mayúsculas solo de ASCII (§2.4): no dependen del idioma de la base («Ñ» queda igual).
create function private.esp_lower(p text) returns text
language sql immutable set search_path = '' as $$
  select translate(p, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')
$$;

create function private.esp_upper(p text) returns text
language sql immutable set search_path = '' as $$
  select translate(p, 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
$$;

-- Un número JSON entero entre p_min y p_max.
create function private.esp_int(p jsonb, p_min numeric, p_max numeric) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'number'
              then coalesce((p #>> '{}')::numeric = trunc((p #>> '{}')::numeric)
                            and (p #>> '{}')::numeric between p_min and p_max, false)
              else false end
$$;

-- Un número JSON entero, del tamaño que sea (Number.isInteger del teléfono).
create function private.esp_is_int(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric = trunc((p #>> '{}')::numeric) else false end
$$;

-- El ID de juego normalizado (normalizeGameId de src/sports/esports/gameIds.ts, la misma tabla de §2.4):
-- {display, normalized} o null si no sirve. La plataforma (NBA 2K) se revisa aparte (private.esp_platform_ok).
-- Primero se quitan los espacios de los extremos; «juntar espacios» = cada grupo de espacios queda en uno; las
-- minúsculas son solo de ASCII. Al final, display y normalized de 2 a 40 (lo que piden las columnas).
create function private.esp_normalize_id(p_game text, p_raw text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_kind text := private.esp_id_kind(p_game);
  s text := regexp_replace(coalesce(p_raw, ''), '^\s+|\s+$', '', 'g');
  d text;
  v_name text;
  v_tag text;
  v_at integer;
  v_num numeric;
  m text[];
  v_display text;
  v_norm text;
begin
  if v_kind is null or s = '' then
    return null;
  end if;
  if v_kind in ('riot', 'activision') then
    -- Se parte en el último '#': el nombre (con los espacios juntados) y lo de después, tal cual.
    v_at := strpos(reverse(s), '#');
    if v_at = 0 then
      return null;
    end if;
    v_at := char_length(s) - v_at + 1;
    v_name := regexp_replace(substr(s, 1, v_at - 1), '\s+', ' ', 'g');
    v_tag := substr(s, v_at + 1);
    if v_kind = 'riot' then
      if char_length(v_name) not between 3 and 16 or v_tag !~ '^[A-Za-z0-9]{3,5}$' then
        return null;
      end if;
      v_display := v_name || '#' || v_tag;
      v_norm := private.esp_lower(v_name) || '#' || private.esp_lower(v_tag);
    else
      if char_length(v_name) not between 2 and 16 or v_tag !~ '^[0-9]{4,8}$' then
        return null;
      end if;
      v_display := v_name || '#' || v_tag;
      v_norm := private.esp_lower(v_name) || '#' || v_tag;
    end if;
  elsif v_kind = 'steam' then
    -- SteamID64 (17 cifras que empiezan con 7656119) o código de amigo (1–10 cifras): la cuenta 1…4294967295.
    d := regexp_replace(s, '\s+', '', 'g');
    if d !~ '^[0-9]+$' then
      return null;
    end if;
    if char_length(d) = 17 and left(d, 7) = '7656119' then
      v_num := d::numeric - 76561197960265728;
    elsif char_length(d) between 1 and 10 then
      v_num := d::numeric;
    else
      return null;
    end if;
    if v_num < 1 or v_num > 4294967295 then
      return null;
    end if;
    v_display := d;
    v_norm := v_num::bigint::text;
  elsif v_kind = 'mlbb' then
    m := regexp_match(s, '^([0-9]{5,12})\s*\(?\s*([0-9]{1,5})\s*\)?$');
    if m is null then
      return null;
    end if;
    v_display := m[1] || ' (' || m[2] || ')';
    v_norm := m[1] || ':' || m[2];
  elsif v_kind in ('epic', 'console') then
    d := regexp_replace(s, '\s+', ' ', 'g');
    if char_length(d) not between 3 and 16 or (v_kind = 'epic' and strpos(d, '#') > 0) then
      return null;
    end if;
    v_display := d;
    v_norm := private.esp_lower(d);
  elsif v_kind = 'ea' then
    if s !~ '^[A-Za-z0-9_.-]{4,16}$' then
      return null;
    end if;
    v_display := s;
    v_norm := private.esp_lower(s);
  elsif v_kind = 'buckler' then
    d := regexp_replace(s, '\s+', '', 'g');
    if d !~ '^[0-9]{10}$' then
      return null;
    end if;
    v_display := d;
    v_norm := d;
  elsif v_kind = 'tekken' then
    m := regexp_match(regexp_replace(s, '\s+', '', 'g'), '^([A-Za-z0-9]{4})-?([A-Za-z0-9]{4})-?([A-Za-z0-9]{4})$');
    if m is null then
      return null;
    end if;
    v_display := m[1] || '-' || m[2] || '-' || m[3];
    v_norm := private.esp_lower(m[1] || m[2] || m[3]);
  elsif v_kind = 'nintendo' then
    -- Sin espacios ni guiones, y sin el «SW» del principio (mayúsculas o no).
    d := regexp_replace(regexp_replace(s, '[\s-]+', '', 'g'), '^[Ss][Ww]', '');
    if d !~ '^[0-9]{12}$' then
      return null;
    end if;
    v_display := 'SW-' || substr(d, 1, 4) || '-' || substr(d, 5, 4) || '-' || substr(d, 9, 4);
    v_norm := d;
  elsif v_kind = 'cr' then
    d := private.esp_upper(regexp_replace(regexp_replace(s, '\s+', '', 'g'), '^#', ''));
    if d !~ '^[0289PYLQGRJCUV]{3,12}$' then
      return null;
    end if;
    v_display := '#' || d;
    v_norm := private.esp_lower(d);
  elsif v_kind = 'digits' then
    d := regexp_replace(s, '\s+', '', 'g');
    if d !~ '^[0-9]+$' or char_length(d) < (array[5, 6])[1 + (p_game = 'free_fire')::integer] or char_length(d) > 12 then
      return null;
    end if;
    v_display := d;
    v_norm := d;
  else
    return null;
  end if;
  if char_length(v_display) not between 2 and 40 or char_length(v_norm) not between 2 and 40 then
    return null;
  end if;
  return jsonb_build_object('display', v_display, 'normalized', v_norm);
end $$;

-- Un rango (RankValue de ranks.ts), solo la forma: exactamente uno de {tier (+ div entero 1–5 y mmr entero
-- −100…3000)}, {value} (entero 0–99 999 999) o {text} (1–24). Que el rango exista en el juego lo dice
-- private.esp_rank_ok.
create function private.esp_rank_value_ok(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  if p ? 'tier' then
    return not exists (select 1 from jsonb_object_keys(p) k where k not in ('tier', 'div', 'mmr'))
       and jsonb_typeof(p -> 'tier') = 'string' and (p ->> 'tier') ~ '^[a-z0-9_]{1,24}$'
       and (not (p ? 'div') or private.esp_int(p -> 'div', 1, 5))
       and (not (p ? 'mmr') or private.esp_int(p -> 'mmr', -100, 3000));
  elsif p ? 'value' then
    return not exists (select 1 from jsonb_object_keys(p) k where k <> 'value') and private.esp_int(p -> 'value', 0, 99999999);
  elsif p ? 'text' then
    return not exists (select 1 from jsonb_object_keys(p) k where k <> 'text')
       and jsonb_typeof(p -> 'text') = 'string' and char_length(p ->> 'text') between 1 and 24;
  end if;
  return false;
end $$;

-- Los rangos de un ID (RankMap), solo la forma: objeto de 0 a 3 claves 'main', '1v1', '2v2', '3v3', cada una un rango
-- con forma válida (el check de las columnas).
create function private.esp_ranks_ok(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(p)) > 3 then
    return false;
  end if;
  for k, v in select * from jsonb_each(p) loop
    if k not in ('main', '1v1', '2v2', '3v3') or not private.esp_rank_value_ok(v) then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- La escalera de cada juego (LADDERS de ranks.ts): 'tiers', 'number' o 'text'.
create function private.esp_ladder_kind(p_game text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_game in ('cs2', 'clash_royale') then 'number'
    when p_game in ('nba_2k', 'tekken8', 'smash') then 'text'
    when private.esp_game_ok(p_game) then 'tiers'
  end
$$;

-- Divisiones de un tier de la escalera del juego (0 = sin división); null si el tier no existe en ese juego.
create function private.esp_tier_divs(p_game text, p_tier text) returns integer
language sql immutable set search_path = '' as $$
  select case p_game
    when 'valorant' then case when p_tier in ('iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'ascendant', 'immortal') then 3
                              when p_tier = 'radiant' then 0 end
    when 'lol' then case when p_tier in ('iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond') then 4
                         when p_tier in ('master', 'grandmaster', 'challenger') then 0 end
    when 'mlbb' then case when p_tier in ('warrior', 'elite') then 3 when p_tier = 'master' then 4
                          when p_tier in ('grandmaster', 'epic', 'legend') then 5
                          when p_tier in ('mythic', 'mythical_honor', 'mythical_glory', 'mythical_immortal') then 0 end
    when 'rocket_league' then case when p_tier ~ '^(bronze|silver|gold|platinum|diamond|champion|gc)[123]$' then 4
                                   when p_tier = 'ssl' then 0 end
    when 'ea_fc' then case when p_tier in ('d10', 'd9', 'd8', 'd7', 'd6', 'd5', 'd4', 'd3', 'd2', 'd1', 'elite') then 0 end
    when 'sf6' then case when p_tier in ('rookie', 'iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond') then 5
                         when p_tier = 'master' then 0 end
    when 'free_fire' then case when p_tier in ('bronze', 'silver') then 3 when p_tier in ('gold', 'platinum', 'diamond') then 4
                               when p_tier in ('heroic', 'master', 'grandmaster') then 0 end
    when 'fortnite' then case when p_tier in ('bronze', 'silver', 'gold', 'platinum', 'diamond') then 3
                              when p_tier in ('elite', 'champion', 'unreal') then 0 end
    when 'warzone' then case when p_tier in ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'crimson') then 3
                             when p_tier in ('iridescent', 'top250') then 0 end
    when 'pubg_mobile' then case when p_tier in ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'crown') then 5
                                 when p_tier in ('ace', 'ace_master', 'ace_dominator', 'conqueror') then 0 end
  end
$$;

-- El rango de una clave existe en el juego (validateRank de ranks.ts): la clave es la del juego (Rocket League por modo;
-- el resto 'main'); texto 1–24 sin quedar en blanco; número dentro de la escalera (CS Rating 0–40 000, trofeos 0–15 000);
-- tier de la escalera, con división (1…divs) si el tier tiene y sin ella si no; MMR solo en Rocket League (−100…3000).
create function private.esp_rank_ok(p_game text, p_key text, p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_ladder text := private.esp_ladder_kind(p_game);
  v_divs integer;
begin
  if v_ladder is null or jsonb_typeof(p) is distinct from 'object'
     or (p_game = 'rocket_league' and coalesce(p_key, '') not in ('1v1', '2v2', '3v3'))
     or (p_game <> 'rocket_league' and p_key is distinct from 'main') then
    return false;
  end if;
  if v_ladder = 'text' then
    return not exists (select 1 from jsonb_object_keys(p) k where k <> 'text') and jsonb_typeof(p -> 'text') = 'string'
       and (p ->> 'text') !~ '^\s*$' and char_length(p ->> 'text') between 1 and 24;
  end if;
  if v_ladder = 'number' then
    return not exists (select 1 from jsonb_object_keys(p) k where k <> 'value')
       and private.esp_int(p -> 'value', 0, case p_game when 'cs2' then 40000 else 15000 end);
  end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in ('tier', 'div', 'mmr')) or jsonb_typeof(p -> 'tier') is distinct from 'string' then
    return false;
  end if;
  v_divs := private.esp_tier_divs(p_game, p ->> 'tier');
  if v_divs is null then
    return false;
  end if;
  if v_divs = 0 and p ? 'div' then
    return false;
  end if;
  if v_divs > 0 and not private.esp_int(p -> 'div', 1, v_divs) then
    return false;
  end if;
  if p ? 'mmr' and (p_game <> 'rocket_league' or not private.esp_int(p -> 'mmr', -100, 3000)) then
    return false;
  end if;
  return true;
end $$;

-- Un mapa de rangos que existe en el juego (validateRankMap): objeto y cada clave con private.esp_rank_ok.
create function private.esp_ranks_valid(p_game text, p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  v jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    return false;
  end if;
  for k, v in select * from jsonb_each(p) loop
    if not private.esp_rank_ok(p_game, k, v) then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- Ajustes del torneo (esports_tournaments.settings, la tabla de §3.6; la misma forma que validateSettings de
-- settings.ts): claves, tipos y rangos. Las que faltan se aceptan, salvo la plataforma de NBA 2K; una clave que no está
-- en la tabla es inválida. Las revisiones cruzadas (grupos × clasificados, cupo) son del teléfono.
create function private.esp_settings_ok(p_game text, p_mode text, p_format text, p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  v jsonb;
  v_br boolean := private.esp_game_kind(p_game) = 'br';
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  if p_game = 'nba_2k' and not (p ? 'platform') then
    return false;
  end if;
  for k, v in select * from jsonb_each(p) loop
    case k
      when 'subs' then
        if not private.esp_int(v, 0, least(2, private.esp_subs_max(p_game, p_mode))) then
          return false;
        end if;
      when 'autoApprove', 'requireConfirmedId', 'requireVerifiedRank', 'thirdPlace', 'bracketReset', 'doubleRoundRobin', 'draws' then
        if jsonb_typeof(v) <> 'boolean' then
          return false;
        end if;
      when 'seeding' then
        if not (jsonb_typeof(v) = 'string' and (v #>> '{}') in ('manual', 'random', 'rank')) then
          return false;
        end if;
      when 'bestOf' then
        -- {groups, playoffs, final}, cada uno un mejor de del juego (en BR, 1, 3, 5 o 7: no se usa).
        if jsonb_typeof(v) <> 'object' or (select count(*) from jsonb_object_keys(v)) <> 3
           or not (v ? 'groups' and v ? 'playoffs' and v ? 'final')
           or exists (select 1 from jsonb_each(v) x
                       where not private.esp_int(x.value, 1, 7)
                          or (v_br and (x.value #>> '{}')::numeric not in (1, 3, 5, 7))
                          or (not v_br and not private.esp_best_of_ok(p_game, (x.value #>> '{}')::numeric::integer))) then
          return false;
        end if;
      when 'groups' then
        if not private.esp_int(v, 1, 8) then
          return false;
        end if;
      when 'perGroup' then
        if not private.esp_int(v, 1, 4) then
          return false;
        end if;
      when 'playoffs' then
        if not (jsonb_typeof(v) = 'string' and (v #>> '{}') in ('single', 'double')) then
          return false;
        end if;
      when 'platform' then
        if jsonb_typeof(v) <> 'string'
           or (p_game = 'nba_2k' and (v #>> '{}') not in ('psn', 'xbox', 'steam', 'switch'))
           or (p_game <> 'nba_2k' and (v #>> '{}') <> '') then
          return false;
        end if;
      when 'roundsToWin' then
        if private.esp_scoring(p_game) is distinct from 'fight' or not private.esp_int(v, 2, 3)
           or (p_game = 'sf6' and (v #>> '{}')::numeric <> 2) then
          return false;
        end if;
      when 'stocks' then
        if p_game <> 'smash' or not private.esp_int(v, 1, 5) then
          return false;
        end if;
      when 'br' then
        if not v_br or jsonb_typeof(v) <> 'object'
           or exists (select 1 from jsonb_object_keys(v) x where x not in ('placementPoints', 'killPoints', 'rounds', 'gamesPerRound'))
           or jsonb_typeof(v -> 'placementPoints') is distinct from 'array'
           or jsonb_array_length(v -> 'placementPoints') not between 1 and 100
           or exists (select 1 from jsonb_array_elements(v -> 'placementPoints') x where not private.esp_int(x, 0, 100))
           or not private.esp_int(v -> 'killPoints', 0, 10)
           or not private.esp_int(v -> 'rounds', 1, 10)
           or not private.esp_int(v -> 'gamesPerRound', 1, 12) then
          return false;
        end if;
      else
        return false;
    end case;
  end loop;
  return true;
end $$;

-- Las reglas de una serie (matches.rules, seriesRules del motor): {game, bestOf, draws, roundsToWin?, stocks?} del juego
-- de la liga, con un mejor de permitido; draws solo en EA SPORTS FC al mejor de 1; roundsToWin solo en los de pelea
-- (SF6 solo 2); stocks solo en Smash.
create function private.esp_rules_ok(p_game text, p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_bo integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' or not private.esp_game_ok(p_game)
     or exists (select 1 from jsonb_object_keys(p) k where k not in ('game', 'bestOf', 'draws', 'roundsToWin', 'stocks'))
     or p ->> 'game' is distinct from p_game or not private.esp_int(p -> 'bestOf', 1, 7) then
    return false;
  end if;
  v_bo := (p ->> 'bestOf')::numeric::integer;
  if not private.esp_best_of_ok(p_game, v_bo) then
    return false;
  end if;
  if jsonb_typeof(p -> 'draws') is not null and jsonb_typeof(p -> 'draws') <> 'boolean' then
    return false;
  end if;
  if p -> 'draws' = 'true'::jsonb and not (p_game = 'ea_fc' and v_bo = 1) then
    return false;
  end if;
  if jsonb_typeof(p -> 'roundsToWin') is not null and jsonb_typeof(p -> 'roundsToWin') <> 'null' then
    if private.esp_scoring(p_game) <> 'fight' or not private.esp_int(p -> 'roundsToWin', 2, 3)
       or (p_game = 'sf6' and (p ->> 'roundsToWin')::numeric <> 2) then
      return false;
    end if;
  end if;
  if jsonb_typeof(p -> 'stocks') is not null and jsonb_typeof(p -> 'stocks') <> 'null' then
    if p_game <> 'smash' or not private.esp_int(p -> 'stocks', 1, 5) then
      return false;
    end if;
  end if;
  return true;
end $$;

-- Un mapa o juego de la serie (GameRecord {w?, a?, b?, pa?, pb?, ot?, map?}) con la regla del juego de p_rules.game
-- (§2.3; el gemelo de inspect/gameWinner de src/sports/esports/series.ts): devuelve el lado que lo ganó (1 o 2), 0 si es
-- el empate válido del FC (draws y al mejor de 1) o null si no es válido. Un valor JSON null cuenta como si la clave no
-- viniera. a y b van juntos; pa y pb juntos y solo en el FC; ot (booleano) solo en Rocket League; números enteros.
create function private.esp_game_winner(p_rules jsonb, p_g jsonb) returns smallint
language plpgsql immutable set search_path = '' as $$
declare
  v_game text := p_rules ->> 'game';
  v_rule text := private.esp_scoring(p_rules ->> 'game');
  v_draws boolean := coalesce(p_rules -> 'draws' = 'true'::jsonb, false);
  v_bo1 boolean := coalesce(p_rules -> 'bestOf' = '1'::jsonb, false);
  v_rtw numeric;
  v_stocks numeric;
  w smallint;
  a numeric;
  b numeric;
  pa numeric;
  pb numeric;
  v_ab boolean;
  v_pens boolean;
  ot boolean := false;
  hi numeric;
  lo numeric;
  v_by smallint;
  mine numeric;
  theirs numeric;
  k text;
begin
  if p_g is null or jsonb_typeof(p_g) <> 'object' or v_rule is null or v_rule = 'br' or jsonb_typeof(p_rules) is distinct from 'object' then
    return null;
  end if;
  v_rtw := case when private.esp_is_int(p_rules -> 'roundsToWin') then (p_rules ->> 'roundsToWin')::numeric
                else case v_game when 'tekken8' then 3 else 2 end end;
  v_stocks := case when private.esp_is_int(p_rules -> 'stocks') then (p_rules ->> 'stocks')::numeric else 3 end;
  if exists (select 1 from jsonb_object_keys(p_g) x where x not in ('w', 'a', 'b', 'pa', 'pb', 'ot', 'map')) then
    return null;
  end if;
  -- w: 1, 2 o nada.
  if jsonb_typeof(p_g -> 'w') is not null and jsonb_typeof(p_g -> 'w') <> 'null' then
    if not private.esp_int(p_g -> 'w', 1, 2) then
      return null;
    end if;
    w := (p_g ->> 'w')::numeric::smallint;
  end if;
  -- Números: enteros (el rango de cada regla va abajo).
  foreach k in array array['a', 'b', 'pa', 'pb'] loop
    if jsonb_typeof(p_g -> k) is not null and jsonb_typeof(p_g -> k) <> 'null' and not private.esp_is_int(p_g -> k) then
      return null;
    end if;
  end loop;
  a := (p_g ->> 'a')::numeric;
  b := (p_g ->> 'b')::numeric;
  pa := (p_g ->> 'pa')::numeric;
  pb := (p_g ->> 'pb')::numeric;
  -- La prórroga solo se guarda en Rocket League (y es un booleano); los penales solo en el FC.
  if jsonb_typeof(p_g -> 'ot') is not null and jsonb_typeof(p_g -> 'ot') <> 'null' then
    if jsonb_typeof(p_g -> 'ot') <> 'boolean' or v_rule <> 'goals_ot' then
      return null;
    end if;
    ot := (p_g ->> 'ot')::boolean;
  end if;
  v_pens := pa is not null or pb is not null;
  if v_pens and v_rule <> 'goals_pen' then
    return null;
  end if;
  -- El mapa: en VALORANT y CS2, el id de la lista; en los demás, texto de 1 a 24 que no esté en blanco.
  if jsonb_typeof(p_g -> 'map') is not null and jsonb_typeof(p_g -> 'map') <> 'null' then
    if jsonb_typeof(p_g -> 'map') <> 'string' then
      return null;
    end if;
    if v_game in ('valorant', 'cs2') then
      if (p_g ->> 'map') !~ '^[a-z0-9_]{1,24}$' then
        return null;
      end if;
    elsif (p_g ->> 'map') ~ '^\s*$' or char_length(p_g ->> 'map') > 24 then
      return null;
    end if;
  end if;
  v_ab := a is not null;
  if v_ab <> (b is not null) then
    return null;
  end if;
  hi := greatest(coalesce(a, 0), coalesce(b, 0));
  lo := least(coalesce(a, 0), coalesce(b, 0));
  v_by := case when coalesce(a, 0) > coalesce(b, 0) then 1 else 2 end;

  case v_rule
    when 'val' then
      if not v_ab or a not between 0 and 99 or b not between 0 and 99
         or not ((hi = 13 and lo <= 11) or (hi >= 14 and hi - lo = 2 and lo >= 12)) or (w is not null and w <> v_by) then
        return null;
      end if;
      return v_by;
    when 'cs' then
      if not v_ab or a not between 0 and 99 or b not between 0 and 99
         or not ((hi = 13 and lo <= 11) or (hi >= 16 and mod(hi - 13, 3) = 0 and lo between hi - 4 and hi - 1))
         or (w is not null and w <> v_by) then
        return null;
      end if;
      return v_by;
    when 'win' then
      if (v_ab and (a not between 0 and 200 or b not between 0 and 200)) or w is null then
        return null;
      end if;
      return w;
    when 'goals_ot' then
      if not v_ab or a not between 0 and 99 or b not between 0 and 99 or a = b or (ot and hi - lo <> 1)
         or (w is not null and w <> v_by) then
        return null;
      end if;
      return v_by;
    when 'goals_pen' then
      if not v_ab or a not between 0 and 30 or b not between 0 and 30 or (pa is not null) <> (pb is not null)
         or (v_pens and (pa not between 0 and 30 or pb not between 0 and 30)) then
        return null;
      end if;
      if a <> b then
        if v_pens or (w is not null and w <> v_by) then
          return null;
        end if;
        return v_by;
      end if;
      if v_pens then
        if pa = pb or (w is not null and w <> case when pa > pb then 1 else 2 end) then
          return null;
        end if;
        return case when pa > pb then 1 else 2 end;
      end if;
      -- Empate sin penales: solo con empates (grupos o liga) al mejor de 1; no lo ganó nadie.
      if not (v_draws and v_bo1) or w is not null then
        return null;
      end if;
      return 0;
    when 'points' then
      if not v_ab or a not between 0 and 300 or b not between 0 and 300 or a = b or (w is not null and w <> v_by) then
        return null;
      end if;
      return v_by;
    when 'fight', 'stocks' then
      if w is null then
        return null;
      end if;
      if v_ab then
        mine := case w when 1 then a else b end;
        theirs := case w when 1 then b else a end;
        if (v_rule = 'fight' and (mine <> v_rtw or theirs not between 0 and v_rtw - 1))
           or (v_rule = 'stocks' and (mine not between 1 and v_stocks or theirs <> 0)) then
          return null;
        end if;
      end if;
      return w;
    when 'crowns' then
      if not v_ab or a not between 0 and 3 or b not between 0 and 3 or w is null
         or (case w when 1 then a else b end) < (case w when 1 then b else a end) then
        return null;
      end if;
      return w;
    else
      return null;
  end case;
end $$;

-- El marcador de una serie (SeriesScore, §2.3; el gemelo de seriesScoreOk de src/sports/esports/series.ts, pasos 1–8
-- menos que las fotos sean de la liga, que lo mira el trigger): {text ≤ 80, sides, totals: {maps, points},
-- games: [GameRecord], bestOf = el de las reglas, proof? (0–3 uuid), wo?}. Sin W.O.: de 1 a bestOf mapas válidos con su
-- regla, ninguno después de que un lado llegó a need, sides = ganados, totals.maps = sides, totals.points = suma de a y
-- de b; si es final (p_final: terminado, confirmado o en disputa), un lado llegó justo en el último o es el empate del
-- FC, y p_winner es ese lado (null en el empate). W.O. ({wo: true}): {text: 'W.O.', games: [], sides: [need, 0] |
-- [0, need] | [0, 0], totals: {maps: sides, points: [0, 0]}}; con p_walkover (el lado que no vino, 0 = ninguno), los
-- sides cuadran con él; sin él, cualquiera de los tres.
create function private.esp_series_ok(p_score jsonb, p_rules jsonb, p_final boolean, p_winner smallint,
                                      p_walkover smallint default null) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_bo integer;
  v_need integer;
  g jsonb;
  v_w smallint;
  w1 integer := 0;
  w2 integer := 0;
  s1 numeric := 0;
  s2 numeric := 0;
  v_n integer := 0;
  v_len integer;
  v_done integer;
  v_series smallint;
  v_sides jsonb;
  v_opt integer;
begin
  if p_score is null or jsonb_typeof(p_score) <> 'object' or jsonb_typeof(p_rules) is distinct from 'object'
     or not private.esp_int(p_rules -> 'bestOf', 1, 7) or (p_rules ->> 'bestOf')::numeric not in (1, 3, 5, 7) then
    return false;
  end if;
  if exists (select 1 from jsonb_object_keys(p_score) k where k not in ('text', 'sides', 'totals', 'games', 'bestOf', 'proof', 'wo')) then
    return false;
  end if;
  v_bo := (p_rules ->> 'bestOf')::numeric::integer;
  v_need := private.esp_need(v_bo);
  -- 5. El mejor de del marcador es el de las reglas.
  if p_score -> 'bestOf' is distinct from p_rules -> 'bestOf' then
    return false;
  end if;
  if jsonb_typeof(p_score -> 'text') is distinct from 'string' or char_length(p_score ->> 'text') > 80 then
    return false;
  end if;
  -- 8. Las pruebas: hasta 3 ids de fotos.
  if p_score ? 'proof' and (jsonb_typeof(p_score -> 'proof') <> 'array' or jsonb_array_length(p_score -> 'proof') > 3
       or exists (select 1 from jsonb_array_elements(p_score -> 'proof') x
                   where jsonb_typeof(x) <> 'string' or (x #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then
    return false;
  end if;
  if jsonb_typeof(p_score -> 'totals') is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_score -> 'totals') k where k not in ('maps', 'points'))
     or jsonb_typeof(p_score -> 'games') is distinct from 'array' then
    return false;
  end if;
  -- 7. W.O.
  if p_score ? 'wo' then
    if p_score -> 'wo' <> 'true'::jsonb or p_score ->> 'text' <> 'W.O.' or jsonb_array_length(p_score -> 'games') <> 0
       or p_score -> 'totals' -> 'points' is distinct from '[0, 0]'::jsonb then
      return false;
    end if;
    foreach v_opt in array case when p_walkover in (0, 1, 2) then array[p_walkover::integer] else array[0, 1, 2] end loop
      v_sides := case v_opt when 2 then jsonb_build_array(v_need, 0) when 1 then jsonb_build_array(0, v_need) else '[0, 0]'::jsonb end;
      if p_score -> 'sides' = v_sides and p_score -> 'totals' -> 'maps' = v_sides then
        return true;
      end if;
    end loop;
    return false;
  end if;
  -- 1. De 1 a bestOf mapas o juegos, cada uno válido con su regla.
  v_len := jsonb_array_length(p_score -> 'games');
  if v_len not between 1 and v_bo then
    return false;
  end if;
  for g in select x from jsonb_array_elements(p_score -> 'games') with ordinality as t (x, n) order by n loop
    v_n := v_n + 1;
    -- 2. Ninguno después de que un lado llegó a need.
    if v_done is not null then
      return false;
    end if;
    v_w := private.esp_game_winner(p_rules, g);
    if v_w is null then
      return false;
    elsif v_w = 1 then
      w1 := w1 + 1;
    elsif v_w = 2 then
      w2 := w2 + 1;
    end if;
    if w1 = v_need or w2 = v_need then
      v_done := v_n;
      v_series := case when w1 = v_need then 1 else 2 end;
    end if;
    s1 := s1 + coalesce((g ->> 'a')::numeric, 0);
    s2 := s2 + coalesce((g ->> 'b')::numeric, 0);
  end loop;
  -- 4. sides = ganados; totals.maps = sides; totals.points = suma de a y de b.
  v_sides := jsonb_build_array(w1, w2);
  if p_score -> 'sides' is distinct from v_sides or p_score -> 'totals' -> 'maps' is distinct from v_sides
     or p_score -> 'totals' -> 'points' is distinct from jsonb_build_array(s1, s2) then
    return false;
  end if;
  -- 3. Final: un lado llegó a need en el último (paso 2) o es el empate del FC; el ganador cuadra.
  if p_final then
    if v_done is null then
      -- El empate del FC: con empates, al mejor de 1, un solo juego empatado.
      if p_rules -> 'draws' = 'true'::jsonb and v_bo = 1 and v_len = 1 and w1 = 0 and w2 = 0 then
        return p_winner is null;
      end if;
      return false;
    end if;
    return p_winner is not distinct from v_series;
  end if;
  return true;
end $$;

-- =====================================================================
-- 3. Tablas
-- =====================================================================

-- ID de juego de cada cuenta: una fila por cuenta, juego y plataforma (la plataforma es '' salvo en NBA 2K).
-- ownership = cómo se comprobó que es suyo: 'declarado' (lo escribió; status 'pendiente'), 'busqueda' (la API de Riot lo
-- encontró y la cuenta dijo «soy yo») o 'login' (cuenta conectada); los dos últimos, status 'confirmado'. Solo el login
-- es exclusivo (índices únicos parciales): un ID declarado o buscado lo pueden tener varias cuentas. rank_source = de
-- dónde salió el rango (por separado, D11): 'verificado' solo sale de una búsqueda de LoL.
create table public.esports_game_ids (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game text not null check (private.esp_game_ok(game)),
  platform text not null default '' check (platform ~ '^[a-z0-9]{0,8}$'),
  region text not null default '' check (region ~ '^[a-z0-9]{0,8}$'),
  id_display text not null check (char_length(id_display) between 2 and 40),
  id_normalized text not null check (char_length(id_normalized) between 2 and 40 and id_normalized !~ '[A-Z]'),
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmado')),
  ownership text not null default 'declarado' check (ownership in ('declarado', 'busqueda', 'login')),
  -- SteamID64, account_id de Epic o puuid de Riot (la cuenta conectada o lo que dio la búsqueda).
  external_id text check (char_length(external_id) between 1 and 100),
  ranks jsonb not null default '{}' check (private.esp_ranks_ok(ranks)),
  rank_source text not null default 'declarado' check (rank_source in ('declarado', 'verificado')),
  -- El nombre que dio la API del juego o el proveedor al conectar.
  lookup_name text check (char_length(lookup_name) <= 60),
  verified_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game, platform),
  check ((status = 'confirmado') = (ownership <> 'declarado'))
);
create unique index esports_game_ids_login on public.esports_game_ids (game, platform, id_normalized) where ownership = 'login';
create unique index esports_game_ids_login_external on public.esports_game_ids (game, external_id)
  where ownership = 'login' and external_id is not null;
create index esports_game_ids_lookup on public.esports_game_ids (game, platform, id_normalized);

-- «Tu ID pasó a otra cuenta»: cuando alguien conecta (login) un ID que otra cuenta tenía conectado, a esa cuenta le
-- queda este aviso en la app (además del push). Sin lectura directa: esports_my_id_moves y esports_seen_id_move.
create table public.esports_id_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  game text not null check (private.esp_game_ok(game)),
  platform text not null default '' check (platform ~ '^[a-z0-9]{0,8}$'),
  id_display text not null check (char_length(id_display) between 2 and 40),
  provider text not null check (provider in ('steam', 'epic', 'riot')),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index esports_id_moves_user on public.esports_id_moves (user_id, created_at desc);

-- Búsquedas de la Edge Function esports-verify (las escribe ella con la clave secreta; valen 15 minutos). La cuenta
-- confirma apuntando a una suya (esports_confirm_game_id con p_lookup): el teléfono nunca escribe un rango verificado.
create table private.esports_lookups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  game text not null,
  platform text not null,
  id_normalized text not null,
  found boolean not null,
  display_name text check (char_length(display_name) <= 60),
  external_id text check (char_length(external_id) <= 100),
  ranks jsonb not null default '{}',
  provider text not null check (char_length(provider) <= 20),
  created_at timestamptz not null default now()
);
create index esports_lookups_user_idx on private.esports_lookups (user_id, created_at desc);

-- El state de «Conectar con…» (esports-auth): un uso, 10 minutos.
create table private.esports_link_states (
  state uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null check (provider in ('steam', 'epic', 'riot')),
  game text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index esports_link_states_created_idx on private.esports_link_states (created_at);

-- Equipos de esports: duran (no son de una liga). Un juego de equipos o de battle royale (no los 1 contra 1).
create table public.esports_teams (
  id uuid primary key default gen_random_uuid(),
  game text not null check (private.esp_game_ok(game) and private.esp_game_kind(game) <> 'duel'),
  name text not null check (char_length(name) between 2 and 40 and btrim(name) = name),
  tag text not null check (tag ~ '^[A-Z0-9]{2,5}$'),
  description text not null default '' check (char_length(description) <= 200),
  logo_path text,
  captain_id uuid references public.profiles (id) on delete set null,
  member_count smallint not null default 0 check (member_count between 0 and 20),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (logo_path is null or logo_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$'))
);
create unique index esports_teams_name on public.esports_teams (game, private.normalize_name(name));
create index esports_teams_game on public.esports_teams (game, member_count desc, name);

create table public.esports_team_members (
  team_id uuid not null references public.esports_teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('captain', 'member', 'sub')),
  display_name text not null check (char_length(display_name) between 1 and 60 and btrim(display_name) <> ''),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create unique index esports_team_members_captain on public.esports_team_members (team_id) where role = 'captain';
create index esports_team_members_user on public.esports_team_members (user_id);

-- El código para unirse al equipo: solo lo ve el capitán (y el superadmin).
create table public.esports_team_secrets (
  team_id uuid primary key references public.esports_teams (id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  updated_at timestamptz not null default now()
);

-- El torneo: 1:1 con su evento 'torneo' (la liga kind 'torneo' de un torneo suelto, o una liga de esports del juego).
create table public.esports_tournaments (
  event_id uuid primary key,
  league_id uuid not null,
  game text not null check (private.esp_game_ok(game)),
  mode text not null,
  entry_type text not null check (entry_type in ('teams', 'open')),
  format text not null check (format in ('single_elim', 'double_elim', 'groups_playoffs', 'round_robin', 'br')),
  status text not null default 'registration' check (status in ('registration', 'live', 'finished', 'cancelled')),
  starts_at timestamptz not null,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz not null,
  checkin_minutes smallint check (checkin_minutes between 10 and 180),
  max_entries smallint not null check (max_entries between 2 and 128),
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 8192),
  prize_text text not null default '' check (char_length(prize_text) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  check (private.esp_mode_ok(game, mode)),
  check (private.esp_settings_ok(game, mode, format, settings)),
  check ((format = 'br') = (private.esp_game_kind(game) = 'br')),
  check (registration_closes_at <= starts_at),
  check (registration_opens_at is null or registration_opens_at < registration_closes_at),
  check (entry_type = 'open' or private.esp_mode_size(mode) > 1)
);
create index esports_tournaments_game on public.esports_tournaments (game, starts_at desc);
create index esports_tournaments_sync on public.esports_tournaments (league_id, updated_at);

-- Los inscritos: un equipo (de esports o armado por el organizador), un individual o un agente libre.
create table public.esports_entries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  event_id uuid not null references public.esports_tournaments (event_id) on delete cascade,
  kind text not null check (kind in ('team', 'player', 'free_agent')),
  team_id uuid references public.esports_teams (id) on delete set null,
  name text not null check (char_length(name) between 1 and 40),
  tag text not null default '' check (tag ~ '^[A-Z0-9]{0,5}$'),
  captain_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'assigned')),
  seed smallint check (seed between 1 and 128),
  checked_in_at timestamptz,
  note text check (char_length(note) <= 200),
  -- El equipo de temporada de la liga (teams con event_id null) que juega los partidos (al aprobar).
  side_team_id uuid,
  -- Agente libre asignado: el inscrito al que pasó.
  assigned_entry uuid references public.esports_entries (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id),
  unique (id, event_id),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade,
  foreign key (side_team_id, league_id) references public.teams (id, league_id) on delete set null (side_team_id)
);
create unique index esports_entries_team_live on public.esports_entries (event_id, team_id)
  where team_id is not null and status in ('pending', 'approved');
create index esports_entries_event on public.esports_entries (event_id, status);
create index esports_entries_team on public.esports_entries (team_id);
create index esports_entries_sync on public.esports_entries (league_id, updated_at);

-- La foto de la plantilla de cada inscrito (nombre, ID de juego y rango del momento). Una persona, un inscrito por
-- torneo: al rechazar, retirar o asignar, sus filas se borran o se mueven.
create table public.esports_entry_members (
  entry_id uuid not null,
  event_id uuid not null,
  league_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('captain', 'member', 'sub')),
  display_name text not null check (char_length(display_name) between 1 and 60),
  gamer_tag text not null check (char_length(gamer_tag) between 2 and 40),
  ranks jsonb not null default '{}' check (private.esp_ranks_ok(ranks)),
  rank_source text not null default 'declarado' check (rank_source in ('declarado', 'verificado')),
  player_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entry_id, user_id),
  unique (event_id, user_id),
  foreign key (entry_id, event_id) references public.esports_entries (id, event_id) on delete cascade,
  foreign key (entry_id, league_id) references public.esports_entries (id, league_id) on delete cascade,
  foreign key (player_id, league_id) references public.players (id, league_id) on delete set null (player_id)
);
create unique index esports_entry_members_captain on public.esports_entry_members (entry_id) where role = 'captain';
create index esports_entry_members_user on public.esports_entry_members (user_id);
create index esports_entry_members_sync on public.esports_entry_members (league_id, updated_at);

-- Los enlaces del cuadro: cada serie (public.matches) sabe a dónde va su ganador y su perdedor.
create table public.esports_matches (
  match_id uuid primary key,
  league_id uuid not null,
  event_id uuid not null,
  stage text not null check (stage in ('bracket', 'groups', 'playoffs', 'league')),
  part text not null check (part in ('W', 'L', 'GF', 'GF2', 'P3', 'G')),
  group_no smallint check (group_no between 0 and 7),
  best_of smallint not null check (best_of in (1, 3, 5, 7)),
  winner_to uuid references public.matches (id) on delete set null,
  winner_side smallint check (winner_side in (1, 2)),
  loser_to uuid references public.matches (id) on delete set null,
  loser_side smallint check (loser_side in (1, 2)),
  updated_at timestamptz not null default now(),
  foreign key (match_id, league_id) references public.matches (id, league_id) on delete cascade,
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade
);
-- Sin check entre winner_to y winner_side: al borrar el partido destino, winner_to queda null y el lado sobra (se ignora).
create index esports_matches_event on public.esports_matches (event_id, stage);
create index esports_matches_sync on public.esports_matches (league_id, updated_at);
create index esports_matches_winner_to on public.esports_matches (winner_to);
create index esports_matches_loser_to on public.esports_matches (loser_to);

-- Battle royale: las partidas (rondas de N partidas) y el puesto y las kills de cada inscrito.
create table public.esports_br_games (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  event_id uuid not null references public.esports_tournaments (event_id) on delete cascade,
  round smallint not null check (round between 1 and 10),
  game_no smallint not null check (game_no between 1 and 12),
  map text not null default '' check (char_length(map) <= 24),
  status text not null default 'scheduled' check (status in ('scheduled', 'finished', 'void')),
  scheduled_at timestamptz,
  proof uuid[] not null default '{}' check (cardinality(proof) <= 3),
  entered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, league_id),
  unique (event_id, round, game_no),
  foreign key (event_id, league_id) references public.events (id, league_id) on delete cascade
);
create index esports_br_games_sync on public.esports_br_games (league_id, updated_at);

create table public.esports_br_results (
  game_id uuid not null,
  entry_id uuid not null,
  league_id uuid not null,
  -- null = no jugó esa partida.
  placement smallint check (placement between 1 and 150),
  kills smallint not null default 0 check (kills between 0 and 200),
  updated_at timestamptz not null default now(),
  primary key (game_id, entry_id),
  foreign key (game_id, league_id) references public.esports_br_games (id, league_id) on delete cascade,
  foreign key (entry_id, league_id) references public.esports_entries (id, league_id) on delete cascade
);
create unique index esports_br_results_place on public.esports_br_results (game_id, placement) where placement is not null;
create index esports_br_results_entry on public.esports_br_results (entry_id);
create index esports_br_results_sync on public.esports_br_results (league_id, updated_at);

-- ---------- RLS: solo lectura ----------
alter table public.esports_game_ids enable row level security;
alter table public.esports_id_moves enable row level security;
alter table public.esports_teams enable row level security;
alter table public.esports_team_members enable row level security;
alter table public.esports_team_secrets enable row level security;
alter table public.esports_tournaments enable row level security;
alter table public.esports_entries enable row level security;
alter table public.esports_entry_members enable row level security;
alter table public.esports_matches enable row level security;
alter table public.esports_br_games enable row level security;
alter table public.esports_br_results enable row level security;

-- IDs de juego: con sesión, solo las columnas públicas (lo demás, su dueño con esports_my_game_ids). esports_id_moves:
-- sin políticas ni permisos (solo por RPC).
create policy esports_game_ids_read on public.esports_game_ids for select to authenticated using (true);
-- Equipos: todos (también sin cuenta); miembros: con sesión; el código: el capitán y el superadmin.
create policy esports_teams_read on public.esports_teams for select to anon, authenticated using (true);
create policy esports_team_members_read on public.esports_team_members for select to authenticated using (true);
create policy esports_team_secrets_read on public.esports_team_secrets for select to authenticated
  using (team_id in (select t.id from public.esports_teams t where t.captain_id = (select auth.uid())) or (select private.is_super()));
-- Lo del torneo: quien ve la liga (pública: también sin cuenta).
create policy esports_tournaments_read on public.esports_tournaments for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy esports_entries_read on public.esports_entries for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy esports_entry_members_read on public.esports_entry_members for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy esports_matches_read on public.esports_matches for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy esports_br_games_read on public.esports_br_games for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));
create policy esports_br_results_read on public.esports_br_results for select to anon, authenticated
  using (league_id in (select private.readable_leagues()));

grant select (user_id, game, platform, region, id_display, status, ranks, rank_source, ownership, verified_at, confirmed_at,
              updated_at) on public.esports_game_ids to authenticated;
grant select on public.esports_teams to anon, authenticated;
grant select on public.esports_team_members, public.esports_team_secrets to authenticated;
grant select on public.esports_tournaments, public.esports_entries, public.esports_entry_members, public.esports_matches,
  public.esports_br_games, public.esports_br_results to anon, authenticated;

-- =====================================================================
-- 4. Ayudas que leen o escriben las tablas
-- =====================================================================

-- El torneo bloqueado para cambiarlo ('no_existe' si no está).
create function private.esp_tournament_for_update(p_event uuid) returns public.esports_tournaments
language plpgsql security definer set search_path = '' as $$
declare
  t public.esports_tournaments;
begin
  select * into t from public.esports_tournaments x where x.event_id = p_event for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  return t;
end $$;

-- El inscrito bloqueado para cambiarlo ('no_existe' si no está).
create function private.esp_entry_for_update(p_entry uuid) returns public.esports_entries
language plpgsql security definer set search_path = '' as $$
declare
  e public.esports_entries;
begin
  select * into e from public.esports_entries x where x.id = p_entry for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  return e;
end $$;

-- §5.2 paso 1: el torneo está en inscripción y ahora está dentro de la ventana (desde que abre, o siempre si no dice,
-- hasta que cierra).
create function private.esp_registration_open(t public.esports_tournaments) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(t.status = 'registration' and (t.registration_opens_at is null or now() >= t.registration_opens_at)
                  and now() < t.registration_closes_at, false)
$$;

-- El nombre del torneo (el de su evento).
create function private.esp_tournament_name(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(e.name, ''), l.name) from public.events e join public.leagues l on l.id = e.league_id where e.id = p_event
$$;

-- El ID de juego de una cuenta (en NBA 2K, el de esa plataforma; en los demás, el de plataforma '').
create function private.esp_my_game_id(p_user uuid, p_game text, p_platform text) returns public.esports_game_ids
language sql stable security definer set search_path = '' as $$
  select * from public.esports_game_ids g
   where g.user_id = p_user and g.game = p_game
     and g.platform = case when p_game = 'nba_2k' then coalesce(p_platform, '') else '' end
$$;

-- §5.2 paso 4 (sin el duplicado): null si la cuenta puede estar en la plantilla; si no, 'sin_id' (no puso su ID de ese
-- juego), 'id_sin_comprobar' (el torneo pide el ID comprobado, el juego se puede comprobar y el suyo no lo está) o
-- 'sin_rango' (el torneo pide el rango verificado, el juego lo tiene —solo LoL— y el suyo no lo está o no tiene el de
-- ese modo). requireConfirmedId es false si no viene; en un juego sin verificación no cuenta (basta con tener el ID
-- puesto), igual que requireVerifiedRank en uno sin rango verificado. La plataforma (NBA 2K) es la del torneo; p_mode
-- da la clave del rango (Rocket League es por modo).
create function private.esp_member_ok(p_user uuid, p_game text, p_settings jsonb, p_mode text default null) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  g public.esports_game_ids;
begin
  g := private.esp_my_game_id(p_user, p_game, case when p_game = 'nba_2k' then coalesce(p_settings ->> 'platform', '') else '' end);
  if g.user_id is null then
    return 'sin_id';
  end if;
  if private.esp_verify_kind(p_game) is distinct from 'none'
     and coalesce(p_settings -> 'requireConfirmedId', 'false'::jsonb) = 'true'::jsonb and g.status <> 'confirmado' then
    return 'id_sin_comprobar';
  end if;
  if private.esp_rank_verifiable(p_game)
     and coalesce(p_settings -> 'requireVerifiedRank', 'false'::jsonb) = 'true'::jsonb
     and (g.rank_source <> 'verificado' or not (g.ranks ? private.esp_rank_key(p_game, p_mode))) then
    return 'sin_rango';
  end if;
  return null;
end $$;

-- La cuenta está en una inscripción aprobada de un torneo en curso de ese juego (su ID no cambia ni se borra).
create function private.esp_id_locked(p_user uuid, p_game text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.esports_entry_members m
                   join public.esports_entries e on e.id = m.entry_id
                   join public.esports_tournaments t on t.event_id = e.event_id
                  where m.user_id = p_user and e.status = 'approved' and t.status = 'live' and t.game = p_game)
$$;

-- Tiempo real: 'esports' {table, op, ids} en league:<liga> y event:<evento>.
create function private.esp_emit(p_league uuid, p_event uuid, p_table text, p_op text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_payload jsonb := jsonb_build_object('table', p_table, 'op', p_op, 'ids', to_jsonb(coalesce(p_ids, '{}'::uuid[])));
begin
  if p_league is null or private.deleting(p_league) then
    return;
  end if;
  perform private.emit('league:' || p_league::text, 'esports', v_payload);
  if p_event is not null then
    perform private.emit('event:' || p_event::text, 'esports', v_payload);
  end if;
end $$;

-- Código nuevo para un equipo (8 caracteres como los de las ligas), sin repetir.
create function private.esp_new_team_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v text;
begin
  for i in 1..10 loop
    v := private.new_invite_code();
    if not exists (select 1 from public.esports_team_secrets s where s.invite_code = v) then
      return v;
    end if;
  end loop;
  perform private.fail('duplicado');
  return null;
end $$;

-- La cuenta como miembro y jugador de la liga del torneo (sin reclamos por nombre: no usa ensure_player). Devuelve el
-- jugador.
create function private.esp_ensure_player(p_league uuid, p_user uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := left(coalesce(nullif(btrim(p_name), ''), (select p.name from public.profiles p where p.id = p_user), 'Jugador'), 60);
  v_player uuid;
begin
  insert into public.league_members (league_id, user_id, role, display_name) values (p_league, p_user, 'member', v_name)
  on conflict (league_id, user_id) do nothing;
  update public.league_members m set scorer_only = false where m.league_id = p_league and m.user_id = p_user and m.scorer_only;
  select p.id into v_player from public.players p where p.league_id = p_league and p.user_id = p_user;
  if v_player is null then
    insert into public.players (league_id, user_id, name) values (p_league, p_user, v_name) returning id into v_player;
  end if;
  return v_player;
end $$;

-- Si el inscrito ya tiene su equipo de temporada: membresías y jugadores de los nuevos y team_players igual a la foto
-- (el capitán 'captain', los demás 'player', los suplentes con position 'suplente'; se va quien salió).
create function private.esp_sync_roster(p_entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.esports_entries;
  r record;
  v_player uuid;
begin
  select * into e from public.esports_entries x where x.id = p_entry;
  if e.id is null or e.side_team_id is null then
    return;
  end if;
  for r in select m.user_id, m.display_name from public.esports_entry_members m where m.entry_id = p_entry order by m.created_at, m.user_id loop
    v_player := private.esp_ensure_player(e.league_id, r.user_id, r.display_name);
    update public.esports_entry_members m set player_id = v_player
     where m.entry_id = p_entry and m.user_id = r.user_id and m.player_id is distinct from v_player;
  end loop;
  delete from public.team_players tp
   where tp.team_id = e.side_team_id
     and tp.player_id not in (select m.player_id from public.esports_entry_members m where m.entry_id = p_entry and m.player_id is not null);
  insert into public.team_players as tp (team_id, player_id, league_id, role, position)
  select e.side_team_id, m.player_id, e.league_id,
         case m.role when 'captain' then 'captain' else 'player' end,
         case m.role when 'sub' then 'suplente' end
    from public.esports_entry_members m
   where m.entry_id = p_entry and m.player_id is not null
  on conflict (team_id, player_id) do update set role = excluded.role, position = excluded.position
    where (tp.role, tp.position) is distinct from (excluded.role, excluded.position);
  update public.teams t set name = e.name where t.id = e.side_team_id and t.name is distinct from e.name;
end $$;

-- §5.3: al aprobar, el inscrito queda en la liga del torneo: cada miembro de la foto con su membresía y su jugador, y un
-- equipo de temporada (event_id null, sort_order = la siembra o 999) con su plantilla. Un agente libre no juega solo:
-- se materializa cuando lo asignan a un equipo.
create function private.esp_materialize(p_entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.esports_entries;
  v_team uuid;
begin
  select * into e from public.esports_entries x where x.id = p_entry for update;
  if e.id is null or e.kind = 'free_agent' then
    return;
  end if;
  if e.side_team_id is null then
    insert into public.teams (league_id, event_id, name, sort_order)
    values (e.league_id, null, e.name, coalesce(e.seed, 999)) returning id into v_team;
    update public.esports_entries x set side_team_id = v_team where x.id = p_entry;
  end if;
  perform private.esp_sync_roster(p_entry);
end $$;

-- Al rechazar o retirar (en inscripción): se borra el equipo de temporada (con su plantilla); la membresía y el jugador
-- se quedan.
create function private.esp_dematerialize(p_entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid;
begin
  select x.side_team_id into v_team from public.esports_entries x where x.id = p_entry;
  if v_team is null then
    return;
  end if;
  update public.esports_entries x set side_team_id = null where x.id = p_entry;
  delete from public.teams t where t.id = v_team;
end $$;

-- Pone en un lado del partido destino el equipo del lado de origen (team_id, label y seed). Si el destino ya empezó o
-- tiene resultado y el lado sería otro equipo: con p_strict 'cerrado: cuadro' (el admin anula primero ese partido); si
-- no, se salta. Devuelve 1 si puso el lado.
create function private.esp_place(p_dest uuid, p_dest_side smallint, p_src uuid, p_src_side smallint, p_strict boolean)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.match_sides;
  d public.matches;
  ds public.match_sides;
begin
  select * into s from public.match_sides x where x.match_id = p_src and x.side = p_src_side;
  select * into d from public.matches x where x.id = p_dest for update;
  if s.match_id is null or d.id is null then
    return 0;
  end if;
  select * into ds from public.match_sides x where x.match_id = p_dest and x.side = p_dest_side;
  if ds.match_id is not null and ds.team_id is not distinct from s.team_id and ds.label = s.label
     and ds.seed is not distinct from s.seed then
    return 0;
  end if;
  if d.status in ('scheduled', 'postponed') and d.seq = 0 and d.score is null then
    insert into public.match_sides as ms (match_id, side, league_id, team_id, label, seed)
    values (p_dest, p_dest_side, d.league_id, s.team_id, s.label, s.seed)
    on conflict (match_id, side) do update set team_id = excluded.team_id, label = excluded.label, seed = excluded.seed;
    -- Sube la versión del partido destino (como set_match_sides): quien consulta solo lo que cambió se entera.
    update public.matches x set seq = x.seq where x.id = p_dest;
    return 1;
  end if;
  if ds.team_id is distinct from s.team_id and p_strict then
    raise exception 'cerrado: cuadro' using errcode = 'P0001', detail = 'El partido siguiente ya empezó: anúlalo primero.';
  end if;
  return 0;
end $$;

-- §9.8: con el partido final (confirmado, W.O. o propuesto hace 48 h), el ganador va a winner_to y el perdedor a
-- loser_to. Empate o W.O. doble: nada. Gran final: si gana el lado 2 (el que viene de perdedores), GF2 se juega con los
-- dos de GF; si gana el lado 1 (el invicto), GF2 queda anulado. Devuelve cuántos lados puso.
create function private.esp_apply_links(p_match uuid, p_strict boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches;
  em public.esports_matches;
  g public.esports_matches;
  gm public.matches;
  v_w smallint;
  n integer := 0;
  c_note constant text := 'No hizo falta: ganó el invicto.';
begin
  select * into em from public.esports_matches x where x.match_id = p_match;
  select * into m from public.matches x where x.id = p_match;
  if em.match_id is null or m.id is null or not private.match_final(m.status, m.proposed_at) then
    return 0;
  end if;
  v_w := case when m.status = 'walkover' then case m.walkover_side when 1 then 2 when 2 then 1 end else m.winner_side end;
  if v_w is null then
    return 0;
  end if;
  if em.winner_to is not null and em.winner_side is not null then
    n := n + private.esp_place(em.winner_to, em.winner_side, p_match, v_w, p_strict);
  end if;
  if em.loser_to is not null and em.loser_side is not null then
    n := n + private.esp_place(em.loser_to, em.loser_side, p_match, (3 - v_w)::smallint, p_strict);
  end if;
  if em.part = 'GF' then
    select * into g from public.esports_matches x where x.event_id = em.event_id and x.stage = em.stage and x.part = 'GF2' limit 1;
    if g.match_id is not null then
      select * into gm from public.matches x where x.id = g.match_id for update;
      if v_w = 2 then
        -- El reinicio vuelve si se había anulado solo (la gran final se corrigió).
        if gm.status = 'void' and gm.seq = 0 and gm.score is null and gm.note = c_note then
          update public.matches x set status = 'scheduled', note = null,
                 history = private.match_history(x.history, 'reschedule', 'La gran final la ganó quien venía de perdedores.')
           where x.id = gm.id;
        end if;
        n := n + private.esp_place(g.match_id, 1::smallint, p_match, 1::smallint, p_strict)
               + private.esp_place(g.match_id, 2::smallint, p_match, 2::smallint, p_strict);
      elsif gm.status = 'scheduled' and gm.seq = 0 and gm.score is null then
        update public.matches x set status = 'void', note = c_note, history = private.match_history(x.history, 'void', c_note)
         where x.id = gm.id;
      end if;
    end if;
  end if;
  return n;
end $$;

-- Push a los admins de la liga al llegar una inscripción pendiente (agrupado por torneo).
create function private.esp_push_pending(p_entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.esports_entries;
  v_name text;
  v_n integer;
  r record;
begin
  select * into e from public.esports_entries x where x.id = p_entry;
  if e.id is null or e.status <> 'pending' then
    return;
  end if;
  v_name := private.esp_tournament_name(e.event_id);
  v_n := (select count(*) from public.esports_entries x where x.event_id = e.event_id and x.status = 'pending');
  for r in select m.user_id from public.league_members m
            where m.league_id = e.league_id and m.role in ('owner', 'admin') and m.user_id is distinct from e.created_by loop
    perform private.queue_push(r.user_id, 'liga', left(e.name || ' se inscribió en ' || v_name, 200),
      'Revisa las inscripciones del torneo.', '/l/' || e.league_id::text || '/e/' || e.event_id::text,
      'esports:pend:' || e.event_id::text, 86400, left(v_n::text || ' inscripciones por revisar en ' || v_name, 200));
  end loop;
end $$;

-- Push al capitán (o al individual) cuando el organizador decide su inscripción.
create function private.esp_push_decided(p_entry uuid, p_approved boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.esports_entries;
  v_name text;
begin
  select * into e from public.esports_entries x where x.id = p_entry;
  if e.id is null or e.captain_id is null or e.captain_id = auth.uid() then
    return;
  end if;
  v_name := private.esp_tournament_name(e.event_id);
  perform private.queue_push(e.captain_id, 'liga',
    left(case when p_approved then 'Te aprobaron en ' else 'No aprobaron tu inscripción en ' end || v_name, 200),
    coalesce(nullif(btrim(p_note), ''), case when p_approved then 'Ya estás en el torneo. Toca para verlo.' else 'Toca para ver el torneo.' end),
    '/l/' || e.league_id::text || '/e/' || e.event_id::text, 'esports:entry:' || e.id::text, 86400);
end $$;

-- =====================================================================
-- 5. Triggers
-- =====================================================================

-- Liga de esports: rules = {game} con un juego del catálogo; el juego no cambia si ya tiene torneos.
create function private.esp_check_league() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sport is distinct from 'esports' then
    return new;
  end if;
  if jsonb_typeof(new.rules) <> 'object' or not private.esp_game_ok(new.rules ->> 'game')
     or exists (select 1 from jsonb_object_keys(new.rules) k where k <> 'game') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Elige el juego.';
  end if;
  if tg_op = 'UPDATE' and new.rules ->> 'game' is distinct from old.rules ->> 'game'
     and exists (select 1 from public.esports_tournaments t where t.league_id = new.id) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'El juego no cambia: la liga ya tiene torneos.';
  end if;
  return new;
end $$;

create trigger leagues_esp_check before insert or update of sport, rules on public.leagues
  for each row execute function private.esp_check_league();

-- En una liga de esports cada evento es un torneo.
create function private.esp_check_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.type <> 'torneo' and (select l.sport from public.leagues l where l.id = new.league_id) = 'esports' then
    raise exception 'invalido' using errcode = 'P0001', detail = 'En esports cada evento es un torneo.';
  end if;
  return new;
end $$;

create trigger events_esp_check before insert or update of type, league_id on public.events
  for each row execute function private.esp_check_event();

-- Series de una liga de esports: formato = el juego de la liga; reglas del juego (private.esp_rules_ok); el marcador de
-- la serie con la regla del juego (private.esp_series_ok), final si está terminado, confirmado o en disputa; un W.O. con
-- su forma; las pruebas (score.proof), fotos de la liga. finish_match, confirm_result, resolve_dispute,
-- admin_correct_result y set_walkover pasan por aquí. Un partido anulado no se revisa (guarda lo que tenía).
create function private.esp_check_match() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sport text;
  v_game text;
  v_winner smallint;
  v_bad boolean := false;
begin
  select l.sport, l.rules ->> 'game' into v_sport, v_game from public.leagues l where l.id = new.league_id;
  if v_sport is distinct from 'esports' then
    return new;
  end if;
  if new.format is distinct from v_game or not private.esp_rules_ok(v_game, new.rules) then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Serie no válida para ' || private.esp_game_name(v_game) || '.';
  end if;
  if new.status = 'void' then
    return new;
  end if;
  if new.score is null then
    if new.status in ('finished', 'confirmed', 'disputed') then
      v_bad := true;
    end if;
  elsif new.status = 'walkover' then
    v_winner := case new.walkover_side when 1 then 2 when 2 then 1 end;
    v_bad := new.score -> 'wo' is distinct from 'true'::jsonb
             or not private.esp_series_ok(new.score, new.rules, true, v_winner, new.walkover_side)
             or new.winner_side is distinct from v_winner;
  elsif new.score ? 'wo' then
    v_bad := true;
  else
    v_bad := not private.esp_series_ok(new.score, new.rules, new.status in ('finished', 'confirmed', 'disputed'),
                                       case when new.status in ('finished', 'confirmed', 'disputed') then new.winner_side end);
  end if;
  if not v_bad and jsonb_typeof(new.score -> 'proof') = 'array'
     and exists (select 1 from jsonb_array_elements_text(new.score -> 'proof') x
                  where not exists (select 1 from public.photos p where p.id = x::uuid and p.league_id = new.league_id)) then
    v_bad := true;
  end if;
  if v_bad then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Marcador no válido para ' || private.esp_game_name(v_game) || '.';
  end if;
  return new;
end $$;

create trigger matches_esp_check before insert or update of score, status, winner_side, walkover_side, rules, format on public.matches
  for each row execute function private.esp_check_match();

-- El cuadro avanza solo: una serie del cuadro que queda confirmada o en W.O. pone a su ganador y su perdedor en el
-- partido siguiente (estricto: si ese ya empezó con otro equipo, la corrección falla con 'cerrado: cuadro').
create function private.esp_advance_match() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.esports_matches x where x.match_id = new.id) then
    perform private.esp_apply_links(new.id, true);
  end if;
  return null;
end $$;

create trigger matches_esp_advance after update of status, winner_side, walkover_side on public.matches
  for each row when (new.status in ('confirmed', 'walkover'))
  execute function private.esp_advance_match();

create trigger esports_game_ids_touch before update on public.esports_game_ids for each row execute function private.touch_updated_at();
create trigger esports_teams_touch before update on public.esports_teams for each row execute function private.touch_updated_at();
create trigger esports_team_members_touch before update on public.esports_team_members for each row execute function private.touch_updated_at();
create trigger esports_team_secrets_touch before update on public.esports_team_secrets for each row execute function private.touch_updated_at();
create trigger esports_tournaments_touch before update on public.esports_tournaments for each row execute function private.touch_updated_at();
create trigger esports_entries_touch before update on public.esports_entries for each row execute function private.touch_updated_at();
create trigger esports_entry_members_touch before update on public.esports_entry_members for each row execute function private.touch_updated_at();
create trigger esports_matches_touch before update on public.esports_matches for each row execute function private.touch_updated_at();
create trigger esports_br_games_touch before update on public.esports_br_games for each row execute function private.touch_updated_at();
create trigger esports_br_results_touch before update on public.esports_br_results for each row execute function private.touch_updated_at();

-- Miembros de un equipo (una vez por sentencia): member_count al día; si se fue el capitán (borró su cuenta), pasa al
-- más antiguo (titular antes que suplente); sin miembros, el equipo se borra.
create function private.esp_team_members_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_teams uuid[];
  t uuid;
  v_new uuid;
begin
  if tg_op = 'DELETE' then
    select array_agg(distinct o.team_id) into v_teams from old_rows o;
  else
    select array_agg(distinct n.team_id) into v_teams from new_rows n;
  end if;
  foreach t in array coalesce(v_teams, '{}'::uuid[]) loop
    continue when not exists (select 1 from public.esports_teams e where e.id = t);
    if not exists (select 1 from public.esports_team_members m where m.team_id = t) then
      delete from public.esports_teams e where e.id = t;
      continue;
    end if;
    if not exists (select 1 from public.esports_team_members m where m.team_id = t and m.role = 'captain') then
      select m.user_id into v_new from public.esports_team_members m
       where m.team_id = t order by (m.role = 'sub'), m.joined_at, m.user_id limit 1;
      update public.esports_team_members m set role = 'captain' where m.team_id = t and m.user_id = v_new;
      update public.esports_teams e set captain_id = v_new where e.id = t;
    end if;
    update public.esports_teams e
       set member_count = (select count(*) from public.esports_team_members m where m.team_id = t)
     where e.id = t and e.member_count <> (select count(*) from public.esports_team_members m where m.team_id = t);
  end loop;
  return null;
end $$;

create trigger esports_team_members_count_insert after insert on public.esports_team_members referencing new table as new_rows
  for each statement execute function private.esp_team_members_count();
create trigger esports_team_members_count_delete after delete on public.esports_team_members referencing old table as old_rows
  for each statement execute function private.esp_team_members_count();

-- El logo que deja de usarse (cambiado, quitado o el equipo borrado) y sus reservas van a la cola de Storage: la misma
-- función de los logos de las ligas (usa old.logo_path y old.id; la reserva guarda el id del equipo en league_id).
create trigger esports_teams_logo_purge after update of logo_path or delete on public.esports_teams
  for each row execute function private.queue_logo_purge();

-- Tiempo real (una vez por sentencia): tg_argv[0] = la tabla que se avisa ('tournament', 'entries', 'members', 'links',
-- 'br'), tg_argv[1] = la columna de los ids.
create function private.esp_emit_rows() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_col text := tg_argv[1];
  v_op text := lower(tg_op);
begin
  if tg_op = 'DELETE' then
    for r in select x.league_id, x.event_id, array_agg(distinct x.id) as ids
               from (select (to_jsonb(o) ->> 'league_id')::uuid as league_id,
                            coalesce((to_jsonb(o) ->> 'event_id')::uuid,
                                     (select g.event_id from public.esports_br_games g where g.id = (to_jsonb(o) ->> 'game_id')::uuid)) as event_id,
                            (to_jsonb(o) ->> v_col)::uuid as id
                       from old_rows o) x
              group by x.league_id, x.event_id loop
      perform private.esp_emit(r.league_id, r.event_id, tg_argv[0], v_op, r.ids);
    end loop;
  else
    for r in select x.league_id, x.event_id, array_agg(distinct x.id) as ids
               from (select (to_jsonb(n) ->> 'league_id')::uuid as league_id,
                            coalesce((to_jsonb(n) ->> 'event_id')::uuid,
                                     (select g.event_id from public.esports_br_games g where g.id = (to_jsonb(n) ->> 'game_id')::uuid)) as event_id,
                            (to_jsonb(n) ->> v_col)::uuid as id
                       from new_rows n) x
              group by x.league_id, x.event_id loop
      perform private.esp_emit(r.league_id, r.event_id, tg_argv[0], v_op, r.ids);
    end loop;
  end if;
  return null;
exception when others then
  raise warning 'esports emit %: %', tg_table_name, sqlerrm;
  return null;
end $$;

create trigger esports_tournaments_emit_insert after insert on public.esports_tournaments referencing new table as new_rows
  for each statement execute function private.esp_emit_rows('tournament', 'event_id');
create trigger esports_tournaments_emit_update after update on public.esports_tournaments referencing new table as new_rows
  for each statement execute function private.esp_emit_rows('tournament', 'event_id');
create trigger esports_tournaments_emit_delete after delete on public.esports_tournaments referencing old table as old_rows
  for each statement execute function private.esp_emit_rows('tournament', 'event_id');
create trigger esports_entries_emit_insert after insert on public.esports_entries referencing new table as new_rows
  for each statement execute function private.esp_emit_rows('entries', 'id');
create trigger esports_entries_emit_update after update on public.esports_entries referencing new table as new_rows
  for each statement execute function private.esp_emit_rows('entries', 'id');
create trigger esports_entries_emit_delete after delete on public.esports_entries referencing old table as old_rows
  for each statement execute function private.esp_emit_rows('entries', 'id');
create trigger esports_entry_members_emit_insert after insert on public.esports_entry_members referencing new table as new_rows
  for each statement execute function private.esp_emit_rows('members', 'entry_id');
create trigger esports_entry_members_emit_update after update on public.esports_entry_members referencing new table as new_rows
  for each statement execute function private.esp_emit_rows('members', 'entry_id');
create trigger esports_entry_members_emit_delete after delete on public.esports_entry_members referencing old table as old_rows
  for each statement execute function private.esp_emit_rows('members', 'entry_id');
create trigger esports_matches_emit_insert after insert on public.esports_matches referencing new table as new_rows
  for each statement execute function private.esp_emit_rows('links', 'match_id');
create trigger esports_matches_emit_update after update on public.esports_matches referencing new table as new_rows
  for each statement execute function private.esp_emit_rows('links', 'match_id');
create trigger esports_matches_emit_delete after delete on public.esports_matches referencing old table as old_rows
  for each statement execute function private.esp_emit_rows('links', 'match_id');
create trigger esports_br_games_emit_insert after insert on public.esports_br_games referencing new table as new_rows
  for each statement execute function private.esp_emit_rows('br', 'id');
create trigger esports_br_games_emit_update after update on public.esports_br_games referencing new table as new_rows
  for each statement execute function private.esp_emit_rows('br', 'id');
create trigger esports_br_games_emit_delete after delete on public.esports_br_games referencing old table as old_rows
  for each statement execute function private.esp_emit_rows('br', 'id');
create trigger esports_br_results_emit_insert after insert on public.esports_br_results referencing new table as new_rows
  for each statement execute function private.esp_emit_rows('br', 'game_id');
create trigger esports_br_results_emit_update after update on public.esports_br_results referencing new table as new_rows
  for each statement execute function private.esp_emit_rows('br', 'game_id');
create trigger esports_br_results_emit_delete after delete on public.esports_br_results referencing old table as old_rows
  for each statement execute function private.esp_emit_rows('br', 'game_id');

-- =====================================================================
-- 6. Lo que se redefine (cuerpo copiado de su última versión con el cambio)
-- =====================================================================

-- Igual que en 20260927000100_partidos.sql y además la familia 'esports' (sus series son partidos).
create or replace function private.require_match_league(p_league uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v text := private.league_family(p_league);
begin
  if v is null then
    perform private.fail('no_existe');
  end if;
  if v not in ('racket', 'team', 'esports') then
    perform private.fail('invalido');
  end if;
  return v;
end $$;

-- Igual que en 20260927000100_partidos.sql y además la familia 'esports'.
create or replace function private.check_match() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(private.league_family(new.league_id), '') not in ('racket', 'team', 'esports') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Solo las ligas de raqueta, de equipos o de esports tienen partidos.';
  end if;
  return new;
end $$;

-- Igual que en 20260927000100_partidos.sql y además la familia 'esports' (el inscrito aprobado es un equipo de
-- temporada de la liga del torneo).
create or replace function private.check_season_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.event_id is null and coalesce(private.league_family(new.league_id), '') not in ('racket', 'team', 'esports') then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Los equipos de temporada son de ligas de partidos.';
  end if;
  return new;
end $$;

-- Igual que en 20260929001000_sueltos_logos.sql y además el logo de un equipo de esports: si la carpeta no es una liga
-- y es un equipo, la ruta es '<equipo>/<uuid>.webp|.jpg|.png', la cuenta (sin bloquear) es su capitán (o superadmin) y
-- la reservó con esports_begin_team_logo (en logo_uploads, league_id = el equipo) hace menos de un día.
create or replace function private.can_upload_logo_path(p_path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_league uuid;
begin
  begin
    v_league := split_part(p_path, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  if not exists (select 1 from public.leagues l where l.id = v_league)
     and exists (select 1 from public.esports_teams t where t.id = v_league) then
    return p_path ~ ('^' || v_league::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$')
       and not private.is_blocked((select auth.uid()))
       and (private.is_super() or exists (select 1 from public.esports_teams t where t.id = v_league and t.captain_id = (select auth.uid())))
       and exists (select 1 from private.logo_uploads u
                    where u.path = p_path and u.league_id = v_league and u.user_id = (select auth.uid())
                      and u.created_at > now() - interval '1 day');
  end if;
  return p_path ~ ('^' || v_league::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$')
     and exists (select 1 from public.leagues l where l.id = v_league)
     and not private.is_blocked((select auth.uid()))
     and private.is_admin(v_league)
     and exists (select 1 from private.logo_uploads u
                  where u.path = p_path and u.league_id = v_league and u.user_id = (select auth.uid())
                    and u.created_at > now() - interval '1 day');
end $$;

-- Igual que en 20260929001000_sueltos_logos.sql y además los logos de los equipos de esports de los que la cuenta es
-- capitán.
create or replace function private.can_remove_logo_path(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and not private.is_blocked((select auth.uid()))
     and (split_part(p_path, '/', 1) in (select l::text from private.photo_admin_leagues() l)
          or split_part(p_path, '/', 1) in (select t.id::text from public.esports_teams t where t.captain_id = (select auth.uid()))
          or exists (select 1 from private.storage_purge_queue q where q.path = p_path and q.bucket = 'logos'))
$$;

-- Igual que en 20260929001000_sueltos_logos.sql y además, en 'logos', tampoco se borra el logo de un equipo de esports en
-- uso. Sigue solo de service_role.
create or replace function public.purge_queue_take(p_limit integer default 500, p_bucket text default 'scoreboards')
returns table (path text)
language plpgsql security definer set search_path = '' as $$
begin
  if p_bucket is null or p_bucket not in ('scoreboards', 'logos') then
    perform private.fail('invalido');
  end if;
  if p_bucket = 'scoreboards' then
    delete from private.storage_purge_queue q
     where q.bucket = 'scoreboards' and exists (select 1 from public.photos p where p.path = q.path);
  else
    delete from private.storage_purge_queue q
     where q.bucket = 'logos'
       and (exists (select 1 from public.leagues l where l.logo_path = q.path)
            or exists (select 1 from public.esports_teams t where t.logo_path = q.path));
  end if;
  return query
  with picked as (
    select q.path
      from private.storage_purge_queue q
     where q.bucket = p_bucket and q.attempts < 10 and (q.claimed_at is null or q.claimed_at < now() - interval '10 minutes')
     order by q.queued_at, q.path
     limit private.clamp_int(p_limit, 1, 1000, 500)
       for update of q skip locked
  )
  update private.storage_purge_queue q set claimed_at = now(), attempts = q.attempts + 1
    from picked x
   where q.path = x.path
  returning q.path;
end $$;

-- Igual que en 20260929001400_anotadores.sql (la última) y además 'esports' (inscripciones: 'esports:entry:<inscrito>',
-- 'esports:pend:<evento>') y 'esports-id' (IDs de juego: 'esports-id:login:<cuenta>', «tu ID pasó a otra cuenta») en
-- 'liga' («Tus ligas»).
create or replace function private.push_category(p_tag text) returns text
language sql immutable set search_path = '' as $$
  select case split_part(coalesce(p_tag, ''), ':', 1)
    when 'envio' then 'resultados'
    when 'confirmar' then 'resultados'
    when 'resultado' then 'resultados'
    when 'reclamo' then 'resultados'
    when 'reaccion' then 'social'
    when 'comentario' then 'social'
    when 'seguir' then 'social'
    when 'insignias' then 'social'
    when 'insignia' then 'social'
    when 'recordatorio' then 'recordatorios'
    when 'partido' then 'recordatorios'
    when 'despues' then 'recordatorios'
    when 'sinresultado' then 'recordatorios'
    when 'pista' then 'recordatorios'
    when 'aviso' then 'liga'
    when 'temporada' then 'liga'
    when 'invitacion' then 'liga'
    when 'invitacion-ok' then 'liga'
    when 'anotador' then 'liga'
    when 'esports' then 'liga'
    when 'esports-id' then 'liga'
  end
$$;

-- =====================================================================
-- 7. RPC: IDs de juego
-- =====================================================================

-- Orden de los juegos en las listas (el del catálogo).
create function private.esp_game_order(p_game text) returns integer
language sql immutable set search_path = '' as $$
  select coalesce(array_position(array['valorant', 'cs2', 'lol', 'mlbb', 'rocket_league', 'ea_fc', 'nba_2k', 'sf6', 'tekken8',
                                       'smash', 'clash_royale', 'free_fire', 'fortnite', 'warzone', 'pubg_mobile'], p_game), 99)
$$;

-- Una fila de esports_game_ids con todas sus columnas, en camelCase (lo que ve su dueño).
create function private.esp_game_id_json(g public.esports_game_ids) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'userId', g.user_id, 'game', g.game, 'platform', g.platform, 'region', g.region, 'idDisplay', g.id_display,
    'idNormalized', g.id_normalized, 'status', g.status, 'ownership', g.ownership, 'externalId', g.external_id,
    'ranks', g.ranks, 'rankSource', g.rank_source, 'lookupName', g.lookup_name, 'verifiedAt', private.iso(g.verified_at),
    'confirmedAt', private.iso(g.confirmed_at), 'createdAt', private.iso(g.created_at), 'updatedAt', private.iso(g.updated_at))
$$;

-- Guarda (o cambia) el ID de juego de la cuenta: queda declarado ('pendiente') hasta comprobarlo (búsqueda o login,
-- donde el juego lo permite). Varias cuentas pueden declarar el mismo ID; solo choca con uno que otra cuenta tiene
-- conectado con su inicio de sesión ('id_tomado'). Si el ID normalizado cambió, se borra lo comprobado (búsqueda,
-- cuenta externa, nombre de la API, rango verificado: los rangos quedan declarados). Si no cambió, solo la región y cómo
-- se escribe. 'invalido' (no sirve, plataforma o región que no son del juego, o su ID conectado con login: se quita y se
-- vuelve a conectar), 'cerrado' (en una inscripción aprobada de un torneo en curso de ese juego), 'rate_limited' (20
-- cambios por día).
create function public.esports_save_game_id(p_game text, p_id text, p_platform text default '', p_region text default '')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_platform text := coalesce(p_platform, '');
  v_region text := coalesce(p_region, '');
  v_n jsonb;
  v_display text;
  v_norm text;
  g public.esports_game_ids;
begin
  if not private.esp_game_ok(p_game) or not private.esp_platform_ok(p_game, v_platform) or not private.esp_region_ok(p_game, v_region) then
    perform private.fail('invalido');
  end if;
  v_n := private.esp_normalize_id(p_game, p_id);
  v_display := v_n ->> 'display';
  v_norm := v_n ->> 'normalized';
  if v_n is null or char_length(v_display) not between 2 and 40 or char_length(v_norm) not between 2 and 40 then
    perform private.fail('invalido');
  end if;
  select * into g from public.esports_game_ids x where x.user_id = v_uid and x.game = p_game and x.platform = v_platform for update;
  if g.user_id is not null and g.ownership = 'login' then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.esports_game_ids x
              where x.game = p_game and x.platform = v_platform and x.id_normalized = v_norm and x.ownership = 'login'
                and x.user_id <> v_uid) then
    perform private.fail('id_tomado');
  end if;
  if g.user_id is not null and g.id_normalized = v_norm then
    if g.id_display is distinct from v_display or g.region is distinct from v_region then
      update public.esports_game_ids x set id_display = v_display, region = v_region
       where x.user_id = v_uid and x.game = p_game and x.platform = v_platform;
    end if;
    return jsonb_build_object('status', g.status, 'idDisplay', v_display, 'idNormalized', v_norm);
  end if;
  if private.esp_id_locked(v_uid, p_game) then
    perform private.fail('cerrado');
  end if;
  if not private.rate_take('esp_id:' || v_uid::text, 20, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  if g.user_id is null then
    insert into public.esports_game_ids (user_id, game, platform, region, id_display, id_normalized)
    values (v_uid, p_game, v_platform, v_region, v_display, v_norm);
  else
    update public.esports_game_ids x
       set id_display = v_display, id_normalized = v_norm, region = v_region, status = 'pendiente', ownership = 'declarado',
           rank_source = 'declarado', external_id = null, lookup_name = null, verified_at = null, confirmed_at = null
     where x.user_id = v_uid and x.game = p_game and x.platform = v_platform;
  end if;
  return jsonb_build_object('status', 'pendiente', 'idDisplay', v_display, 'idNormalized', v_norm);
end $$;

-- «Sí, soy yo» después de una búsqueda: comprueba el ID guardado con p_lookup, una búsqueda suya de esports-verify (del
-- mismo juego, plataforma e ID, que lo encontró y de menos de 15 minutos; si no —o sin p_lookup—, 'invalido'). Queda
-- 'confirmado' con ownership 'busqueda' (uno conectado sigue 'login'), el nombre y la cuenta que dio la API y, si trajo
-- rangos y el juego los verifica (LoL), se mezclan por clave y quedan 'verificado'. Otra cuenta lo tiene conectado con
-- login: 'id_tomado'. Se puede volver a comprobar. 'no_existe' (sin fila).
create function public.esports_confirm_game_id(p_game text, p_platform text default '', p_lookup uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_platform text := coalesce(p_platform, '');
  g public.esports_game_ids;
  l private.esports_lookups;
  v_ranks jsonb;
begin
  select * into g from public.esports_game_ids x where x.user_id = v_uid and x.game = p_game and x.platform = v_platform for update;
  if g.user_id is null then
    perform private.fail('no_existe');
  end if;
  if p_lookup is not null and private.esp_verify_kind(p_game) = 'lookup' then
    select * into l from private.esports_lookups x
     where x.id = p_lookup and x.user_id = v_uid and x.game = p_game and x.platform = v_platform
       and x.id_normalized = g.id_normalized and x.found and x.created_at > now() - interval '15 minutes';
  end if;
  if l.id is null then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.esports_game_ids x
              where x.game = p_game and x.ownership = 'login' and x.user_id <> v_uid
                and ((x.platform = v_platform and x.id_normalized = g.id_normalized)
                     or (l.external_id is not null and x.external_id = l.external_id))) then
    perform private.fail('id_tomado');
  end if;
  v_ranks := case when private.esp_rank_verifiable(p_game) and l.ranks <> '{}'::jsonb and private.esp_ranks_ok(l.ranks)
                       and private.esp_ranks_valid(p_game, l.ranks)
                  then g.ranks || l.ranks end;
  update public.esports_game_ids x
     set status = 'confirmado', confirmed_at = now(),
         ownership = case when x.ownership = 'login' then 'login' else 'busqueda' end,
         lookup_name = coalesce(left(l.display_name, 60), x.lookup_name),
         external_id = case when x.ownership = 'login' then x.external_id else coalesce(l.external_id, x.external_id) end,
         ranks = coalesce(v_ranks, x.ranks),
         rank_source = case when v_ranks is not null then 'verificado' else x.rank_source end,
         verified_at = case when v_ranks is not null then now() else x.verified_at end
   where x.user_id = v_uid and x.game = p_game and x.platform = v_platform
  returning * into g;
  return jsonb_build_object('status', g.status, 'rankSource', g.rank_source, 'ownership', g.ownership);
end $$;

-- Rangos declarados (los elige con las escaleras del catálogo; tienen que existir en el juego: private.esp_ranks_valid,
-- como validateRankMap): quedan 'declarado', sin lo verificado.
-- p_ranks es obligatorio (lleva default solo porque va después de p_platform). 'no_existe', 'invalido'.
create function public.esports_set_ranks(p_game text, p_platform text default '', p_ranks jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_platform text := coalesce(p_platform, '');
begin
  if p_ranks is null or not private.esp_ranks_ok(p_ranks) or not private.esp_ranks_valid(p_game, p_ranks) then
    perform private.fail('invalido');
  end if;
  update public.esports_game_ids x set ranks = p_ranks, rank_source = 'declarado', verified_at = null
   where x.user_id = v_uid and x.game = p_game and x.platform = v_platform;
  if not found then
    perform private.fail('no_existe');
  end if;
end $$;

-- Borra su ID de ese juego. 'cerrado' si es miembro de un equipo de esports de ese juego o está en una inscripción viva
-- (por aprobar o aprobada) de un torneo de ese juego que no terminó. Si no tenía, no hace nada.
create function public.esports_delete_game_id(p_game text, p_platform text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  if exists (select 1 from public.esports_team_members m join public.esports_teams t on t.id = m.team_id
              where m.user_id = v_uid and t.game = p_game)
     or exists (select 1 from public.esports_entry_members m
                  join public.esports_entries e on e.id = m.entry_id
                  join public.esports_tournaments t on t.event_id = e.event_id
                 where m.user_id = v_uid and t.game = p_game and e.status in ('pending', 'approved')
                   and t.status in ('registration', 'live')) then
    perform private.fail('cerrado');
  end if;
  delete from public.esports_game_ids x where x.user_id = v_uid and x.game = p_game and x.platform = coalesce(p_platform, '');
end $$;

-- Sus IDs de juego con todas las columnas (camelCase), en el orden del catálogo.
create function public.esports_my_game_ids() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  return coalesce((select jsonb_agg(private.esp_game_id_json(g) order by private.esp_game_order(g.game), g.platform)
                     from public.esports_game_ids g where g.user_id = v_uid), '[]'::jsonb);
end $$;

-- Los avisos de «tu ID pasó a otra cuenta» (esports_link_account) que la cuenta no ha visto, de los últimos 30 días,
-- los más nuevos primero: [{id, game, platform, idDisplay, provider, createdAt}].
create function public.esports_my_id_moves() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'game', m.game, 'platform', m.platform, 'idDisplay', m.id_display,
                                        'provider', m.provider, 'createdAt', private.iso(m.created_at))
                     order by m.created_at desc, m.id)
      from public.esports_id_moves m
     where m.user_id = v_uid and m.seen_at is null and m.created_at > now() - interval '30 days'), '[]'::jsonb);
end $$;

-- La cuenta cerró el aviso: queda visto (otra vez, no cambia nada). 'no_existe' si no es suyo.
create function public.esports_seen_id_move(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  update public.esports_id_moves m set seen_at = coalesce(m.seen_at, now()) where m.id = p_id and m.user_id = v_uid;
  if not found then
    perform private.fail('no_existe');
  end if;
end $$;

-- Solo service_role (esports-verify): normaliza el ID con la misma regla de la base y cuenta una búsqueda de la cuenta
-- (20 por hora y 60 por día). Solo los juegos con búsqueda (LoL y VALORANT). {ok: false, reason: 'invalido' |
-- 'rate_limited'} o {ok: true, display, normalized}.
create function public.esports_begin_lookup(p_user uuid, p_game text, p_id text, p_platform text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_n jsonb;
begin
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user)
     or private.esp_verify_kind(p_game) is distinct from 'lookup' or not private.esp_platform_ok(p_game, coalesce(p_platform, '')) then
    return jsonb_build_object('ok', false, 'reason', 'invalido');
  end if;
  v_n := private.esp_normalize_id(p_game, p_id);
  if v_n is null then
    return jsonb_build_object('ok', false, 'reason', 'invalido');
  end if;
  if private.rate_blocked('esp_lookup_d:' || p_user::text, 60, interval '1 day')
     or not private.rate_take('esp_lookup:' || p_user::text, 20, interval '1 hour') then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  perform private.rate_hit('esp_lookup_d:' || p_user::text, interval '1 day');
  return jsonb_build_object('ok', true, 'display', v_n ->> 'display', 'normalized', v_n ->> 'normalized');
end $$;

-- Solo service_role (esports-verify): guarda lo que encontró la API (vale 15 minutos para confirmar) y devuelve su id.
-- Solo de los juegos con búsqueda ('invalido' si no). Los rangos solo se guardan si el juego los verifica (LoL) y
-- existen en su escalera; si no (VALORANT: solo que el ID existe), {}. Borra las búsquedas de más de un día de esa
-- cuenta.
create function public.esports_store_lookup(p_user uuid, p_game text, p_platform text, p_id text, p_found boolean,
                                            p_display text, p_external text, p_ranks jsonb, p_provider text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_n jsonb := private.esp_normalize_id(p_game, p_id);
  v_id uuid;
begin
  if p_user is null or v_n is null or private.esp_verify_kind(p_game) is distinct from 'lookup'
     or not private.esp_platform_ok(p_game, coalesce(p_platform, '')) or p_found is null
     or nullif(btrim(coalesce(p_provider, '')), '') is null then
    perform private.fail('invalido');
  end if;
  delete from private.esports_lookups x where x.user_id = p_user and x.created_at < now() - interval '1 day';
  insert into private.esports_lookups (user_id, game, platform, id_normalized, found, display_name, external_id, ranks, provider)
  values (p_user, p_game, coalesce(p_platform, ''), v_n ->> 'normalized', p_found, left(nullif(btrim(p_display), ''), 60),
          left(nullif(btrim(p_external), ''), 100),
          case when private.esp_rank_verifiable(p_game) and private.esp_ranks_ok(p_ranks) and private.esp_ranks_valid(p_game, p_ranks)
               then p_ranks else '{}'::jsonb end,
          left(btrim(p_provider), 20))
  returning id into v_id;
  return v_id;
end $$;

-- Solo service_role (esports-auth /start): un state nuevo de un uso (10 minutos) para conectar la cuenta del proveedor
-- del juego ('invalido' si no es el suyo). 10 por hora por cuenta ('rate_limited').
create function public.esports_link_begin(p_user uuid, p_provider text, p_game text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_state uuid;
begin
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user)
     or private.esp_link_provider(p_game) is distinct from p_provider then
    perform private.fail('invalido');
  end if;
  if not private.rate_take('esp_link:' || p_user::text, 10, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  delete from private.esports_link_states x where x.created_at < now() - interval '1 day';
  insert into private.esports_link_states (user_id, provider, game) values (p_user, p_provider, p_game) returning state into v_state;
  return v_state;
end $$;

-- Solo service_role (la vuelta del proveedor): el state sin usar y de menos de 10 minutos, marcado usado.
-- {userId, provider, game} o null.
create function public.esports_link_take(p_state uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s private.esports_link_states;
begin
  update private.esports_link_states x set used_at = now()
   where x.state = p_state and x.used_at is null and x.created_at > now() - interval '10 minutes'
  returning * into s;
  if s.state is null then
    return null;
  end if;
  return jsonb_build_object('userId', s.user_id, 'provider', s.provider, 'game', s.game);
end $$;

-- Solo service_role (la vuelta del proveedor): el ID de la cuenta conectada queda 'confirmado' con ownership 'login'
-- (Steam: el código de amigo, external_id = SteamID64; Epic: displayName y account_id; Riot: gameName#tagLine y puuid).
-- El login prueba que es de quien entró ahora: si OTRA cuenta lo tenía conectado (mismo ID normalizado o misma cuenta
-- externa), esa fila se borra y a esa cuenta le quedan el aviso en la app (esports_id_moves), el push
-- 'esports-id:login:<esa cuenta>' y la auditoría 'esports_id_login'. Los IDs declarados o buscados de otras cuentas no
-- se tocan (no son exclusivos). Si el ID cambia, el rango verificado de antes queda declarado. Devuelve 'ok'.
create function public.esports_link_account(p_user uuid, p_game text, p_provider text, p_external_id text, p_display text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ext text := btrim(coalesce(p_external_id, ''));
  v_raw text;
  v_n jsonb;
  v_brand text := case p_provider when 'steam' then 'Steam' when 'epic' then 'Epic' when 'riot' then 'Riot' end;
  o public.esports_game_ids;
begin
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user)
     or private.esp_link_provider(p_game) is distinct from p_provider or v_ext = '' or char_length(v_ext) > 100 then
    perform private.fail('invalido');
  end if;
  if p_provider = 'steam' then
    if v_ext !~ '^7656119[0-9]{10}$' then
      perform private.fail('invalido');
    end if;
    v_raw := (v_ext::bigint - 76561197960265728)::text;
  else
    v_raw := btrim(coalesce(p_display, ''));
  end if;
  v_n := private.esp_normalize_id(p_game, v_raw);
  if v_n is null then
    perform private.fail('invalido');
  end if;
  for o in delete from public.esports_game_ids x
            where x.game = p_game and x.platform = '' and x.user_id <> p_user and x.ownership = 'login'
              and (x.id_normalized = v_n ->> 'normalized' or x.external_id = v_ext)
           returning x.* loop
    insert into public.esports_id_moves (user_id, game, platform, id_display, provider)
    values (o.user_id, o.game, o.platform, o.id_display, p_provider);
    perform private.queue_push(o.user_id, 'liga',
      left('Tu ID ' || o.id_display || ' de ' || private.esp_game_name(p_game) || ' pasó a otra cuenta', 200),
      'Alguien entró con esa cuenta de ' || v_brand || ' en otra cuenta de MatchMate.', '/esports/mi-id?juego=' || p_game,
      'esports-id:login:' || o.user_id::text, 604800);
    perform private.audit('esports_id_login', 'user', o.user_id::text,
      jsonb_build_object('game', p_game, 'idDisplay', o.id_display, 'by', p_user, 'provider', p_provider));
  end loop;
  insert into public.esports_game_ids as x (user_id, game, platform, id_display, id_normalized, status, ownership, external_id,
                                            lookup_name, confirmed_at)
  values (p_user, p_game, '', v_n ->> 'display', v_n ->> 'normalized', 'confirmado', 'login', v_ext,
          left(nullif(btrim(p_display), ''), 60), now())
  on conflict (user_id, game, platform) do update
    set id_display = excluded.id_display, id_normalized = excluded.id_normalized, status = 'confirmado', ownership = 'login',
        external_id = excluded.external_id, lookup_name = excluded.lookup_name, confirmed_at = now(),
        rank_source = case when x.id_normalized = excluded.id_normalized then x.rank_source else 'declarado' end,
        verified_at = case when x.id_normalized = excluded.id_normalized then x.verified_at end;
  return 'ok';
end $$;

-- =====================================================================
-- 8. RPC: equipos de esports
-- =====================================================================

-- El equipo bloqueado y la cuenta es su capitán (o superadmin). 'no_existe', 'no_permitido'.
create function private.esp_team_as_captain(p_team uuid) returns public.esports_teams
language plpgsql security definer set search_path = '' as $$
declare
  t public.esports_teams;
begin
  select * into t from public.esports_teams x where x.id = p_team for update;
  if not found then
    perform private.fail('no_existe');
  end if;
  if t.captain_id is distinct from auth.uid() and not private.is_super() then
    perform private.deny();
  end if;
  return t;
end $$;

-- Cuántos equipos de esports tiene la cuenta (en ese juego, o en total con p_game null).
create function private.esp_team_count(p_user uuid, p_game text) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.esports_team_members m join public.esports_teams t on t.id = m.team_id
   where m.user_id = p_user and (p_game is null or t.game = p_game)
$$;

-- Crea un equipo de un juego de equipos o de battle royale: la cuenta (con su ID de ese juego puesto, comprobado o no;
-- si no, 'sin_id') queda de capitán, con su código para invitar. Nombre 2–40 (recortado; repetido en el juego:
-- 'duplicado'), tag en mayúsculas 2–5. Como mucho 3 equipos por juego y 10 en total por cuenta ('limite: equipos'); 5
-- por día ('rate_limited').
create function public.esports_create_team(p_game text, p_name text, p_tag text, p_description text default '',
                                           p_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_tag text := upper(btrim(coalesce(p_tag, '')));
  v_desc text := btrim(coalesce(p_description, ''));
  v_me text := (select p.name from public.profiles p where p.id = v_uid);
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_code text;
begin
  if v_me is null then
    perform private.fail('no_existe');
  end if;
  if not private.esp_game_ok(p_game) or private.esp_game_kind(p_game) = 'duel' or char_length(v_name) not between 2 and 40
     or v_tag !~ '^[A-Z0-9]{2,5}$' or char_length(v_desc) > 200 then
    perform private.fail('invalido');
  end if;
  if (private.esp_my_game_id(v_uid, p_game, '')).user_id is null then
    perform private.fail('sin_id');
  end if;
  if exists (select 1 from public.esports_teams t where t.game = p_game and private.normalize_name(t.name) = private.normalize_name(v_name)) then
    perform private.fail('duplicado');
  end if;
  if private.esp_team_count(v_uid, p_game) >= 3 or private.esp_team_count(v_uid, null) >= 10 then
    perform private.fail('limite: equipos');
  end if;
  if not private.rate_take('esp_team:' || v_uid::text, 5, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  insert into public.esports_teams (id, game, name, tag, description, captain_id, created_by)
  values (v_id, p_game, v_name, v_tag, v_desc, v_uid, v_uid);
  insert into public.esports_team_members (team_id, user_id, role, display_name) values (v_id, v_uid, 'captain', v_me);
  v_code := private.esp_new_team_code();
  insert into public.esports_team_secrets (team_id, invite_code) values (v_id, v_code);
  return jsonb_build_object('teamId', v_id, 'inviteCode', v_code);
end $$;

-- El capitán (o el superadmin) cambia el nombre, el tag o la descripción. Otra clave: 'invalido'.
create function public.esports_update_team(p_team uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.esports_teams;
  v_name text;
  v_tag text;
  v_desc text;
begin
  perform private.require_uid();
  t := private.esp_team_as_captain(p_team);
  if jsonb_typeof(p_patch) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('name', 'tag', 'description')) then
    perform private.fail('invalido');
  end if;
  v_name := case when p_patch ? 'name' then btrim(coalesce(p_patch ->> 'name', '')) else t.name end;
  v_tag := case when p_patch ? 'tag' then upper(btrim(coalesce(p_patch ->> 'tag', ''))) else t.tag end;
  v_desc := case when p_patch ? 'description' then btrim(coalesce(p_patch ->> 'description', '')) else t.description end;
  if char_length(v_name) not between 2 and 40 or v_tag !~ '^[A-Z0-9]{2,5}$' or char_length(v_desc) > 200 then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.esports_teams x where x.game = t.game and x.id <> t.id
                and private.normalize_name(x.name) = private.normalize_name(v_name)) then
    perform private.fail('duplicado');
  end if;
  update public.esports_teams x set name = v_name, tag = v_tag, description = v_desc
   where x.id = t.id and (x.name, x.tag, x.description) is distinct from (v_name, v_tag, v_desc);
end $$;

-- El capitán (o el superadmin) borra el equipo. Sus inscripciones vivas en torneos que todavía inscriben se retiran; en
-- un torneo en curso: 'cerrado'. Las inscripciones viejas quedan con su nombre (team_id null).
create function public.esports_delete_team(p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.esports_teams;
  e record;
begin
  perform private.require_uid();
  t := private.esp_team_as_captain(p_team);
  if exists (select 1 from public.esports_entries x join public.esports_tournaments s on s.event_id = x.event_id
              where x.team_id = t.id and x.status in ('pending', 'approved') and s.status = 'live') then
    perform private.fail('cerrado');
  end if;
  for e in select x.id from public.esports_entries x join public.esports_tournaments s on s.event_id = x.event_id
            where x.team_id = t.id and x.status in ('pending', 'approved') and s.status = 'registration' loop
    update public.esports_entries x set status = 'withdrawn' where x.id = e.id;
    delete from public.esports_entry_members m where m.entry_id = e.id;
    perform private.esp_dematerialize(e.id);
  end loop;
  delete from public.esports_teams x where x.id = t.id;
end $$;

-- El código para invitar (capitán o superadmin).
create function public.esports_team_code(p_team uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  t public.esports_teams;
begin
  perform private.require_uid();
  select * into t from public.esports_teams x where x.id = p_team;
  if t.id is null then
    perform private.fail('no_existe');
  end if;
  if t.captain_id is distinct from auth.uid() and not private.is_super() then
    perform private.deny();
  end if;
  return (select s.invite_code from public.esports_team_secrets s where s.team_id = p_team);
end $$;

-- Código nuevo (el anterior deja de servir).
create function public.esports_renew_team_code(p_team uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  t public.esports_teams;
  v_code text;
begin
  perform private.require_uid();
  t := private.esp_team_as_captain(p_team);
  v_code := private.esp_new_team_code();
  insert into public.esports_team_secrets as s (team_id, invite_code) values (t.id, v_code)
  on conflict (team_id) do update set invite_code = excluded.invite_code;
  return v_code;
end $$;

-- A qué equipo lleva un código (también sin cuenta). Código malo: ninguna fila (cuenta el intento; 30 por hora por
-- cuenta o IP: 'rate_limited'). Mayúsculas y espacios no importan.
create function public.esports_team_preview(p_code text)
returns table (team_id uuid, game text, name text, tag text, logo_path text, member_count smallint)
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := private.rate_key('esp_preview');
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
begin
  if private.rate_blocked(v_key, 30, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  return query
    select t.id, t.game, t.name, t.tag, t.logo_path, t.member_count
      from public.esports_team_secrets s join public.esports_teams t on t.id = s.team_id
     where s.invite_code = v_code;
  if not found then
    perform private.rate_hit(v_key, interval '1 hour');
  end if;
end $$;

-- Entrar a un equipo con su código. Código malo: null (cuenta el intento; 10 por hora: 'rate_limited'). Ya es miembro:
-- lo mismo. 'sin_id' (no puso su ID del juego; comprobado o no, da igual), 'cupo_lleno' (el equipo llegó al máximo
-- de plantilla del juego), 'limite: equipos' (3 por juego, 10 en total). Entra como titular ('member').
create function public.esports_join_team(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_key text := 'esp_join:' || v_uid::text;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_me text := (select p.name from public.profiles p where p.id = v_uid);
  t public.esports_teams;
begin
  if v_me is null then
    perform private.fail('no_existe');
  end if;
  if private.rate_blocked(v_key, 10, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  select x.* into t from public.esports_team_secrets s join public.esports_teams x on x.id = s.team_id
   where s.invite_code = v_code for update of x;
  if t.id is null then
    perform private.rate_hit(v_key, interval '1 hour');
    return null;
  end if;
  if exists (select 1 from public.esports_team_members m where m.team_id = t.id and m.user_id = v_uid) then
    return jsonb_build_object('teamId', t.id);
  end if;
  if (private.esp_my_game_id(v_uid, t.game, '')).user_id is null then
    perform private.fail('sin_id');
  end if;
  if (select count(*) from public.esports_team_members m where m.team_id = t.id) >= private.esp_team_max(t.game) then
    perform private.fail('cupo_lleno');
  end if;
  if private.esp_team_count(v_uid, t.game) >= 3 or private.esp_team_count(v_uid, null) >= 10 then
    perform private.fail('limite: equipos');
  end if;
  insert into public.esports_team_members (team_id, user_id, role, display_name) values (t.id, v_uid, 'member', v_me);
  return jsonb_build_object('teamId', t.id);
end $$;

-- Salir del equipo. El capitán no sale si quedan otros ('invalido': primero pasa la capitanía); si es el único, el
-- equipo se borra. 'no_existe' si no es miembro.
create function public.esports_leave_team(p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_role text;
begin
  perform 1 from public.esports_teams x where x.id = p_team for update;
  select m.role into v_role from public.esports_team_members m where m.team_id = p_team and m.user_id = v_uid;
  if v_role is null then
    perform private.fail('no_existe');
  end if;
  if v_role = 'captain' and exists (select 1 from public.esports_team_members m where m.team_id = p_team and m.user_id <> v_uid) then
    perform private.fail('invalido');
  end if;
  -- El último que sale se lleva el equipo (lo borra el trigger de los miembros).
  delete from public.esports_team_members m where m.team_id = p_team and m.user_id = v_uid;
end $$;

-- El capitán saca a un miembro (no a sí mismo: 'invalido'). 'no_existe' si no es miembro.
create function public.esports_remove_member(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.esports_teams;
begin
  perform private.require_uid();
  t := private.esp_team_as_captain(p_team);
  if p_user is not distinct from t.captain_id then
    perform private.fail('invalido');
  end if;
  delete from public.esports_team_members m where m.team_id = t.id and m.user_id = p_user;
  if not found then
    perform private.fail('no_existe');
  end if;
end $$;

-- El capitán cambia el rol de un miembro: 'member' (titular) o 'sub' (suplente); 'captain' pasa la capitanía (el
-- anterior queda titular). 'invalido' (otro rol, o bajarse a sí mismo sin pasarla), 'no_existe' (no es miembro).
create function public.esports_set_member_role(p_team uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.esports_teams;
  v_old text;
begin
  perform private.require_uid();
  t := private.esp_team_as_captain(p_team);
  if p_role is null or p_role not in ('captain', 'member', 'sub') then
    perform private.fail('invalido');
  end if;
  select m.role into v_old from public.esports_team_members m where m.team_id = t.id and m.user_id = p_user;
  if v_old is null then
    perform private.fail('no_existe');
  end if;
  if v_old = p_role then
    return;
  end if;
  if v_old = 'captain' then
    perform private.fail('invalido');
  end if;
  if p_role = 'captain' then
    update public.esports_team_members m set role = 'member' where m.team_id = t.id and m.role = 'captain';
    update public.esports_team_members m set role = 'captain' where m.team_id = t.id and m.user_id = p_user;
    update public.esports_teams x set captain_id = p_user where x.id = t.id;
  else
    update public.esports_team_members m set role = p_role where m.team_id = t.id and m.user_id = p_user;
  end if;
end $$;

-- El capitán, antes de subir el logo: reserva la ruta '<p_team>/<uuid>.webp|.jpg|.png' (nueva: ni reservada, ni en la
-- cola de Storage, ni el logo de ahora). Como begin_logo_upload: la misma reserva (private.logo_uploads, con el equipo
-- en league_id) y el mismo límite 'logo:<cuenta>' (30 por día). 'no_existe', 'no_permitido', 'invalido', 'rate_limited'.
create function public.esports_begin_team_logo(p_team uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  t public.esports_teams;
begin
  t := private.esp_team_as_captain(p_team);
  if p_path is null or p_path !~ ('^' || t.id::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$')
     or exists (select 1 from private.logo_uploads u where u.path = p_path)
     or exists (select 1 from private.storage_purge_queue q where q.path = p_path)
     or t.logo_path is not distinct from p_path then
    perform private.fail('invalido');
  end if;
  if not private.rate_take('logo:' || v_uid::text, 30, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  insert into private.logo_uploads (path, league_id, user_id) values (p_path, t.id, v_uid);
end $$;

-- El capitán pone el logo (una ruta que reservó hace menos de un día; se usa una vez) o lo quita (null). Devuelve la
-- ruta anterior (ya en la cola de Storage) o null. Como set_league_logo.
create function public.esports_set_team_logo(p_team uuid, p_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  t public.esports_teams;
begin
  t := private.esp_team_as_captain(p_team);
  if p_path is not null and p_path !~ ('^' || t.id::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$') then
    perform private.fail('invalido');
  end if;
  if p_path is not distinct from t.logo_path then
    return null;
  end if;
  if p_path is null then
    if not private.rate_take('logo:' || v_uid::text, 30, interval '1 day') then
      perform private.fail('rate_limited');
    end if;
  else
    delete from private.logo_uploads u
     where u.path = p_path and u.league_id = t.id and u.user_id = v_uid and u.created_at > now() - interval '1 day';
    if not found then
      perform private.fail('invalido');
    end if;
  end if;
  update public.esports_teams x set logo_path = p_path where x.id = t.id;
  return t.logo_path;
end $$;

-- =====================================================================
-- 9. RPC: torneos e inscripciones
-- =====================================================================

-- Suplentes permitidos en el torneo (settings.subs, o los de por defecto del modo).
create function private.esp_subs(t public.esports_tournaments) returns integer
language sql immutable set search_path = '' as $$
  select case when private.esp_int(t.settings -> 'subs', 0, 2) then (t.settings ->> 'subs')::integer
              else private.esp_subs_default(t.game, t.mode) end
$$;

-- Inscritos aprobados que ocupan cupo (equipos e individuales; los agentes libres no).
create function private.esp_approved(p_event uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.esports_entries e
   where e.event_id = p_event and e.status = 'approved' and e.kind in ('team', 'player')
$$;

-- La plantilla que manda el teléfono, revisada (§5.2 paso 5): [{user_id, role: 'captain' | 'member' | 'sub'}] sin
-- repetir, con un solo capitán (p_captain si viene: siempre adentro y como capitán), entre modeSize y modeSize + subs
-- personas, al menos modeSize titulares (capitán y 'member') y como mucho subs suplentes. Devuelve la lista con el
-- capitán primero. 'invalido' si no.
create function private.esp_roster(t public.esports_tournaments, p_members jsonb, p_captain uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_size integer := private.esp_mode_size(t.mode);
  v_subs integer := private.esp_subs(t);
  v_captain uuid := p_captain;
  v_users uuid[] := '{}';
  v_roles text[] := '{}';
  x jsonb;
  v_user uuid;
  v_role text;
  v_out jsonb;
begin
  if jsonb_typeof(p_members) is distinct from 'array' or jsonb_array_length(p_members) > 20 then
    perform private.fail('invalido');
  end if;
  for x in select a.x from jsonb_array_elements(p_members) with ordinality as a (x, n) order by a.n loop
    if jsonb_typeof(x) <> 'object' or nullif(x ->> 'user_id', '') is null then
      perform private.fail('invalido');
    end if;
    v_user := (x ->> 'user_id')::uuid;
    v_role := coalesce(nullif(x ->> 'role', ''), 'member');
    if v_role not in ('captain', 'member', 'sub') or v_user = any (v_users) then
      perform private.fail('invalido');
    end if;
    if v_user = p_captain then
      v_role := 'captain';
    elsif v_role = 'captain' then
      if p_captain is not null or v_captain is not null then
        perform private.fail('invalido');
      end if;
      v_captain := v_user;
    end if;
    v_users := v_users || v_user;
    v_roles := v_roles || v_role;
  end loop;
  if v_captain is null then
    perform private.fail('invalido');
  end if;
  if not (v_captain = any (v_users)) then
    v_users := v_users || v_captain;
    v_roles := v_roles || 'captain'::text;
  end if;
  if cardinality(v_users) not between v_size and v_size + v_subs
     or (select count(*) from unnest(v_roles) r where r in ('captain', 'member')) < v_size
     or (select count(*) from unnest(v_roles) r where r = 'sub') > v_subs then
    perform private.fail('invalido');
  end if;
  select jsonb_agg(jsonb_build_object('user_id', u.user_id, 'role', u.role) order by (u.role <> 'captain'), u.n) into v_out
    from unnest(v_users, v_roles) with ordinality as u (user_id, role, n);
  return v_out;
end $$;

-- §5.2 paso 4 para cada persona de la plantilla: su ID (sin_id / id_sin_comprobar / sin_rango con private.esp_member_ok,
-- con su nombre en el detail) y que no esté en otra inscripción viva del torneo ('duplicado'). p_entry: la inscripción
-- que se está cambiando (la propia no cuenta).
create function private.esp_check_members(t public.esports_tournaments, p_users uuid[], p_entry uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid;
  v_err text;
begin
  foreach v_user in array p_users loop
    v_err := private.esp_member_ok(v_user, t.game, t.settings, t.mode);
    if v_err is not null then
      raise exception '%', v_err using errcode = 'P0001',
        detail = coalesce((select p.name from public.profiles p where p.id = v_user), '');
    end if;
    if exists (select 1 from public.esports_entry_members m
                where m.event_id = t.event_id and m.user_id = v_user and m.entry_id is distinct from p_entry) then
      perform private.fail('duplicado');
    end if;
  end loop;
end $$;

-- La fila de la foto de una persona (nombre, ID de juego y rango del momento).
create function private.esp_snapshot(p_entry uuid, p_user uuid, p_role text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.esports_entries;
  t public.esports_tournaments;
  g public.esports_game_ids;
begin
  select * into e from public.esports_entries x where x.id = p_entry;
  select * into t from public.esports_tournaments x where x.event_id = e.event_id;
  g := private.esp_my_game_id(p_user, t.game, case when t.game = 'nba_2k' then coalesce(t.settings ->> 'platform', '') else '' end);
  if g.user_id is null then
    raise exception 'sin_id' using errcode = 'P0001', detail = coalesce((select p.name from public.profiles p where p.id = p_user), '');
  end if;
  insert into public.esports_entry_members (entry_id, event_id, league_id, user_id, role, display_name, gamer_tag, ranks, rank_source)
  values (p_entry, e.event_id, e.league_id, p_user, p_role,
          left(coalesce(nullif(btrim(p_name), ''), (select p.name from public.profiles p where p.id = p_user), 'Jugador'), 60),
          g.id_display, g.ranks, g.rank_source);
end $$;

-- Crea un torneo de esports de un juego. Sin p_league: su liga de un solo torneo (create_league con kind 'torneo',
-- sport 'esports', rules {game}; el tope de 5 por día y 20 al mes). Con p_league: dentro de esa liga de esports del
-- mismo juego (admin). Después el evento 'torneo' (fecha y hora del inicio en la zona de la liga) y su fila de
-- esports_tournaments. Los checks de la tabla dan 'invalido'. inviteCode solo si la liga es privada.
create function public.esports_create_tournament(
  p_game text,
  p_name text,
  p_mode text,
  p_entry_type text,
  p_format text,
  p_starts_at timestamptz,
  p_max_entries integer,
  p_settings jsonb,
  p_visibility text default 'public',
  p_league uuid default null,
  p_registration_opens_at timestamptz default null,
  p_registration_closes_at timestamptz default null,
  p_checkin_minutes integer default null,
  p_venue text default '',
  p_announcement text default '',
  p_prize_text text default '',
  p_tz text default 'America/Santo_Domingo',
  p_id uuid default null,
  p_event_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_event uuid := coalesce(p_event_id, gen_random_uuid());
  v_league uuid;
  v_code text;
  v_vis text;
  v_tz text;
  l public.leagues;
  r jsonb;
begin
  if not private.esp_game_ok(p_game) or not private.esp_mode_ok(p_game, p_mode) or p_entry_type is null
     or p_entry_type not in ('teams', 'open') or p_format is null
     or p_format not in ('single_elim', 'double_elim', 'groups_playoffs', 'round_robin', 'br')
     or (p_format = 'br') <> (private.esp_game_kind(p_game) = 'br') or p_starts_at is null or p_max_entries is null
     or jsonb_typeof(p_settings) is distinct from 'object' or char_length(v_name) not between 1 and 80
     or char_length(coalesce(p_announcement, '')) > 1000 or char_length(coalesce(p_prize_text, '')) > 120
     or (p_format = 'br' and p_max_entries > private.esp_lobby(p_game, p_mode)) then
    perform private.fail('invalido');
  end if;
  if p_league is null then
    perform private.check_tz(p_tz);
    r := public.create_league(p_name => v_name, p_visibility => coalesce(p_visibility, 'public'), p_kind => 'torneo',
                              p_sport => 'esports', p_venue => coalesce(p_venue, ''),
                              p_season_start => (p_starts_at at time zone p_tz)::date,
                              p_season_end => (p_starts_at at time zone p_tz)::date, p_tz => p_tz,
                              p_rules => jsonb_build_object('game', p_game), p_id => p_id);
    v_league := (r ->> 'league_id')::uuid;
    v_code := r ->> 'invite_code';
  else
    select * into l from public.leagues x where x.id = p_league;
    if l.id is null then
      perform private.fail('no_existe');
    end if;
    perform private.require_admin(p_league);
    if l.sport <> 'esports' or l.rules ->> 'game' is distinct from p_game then
      perform private.fail('invalido');
    end if;
    v_league := p_league;
    v_code := (select s.invite_code from public.league_secrets s where s.league_id = p_league);
  end if;
  select x.visibility, x.tz into v_vis, v_tz from public.leagues x where x.id = v_league;
  insert into public.events (id, league_id, type, name, date, start_time, announcement, created_by)
  values (v_event, v_league, 'torneo', v_name, (p_starts_at at time zone v_tz)::date, (p_starts_at at time zone v_tz)::time,
          coalesce(p_announcement, ''), v_uid);
  begin
    insert into public.esports_tournaments (event_id, league_id, game, mode, entry_type, format, starts_at, registration_opens_at,
                                            registration_closes_at, checkin_minutes, max_entries, settings, prize_text)
    values (v_event, v_league, p_game, p_mode, p_entry_type, p_format, p_starts_at, p_registration_opens_at,
            coalesce(p_registration_closes_at, p_starts_at), p_checkin_minutes, p_max_entries, p_settings,
            btrim(coalesce(p_prize_text, '')));
  exception when check_violation or not_null_violation or numeric_value_out_of_range then
    perform private.fail('invalido');
  end;
  return jsonb_build_object('leagueId', v_league, 'eventId', v_event, 'inviteCode', case when v_vis = 'private' then v_code end);
end $$;

-- Admin: cambia el torneo. Claves: name (el evento y, en un torneo suelto, la liga), starts_at (y la fecha del evento),
-- registration_opens_at, registration_closes_at, checkin_minutes, max_entries (no menos que los aprobados), prize_text,
-- announcement; y solo en inscripción y sin fases ni partidas ('cerrado' si no): mode, entry_type, format, settings.
-- Otra clave o un valor que no sirve: 'invalido'.
create function public.esports_update_tournament(p_event uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.esports_tournaments;
  n public.esports_tournaments;
  v_name text;
  v_tz text;
  v_kind text;
  v_announce text;
begin
  perform private.require_uid();
  t := private.esp_tournament_for_update(p_event);
  perform private.require_admin(t.league_id);
  if jsonb_typeof(p_patch) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k
                 where k not in ('name', 'starts_at', 'registration_opens_at', 'registration_closes_at', 'checkin_minutes',
                                 'max_entries', 'prize_text', 'announcement', 'mode', 'entry_type', 'format', 'settings')) then
    perform private.fail('invalido');
  end if;
  if (p_patch ?| array['mode', 'entry_type', 'format', 'settings'])
     and (t.status <> 'registration' or exists (select 1 from public.esports_matches x where x.event_id = t.event_id)
          or exists (select 1 from public.esports_br_games x where x.event_id = t.event_id)) then
    perform private.fail('cerrado');
  end if;
  n := t;
  begin
    if p_patch ? 'starts_at' then n.starts_at := (p_patch ->> 'starts_at')::timestamptz; end if;
    if p_patch ? 'registration_opens_at' then n.registration_opens_at := (p_patch ->> 'registration_opens_at')::timestamptz; end if;
    if p_patch ? 'registration_closes_at' then
      n.registration_closes_at := coalesce((p_patch ->> 'registration_closes_at')::timestamptz, n.starts_at);
    end if;
    if p_patch ? 'checkin_minutes' then n.checkin_minutes := (p_patch ->> 'checkin_minutes')::numeric::smallint; end if;
    if p_patch ? 'max_entries' then n.max_entries := (p_patch ->> 'max_entries')::numeric::smallint; end if;
    if p_patch ? 'prize_text' then n.prize_text := btrim(coalesce(p_patch ->> 'prize_text', '')); end if;
    if p_patch ? 'mode' then n.mode := p_patch ->> 'mode'; end if;
    if p_patch ? 'entry_type' then n.entry_type := p_patch ->> 'entry_type'; end if;
    if p_patch ? 'format' then n.format := p_patch ->> 'format'; end if;
    if p_patch ? 'settings' then n.settings := p_patch -> 'settings'; end if;
  exception when data_exception then
    perform private.fail('invalido');
  end;
  if n.max_entries is null or n.max_entries < private.esp_approved(t.event_id)
     or (n.format = 'br' and n.max_entries > coalesce(private.esp_lobby(n.game, n.mode), 0))
     or jsonb_typeof(n.settings) is distinct from 'object' then
    perform private.fail('invalido');
  end if;
  begin
    update public.esports_tournaments x
       set starts_at = n.starts_at, registration_opens_at = n.registration_opens_at,
           registration_closes_at = n.registration_closes_at, checkin_minutes = n.checkin_minutes, max_entries = n.max_entries,
           prize_text = n.prize_text, mode = n.mode, entry_type = n.entry_type, format = n.format, settings = n.settings
     where x.event_id = t.event_id
       and (x.starts_at, x.registration_opens_at, x.registration_closes_at, x.checkin_minutes, x.max_entries, x.prize_text,
            x.mode, x.entry_type, x.format, x.settings)
           is distinct from (n.starts_at, n.registration_opens_at, n.registration_closes_at, n.checkin_minutes, n.max_entries,
                             n.prize_text, n.mode, n.entry_type, n.format, n.settings);
  exception when check_violation or not_null_violation or numeric_value_out_of_range then
    perform private.fail('invalido');
  end;
  select l.tz, l.kind into v_tz, v_kind from public.leagues l where l.id = t.league_id;
  v_name := case when p_patch ? 'name' then btrim(coalesce(p_patch ->> 'name', '')) end;
  v_announce := case when p_patch ? 'announcement' then coalesce(p_patch ->> 'announcement', '') end;
  if v_name is not null and char_length(v_name) not between 1 and 80 or char_length(v_announce) > 1000 then
    perform private.fail('invalido');
  end if;
  update public.events e
     set name = coalesce(v_name, e.name), announcement = coalesce(v_announce, e.announcement),
         date = (n.starts_at at time zone v_tz)::date, start_time = (n.starts_at at time zone v_tz)::time
   where e.id = t.event_id
     and (e.name, e.announcement, e.date, e.start_time) is distinct from
         (coalesce(v_name, e.name), coalesce(v_announce, e.announcement), (n.starts_at at time zone v_tz)::date,
          (n.starts_at at time zone v_tz)::time);
  if v_name is not null and v_kind = 'torneo' then
    update public.leagues l set name = private.clean_name(left(v_name, 60)) where l.id = t.league_id and l.name is distinct from left(v_name, 60);
  end if;
end $$;

-- Admin: el estado del torneo (§5.5). registration → live («Empezar»), live → finished («Cerrar torneo»),
-- registration | live → cancelled, live → registration (solo sin partidos ni partidas), cancelled → registration. Otro
-- cambio: 'invalido'.
create function public.esports_set_status(p_event uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.esports_tournaments;
begin
  perform private.require_uid();
  t := private.esp_tournament_for_update(p_event);
  perform private.require_admin(t.league_id);
  if p_status is not distinct from t.status then
    return;
  end if;
  if not ((t.status = 'registration' and p_status in ('live', 'cancelled'))
          or (t.status = 'live' and p_status in ('finished', 'cancelled'))
          or (t.status = 'live' and p_status = 'registration'
              and not exists (select 1 from public.esports_matches x where x.event_id = t.event_id)
              and not exists (select 1 from public.esports_br_games x where x.event_id = t.event_id))
          or (t.status = 'cancelled' and p_status = 'registration')) then
    perform private.fail('invalido');
  end if;
  update public.esports_tournaments x set status = p_status where x.event_id = t.event_id;
end $$;

-- El capitán inscribe a su equipo de esports del juego del torneo con su plantilla (§5.2): p_members = [{user_id, role:
-- 'member' | 'sub'}] de miembros actuales del equipo (el capitán va solo). 'cerrado' (fuera de la inscripción),
-- 'no_permitido' (torneo privado y no es de la liga), 'no_existe' (equipo), 'invalido' (no es el capitán, otro juego,
-- modo individual, plantilla corta o larga, alguien que no es del equipo), 'duplicado' (el equipo ya está, o alguien ya
-- está en otra inscripción), 'sin_id' / 'id_sin_comprobar' / 'sin_rango' (con el nombre en el detail), 'cupo_lleno'.
-- Con autoApprove queda aprobado y materializado; si no, pendiente (push a los admins). Devuelve el id del inscrito.
create function public.esports_register_team(p_event uuid, p_team uuid, p_members jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  t public.esports_tournaments;
  team public.esports_teams;
  v_roster jsonb;
  v_users uuid[];
  v_id uuid := gen_random_uuid();
  v_auto boolean;
  x jsonb;
begin
  t := private.esp_tournament_for_update(p_event);
  if not private.esp_registration_open(t) then
    perform private.fail('cerrado');
  end if;
  if (select l.visibility from public.leagues l where l.id = t.league_id) = 'private' and not private.is_member(t.league_id)
     and not private.is_super() then
    perform private.deny();
  end if;
  select * into team from public.esports_teams x where x.id = p_team for share;
  if team.id is null then
    perform private.fail('no_existe');
  end if;
  if team.captain_id is distinct from v_uid or team.game <> t.game or private.esp_mode_size(t.mode) <= 1 then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.esports_entries e where e.event_id = t.event_id and e.team_id = team.id and e.status in ('pending', 'approved')) then
    perform private.fail('duplicado');
  end if;
  v_roster := private.esp_roster(t, p_members, v_uid);
  v_users := array(select (y ->> 'user_id')::uuid from jsonb_array_elements(v_roster) y);
  if exists (select 1 from unnest(v_users) u
              where not exists (select 1 from public.esports_team_members m where m.team_id = team.id and m.user_id = u)) then
    perform private.fail('invalido');
  end if;
  perform private.esp_check_members(t, v_users, null);
  if private.esp_approved(t.event_id) >= t.max_entries then
    perform private.fail('cupo_lleno');
  end if;
  v_auto := coalesce(t.settings -> 'autoApprove' = 'true'::jsonb, false);
  insert into public.esports_entries (id, league_id, event_id, kind, team_id, name, tag, captain_id, status, created_by)
  values (v_id, t.league_id, t.event_id, 'team', team.id, left(team.name, 40), team.tag, v_uid,
          case when v_auto then 'approved' else 'pending' end, v_uid);
  for x in select y from jsonb_array_elements(v_roster) y loop
    perform private.esp_snapshot(v_id, (x ->> 'user_id')::uuid, x ->> 'role',
      (select m.display_name from public.esports_team_members m where m.team_id = team.id and m.user_id = (x ->> 'user_id')::uuid));
  end loop;
  if v_auto then
    perform private.esp_materialize(v_id);
  else
    perform private.esp_push_pending(v_id);
  end if;
  return v_id;
end $$;

-- La cuenta se inscribe sola: en un modo de 1 titular, como individual ('player'); en un modo de equipo con entrada
-- libre, como agente libre ('free_agent'; si no, 'invalido'). Los agentes libres no ocupan cupo (tope: cupo × titulares).
-- Mismas reglas que la de equipos. Devuelve el id del inscrito.
create function public.esports_register_solo(p_event uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_me text := (select p.name from public.profiles p where p.id = v_uid);
  t public.esports_tournaments;
  v_kind text;
  v_id uuid := gen_random_uuid();
  v_auto boolean;
begin
  if v_me is null then
    perform private.fail('no_existe');
  end if;
  t := private.esp_tournament_for_update(p_event);
  if not private.esp_registration_open(t) then
    perform private.fail('cerrado');
  end if;
  if (select l.visibility from public.leagues l where l.id = t.league_id) = 'private' and not private.is_member(t.league_id)
     and not private.is_super() then
    perform private.deny();
  end if;
  v_kind := case when private.esp_mode_size(t.mode) = 1 then 'player' when t.entry_type = 'open' then 'free_agent' end;
  if v_kind is null then
    perform private.fail('invalido');
  end if;
  perform private.esp_check_members(t, array[v_uid], null);
  if v_kind = 'player' and private.esp_approved(t.event_id) >= t.max_entries then
    perform private.fail('cupo_lleno');
  end if;
  if v_kind = 'free_agent' and (select count(*) from public.esports_entries e
                                 where e.event_id = t.event_id and e.kind = 'free_agent' and e.status in ('pending', 'approved'))
                                >= t.max_entries * private.esp_mode_size(t.mode) then
    perform private.fail('cupo_lleno');
  end if;
  v_auto := coalesce(t.settings -> 'autoApprove' = 'true'::jsonb, false);
  insert into public.esports_entries (id, league_id, event_id, kind, name, captain_id, status, created_by)
  values (v_id, t.league_id, t.event_id, v_kind, left(v_me, 40), v_uid, case when v_auto then 'approved' else 'pending' end, v_uid);
  perform private.esp_snapshot(v_id, v_uid, 'captain', v_me);
  if v_auto then
    perform private.esp_materialize(v_id);
  else
    perform private.esp_push_pending(v_id);
  end if;
  return v_id;
end $$;

-- Cambia la plantilla de un inscrito 'team' (la foto): el capitán mientras el torneo está en inscripción; el admin
-- siempre (no en un torneo terminado o cancelado). Mismas reglas que al inscribir. Los nuevos tienen que ser miembros
-- del equipo de esports enlazado, o ya estar en la foto, o (solo el admin) agentes libres vivos del torneo, que se
-- mueven aquí (quedan 'assigned'). El admin puede cambiar el capitán (un 'captain' en la lista). Si ya estaba
-- materializado, la plantilla de la liga queda igual a la foto.
create function public.esports_set_entry_roster(p_entry uuid, p_members jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_event uuid := (select x.event_id from public.esports_entries x where x.id = p_entry);
  t public.esports_tournaments;
  e public.esports_entries;
  v_admin boolean;
  v_captain uuid;
  v_roster jsonb;
  v_new uuid[];
  v_fa uuid;
  x jsonb;
  v_user uuid;
begin
  if v_event is null then
    perform private.fail('no_existe');
  end if;
  t := private.esp_tournament_for_update(v_event);
  e := private.esp_entry_for_update(p_entry);
  v_admin := private.is_admin(t.league_id);
  if not v_admin and e.captain_id is distinct from v_uid then
    perform private.deny();
  end if;
  if t.status in ('finished', 'cancelled') or (not v_admin and t.status <> 'registration') then
    perform private.fail('cerrado');
  end if;
  if e.kind <> 'team' or e.status not in ('pending', 'approved') then
    perform private.fail('invalido');
  end if;
  v_captain := e.captain_id;
  if v_admin and jsonb_typeof(p_members) = 'array' then
    v_captain := coalesce((select (y ->> 'user_id')::uuid from jsonb_array_elements(p_members) y where y ->> 'role' = 'captain' limit 1),
                          e.captain_id);
  end if;
  v_roster := private.esp_roster(t, p_members, v_captain);
  -- Los que no estaban en la foto.
  v_new := array(select (y ->> 'user_id')::uuid from jsonb_array_elements(v_roster) y
                  where not exists (select 1 from public.esports_entry_members m
                                     where m.entry_id = e.id and m.user_id = (y ->> 'user_id')::uuid));
  foreach v_user in array v_new loop
    if not ((e.team_id is not null and exists (select 1 from public.esports_team_members m where m.team_id = e.team_id and m.user_id = v_user))
            or (v_admin and exists (select 1 from public.esports_entries f
                                     where f.event_id = t.event_id and f.kind = 'free_agent' and f.status in ('pending', 'approved')
                                       and f.captain_id = v_user))) then
      perform private.fail('invalido');
    end if;
  end loop;
  -- Los que vienen del equipo: su ID y que no estén en otra inscripción; los agentes libres ya están en la foto de su
  -- inscripción de agente (se mueven).
  perform private.esp_check_members(t,
    array(select u from unnest(v_new) u
           where not exists (select 1 from public.esports_entries f where f.event_id = t.event_id and f.kind = 'free_agent'
                               and f.status in ('pending', 'approved') and f.captain_id = u)), e.id);
  delete from public.esports_entry_members m
   where m.entry_id = e.id and m.user_id not in (select (y ->> 'user_id')::uuid from jsonb_array_elements(v_roster) y);
  -- Primero se baja el capitán que deja de serlo (el índice único de capitán no admite dos a la vez).
  update public.esports_entry_members m set role = 'member'
   where m.entry_id = e.id and m.role = 'captain' and m.user_id <> v_captain;
  for x in select y from jsonb_array_elements(v_roster) y loop
    v_user := (x ->> 'user_id')::uuid;
    if exists (select 1 from public.esports_entry_members m where m.entry_id = e.id and m.user_id = v_user) then
      update public.esports_entry_members m set role = x ->> 'role'
       where m.entry_id = e.id and m.user_id = v_user and m.role <> x ->> 'role';
    else
      select f.id into v_fa from public.esports_entries f
       where f.event_id = t.event_id and f.kind = 'free_agent' and f.status in ('pending', 'approved') and f.captain_id = v_user
       limit 1;
      if v_fa is not null then
        update public.esports_entry_members m set entry_id = e.id, role = x ->> 'role' where m.entry_id = v_fa and m.user_id = v_user;
        update public.esports_entries f set status = 'assigned', assigned_entry = e.id where f.id = v_fa;
      else
        perform private.esp_snapshot(e.id, v_user, x ->> 'role',
          (select m.display_name from public.esports_team_members m where m.team_id = e.team_id and m.user_id = v_user));
      end if;
    end if;
  end loop;
  if e.captain_id is distinct from v_captain then
    update public.esports_entries x set captain_id = v_captain where x.id = e.id;
  end if;
  perform private.esp_sync_roster(e.id);
end $$;

-- Admin: cambia el nombre, el tag, la siembra o la nota de un inscrito (y el nombre de su equipo de temporada). Otra
-- clave: 'invalido'.
create function public.esports_update_entry(p_entry uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.esports_entries;
  v_name text;
  v_tag text;
  v_seed smallint;
  v_note text;
begin
  perform private.require_uid();
  e := private.esp_entry_for_update(p_entry);
  perform private.require_admin(e.league_id);
  if jsonb_typeof(p_patch) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('name', 'tag', 'seed', 'note')) then
    perform private.fail('invalido');
  end if;
  v_name := case when p_patch ? 'name' then btrim(coalesce(p_patch ->> 'name', '')) else e.name end;
  v_tag := case when p_patch ? 'tag' then upper(btrim(coalesce(p_patch ->> 'tag', ''))) else e.tag end;
  v_note := case when p_patch ? 'note' then nullif(btrim(coalesce(p_patch ->> 'note', '')), '') else e.note end;
  if p_patch ? 'seed' then
    if jsonb_typeof(p_patch -> 'seed') = 'null' then
      v_seed := null;
    elsif private.esp_int(p_patch -> 'seed', 1, 128) then
      v_seed := (p_patch ->> 'seed')::numeric::smallint;
    else
      perform private.fail('invalido');
    end if;
  else
    v_seed := e.seed;
  end if;
  if char_length(v_name) not between 1 and 40 or v_tag !~ '^[A-Z0-9]{0,5}$' or char_length(v_note) > 200 then
    perform private.fail('invalido');
  end if;
  update public.esports_entries x set name = v_name, tag = v_tag, seed = v_seed, note = v_note
   where x.id = e.id and (x.name, x.tag, x.seed, x.note) is distinct from (v_name, v_tag, v_seed, v_note);
  if e.side_team_id is not null then
    update public.teams t set name = v_name, sort_order = coalesce(v_seed, 999)
     where t.id = e.side_team_id and (t.name, t.sort_order) is distinct from (v_name, coalesce(v_seed, 999));
  end if;
end $$;

-- El capitán (o el individual, o el admin) retira la inscripción, solo mientras el torneo está en inscripción
-- ('cerrado' si no): queda 'withdrawn', se borra la foto y el equipo de temporada.
create function public.esports_withdraw(p_entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_event uuid := (select x.event_id from public.esports_entries x where x.id = p_entry);
  t public.esports_tournaments;
  e public.esports_entries;
begin
  if v_event is null then
    perform private.fail('no_existe');
  end if;
  t := private.esp_tournament_for_update(v_event);
  e := private.esp_entry_for_update(p_entry);
  if e.captain_id is distinct from v_uid and not private.is_admin(t.league_id) then
    perform private.deny();
  end if;
  if t.status <> 'registration' then
    perform private.fail('cerrado');
  end if;
  if e.status not in ('pending', 'approved') then
    perform private.fail('invalido');
  end if;
  update public.esports_entries x set status = 'withdrawn' where x.id = e.id;
  delete from public.esports_entry_members m where m.entry_id = e.id;
  perform private.esp_dematerialize(e.id);
end $$;

-- Admin: aprueba (cupo: 'cupo_lleno'; queda en la liga: private.esp_materialize) o rechaza con nota (se borra la foto y
-- el equipo de temporada; en un torneo en curso: 'cerrado'). Push al capitán.
create function public.esports_decide_entry(p_entry uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid := (select x.event_id from public.esports_entries x where x.id = p_entry);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  t public.esports_tournaments;
  e public.esports_entries;
begin
  perform private.require_uid();
  if v_event is null then
    perform private.fail('no_existe');
  end if;
  t := private.esp_tournament_for_update(v_event);
  e := private.esp_entry_for_update(p_entry);
  perform private.require_admin(t.league_id);
  if p_approve is null or char_length(v_note) > 200 then
    perform private.fail('invalido');
  end if;
  if t.status in ('finished', 'cancelled') then
    perform private.fail('cerrado');
  end if;
  if p_approve then
    if e.status = 'approved' then
      return;
    end if;
    if e.status <> 'pending' then
      perform private.fail('invalido');
    end if;
    if (e.kind in ('team', 'player') and private.esp_approved(t.event_id) >= t.max_entries)
       or (e.kind = 'free_agent' and (select count(*) from public.esports_entries x
                                       where x.event_id = t.event_id and x.kind = 'free_agent' and x.status = 'approved')
                                      >= t.max_entries * private.esp_mode_size(t.mode)) then
      perform private.fail('cupo_lleno');
    end if;
    update public.esports_entries x set status = 'approved', note = coalesce(v_note, x.note) where x.id = e.id;
    perform private.esp_materialize(e.id);
  else
    if t.status = 'live' then
      perform private.fail('cerrado');
    end if;
    if e.status = 'rejected' then
      return;
    end if;
    if e.status not in ('pending', 'approved') then
      perform private.fail('invalido');
    end if;
    update public.esports_entries x set status = 'rejected', note = v_note where x.id = e.id;
    delete from public.esports_entry_members m where m.entry_id = e.id;
    perform private.esp_dematerialize(e.id);
  end if;
  perform private.esp_push_decided(e.id, p_approve, v_note);
end $$;

-- Check-in de un inscrito aprobado: el capitán (o el individual) dentro de la ventana (desde starts_at − checkin_minutes
-- hasta starts_at + 30 min; 'cerrado' fuera o sin check-in); el admin siempre. p_undo lo quita.
create function public.esports_check_in(p_entry uuid, p_undo boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_event uuid := (select x.event_id from public.esports_entries x where x.id = p_entry);
  t public.esports_tournaments;
  e public.esports_entries;
begin
  if v_event is null then
    perform private.fail('no_existe');
  end if;
  select * into t from public.esports_tournaments x where x.event_id = v_event;
  e := private.esp_entry_for_update(p_entry);
  if not private.is_admin(t.league_id) then
    if e.captain_id is distinct from v_uid then
      perform private.deny();
    end if;
    if t.checkin_minutes is null or t.status not in ('registration', 'live')
       or now() < t.starts_at - make_interval(mins => t.checkin_minutes) or now() > t.starts_at + interval '30 minutes' then
      perform private.fail('cerrado');
    end if;
  end if;
  if e.status <> 'approved' then
    perform private.fail('invalido');
  end if;
  update public.esports_entries x set checked_in_at = case when coalesce(p_undo, false) then null else now() end
   where x.id = e.id and (x.checked_in_at is null) = not coalesce(p_undo, false);
end $$;

-- Admin: la siembra. p_order = todos los aprobados (equipos e individuales), sin repetir ('invalido'); seed = la
-- posición (y el orden de su equipo de temporada).
create function public.esports_set_seeds(p_event uuid, p_order uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.esports_tournaments;
begin
  perform private.require_uid();
  t := private.esp_tournament_for_update(p_event);
  perform private.require_admin(t.league_id);
  if p_order is null or cardinality(p_order) <> (select count(distinct u) from unnest(p_order) u)
     or (select array_agg(u order by u) from unnest(p_order) u)
        is distinct from (select array_agg(e.id order by e.id) from public.esports_entries e
                           where e.event_id = t.event_id and e.status = 'approved' and e.kind in ('team', 'player')) then
    perform private.fail('invalido');
  end if;
  update public.esports_entries e set seed = o.n
    from unnest(p_order) with ordinality as o (id, n)
   where e.id = o.id and e.seed is distinct from o.n::smallint;
  update public.teams x set sort_order = o.n
    from unnest(p_order) with ordinality as o (id, n), public.esports_entries e
   where e.id = o.id and x.id = e.side_team_id and x.sort_order <> o.n;
end $$;

-- Admin: arma equipos del torneo con agentes libres (a mano o «Balancear por rango»). p_teams = [{name, tag?, members:
-- [{user_id, role}]}] (1–64); cada cuenta, un agente libre vivo del torneo (una sola vez); titulares y suplentes como en
-- §5.2 (sin capitán, el primero). Crea inscritos 'team' (sin equipo de esports) aprobados y materializados; los agentes
-- quedan 'assigned' y su fila de la foto se mueve. 'cupo_lleno' si no caben. Devuelve los ids.
create function public.esports_form_teams(p_event uuid, p_teams jsonb) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  t public.esports_tournaments;
  x jsonb;
  y jsonb;
  v_roster jsonb;
  v_first uuid;
  v_name text;
  v_tag text;
  v_id uuid;
  v_fa uuid;
  v_user uuid;
  v_ids uuid[] := '{}';
  v_seen uuid[] := '{}';
  i integer := 0;
begin
  t := private.esp_tournament_for_update(p_event);
  perform private.require_admin(t.league_id);
  if t.status not in ('registration', 'live') then
    perform private.fail('cerrado');
  end if;
  if t.entry_type <> 'open' or private.esp_mode_size(t.mode) <= 1 or jsonb_typeof(p_teams) is distinct from 'array'
     or jsonb_array_length(p_teams) not between 1 and 64 then
    perform private.fail('invalido');
  end if;
  if private.esp_approved(t.event_id) + jsonb_array_length(p_teams) > t.max_entries then
    perform private.fail('cupo_lleno');
  end if;
  for x in select a.x from jsonb_array_elements(p_teams) with ordinality as a (x, n) order by a.n loop
    i := i + 1;
    if jsonb_typeof(x) <> 'object' or jsonb_typeof(x -> 'members') <> 'array' or jsonb_array_length(x -> 'members') = 0 then
      perform private.fail('invalido');
    end if;
    v_name := coalesce(nullif(btrim(coalesce(x ->> 'name', '')), ''), 'Equipo ' || i);
    v_tag := upper(btrim(coalesce(x ->> 'tag', '')));
    if char_length(v_name) > 40 or v_tag !~ '^[A-Z0-9]{0,5}$' then
      perform private.fail('invalido');
    end if;
    v_first := coalesce((select (z ->> 'user_id')::uuid from jsonb_array_elements(x -> 'members') z where z ->> 'role' = 'captain' limit 1),
                        nullif(x -> 'members' -> 0 ->> 'user_id', '')::uuid);
    v_roster := private.esp_roster(t, x -> 'members', v_first);
    v_id := gen_random_uuid();
    insert into public.esports_entries (id, league_id, event_id, kind, name, tag, captain_id, status, created_by)
    values (v_id, t.league_id, t.event_id, 'team', v_name, v_tag, v_first, 'approved', v_uid);
    for y in select z from jsonb_array_elements(v_roster) z loop
      v_user := (y ->> 'user_id')::uuid;
      if v_user = any (v_seen) then
        perform private.fail('invalido');
      end if;
      v_seen := v_seen || v_user;
      select f.id into v_fa from public.esports_entries f
       where f.event_id = t.event_id and f.kind = 'free_agent' and f.status in ('pending', 'approved') and f.captain_id = v_user
       for update;
      if v_fa is null then
        perform private.fail('invalido');
      end if;
      update public.esports_entry_members m set entry_id = v_id, role = y ->> 'role' where m.entry_id = v_fa and m.user_id = v_user;
      update public.esports_entries f set status = 'assigned', assigned_entry = v_id where f.id = v_fa;
      v_fa := null;
    end loop;
    perform private.esp_materialize(v_id);
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end $$;

-- Admin: pasa un agente libre a un inscrito 'team' vivo del torneo con lugar ('cupo_lleno' si la plantilla ya está
-- completa: modeSize + suplentes, o no caben más suplentes), con rol 'member' o 'sub'. El agente queda 'assigned'.
create function public.esports_assign_free_agent(p_free_agent uuid, p_entry uuid, p_role text default 'member') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid := (select x.event_id from public.esports_entries x where x.id = p_free_agent);
  t public.esports_tournaments;
  f public.esports_entries;
  e public.esports_entries;
  v_role text := coalesce(p_role, 'member');
begin
  perform private.require_uid();
  if v_event is null then
    perform private.fail('no_existe');
  end if;
  t := private.esp_tournament_for_update(v_event);
  perform private.require_admin(t.league_id);
  if t.status not in ('registration', 'live') then
    perform private.fail('cerrado');
  end if;
  f := private.esp_entry_for_update(p_free_agent);
  e := private.esp_entry_for_update(p_entry);
  if f.kind <> 'free_agent' or f.status not in ('pending', 'approved') or e.event_id <> f.event_id or e.kind <> 'team'
     or e.status not in ('pending', 'approved') or v_role not in ('member', 'sub') then
    perform private.fail('invalido');
  end if;
  if (select count(*) from public.esports_entry_members m where m.entry_id = e.id)
       >= private.esp_mode_size(t.mode) + private.esp_subs(t)
     or (v_role = 'sub' and (select count(*) from public.esports_entry_members m where m.entry_id = e.id and m.role = 'sub')
                              >= private.esp_subs(t)) then
    perform private.fail('cupo_lleno');
  end if;
  update public.esports_entry_members m set entry_id = e.id, role = v_role where m.entry_id = f.id;
  update public.esports_entries x set status = 'assigned', assigned_entry = e.id where x.id = f.id;
  perform private.esp_sync_roster(e.id);
end $$;

-- =====================================================================
-- 10. RPC: fases, cuadro y battle royale
-- =====================================================================

-- Admin: crea una fase del torneo con el plan del motor (§9.7.1). p_stage cuadra con el formato (single_elim y
-- double_elim → 'bracket'; groups_playoffs → 'groups' y después 'playoffs'; round_robin → 'league'); no existe ya
-- ('duplicado'); 'playoffs' solo con 'groups' creada. p_matches (1–500): [{id, key, part, round, group_no, stage,
-- best_of, scheduled_at, sides: [{side, entry_id | null, label}], winner_to: {id, side} | null, loser_to}]. Cada
-- entry_id es un inscrito aprobado y materializado del evento; los enlaces apuntan a ids del lote; el mejor de lo
-- permite el juego. Las reglas de cada serie las arma la base (seriesRules del motor: draws solo en el FC al mejor de 1
-- en grupos o liga, si los ajustes lo dejan). Crea los partidos con public.create_matches, los enlaces, y el torneo
-- pasa a 'live'. Devuelve los ids en el orden del lote.
create function public.esports_create_stage(p_event uuid, p_stage text, p_matches jsonb) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  t public.esports_tournaments;
  v_ids uuid[];
  v_batch jsonb := '[]'::jsonb;
  x jsonb;
  s jsonb;
  v_sides jsonb;
  v_entry public.esports_entries;
  v_bo integer;
  v_rules jsonb;
  v_draws boolean;
  v_scoring text;
  v_link jsonb;
begin
  perform private.require_uid();
  t := private.esp_tournament_for_update(p_event);
  perform private.require_admin(t.league_id);
  if t.status not in ('registration', 'live') then
    perform private.fail('cerrado');
  end if;
  if p_stage is null or not ((t.format in ('single_elim', 'double_elim') and p_stage = 'bracket')
                             or (t.format = 'groups_playoffs' and p_stage in ('groups', 'playoffs'))
                             or (t.format = 'round_robin' and p_stage = 'league')) then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.esports_matches x where x.event_id = t.event_id and x.stage = p_stage) then
    perform private.fail('duplicado');
  end if;
  if p_stage = 'playoffs' and not exists (select 1 from public.esports_matches x where x.event_id = t.event_id and x.stage = 'groups') then
    perform private.fail('invalido');
  end if;
  if jsonb_typeof(p_matches) is distinct from 'array' or jsonb_array_length(p_matches) not between 1 and 500
     or exists (select 1 from jsonb_array_elements(p_matches) y
                 where jsonb_typeof(y) <> 'object' or nullif(y ->> 'id', '') is null) then
    perform private.fail('invalido');
  end if;
  v_ids := array(select (y ->> 'id')::uuid from jsonb_array_elements(p_matches) with ordinality as a (y, n) order by a.n);
  if cardinality(v_ids) <> (select count(distinct u) from unnest(v_ids) u)
     or exists (select 1 from public.matches m where m.id = any (v_ids)) then
    perform private.fail('invalido');
  end if;
  v_scoring := private.esp_scoring(t.game);
  for x in select a.y from jsonb_array_elements(p_matches) with ordinality as a (y, n) order by a.n loop
    if coalesce(x ->> 'part', '') not in ('W', 'L', 'GF', 'GF2', 'P3', 'G') or coalesce(x ->> 'key', '') !~ '^[A-Za-z0-9_-]{1,20}$'
       or not private.esp_int(x -> 'best_of', 1, 7) or not private.esp_best_of_ok(t.game, (x ->> 'best_of')::numeric::integer)
       or (jsonb_typeof(x -> 'round') is not null and jsonb_typeof(x -> 'round') <> 'null' and not private.esp_int(x -> 'round', 0, 999))
       or (jsonb_typeof(x -> 'group_no') is not null and jsonb_typeof(x -> 'group_no') <> 'null' and not private.esp_int(x -> 'group_no', 0, 7))
       or char_length(coalesce(x ->> 'stage', '')) > 40
       or jsonb_typeof(x -> 'sides') is distinct from 'array' or jsonb_array_length(x -> 'sides') <> 2 then
      perform private.fail('invalido');
    end if;
    -- Los enlaces: a un partido del lote (no a sí mismo), lado 1 o 2.
    foreach v_link in array array[x -> 'winner_to', x -> 'loser_to'] loop
      if v_link is not null and jsonb_typeof(v_link) <> 'null'
         and (jsonb_typeof(v_link) <> 'object' or nullif(v_link ->> 'id', '') is null
              or not ((v_link ->> 'id')::uuid = any (v_ids)) or (v_link ->> 'id') = (x ->> 'id')
              or coalesce(v_link ->> 'side', '') not in ('1', '2')) then
        perform private.fail('invalido');
      end if;
    end loop;
    v_sides := '[]'::jsonb;
    for s in select y from jsonb_array_elements(x -> 'sides') y loop
      if jsonb_typeof(s) <> 'object' or coalesce(s ->> 'side', '') not in ('1', '2') then
        perform private.fail('invalido');
      end if;
      if nullif(s ->> 'entry_id', '') is not null then
        select * into v_entry from public.esports_entries e
         where e.id = (s ->> 'entry_id')::uuid and e.event_id = t.event_id and e.status = 'approved' and e.kind in ('team', 'player')
           and e.side_team_id is not null;
        if v_entry.id is null then
          perform private.fail('invalido');
        end if;
        v_sides := v_sides || jsonb_build_array(jsonb_build_object('side', (s ->> 'side')::integer, 'team_id', v_entry.side_team_id,
                                                                   'label', v_entry.name, 'seed', v_entry.seed));
        v_entry := null;
      else
        if char_length(coalesce(s ->> 'label', '')) > 80 then
          perform private.fail('invalido');
        end if;
        v_sides := v_sides || jsonb_build_array(jsonb_build_object('side', (s ->> 'side')::integer,
                                                                   'label', coalesce(nullif(btrim(coalesce(s ->> 'label', '')), ''), 'Por definir')));
      end if;
    end loop;
    v_bo := (x ->> 'best_of')::numeric::integer;
    v_draws := t.game = 'ea_fc' and coalesce(t.settings -> 'draws', 'true'::jsonb) = 'true'::jsonb and v_bo = 1
               and p_stage in ('groups', 'league');
    v_rules := jsonb_build_object('game', t.game, 'bestOf', v_bo, 'draws', v_draws)
            || case when v_scoring = 'fight'
                    then jsonb_build_object('roundsToWin', case when private.esp_int(t.settings -> 'roundsToWin', 2, 3)
                                                                then (t.settings ->> 'roundsToWin')::integer
                                                                else case t.game when 'sf6' then 2 else 3 end end)
                    else '{}'::jsonb end
            || case when t.game = 'smash'
                    then jsonb_build_object('stocks', case when private.esp_int(t.settings -> 'stocks', 1, 5)
                                                           then (t.settings ->> 'stocks')::integer else 3 end)
                    else '{}'::jsonb end;
    v_batch := v_batch || jsonb_build_array(jsonb_build_object(
      'id', x ->> 'id', 'event_id', t.event_id, 'round', x -> 'round', 'stage', coalesce(x ->> 'stage', ''),
      'bracket_key', x ->> 'key', 'scheduled_at', x -> 'scheduled_at', 'format', t.game, 'rules', v_rules,
      'require_confirm', true, 'sides', v_sides));
  end loop;
  begin
    perform public.create_matches(p_league => t.league_id, p_matches => v_batch);
  exception when data_exception then
    perform private.fail('invalido');
  end;
  insert into public.esports_matches (match_id, league_id, event_id, stage, part, group_no, best_of, winner_to, winner_side,
                                      loser_to, loser_side)
  select (y ->> 'id')::uuid, t.league_id, t.event_id, p_stage, y ->> 'part', (y ->> 'group_no')::numeric::smallint,
         (y ->> 'best_of')::numeric::smallint,
         nullif(y -> 'winner_to' ->> 'id', '')::uuid, (y -> 'winner_to' ->> 'side')::smallint,
         nullif(y -> 'loser_to' ->> 'id', '')::uuid, (y -> 'loser_to' ->> 'side')::smallint
    from jsonb_array_elements(p_matches) y;
  if t.status = 'registration' then
    update public.esports_tournaments x set status = 'live' where x.event_id = t.event_id;
  end if;
  return v_ids;
end $$;

-- Admin: borra una fase sin resultados (para rehacer el cuadro). 'cerrado' si algún partido de la fase tiene resultado
-- (fuera de programado, aplazado o anulado, o con anotaciones) o si se borran los grupos con los playoffs creados. Sin
-- fases ni partidas BR, el torneo vuelve a 'registration'.
create function public.esports_delete_stage(p_event uuid, p_stage text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.esports_tournaments;
begin
  perform private.require_uid();
  t := private.esp_tournament_for_update(p_event);
  perform private.require_admin(t.league_id);
  if exists (select 1 from public.esports_matches x join public.matches m on m.id = x.match_id
              where x.event_id = t.event_id and x.stage = p_stage
                and (m.status not in ('scheduled', 'postponed', 'void') or m.seq > 0 or (m.score is not null and m.status <> 'void')))
     or (p_stage = 'groups' and exists (select 1 from public.esports_matches x where x.event_id = t.event_id and x.stage = 'playoffs')) then
    perform private.fail('cerrado');
  end if;
  delete from public.matches m where m.id in (select x.match_id from public.esports_matches x where x.event_id = t.event_id and x.stage = p_stage);
  if t.status = 'live' and not exists (select 1 from public.esports_matches x where x.event_id = t.event_id)
     and not exists (select 1 from public.esports_br_games x where x.event_id = t.event_id) then
    update public.esports_tournaments x set status = 'registration' where x.event_id = t.event_id;
  end if;
end $$;

-- Lo que pasó a final por las 48 h (sin escritura) avanza el cuadro: private.esp_apply_links (sin cortar) de cada serie
-- final del torneo, de la primera ronda a la última. Miembro de la liga, admin o superadmin. Devuelve cuántos lados puso.
create function public.esports_sync(p_event uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select x.league_id from public.esports_tournaments x where x.event_id = p_event);
  r record;
  n integer := 0;
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  if not (private.is_member(v_league) or private.is_super()) then
    perform private.deny();
  end if;
  for r in select x.match_id from public.esports_matches x join public.matches m on m.id = x.match_id
            where x.event_id = p_event and private.match_final(m.status, m.proposed_at)
            order by case x.stage when 'groups' then 0 when 'league' then 0 when 'bracket' then 1 else 2 end,
                     case x.part when 'W' then 0 when 'G' then 0 when 'P3' then 1 when 'L' then 2 when 'GF' then 3 else 4 end,
                     m.round nulls last, m.bracket_key loop
    n := n + private.esp_apply_links(r.match_id, false);
  end loop;
  return n;
end $$;

-- Admin o anotador de la liga: guarda una partida de battle royale con sus resultados (todo junto: reemplaza los de
-- esa partida). p_game = {id?, round, game_no, map?, scheduled_at?, status?, proof?: [uuid], results?: [{entry_id,
-- placement | null, kills}]}. Torneo BR ('invalido' si no); inscritos aprobados del evento; puestos sin repetir y no más
-- que los aprobados; fotos de la liga. Con resultados queda 'finished' (o el status que venga). El torneo pasa a 'live'.
create function public.esports_br_save_game(p_event uuid, p_game jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  t public.esports_tournaments;
  v_id uuid;
  v_round smallint;
  v_no smallint;
  v_map text;
  v_at timestamptz;
  v_status text;
  v_proof uuid[];
  v_n integer;
  g public.esports_br_games;
begin
  t := private.esp_tournament_for_update(p_event);
  if not private.is_match_official(t.league_id) then
    perform private.deny();
  end if;
  if t.format <> 'br' or jsonb_typeof(p_game) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_game) k
                 where k not in ('id', 'round', 'game_no', 'map', 'scheduled_at', 'status', 'proof', 'results')) then
    perform private.fail('invalido');
  end if;
  if t.status not in ('registration', 'live') then
    perform private.fail('cerrado');
  end if;
  if not private.esp_int(p_game -> 'round', 1, 10) or not private.esp_int(p_game -> 'game_no', 1, 12)
     or char_length(coalesce(p_game ->> 'map', '')) > 24
     or (p_game ? 'status' and coalesce(p_game ->> 'status', '') not in ('scheduled', 'finished', 'void'))
     or (jsonb_typeof(p_game -> 'proof') is not null and jsonb_typeof(p_game -> 'proof') <> 'null'
         and (jsonb_typeof(p_game -> 'proof') <> 'array' or jsonb_array_length(p_game -> 'proof') > 3))
     or (jsonb_typeof(p_game -> 'results') is not null and jsonb_typeof(p_game -> 'results') <> 'null'
         and jsonb_typeof(p_game -> 'results') <> 'array') then
    perform private.fail('invalido');
  end if;
  v_round := (p_game ->> 'round')::numeric::smallint;
  v_no := (p_game ->> 'game_no')::numeric::smallint;
  v_map := btrim(coalesce(p_game ->> 'map', ''));
  begin
    v_at := (p_game ->> 'scheduled_at')::timestamptz;
    v_proof := coalesce(array(select x::uuid from jsonb_array_elements_text(case when jsonb_typeof(p_game -> 'proof') = 'array'
                                                                                then p_game -> 'proof' else '[]'::jsonb end) x), '{}');
  exception when data_exception then
    perform private.fail('invalido');
  end;
  if cardinality(v_proof) <> (select count(distinct u) from unnest(v_proof) u)
     or exists (select 1 from unnest(v_proof) u
                 where not exists (select 1 from public.photos p where p.id = u and p.league_id = t.league_id)) then
    perform private.fail('invalido');
  end if;
  if jsonb_typeof(p_game -> 'results') = 'array' then
    v_n := (select count(*) from public.esports_entries e
             where e.event_id = t.event_id and e.status = 'approved' and e.kind in ('team', 'player'));
    if exists (select 1 from jsonb_array_elements(p_game -> 'results') r
                where jsonb_typeof(r) <> 'object' or nullif(r ->> 'entry_id', '') is null
                   or not private.esp_int(coalesce(r -> 'kills', '0'::jsonb), 0, 200)
                   or (jsonb_typeof(r -> 'placement') is not null and jsonb_typeof(r -> 'placement') <> 'null'
                       and not private.esp_int(r -> 'placement', 1, greatest(v_n, 1)))
                   or not exists (select 1 from public.esports_entries e
                                   where e.id = (r ->> 'entry_id')::uuid and e.event_id = t.event_id and e.status = 'approved'
                                     and e.kind in ('team', 'player')))
       or (select count(distinct r ->> 'entry_id') from jsonb_array_elements(p_game -> 'results') r)
          <> jsonb_array_length(p_game -> 'results')
       or (select count(distinct r ->> 'placement') from jsonb_array_elements(p_game -> 'results') r
            where jsonb_typeof(r -> 'placement') = 'number')
          <> (select count(*) from jsonb_array_elements(p_game -> 'results') r where jsonb_typeof(r -> 'placement') = 'number') then
      perform private.fail('invalido');
    end if;
  end if;
  v_id := nullif(p_game ->> 'id', '')::uuid;
  if v_id is not null then
    select * into g from public.esports_br_games x where x.id = v_id for update;
    if g.id is not null and g.event_id <> t.event_id then
      perform private.fail('invalido');
    end if;
  end if;
  v_status := coalesce(p_game ->> 'status',
                       case when jsonb_typeof(p_game -> 'results') = 'array' and jsonb_array_length(p_game -> 'results') > 0
                            then 'finished' end,
                       g.status, 'scheduled');
  begin
    if g.id is null then
      insert into public.esports_br_games (id, league_id, event_id, round, game_no, map, status, scheduled_at, proof, entered_by)
      values (coalesce(v_id, gen_random_uuid()), t.league_id, t.event_id, v_round, v_no, v_map, v_status, v_at, v_proof, v_uid)
      returning id into v_id;
    else
      update public.esports_br_games x
         set round = v_round, game_no = v_no, map = v_map, status = v_status,
             scheduled_at = case when p_game ? 'scheduled_at' then v_at else x.scheduled_at end,
             proof = case when p_game ? 'proof' then v_proof else x.proof end, entered_by = v_uid
       where x.id = v_id;
    end if;
  exception when unique_violation then
    perform private.fail('duplicado');
  end;
  if jsonb_typeof(p_game -> 'results') = 'array' then
    delete from public.esports_br_results r where r.game_id = v_id;
    insert into public.esports_br_results (game_id, entry_id, league_id, placement, kills)
    select v_id, (r ->> 'entry_id')::uuid, t.league_id, (r ->> 'placement')::numeric::smallint,
           coalesce((r ->> 'kills')::numeric::smallint, 0)
      from jsonb_array_elements(p_game -> 'results') r;
  end if;
  if t.status = 'registration' then
    update public.esports_tournaments x set status = 'live' where x.event_id = t.event_id;
  end if;
  return v_id;
end $$;

-- Admin: borra una partida de battle royale (con sus resultados).
create function public.esports_br_delete_game(p_game uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid := (select x.league_id from public.esports_br_games x where x.id = p_game);
begin
  perform private.require_uid();
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  perform private.require_admin(v_league);
  delete from public.esports_br_games x where x.id = p_game;
end $$;

-- =====================================================================
-- 11. RPC: lo que se lee junto
-- =====================================================================

-- La página de un juego (también sin cuenta): sus torneos que ve (sin cancelados; primero los de inscripción por fecha,
-- después en curso y al final terminados, los más nuevos primero), hasta p_limit (1–100), y hasta 100 equipos del juego
-- por miembros y nombre.
create function public.esports_hub(p_game text, p_limit integer default 60) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.esp_game_ok(p_game) then
    perform private.fail('invalido');
  end if;
  return jsonb_build_object(
    'tournaments', coalesce((
      select jsonb_agg(x.j order by x.o1, x.o2, x.o3 desc, x.event_id)
        from (select t.event_id,
                     case t.status when 'registration' then 0 when 'live' then 1 else 2 end as o1,
                     case when t.status = 'registration' then t.starts_at end as o2,
                     t.starts_at as o3,
                     jsonb_build_object(
                       'eventId', t.event_id, 'leagueId', t.league_id, 'name', coalesce(nullif(e.name, ''), l.name),
                       'leagueName', l.name, 'visibility', l.visibility, 'logoPath', l.logo_path, 'mode', t.mode,
                       'entryType', t.entry_type, 'format', t.format, 'status', t.status, 'startsAt', private.iso(t.starts_at),
                       'registrationOpensAt', private.iso(t.registration_opens_at),
                       'registrationClosesAt', private.iso(t.registration_closes_at), 'checkinMinutes', t.checkin_minutes,
                       'maxEntries', t.max_entries,
                       'approved', (select count(*) from public.esports_entries x
                                     where x.event_id = t.event_id and x.status = 'approved' and x.kind in ('team', 'player')),
                       'pending', (select count(*) from public.esports_entries x where x.event_id = t.event_id and x.status = 'pending'),
                       'prizeText', t.prize_text) as j
                from public.esports_tournaments t
                join public.events e on e.id = t.event_id
                join public.leagues l on l.id = t.league_id
               where t.game = p_game and t.status <> 'cancelled' and t.league_id in (select private.readable_leagues())
               order by case t.status when 'registration' then 0 when 'live' then 1 else 2 end,
                        case when t.status = 'registration' then t.starts_at end, t.starts_at desc, t.event_id
               limit private.clamp_int(p_limit, 1, 100, 60)) x), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', y.id, 'name', y.name, 'tag', y.tag, 'logoPath', y.logo_path,
                                          'memberCount', y.member_count) order by y.member_count desc, y.name, y.id)
        from (select * from public.esports_teams t where t.game = p_game
               order by t.member_count desc, t.name, t.id limit 100) y), '[]'::jsonb));
end $$;

-- Sus inscripciones (por la foto o como capitán): las vivas y las de torneos sin terminar (sin las de agente libre que ya
-- pasaron a un equipo).
create function public.esports_my_entries() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'entryId', e.id, 'eventId', e.event_id, 'leagueId', e.league_id,
             'tournament', private.esp_tournament_name(e.event_id), 'game', t.game, 'mode', t.mode, 'entryStatus', e.status,
             'tournamentStatus', t.status, 'startsAt', private.iso(t.starts_at), 'entryName', e.name,
             'role', coalesce((select m.role from public.esports_entry_members m where m.entry_id = e.id and m.user_id = v_uid), 'captain'),
             'kind', e.kind)
             order by t.starts_at, e.id)
      from public.esports_entries e
      join public.esports_tournaments t on t.event_id = e.event_id
     where (e.captain_id = v_uid or exists (select 1 from public.esports_entry_members m where m.entry_id = e.id and m.user_id = v_uid))
       and e.status <> 'assigned'
       and (e.status in ('pending', 'approved') or t.status in ('registration', 'live'))), '[]'::jsonb);
end $$;

-- =====================================================================
-- 12. Insignias: 'esports' en los checks de deporte (sin evaluadores en esta entrega)
-- =====================================================================

alter table public.badge_awards drop constraint badge_awards_sport_check,
  add constraint badge_awards_sport_check check (sport in ('all', 'bowling', 'padel', 'tennis', 'pickleball',
    'table_tennis', 'basketball', 'football', 'futsal', 'golf', 'swimming', 'esports'));
alter table public.badge_progress drop constraint badge_progress_sport_check,
  add constraint badge_progress_sport_check check (sport in ('all', 'bowling', 'padel', 'tennis', 'pickleball',
    'table_tennis', 'basketball', 'football', 'futsal', 'golf', 'swimming', 'esports'));
alter table public.badge_stats drop constraint badge_stats_sport_check,
  add constraint badge_stats_sport_check check (sport in ('all', 'bowling', 'padel', 'tennis', 'pickleball',
    'table_tennis', 'basketball', 'football', 'futsal', 'golf', 'swimming', 'esports'));

-- =====================================================================
-- 13. Bajar mis datos: con lo de esports (la de 20261007000100_modo_app.sql)
-- =====================================================================

-- Igual que en 20261007000100_modo_app.sql y además esportsIds (sus IDs de juego, todas las columnas), esportsTeams (sus
-- membresías con el equipo), esportsEntries (sus filas de la foto de las inscripciones) y esportsIdMoves (los avisos de
-- «tu ID pasó a otra cuenta», vistos o no).
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
    'esportsIds', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.game, g.platform)
        from public.esports_game_ids g where g.user_id = v_uid), '[]'::jsonb),
    'esportsTeams', coalesce((
      select jsonb_agg(jsonb_build_object(
               'teamId', t.id, 'game', t.game, 'name', t.name, 'tag', t.tag, 'role', m.role, 'displayName', m.display_name,
               'joinedAt', private.iso(m.joined_at))
               order by m.joined_at, t.id)
        from public.esports_team_members m join public.esports_teams t on t.id = m.team_id
       where m.user_id = v_uid), '[]'::jsonb),
    'esportsEntries', coalesce((
      select jsonb_agg(to_jsonb(m) || jsonb_build_object('entryName', e.name, 'entryStatus', e.status,
                                                         'tournament', private.esp_tournament_name(e.event_id))
               order by m.created_at, m.entry_id)
        from public.esports_entry_members m join public.esports_entries e on e.id = m.entry_id
       where m.user_id = v_uid), '[]'::jsonb),
    'esportsIdMoves', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'game', m.game, 'platform', m.platform, 'idDisplay', m.id_display, 'provider', m.provider,
               'createdAt', private.iso(m.created_at), 'seenAt', private.iso(m.seen_at))
               order by m.created_at, m.id)
        from public.esports_id_moves m where m.user_id = v_uid), '[]'::jsonb),
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
-- 14. Permisos: las RPC solo con sesión (esports_team_preview y esports_hub también sin cuenta); las de la Edge
-- Function, solo service_role; las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'esports_save_game_id', 'esports_confirm_game_id', 'esports_set_ranks', 'esports_delete_game_id', 'esports_my_game_ids',
    'esports_my_id_moves', 'esports_seen_id_move', 'esports_create_team', 'esports_update_team', 'esports_delete_team',
    'esports_team_code', 'esports_renew_team_code', 'esports_team_preview', 'esports_join_team', 'esports_leave_team',
    'esports_remove_member', 'esports_set_member_role', 'esports_begin_team_logo', 'esports_set_team_logo',
    'esports_create_tournament', 'esports_update_tournament',
    'esports_set_status', 'esports_register_team', 'esports_register_solo', 'esports_set_entry_roster', 'esports_update_entry',
    'esports_withdraw', 'esports_decide_entry', 'esports_check_in', 'esports_set_seeds', 'esports_form_teams',
    'esports_assign_free_agent', 'esports_create_stage', 'esports_delete_stage', 'esports_sync', 'esports_br_save_game',
    'esports_br_delete_game', 'esports_hub', 'esports_my_entries',
    -- Redefinida (create or replace conserva sus permisos; se deja igual para asegurarlo).
    'export_my_data'];
  v_service constant text[] := array[
    'esports_begin_lookup', 'esports_store_lookup', 'esports_link_begin', 'esports_link_take', 'esports_link_account',
    -- Redefinida (create or replace conserva sus permisos; se deja igual para asegurarlo).
    'purge_queue_take'];
  v_private constant text[] := array[
    'require_match_league', 'check_match', 'check_season_team', 'push_category'];
begin
  for f in select p.oid::regprocedure as sig, n.nspname, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and (p.proname = any (v_rpc) or p.proname = any (v_service)))
               or (n.nspname = 'private' and (p.proname = any (v_private) or p.proname like 'esp\_%')) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' and f.proname = any (v_rpc) then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.nspname = 'public' then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

-- Ver a qué equipo lleva un código y la página de un juego también sin cuenta (como invite_preview).
grant execute on function public.esports_team_preview(text) to anon;
grant execute on function public.esports_hub(text, integer) to anon;
