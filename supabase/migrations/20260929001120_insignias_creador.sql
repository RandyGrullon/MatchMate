-- MatchMate · Insignias: el creador de insignias de la liga (diseño completo en docs/insignias.md §5). Los datos de
-- las automáticas están en 20260929001100_insignias.sql y el motor en …1110.
--
-- Las insignias de liga las diseña y las da una persona. Nunca cuentan para las oficiales (ni rareza, ni rankings, ni
-- el total del perfil) y siempre dicen de qué liga son.
--
-- 1. Permisos (§5.1): leagues.badge_makers ('owner' | 'admins' | 'chosen'; lo cambia el dueño con set_badge_policy) y
--    league_members.badge_maker («Diseña insignias», set_member_badge_maker). private.can_badges(liga) = dueño (o
--    superadmin), o admin con 'admins', o miembro marcado con 'chosen'.
-- 2. public.league_badges: los diseños (≤ 30 activos y ≤ 100 en total por liga; 20 guardados por hora por cuenta). Un
--    diseño que ya se dio queda bloqueado: solo cambian la descripción y el estado (archivar).
-- 3. public.league_badge_awards: quién la tiene (siempre un jugador de la liga, con cuenta o sin ella). Cupos (§5.7):
--    Única 1, Selecta 3, Abierta 20 por insignia, periodo y división (con by_team, un equipo cuenta 1); 15 activas por
--    jugador, liga y año; 60 por liga en 30 días; 60 por cuenta por hora (periodo y división sin mayúsculas, tildes
--    ni signos: private.badge_slot_key). Nadie se la da a sí mismo, tampoco a un jugador sin cuenta que después
--    reclama, vincula o junta con el suyo (private.badge_link_guard la retira, y devuelve a revisión el aval que esa
--    cuenta le confirmó). Deshacer: quien la dio, en 24 h; retirar: el dueño (o el superadmin).
-- 4. Filtro de texto: private.badge_text_ok (caracteres permitidos, sin enlaces, teléfonos ni letras repetidas, y las
--    palabras de private.blocked_terms, normalizadas; trae una lista base). Reportes a private.badge_reports (5 por
--    día por cuenta), que revisa el superadmin (admin_badge_reports); él esconde diseños (hide_league_badge, con
--    auditoría).
-- 5. Quién ve qué (RLS, solo lectura): diseños y otorgamientos, quien ve la liga; los admins también los escondidos y
--    los retirados. note, awarded_by, revoked_by y revoke_reason NO se leen directo (permiso por columna): salen por
--    league_badge_holders (la nota al jugador y a los admins; quién la dio y por qué se retiró, solo a los admins).
-- 6. En el perfil (/u/) salen solo si la liga pasa private.league_badges_public: la ve quien mira y sin menores
--    (social_league_ok), 6+ cuentas miembro no bloqueadas y 14+ días de creada. El dueño las ve todas.
-- 7. Cambian (misma firma): private.merge_badges (también las de liga: si chocan, queda la más vieja y la otra se
--    retira con 'fusión'), public.profile_badges (+ leagueAwards), public.badge_notices (+ leagueAwards, leagueUnseen),
--    public.remove_member (un admin no saca a quien diseña insignias), la vista public.memberships (+ badge_maker) y
--    private.my_badge_reports (…1100: badgeReports de export_my_data, aquí con los reportes de la cuenta).
--    report_badge (reportar una insignia automática) va aquí porque usa private.badge_reports.
-- 8. Tiempo real (private.emit_league_badges): el mismo aviso 'badges' que las automáticas, por league:<liga> y por
--    user:<cuenta del jugador>.

-- =====================================================================
-- Permisos del creador
-- =====================================================================

-- ¿Quién diseña y da insignias? 'owner' «Solo yo», 'admins' «Yo y los admins» (por defecto), 'chosen' «Yo y los que
-- yo elija» (league_members.badge_maker).
alter table public.leagues add column badge_makers text not null default 'admins'
  check (badge_makers in ('owner', 'admins', 'chosen'));
-- «Diseña insignias»: lo prende el dueño; vale con badge_makers = 'chosen'.
alter table public.league_members add column badge_maker boolean not null default false;

-- =====================================================================
-- Tablas
-- =====================================================================

-- Un diseño de la liga. palette 'color' lleva color (hex en minúsculas); las demás, no. icon: uno de los 52 curados
-- (src/badges/visual/icons.ts, private.badge_icon_ok). status 'oculta' = escondido por el superadmin (moderación).
create table public.league_badges (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  template text check (template ~ '^[a-z_]{1,32}$'),
  name text not null check (char_length(name) between 3 and 28),
  description text not null default '' check (char_length(description) <= 140),
  shape text not null check (shape in ('hex', 'shield', 'circle', 'star', 'medal', 'medal_laurel', 'square')),
  palette text not null check (palette in ('bronce', 'plata', 'oro', 'platino', 'diamante', 'liga', 'color')),
  color text check (color ~ '^#[0-9a-f]{6}$'),
  icon text not null check (icon ~ '^[a-z0-9-]{1,32}$'),
  top_text text not null default '' check (char_length(top_text) <= 14),
  period_text text not null default '' check (char_length(period_text) <= 10),
  limit_kind text not null default 'abierta' check (limit_kind in ('unica', 'selecta', 'abierta')),
  -- Equipos y parejas: se da al equipo (su plantilla) y el cupo cuenta equipos.
  by_team boolean not null default false,
  status text not null default 'activa' check (status in ('activa', 'archivada', 'oculta')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((palette = 'color') = (color is not null)),
  unique (id, league_id)
);
create index league_badges_sync_idx on public.league_badges (league_id, updated_at);

-- Un otorgamiento: siempre a un jugador de la liga (el perfil lo muestra por players.user_id). Con by_team, team_id
-- es su equipo. revoked_at: retirada (deshacer, el dueño o una fusión); la fila se queda para la auditoría.
create table public.league_badge_awards (
  id uuid primary key default gen_random_uuid(),
  badge_id uuid not null,
  league_id uuid not null references public.leagues (id) on delete cascade,
  player_id uuid not null,
  team_id uuid,
  period text not null default '' check (char_length(period) <= 10),
  division text not null default '' check (char_length(division) <= 16),
  -- Nota para el jugador (la ven él y los admins).
  note text not null default '' check (char_length(note) <= 140),
  awarded_by uuid references public.profiles (id) on delete set null,
  awarded_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  -- Privado (dueño y admins de la liga). 'fusión' = la quitó merge_players.
  revoke_reason text check (char_length(revoke_reason) <= 140),
  hidden boolean not null default false,
  seen_at timestamptz,
  updated_at timestamptz not null default now(),
  -- NO ACTION: el diseño no se borra si ya se dio; borrar la liga cascada limpio por las dos.
  foreign key (badge_id, league_id) references public.league_badges (id, league_id),
  foreign key (player_id, league_id) references public.players (id, league_id) on delete cascade,
  foreign key (team_id, league_id) references public.teams (id, league_id) on delete set null (team_id),
  check (revoked_at is not null or (revoked_by is null and revoke_reason is null))
);
-- Periodo o división para comparar (cupos, duplicados y fusiones): minúsculas, sin tildes y solo letras y números.
-- «TEMP 2026», «Temp 2026» y «temp 2026.» son el mismo periodo; «A», «a» y «A.», la misma división. No usa
-- private.badge_fold: ese cambia números por letras (2026 y 2027 darían lo mismo).
create function private.badge_slot_key(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(lower(translate(coalesce(p, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'aeiouunaeiouun')), '[^a-z0-9]+', '', 'g')
$$;

-- Una vigente por insignia, jugador, periodo y división (normalizados).
create unique index league_badge_awards_once
  on public.league_badge_awards (badge_id, player_id, private.badge_slot_key(period), private.badge_slot_key(division))
  where revoked_at is null;
create index league_badge_awards_sync_idx on public.league_badge_awards (league_id, updated_at);
create index league_badge_awards_player_idx on public.league_badge_awards (player_id);
create index league_badge_awards_badge_idx on public.league_badge_awards (badge_id);
create index league_badge_awards_team_idx on public.league_badge_awards (team_id) where team_id is not null;
create index league_badge_awards_by_idx on public.league_badge_awards (awarded_by, awarded_at) where awarded_by is not null;

-- Palabras bloqueadas, ya normalizadas (private.badge_fold sin espacios). whole = false: en cualquier parte del texto
-- junto (sin separadores: «p u t 0» también); true: solo como palabra entera (o su plural), para las que salen dentro
-- de palabras sanas («disputa»). Las maneja el superadmin (admin_blocked_terms).
create table private.blocked_terms (
  term text primary key check (term ~ '^[a-z]{2,40}$'),
  whole boolean not null default false,
  created_at timestamptz not null default now()
);
-- La lista base (insultos y groserías de aquí y de otros países de habla hispana), para que el filtro sirva desde el
-- primer día; el superadmin suma o quita. Las cortas o que salen dentro de palabras sanas van enteras («puta» está en
-- «disputa», «culo» en «ridículo», «singa» en «Singapur»).
insert into private.blocked_terms (term, whole) values
  ('mierda', false), ('carajo', false), ('pendejo', false), ('pendeja', false), ('maricon', false), ('maricona', false),
  ('cabron', false), ('cabrona', false), ('mamaguevo', false), ('mamahuevo', false), ('mamaguebo', false),
  ('mamabicho', false), ('hijodeputa', false), ('hijueputa', false), ('malparido', false), ('malparida', false),
  ('gonorrea', false), ('culero', false), ('estupido', false), ('estupida', false), ('imbecil', false),
  ('idiota', false), ('huevon', false), ('guevon', false), ('gilipollas', false), ('chupamela', false),
  ('chupapinga', false), ('comemierda', false), ('singadera', false), ('mongolico', false), ('mongolica', false),
  ('putona', false), ('prostituta', false), ('follar', false), ('joder', false),
  ('puta', true), ('puto', true), ('culo', true), ('verga', true), ('pinga', true), ('chocha', true), ('cono', true),
  ('singa', true), ('singar', true), ('singao', true), ('zorra', true), ('perra', true), ('mojon', true),
  ('guevo', true), ('marica', true), ('nazi', true), ('hitler', true), ('mmg', true), ('hdp', true), ('ctm', true),
  ('ptm', true), ('lpm', true);

-- Reportes de un diseño (badge_id) o de una insignia automática (award_id). Los ve el superadmin; se cierran al
-- esconder el diseño ('oculta'), al retirar la insignia ('retirada') o a mano ('descartado').
create table private.badge_reports (
  id bigint generated always as identity primary key,
  badge_id uuid references public.league_badges (id) on delete cascade,
  award_id uuid references public.badge_awards (id) on delete cascade,
  league_id uuid references public.leagues (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  reason text not null default '' check (char_length(reason) <= 140),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution text check (resolution in ('oculta', 'retirada', 'descartado')),
  check (num_nonnulls(badge_id, award_id) = 1),
  check ((resolved_at is null) = (resolution is null))
);
create unique index badge_reports_open_badge on private.badge_reports (badge_id, user_id)
  where resolved_at is null and badge_id is not null;
create unique index badge_reports_open_award on private.badge_reports (award_id, user_id)
  where resolved_at is null and award_id is not null;
create index badge_reports_open_idx on private.badge_reports (created_at desc) where resolved_at is null;

revoke all on private.blocked_terms, private.badge_reports from public, anon, authenticated;

-- =====================================================================
-- Triggers
-- =====================================================================

create trigger league_badges_touch before update on public.league_badges
  for each row execute function private.touch_updated_at();
create trigger league_badge_awards_touch before update on public.league_badge_awards
  for each row execute function private.touch_updated_at();
create trigger league_badges_tombstone after delete on public.league_badges
  for each row execute function private.tombstone('id');
create trigger league_badge_awards_tombstone after delete on public.league_badge_awards
  for each row execute function private.tombstone('id');

-- Una insignia automática retirada (por el motor, un aval o el superadmin) cierra sus reportes abiertos.
create function private.badge_reports_on_revoke() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update private.badge_reports r set resolved_at = now(), resolved_by = auth.uid(), resolution = 'retirada'
   where r.award_id = new.id and r.resolved_at is null;
  return null;
end $$;
create trigger badge_awards_reports after update of status on public.badge_awards
  for each row when (new.status = 'revocada' and old.status is distinct from 'revocada')
  execute function private.badge_reports_on_revoke();

-- =====================================================================
-- Quién ve qué (solo lectura)
-- =====================================================================

alter table public.league_badges enable row level security;
alter table public.league_badge_awards enable row level security;

-- Diseños: quien ve la liga, menos los escondidos por el superadmin; los admins de la liga (y el superadmin), todos.
create policy league_badges_read on public.league_badges for select to anon, authenticated
  using (league_id in (select private.readable_leagues()) and status <> 'oculta');
create policy league_badges_admin on public.league_badges for select to authenticated
  using (league_id in (select private.admin_leagues()));

-- Otorgamientos: quien ve la liga, los vigentes y no ocultos; el jugador, también los suyos ocultos; los admins de la
-- liga (y el superadmin), todos (también los retirados: auditoría).
create policy league_badge_awards_read on public.league_badge_awards for select to anon, authenticated
  using (league_id in (select private.readable_leagues()) and revoked_at is null and not hidden);
create policy league_badge_awards_own on public.league_badge_awards for select to authenticated
  using (revoked_at is null and player_id in (select p.id from public.players p where p.user_id = (select auth.uid())));
create policy league_badge_awards_admin on public.league_badge_awards for select to authenticated
  using (league_id in (select private.admin_leagues()));

revoke all on public.league_badges, public.league_badge_awards from public, anon, authenticated;
grant select on public.league_badges to anon, authenticated;
-- Sin note, awarded_by, revoked_by, revoke_reason ni seen_at: esos salen por las RPC (league_badge_holders,
-- profile_badges, badge_notices). Pedir esas columnas (o *) directo da 42501.
grant select (id, badge_id, league_id, player_id, team_id, period, division, awarded_at, revoked_at, hidden, updated_at)
  on public.league_badge_awards to anon, authenticated;

-- Membresías con su jugador: ahora también «Diseña insignias» (al final: create or replace solo añade columnas).
create or replace view public.memberships with (security_invoker = true) as
  select m.league_id, m.user_id, m.role, m.is_scorer, m.display_name, m.joined_at, m.updated_at, p.id as player_id,
         m.badge_maker
  from public.league_members m
  left join public.players p on p.league_id = m.league_id and p.user_id = m.user_id;

-- =====================================================================
-- Ayudas
-- =====================================================================

-- ¿La cuenta de la sesión diseña y da insignias en esa liga? (§5.1; el superadmin, siempre.)
create function private.can_badges(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_owner(p_league) or exists (
    select 1 from public.league_members m join public.leagues l on l.id = m.league_id
     where m.league_id = p_league and m.user_id = (select auth.uid())
       and ((l.badge_makers = 'admins' and m.role = 'admin') or (l.badge_makers = 'chosen' and m.badge_maker)))
$$;

-- ¿Las insignias del creador de esa liga salen en el perfil público (§5.7)? La ve quien mira y no tiene menores
-- (social_league_ok), tiene 6+ cuentas miembro no bloqueadas y 14+ días de creada. Si no, solo dentro de la liga.
create function private.league_badges_public(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.social_league_ok(p_league)
     and exists (select 1 from public.leagues l where l.id = p_league and l.created_at <= now() - interval '14 days')
     and (select count(*) from public.league_members m join public.profiles pr on pr.id = m.user_id
           where m.league_id = p_league and pr.blocked_at is null) >= 6
$$;

-- Texto limpio: sin espacios a los lados y con un solo espacio entre palabras (saltos de línea y tabs también).
create function private.badge_clean(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'))
$$;

-- Normalizado para comparar con las palabras bloqueadas: minúsculas, sin tildes (ñ → n), leetspeak
-- (0→o 1→i 3→e 4→a 5→s @→a) y todo lo que no es letra pasa a un espacio (palabras separadas por uno).
create function private.badge_fold(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
           lower(translate(coalesce(p, ''), 'ÁÉÍÓÚÜÑáéíóúüñ01345@', 'aeiouunaeiouunoieasa')),
           '[^a-z]+', ' ', 'g'))
$$;

-- ¿Se puede usar este texto en una insignia de liga (§5.7)? Vacío: sí. No, si:
-- - tiene algo fuera de letras (con áéíóúüñ), números, espacio y . , : ; ! ¡ ? ¿ ' " & # / ( ) + - (sin emoji);
-- - parece un enlace o correo: 'http', 'www.', o '.com', '.net', '.org', '.do' al final de una palabra (la @ ya no pasa);
-- - parece un teléfono: 7+ dígitos seguidos, o 3 y 4 dígitos con un espacio, punto o guion en medio;
-- - repite el mismo carácter 4+ veces seguidas;
-- - tiene una palabra bloqueada (private.blocked_terms) después de normalizar (private.badge_fold).
-- src/components/badges/text.ts repite las cuatro primeras reglas en el teléfono; las palabras solo las sabe el servidor.
create function private.badge_text_ok(p_text text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v text := coalesce(p_text, '');
  v_plain text;
  v_fold text;
  v_joined text;
  v_words text[];
begin
  if v = '' then
    return true;
  end if;
  if v !~ '^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ .,:;!¡?¿''"&#/()+-]+$' then
    return false;
  end if;
  v_plain := lower(translate(v, 'ÁÉÍÓÚÜÑáéíóúüñ', 'aeiouunaeiouun'));
  if v_plain ~ '(http|www\.)' or v_plain ~ '\.(com|net|org|do)([^a-z0-9]|$)' then
    return false;
  end if;
  if v ~ '[0-9]{7,}' or v ~ '(^|[^0-9])[0-9]{3}[ .-]?[0-9]{4}([^0-9]|$)' then
    return false;
  end if;
  if v_plain ~ '(.)\1\1\1' then
    return false;
  end if;
  v_fold := private.badge_fold(v);
  v_joined := replace(v_fold, ' ', '');
  v_words := string_to_array(v_fold, ' ');
  return not exists (
    select 1 from private.blocked_terms t
     where (not t.whole and strpos(v_joined, t.term) > 0)
        or (t.whole and (t.term = any (v_words) or t.term || 's' = any (v_words) or t.term || 'es' = any (v_words)
                         or v_joined = t.term)));
end $$;

-- Los 52 íconos curados del editor (BADGE_ICON_KEYS de src/badges/visual/icons.ts; la prueba compara las dos listas).
create function private.badge_icon_ok(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p = any (array[
    'bowling', 'padel', 'tennis', 'pickleball', 'basketball', 'football', 'golf', 'swimming', 'whistle', 'timer',
    'target', 'goal', 'flag-triangle-right', 'trophy', 'medal', 'award', 'crown', 'star', 'gem', 'ribbon',
    'badge-check', 'sparkles', 'flame', 'zap', 'trending-up', 'rocket', 'mountain', 'footprints', 'crosshair',
    'hourglass', 'repeat', 'infinity', 'calendar-check', 'handshake', 'heart-handshake', 'hand-heart', 'users-round',
    'smile', 'thumbs-up', 'megaphone', 'party-popper', 'cake', 'gift', 'sun', 'sunrise', 'tree-palm', 'waves',
    'sprout', 'bird', 'shell', 'anchor', 'moon-star']::text[]), false)
$$;

-- Texto de una clave de p_design: si es string, el texto; null si viene null y p_null lo permite; si no, 'invalido'.
create function private.badge_design_text(p jsonb, p_key text, p_null boolean default false) returns text
language plpgsql stable set search_path = '' as $$
begin
  if jsonb_typeof(p -> p_key) = 'string' then
    return p ->> p_key;
  elsif jsonb_typeof(p -> p_key) = 'null' and p_null then
    return null;
  end if;
  perform private.fail('invalido');
  return null;
end $$;

-- Cómo se pinta un diseño (lo que necesita <Insignia/>): {id, name, description, shape, palette, color, icon,
-- topText, periodText, template, limitKind, byTeam, status}.
create function private.league_badge_look(b public.league_badges) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
           'id', b.id, 'name', b.name, 'description', b.description, 'shape', b.shape, 'palette', b.palette,
           'color', b.color, 'icon', b.icon, 'topText', b.top_text, 'periodText', b.period_text, 'template', b.template,
           'limitKind', b.limit_kind, 'byTeam', b.by_team, 'status', b.status)
$$;

-- Un diseño completo (LeagueBadge): el look más {leagueId, createdBy, createdAt, updatedAt, given (cuántas veces se
-- dio, también las retiradas), active (vigentes), locked (given > 0: solo cambian descripción y estado)}.
create function private.league_badge_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.league_badge_look(b) || jsonb_build_object(
           'leagueId', b.league_id, 'createdBy', b.created_by, 'createdAt', private.iso(b.created_at),
           'updatedAt', private.iso(b.updated_at), 'given', g.n, 'active', g.active, 'locked', g.n > 0)
    from public.league_badges b
    cross join lateral (select count(*)::integer as n, (count(*) filter (where a.revoked_at is null))::integer as active
                          from public.league_badge_awards a where a.badge_id = b.id) g
   where b.id = p_id
$$;

-- Un otorgamiento para el perfil y los avisos (LeagueBadgeAward): {id, badgeId, leagueId, leagueName, sport, playerId,
-- teamId, teamName, period, division, awardedAt, hidden, note, seenAt, badge: look}. note y seenAt solo si p_mine
-- (es del jugador de quien mira); si no, null.
create function private.league_award_json(a public.league_badge_awards, p_mine boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'id', a.id, 'badgeId', a.badge_id, 'leagueId', a.league_id, 'leagueName', l.name, 'sport', l.sport,
           'playerId', a.player_id, 'teamId', a.team_id,
           'teamName', (select t.name from public.teams t where t.id = a.team_id),
           'period', a.period, 'division', a.division, 'awardedAt', private.iso(a.awarded_at), 'hidden', a.hidden,
           'note', case when p_mine then a.note end, 'seenAt', case when p_mine then private.iso(a.seen_at) end,
           'badge', private.league_badge_look(b))
    from public.leagues l, public.league_badges b
   where l.id = a.league_id and b.id = a.badge_id
$$;

-- =====================================================================
-- Juntar jugadores: también las insignias de la liga
-- =====================================================================

-- Igual que en 20260929001100_insignias.sql, y además league_badge_awards: si los dos jugadores tienen vigente la misma
-- insignia, periodo y división, queda la más vieja y la otra se retira con 'fusión' (sin push); después todas pasan a
-- p_into (las retiradas también: son historia).
create or replace function private.merge_badges(p_from uuid, p_into uuid, p_league uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rank constant text[] := array['revocada', 'en_revision', 'provisional', 'firme'];
  v_gone uuid[] := '{}';
  v_keep uuid;
  v_drop uuid;
  r record;
begin
  for r in
    select f.id as f_id, i.id as i_id,
           array_position(v_rank, f.status) > array_position(v_rank, i.status)
             or (f.status = i.status and f.awarded_at < i.awarded_at) as from_wins,
           f.hidden or i.hidden as hidden,
           least(f.seen_at, i.seen_at) as seen_at,
           least(f.notified_at, i.notified_at) as notified_at,
           least(f.awarded_at, i.awarded_at) as awarded_at
      from public.badge_awards f
      join public.badge_awards i on i.player_id = p_into and i.badge_key = f.badge_key and i.sport = f.sport
                                and i.level = f.level and i.period_key = f.period_key
     where f.player_id = p_from
  loop
    v_keep := case when r.from_wins then r.f_id else r.i_id end;
    v_drop := case when r.from_wins then r.i_id else r.f_id end;
    delete from public.badge_awards a where a.id = v_drop;
    update public.badge_awards a
       set hidden = r.hidden, seen_at = r.seen_at, notified_at = r.notified_at, awarded_at = r.awarded_at
     where a.id = v_keep;
    v_gone := v_gone || v_drop;
  end loop;
  update public.badge_awards a set player_id = p_into where a.player_id = p_from and a.league_id = p_league;
  if cardinality(v_gone) > 0 then
    update public.profiles p
       set featured_badges = array(select u.x from unnest(p.featured_badges) with ordinality as u (x, n)
                                    where u.x <> all (v_gone) order by u.n)
     where p.featured_badges && v_gone;
  end if;
  delete from public.badge_progress x where x.player_id in (p_from, p_into);

  -- Insignias del creador: la más nueva de cada choque se retira (la subconsulta ve la tabla de antes del cambio).
  update public.league_badge_awards f set revoked_at = now(), revoked_by = null, revoke_reason = 'fusión'
   where f.player_id in (p_from, p_into) and f.revoked_at is null
     and exists (select 1 from public.league_badge_awards o
                  where o.player_id in (p_from, p_into) and o.player_id <> f.player_id and o.revoked_at is null
                    and o.badge_id = f.badge_id and private.badge_slot_key(o.period) = private.badge_slot_key(f.period)
                    and private.badge_slot_key(o.division) = private.badge_slot_key(f.division)
                    and (o.awarded_at, o.id) < (f.awarded_at, f.id));
  update public.league_badge_awards x set player_id = p_into where x.player_id = p_from;

  -- «Se vinculó él mismo» (…1110, §1.6) pasa al que queda: ese historial ahora está ahí. La fila del que se va se
  -- borra aquí (tiene FK a players: si quedara, el guardia del catálogo de merge_players_base frenaría toda unión de
  -- un jugador marcado con 'conflicto: private.badge_self_links').
  insert into private.badge_self_links (player_id, user_id, created_at)
  select p_into, s.user_id, s.created_at from private.badge_self_links s where s.player_id = p_from
  on conflict (player_id) do nothing;
  delete from private.badge_self_links s where s.player_id = p_from;
  -- Si el que queda ya es de una cuenta (juntar un jugador sin cuenta con el de un admin), lo que esa cuenta le dio o
  -- le confirmó se va (nadie se da insignias a sí mismo).
  perform private.badge_link_guard(p_into);

  perform private.badge_signal('merge', p_league, p_into, null);
end $$;

-- Nadie se da ni se confirma insignias a sí mismo (§5.1, §5.8), tampoco dándoselas a un jugador sin cuenta que
-- después reclama (su reclamo se aprueba al instante por ser dueño o admin), vincula (link_account_to_player) o junta
-- con el suyo. Cuando el jugador queda con una cuenta: las insignias de la liga que esa cuenta le dio se retiran (sin
-- push; el motivo, privado: «Se la dio la misma cuenta») y las hazañas que esa cuenta le confirmó (aval,
-- context.review.by) vuelven a revisión, fuera de las destacadas, para que las confirme otro (push a los revisores).
create function private.badge_link_guard(p_player uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select p.user_id from public.players p where p.id = p_player);
  v_back uuid[];
begin
  if v_user is null then
    return;
  end if;
  update public.league_badge_awards a
     set revoked_at = now(), revoked_by = null, revoke_reason = 'Se la dio la misma cuenta'
   where a.player_id = p_player and a.awarded_by = v_user and a.revoked_at is null;
  with back as (
    update public.badge_awards a
       set status = 'en_revision', firm_at = null, context = a.context - 'review'
     where a.player_id = p_player and a.status in ('provisional', 'firme')
       and a.context -> 'review' ->> 'by' = v_user::text and a.context -> 'review' ->> 'ok' = 'true'
    returning a.id)
  select coalesce(array_agg(b.id), '{}'::uuid[]) into v_back from back b;
  if cardinality(v_back) > 0 then
    update public.profiles pr
       set featured_badges = array(select u.x from unnest(pr.featured_badges) with ordinality as u (x, n)
                                    where u.x <> all (v_back) order by u.n)
     where pr.featured_badges && v_back;
    perform private.badge_push_reviewers(v_back);
  end if;
end $$;

create function private.badges_on_link_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.badge_link_guard(new.id);
  return null;
end $$;
create trigger players_badges_guard after update of user_id on public.players
  for each row when (new.user_id is not null and old.user_id is distinct from new.user_id)
  execute function private.badges_on_link_guard();

-- =====================================================================
-- Miembros: un admin no saca a quien diseña insignias
-- =====================================================================

-- Igual que en 20260926000500_rpc.sql, con badge_maker entre los permisos que impiden que un admin saque a alguien
-- (sacarlo sería quitarle el permiso, y eso es del dueño).
create or replace function public.remove_member(p_league uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_role text;
  v_scorer boolean;
  v_maker boolean;
begin
  select m.role, m.is_scorer, m.badge_maker into v_role, v_scorer, v_maker from public.league_members m
   where m.league_id = p_league and m.user_id = p_user for update;
  if v_role is null then
    perform private.fail('no_existe');
  end if;
  if v_role = 'owner' then
    perform private.deny();
  end if;
  if not (p_user = v_uid or private.is_owner(p_league)
          or (private.is_admin(p_league) and v_role = 'member' and not v_scorer and not v_maker)) then
    perform private.deny();
  end if;
  delete from public.live_states s using public.players p
   where p.league_id = p_league and p.user_id = p_user and s.player_id = p.id;
  delete from public.league_members where league_id = p_league and user_id = p_user;
end $$;

-- =====================================================================
-- RPC: permisos
-- =====================================================================

-- Dueño (o superadmin): ¿quién diseña y da insignias? 'owner' | 'admins' | 'chosen'. 'no_existe', 'no_permitido',
-- 'invalido'. Devuelve la política.
create function public.set_badge_policy(p_league uuid, p_policy text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if p_league is null or not exists (select 1 from public.leagues l where l.id = p_league) then
    perform private.fail('no_existe');
  end if;
  if not private.is_owner(p_league) then
    perform private.deny();
  end if;
  if p_policy is null or p_policy not in ('owner', 'admins', 'chosen') then
    perform private.fail('invalido');
  end if;
  update public.leagues l set badge_makers = p_policy where l.id = p_league and l.badge_makers is distinct from p_policy;
  return p_policy;
end $$;

-- Dueño (o superadmin): «Diseña insignias» de un miembro (vale con la política 'chosen'). Como set_member_scorer.
create function public.set_member_badge_maker(p_league uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not private.is_owner(p_league) then
    perform private.deny();
  end if;
  update public.league_members m set badge_maker = coalesce(p_on, false)
   where m.league_id = p_league and m.user_id = p_user;
  if not found then
    perform private.fail('no_existe');
  end if;
end $$;

-- =====================================================================
-- RPC: diseños
-- =====================================================================

-- Crea (p_id null o un id nuevo del teléfono) o cambia (p_id de la liga) un diseño. p_design (snake_case, solo lo que
-- cambia al editar): template (string|null), name, description, shape, palette, color (string|null; solo con palette
-- 'color'), icon, top_text, period_text, limit_kind, by_team (boolean), status ('activa'|'archivada'). Al crear hacen
-- falta name, shape, palette e icon. Los textos se recortan y quedan con un espacio entre palabras.
-- Quién: private.can_badges. Errores: 'no_existe' (liga, o p_id de otra liga), 'no_permitido' (sin permiso o diseño
-- escondido por el superadmin), 'invalido' (clave desconocida, tipo, largo, forma, color, ícono fuera de la lista,
-- by_team fuera de equipos y parejas), 'texto_bloqueado' (private.badge_text_ok), 'ya_dada' (ya se dio: solo cambian
-- description y status), 'limite: activas' (30 activos), 'limite: total' (100 con archivados), 'rate_limited' (20
-- guardados por hora por cuenta). Devuelve el diseño (private.league_badge_json).
create function public.save_league_badge(p_league uuid, p_id uuid, p_design jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_keys constant text[] := array['template', 'name', 'description', 'shape', 'palette', 'color', 'icon', 'top_text',
                                  'period_text', 'limit_kind', 'by_team', 'status'];
  v_rate text := private.rate_key('badge_save');
  v_key text;
  v_new boolean;
  o public.league_badges;
  n public.league_badges;
begin
  if p_league is null or not exists (select 1 from public.leagues l where l.id = p_league) then
    perform private.fail('no_existe');
  end if;
  if not private.can_badges(p_league) then
    perform private.deny();
  end if;
  if p_design is null or jsonb_typeof(p_design) <> 'object' then
    perform private.fail('invalido');
  end if;
  for v_key in select jsonb_object_keys(p_design) loop
    if v_key <> all (v_keys) then
      perform private.fail('invalido');
    end if;
  end loop;
  -- Una escritura por liga a la vez: los límites se cuentan sin carreras.
  perform 1 from public.leagues l where l.id = p_league for no key update;
  select * into o from public.league_badges b where b.id = p_id for update;
  v_new := o.id is null;
  if not v_new and o.league_id <> p_league then
    perform private.fail('no_existe');
  end if;
  if not v_new and o.status = 'oculta' then
    perform private.deny();
  end if;
  if private.rate_blocked(v_rate, 20, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;

  if v_new then
    n.id := coalesce(p_id, gen_random_uuid());
    n.league_id := p_league;
    n.description := '';
    n.top_text := '';
    n.period_text := '';
    n.limit_kind := 'abierta';
    n.by_team := false;
    n.status := 'activa';
    n.created_by := v_uid;
    n.created_at := now();
    n.updated_at := now();
  else
    n := o;
  end if;
  if p_design ? 'template' then
    n.template := nullif(private.badge_clean(private.badge_design_text(p_design, 'template', true)), '');
  end if;
  if p_design ? 'name' then
    n.name := private.badge_clean(private.badge_design_text(p_design, 'name'));
  end if;
  if p_design ? 'description' then
    n.description := private.badge_clean(private.badge_design_text(p_design, 'description'));
  end if;
  if p_design ? 'shape' then
    n.shape := private.badge_design_text(p_design, 'shape');
  end if;
  if p_design ? 'palette' then
    n.palette := private.badge_design_text(p_design, 'palette');
  end if;
  if p_design ? 'color' then
    n.color := nullif(lower(btrim(coalesce(private.badge_design_text(p_design, 'color', true), ''))), '');
  end if;
  if p_design ? 'icon' then
    n.icon := private.badge_design_text(p_design, 'icon');
  end if;
  if p_design ? 'top_text' then
    n.top_text := private.badge_clean(private.badge_design_text(p_design, 'top_text'));
  end if;
  if p_design ? 'period_text' then
    n.period_text := private.badge_clean(private.badge_design_text(p_design, 'period_text'));
  end if;
  if p_design ? 'limit_kind' then
    n.limit_kind := private.badge_design_text(p_design, 'limit_kind');
  end if;
  if p_design ? 'by_team' then
    if jsonb_typeof(p_design -> 'by_team') <> 'boolean' then
      perform private.fail('invalido');
    end if;
    n.by_team := (p_design ->> 'by_team')::boolean;
  end if;
  if p_design ? 'status' then
    n.status := private.badge_design_text(p_design, 'status');
  end if;
  -- Un metal o el color de la liga no llevan color propio.
  if n.palette is distinct from 'color' then
    n.color := null;
  end if;

  if n.name is null or char_length(n.name) not between 3 and 28
     or char_length(n.description) > 140 or char_length(n.top_text) > 14 or char_length(n.period_text) > 10
     or n.shape is null or n.shape not in ('hex', 'shield', 'circle', 'star', 'medal', 'medal_laurel', 'square')
     or n.palette is null or n.palette not in ('bronce', 'plata', 'oro', 'platino', 'diamante', 'liga', 'color')
     or (n.palette = 'color' and coalesce(n.color, '') !~ '^#[0-9a-f]{6}$')
     or n.icon is null or not private.badge_icon_ok(n.icon)
     or (n.template is not null and n.template !~ '^[a-z_]{1,32}$')
     or n.limit_kind not in ('unica', 'selecta', 'abierta')
     or n.status not in ('activa', 'archivada')
     or (n.by_team and coalesce(private.league_family(p_league), '') not in ('racket', 'team')) then
    perform private.fail('invalido');
  end if;
  if not (private.badge_text_ok(n.name) and private.badge_text_ok(n.description)
          and private.badge_text_ok(n.top_text) and private.badge_text_ok(n.period_text)) then
    perform private.fail('texto_bloqueado');
  end if;
  -- Ya se dio: solo cambian la descripción y el estado (para más, «Duplicar»).
  if not v_new
     and (n.template, n.name, n.shape, n.palette, n.color, n.icon, n.top_text, n.period_text, n.limit_kind, n.by_team)
         is distinct from (o.template, o.name, o.shape, o.palette, o.color, o.icon, o.top_text, o.period_text, o.limit_kind, o.by_team)
     and exists (select 1 from public.league_badge_awards a where a.badge_id = o.id) then
    perform private.fail('ya_dada');
  end if;
  if v_new and (select count(*) from public.league_badges b where b.league_id = p_league) >= 100 then
    perform private.fail('limite: total');
  end if;
  if n.status = 'activa' and (v_new or o.status <> 'activa')
     and (select count(*) from public.league_badges b where b.league_id = p_league and b.status = 'activa') >= 30 then
    perform private.fail('limite: activas');
  end if;

  if v_new then
    insert into public.league_badges values (n.*);
  else
    update public.league_badges b
       set template = n.template, name = n.name, description = n.description, shape = n.shape, palette = n.palette,
           color = n.color, icon = n.icon, top_text = n.top_text, period_text = n.period_text,
           limit_kind = n.limit_kind, by_team = n.by_team, status = n.status
     where b.id = o.id
       and (b.template, b.name, b.description, b.shape, b.palette, b.color, b.icon, b.top_text, b.period_text,
            b.limit_kind, b.by_team, b.status)
           is distinct from (n.template, n.name, n.description, n.shape, n.palette, n.color, n.icon, n.top_text,
                             n.period_text, n.limit_kind, n.by_team, n.status);
  end if;
  perform private.rate_hit(v_rate, interval '1 hour');
  return private.league_badge_json(n.id);
end $$;

-- Archivar (true) o volver a activar (false) un diseño. Quién: private.can_badges. Activar respeta los 30 activos
-- ('limite: activas'). Escondido por el superadmin: 'no_permitido'. 'no_existe', 'invalido'. Devuelve el estado.
create function public.archive_league_badge(p_id uuid, p_archived boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  b public.league_badges;
  v_status text;
begin
  perform private.require_uid();
  select * into b from public.league_badges x where x.id = p_id;
  if b.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.can_badges(b.league_id) or b.status = 'oculta' then
    perform private.deny();
  end if;
  if p_archived is null then
    perform private.fail('invalido');
  end if;
  v_status := case when p_archived then 'archivada' else 'activa' end;
  if v_status = b.status then
    return v_status;
  end if;
  perform 1 from public.leagues l where l.id = b.league_id for no key update;
  if v_status = 'activa'
     and (select count(*) from public.league_badges x where x.league_id = b.league_id and x.status = 'activa') >= 30 then
    perform private.fail('limite: activas');
  end if;
  update public.league_badges x set status = v_status where x.id = p_id and x.status <> 'oculta';
  return v_status;
end $$;

-- Borrar un diseño que nunca se dio (deja tombstone). Si se dio alguna vez (aunque la retiraran): 'ya_dada' (se
-- archiva). Quién: private.can_badges. 'no_existe'.
create function public.delete_league_badge(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.league_badges;
begin
  perform private.require_uid();
  select * into b from public.league_badges x where x.id = p_id for update;
  if b.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.can_badges(b.league_id) then
    perform private.deny();
  end if;
  if exists (select 1 from public.league_badge_awards a where a.badge_id = p_id) then
    perform private.fail('ya_dada');
  end if;
  delete from public.league_badges x where x.id = p_id;
end $$;

-- Superadmin (moderación): esconde (p_hidden true → 'oculta': nadie de la liga la ve salvo sus admins, ni sale en
-- perfiles) o deja de esconder (→ 'archivada': la liga la vuelve a activar si quiere) un diseño. Cierra los reportes
-- abiertos del diseño ('oculta'). Auditoría 'hide_league_badge'. Nota ≤ 200. 'no_existe', 'invalido'. Devuelve el
-- estado.
create function public.hide_league_badge(p_id uuid, p_hidden boolean, p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_super();
  v_note text := nullif(private.badge_clean(p_note), '');
  b public.league_badges;
  v_status text;
begin
  if p_hidden is null or char_length(v_note) > 200 then
    perform private.fail('invalido');
  end if;
  select * into b from public.league_badges x where x.id = p_id for update;
  if b.id is null then
    perform private.fail('no_existe');
  end if;
  v_status := case when p_hidden then 'oculta' when b.status = 'oculta' then 'archivada' else b.status end;
  if v_status <> b.status then
    update public.league_badges x set status = v_status where x.id = p_id;
    perform private.audit('hide_league_badge', 'league', b.league_id::text,
                          jsonb_build_object('badge', b.id, 'name', b.name, 'hidden', p_hidden, 'from', b.status,
                                             'note', v_note));
  end if;
  if p_hidden then
    update private.badge_reports r set resolved_at = now(), resolved_by = v_uid, resolution = 'oculta'
     where r.badge_id = p_id and r.resolved_at is null;
  end if;
  return v_status;
end $$;

-- =====================================================================
-- RPC: dar, deshacer, retirar, ocultar y ver
-- =====================================================================

-- Da un diseño activo a jugadores de su liga (1–30; repetidos cuentan uno). Con by_team: p_team (equipo de la liga)
-- es obligatorio y los jugadores tienen que estar en su plantilla (team_players); sin by_team, p_team va null.
-- p_period null = el period_text del diseño; p_division ≤ 16 («Cat. A»); p_note ≤ 140. p_notify: push a cada jugador
-- con cuenta (nunca en ligas con menores ni a cuentas bloqueadas), tag 'insignia:<otorgamiento>'.
-- Quién: private.can_badges, y nunca a su propio jugador ('a_si_mismo': «No puedes darte insignias a ti mismo. Pídele
-- a otro admin o al dueño.»). Errores: 'no_existe' (diseño, jugador o equipo de otra liga), 'no_permitido',
-- 'no_activa' (archivada o escondida), 'invalido', 'texto_bloqueado', 'duplicado' (ya la tiene vigente con ese periodo
-- y división), 'cupo_lleno' (Única 1, Selecta 3, Abierta 20 jugadores —o equipos con by_team— por periodo y división),
-- 'limite: jugador' (15 vigentes por jugador, liga y año de la liga), 'limite: liga' (60 en 30 días, contando las
-- retiradas), 'rate_limited' (60 por cuenta por hora, contando las retiradas). Periodo y división se comparan sin
-- mayúsculas, tildes ni signos (private.badge_slot_key): «Temp 2026.» es el mismo periodo que «TEMP 2026».
-- Devuelve {awards: [{id, badgeId, leagueId, playerId, teamId, period, division, note, awardedBy, awardedAt, hidden,
-- revokedAt}], notified: cuántos jugadores con cuenta recibieron el push}.
create function public.award_league_badge(p_badge uuid, p_players uuid[], p_team uuid default null,
                                          p_period text default null, p_division text default null,
                                          p_note text default null, p_notify boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  b public.league_badges;
  l public.leagues;
  v_players uuid[];
  v_period text;
  v_division text;
  v_note text;
  v_limit integer;
  v_units integer;
  v_year timestamptz;
  v_ids uuid[];
  v_sent integer := 0;
  r record;
begin
  select * into b from public.league_badges x where x.id = p_badge;
  if b.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.can_badges(b.league_id) then
    perform private.deny();
  end if;
  -- Una escritura por liga a la vez: los cupos se cuentan sin carreras.
  select * into l from public.leagues x where x.id = b.league_id for no key update;
  select * into b from public.league_badges x where x.id = p_badge for share;
  if b.status <> 'activa' then
    perform private.fail('no_activa');
  end if;
  if p_players is null or coalesce(array_ndims(p_players), 1) <> 1 or array_position(p_players, null) is not null then
    perform private.fail('invalido');
  end if;
  v_players := array(select u.x from unnest(p_players) with ordinality as u (x, n) group by u.x order by min(u.n));
  if cardinality(v_players) not between 1 and 30 then
    perform private.fail('invalido');
  end if;
  if (select count(*) from public.players p where p.id = any (v_players) and p.league_id = b.league_id)
     <> cardinality(v_players) then
    perform private.fail('no_existe');
  end if;
  if b.by_team then
    if p_team is null then
      perform private.fail('invalido');
    end if;
    if not exists (select 1 from public.teams t where t.id = p_team and t.league_id = b.league_id) then
      perform private.fail('no_existe');
    end if;
    if exists (select 1 from unnest(v_players) u (x)
                where not exists (select 1 from public.team_players tp where tp.team_id = p_team and tp.player_id = u.x)) then
      perform private.fail('invalido');
    end if;
  elsif p_team is not null then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from public.players p where p.id = any (v_players) and p.user_id = v_uid) then
    perform private.fail('a_si_mismo');
  end if;
  v_period := private.badge_clean(coalesce(p_period, b.period_text));
  v_division := private.badge_clean(p_division);
  v_note := private.badge_clean(p_note);
  if char_length(v_period) > 10 or char_length(v_division) > 16 or char_length(v_note) > 140 then
    perform private.fail('invalido');
  end if;
  if not (private.badge_text_ok(v_period) and private.badge_text_ok(v_division) and private.badge_text_ok(v_note)) then
    perform private.fail('texto_bloqueado');
  end if;
  if exists (select 1 from public.league_badge_awards a
              where a.badge_id = b.id and a.player_id = any (v_players) and a.revoked_at is null
                and private.badge_slot_key(a.period) = private.badge_slot_key(v_period)
                and private.badge_slot_key(a.division) = private.badge_slot_key(v_division)) then
    perform private.fail('duplicado');
  end if;
  -- Cupo por insignia, periodo y división (con by_team, un equipo cuenta 1).
  v_limit := case b.limit_kind when 'unica' then 1 when 'selecta' then 3 else 20 end;
  select count(distinct case when b.by_team then coalesce(a.team_id, a.player_id) else a.player_id end)::integer
    into v_units
    from public.league_badge_awards a
   where a.badge_id = b.id and private.badge_slot_key(a.period) = private.badge_slot_key(v_period)
     and private.badge_slot_key(a.division) = private.badge_slot_key(v_division) and a.revoked_at is null;
  if v_units + (case when not b.by_team then cardinality(v_players)
                     when exists (select 1 from public.league_badge_awards a
                                   where a.badge_id = b.id and private.badge_slot_key(a.period) = private.badge_slot_key(v_period)
                                     and private.badge_slot_key(a.division) = private.badge_slot_key(v_division)
                                     and a.revoked_at is null and a.team_id = p_team) then 0
                     else 1 end) > v_limit then
    perform private.fail('cupo_lleno');
  end if;
  -- 15 vigentes por jugador, liga y año (el año de la zona de la liga).
  v_year := date_trunc('year', now() at time zone l.tz) at time zone l.tz;
  if exists (select 1 from unnest(v_players) u (x)
              where (select count(*) from public.league_badge_awards a
                      where a.player_id = u.x and a.revoked_at is null and a.awarded_at >= v_year) >= 15) then
    perform private.fail('limite: jugador');
  end if;
  if (select count(*) from public.league_badge_awards a
       where a.league_id = b.league_id and a.awarded_at > now() - interval '30 days') + cardinality(v_players) > 60 then
    perform private.fail('limite: liga');
  end if;
  if (select count(*) from public.league_badge_awards a
       where a.awarded_by = v_uid and a.awarded_at > now() - interval '1 hour') + cardinality(v_players) > 60 then
    perform private.fail('rate_limited');
  end if;

  with ins as (
    insert into public.league_badge_awards (badge_id, league_id, player_id, team_id, period, division, note, awarded_by)
    select b.id, b.league_id, u.x, p_team, v_period, v_division, v_note, v_uid
      from unnest(v_players) with ordinality as u (x, n)
     order by u.n
    returning id, player_id)
  select array_agg(i.id order by array_position(v_players, i.player_id)) into v_ids from ins i;

  if coalesce(p_notify, true) and not l.has_minors then
    for r in
      select a.id, p.user_id
        from public.league_badge_awards a
        join public.players p on p.id = a.player_id
        join public.profiles pr on pr.id = p.user_id
       where a.id = any (v_ids) and pr.blocked_at is null
       order by array_position(v_ids, a.id)
    loop
      insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
      values (r.user_id, '¡Tienes una insignia nueva!',
              left(l.name || ' te dio “' || b.name || coalesce(' · ' || nullif(v_period, ''), '') || '”. Tócala para verla.', 1000),
              '/u/' || r.user_id::text || '?tab=insignias', 'insignia:' || r.id::text, 86400, 'normal');
      v_sent := v_sent + 1;
    end loop;
    if v_sent > 0 then
      perform private.kick_send_push();
    end if;
  end if;

  return jsonb_build_object(
    'awards', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'badgeId', a.badge_id, 'leagueId', a.league_id, 'playerId', a.player_id, 'teamId', a.team_id,
               'period', a.period, 'division', a.division, 'note', a.note, 'awardedBy', a.awarded_by,
               'awardedAt', private.iso(a.awarded_at), 'hidden', a.hidden, 'revokedAt', private.iso(a.revoked_at))
               order by array_position(v_ids, a.id))
        from public.league_badge_awards a where a.id = any (v_ids)), '[]'::jsonb),
    'notified', v_sent);
end $$;

-- Deshacer (quien la dio, en 24 h y con permiso de dar) o retirar (el dueño o el superadmin, cuando sea). Sin push:
-- si el push de ese otorgamiento todavía no salió, se quita de la cola. p_reason ≤ 140, privado (dueño y admins). Ya
-- retirada: nada. El superadmin que no administra la liga queda en la auditoría ('revoke_league_badge').
-- 'no_existe', 'no_permitido', 'invalido'.
create function public.revoke_league_badge_award(p_award uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_reason text := nullif(private.badge_clean(p_reason), '');
  a public.league_badge_awards;
begin
  select * into a from public.league_badge_awards x where x.id = p_award for update;
  if a.id is null then
    perform private.fail('no_existe');
  end if;
  if not (private.is_owner(a.league_id)
          or (a.awarded_by = v_uid and a.awarded_at > now() - interval '24 hours' and private.can_badges(a.league_id))) then
    perform private.deny();
  end if;
  if char_length(v_reason) > 140 then
    perform private.fail('invalido');
  end if;
  if a.revoked_at is not null then
    return;
  end if;
  update public.league_badge_awards x set revoked_at = now(), revoked_by = v_uid, revoke_reason = v_reason
   where x.id = p_award;
  delete from public.push_outbox o
   where o.tag = 'insignia:' || p_award::text and o.sent_at is null and o.claimed_at is null;
  if private.is_super() and not exists (select 1 from public.league_members m
                                         where m.league_id = a.league_id and m.user_id = v_uid and m.role = 'owner') then
    perform private.audit('revoke_league_badge', 'league', a.league_id::text,
                          jsonb_build_object('award', a.id, 'badge', a.badge_id, 'playerId', a.player_id,
                                             'period', a.period, 'division', a.division, 'reason', v_reason));
  end if;
end $$;

-- El jugador (la cuenta de su jugador) oculta de su perfil (true) o muestra (false) una insignia de la liga. El
-- superadmin también (con auditoría). 'no_existe', 'no_permitido', 'invalido' (null). Devuelve p_hidden.
create function public.set_league_badge_hidden(p_award uuid, p_hidden boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_found boolean;
  v_owner uuid;
  v_league uuid;
begin
  if p_hidden is null then
    perform private.fail('invalido');
  end if;
  select true, p.user_id, a.league_id into v_found, v_owner, v_league
    from public.league_badge_awards a join public.players p on p.id = a.player_id
   where a.id = p_award
     for update of a;
  if v_found is null then
    perform private.fail('no_existe');
  end if;
  if v_owner is distinct from v_uid and not private.is_super() then
    perform private.deny();
  end if;
  update public.league_badge_awards a set hidden = p_hidden where a.id = p_award and a.hidden is distinct from p_hidden;
  if found and v_owner is distinct from v_uid then
    perform private.audit('hide_league_badge_award', 'league', v_league::text,
                          jsonb_build_object('award', p_award, 'hidden', p_hidden));
  end if;
  return p_hidden;
end $$;

-- Ya vio el aviso de estas insignias de liga: hasta 50 ids ('invalido' si más o null). Solo las de sus jugadores,
-- vigentes y sin ver; las demás se ignoran. Devuelve cuántas marcó.
create function public.mark_league_badges_seen(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  n integer;
begin
  if p_ids is null or coalesce(array_ndims(p_ids), 1) <> 1 or cardinality(p_ids) > 50 then
    perform private.fail('invalido');
  end if;
  update public.league_badge_awards a set seen_at = now()
   where a.id = any (p_ids) and a.seen_at is null and a.revoked_at is null
     and a.player_id in (select p.id from public.players p where p.user_id = v_uid);
  get diagnostics n = row_count;
  return n;
end $$;

-- Quién tiene un diseño («quién la tiene», la pestaña de Admin y el detalle). Quien ve la liga (un diseño escondido,
-- solo sus admins; si no, 'no_existe').
-- {badge: LeagueBadge (+ openReports para los admins), canGive, awards: [{id, playerId, playerName, userId, teamId,
--  teamName, period, division, awardedAt, hidden, revokedAt, note, awardedBy, awardedByName, revokedBy, revokeReason,
--  canUndo}]}, más nuevas primero. Admins (y superadmin): todas, también ocultas y retiradas, con todo. Los demás: las
-- vigentes y no ocultas (y las suyas ocultas); note solo en las suyas; awardedBy, awardedByName, revokedBy y
-- revokeReason null. canUndo: puede deshacerla o retirarla (el dueño; quien la dio, en 24 h).
create function public.league_badge_holders(p_badge uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  b public.league_badges;
  v_admin boolean;
  v_owner boolean;
  v_can boolean;
begin
  select * into b from public.league_badges x where x.id = p_badge;
  if b.id is null or not exists (select 1 from private.readable_leagues() r (id) where r.id = b.league_id) then
    perform private.fail('no_existe');
  end if;
  v_admin := private.is_admin(b.league_id);
  if b.status = 'oculta' and not v_admin then
    perform private.fail('no_existe');
  end if;
  v_owner := private.is_owner(b.league_id);
  v_can := private.can_badges(b.league_id);
  return jsonb_build_object(
    'badge', private.league_badge_json(b.id)
             || case when v_admin then jsonb_build_object('openReports', (
                  select count(*)::integer from private.badge_reports r where r.badge_id = b.id and r.resolved_at is null))
                else '{}'::jsonb end,
    'canGive', v_can and b.status = 'activa',
    'awards', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'playerId', a.player_id, 'playerName', p.name, 'userId', p.user_id, 'teamId', a.team_id,
               'teamName', t.name, 'period', a.period, 'division', a.division,
               'awardedAt', private.iso(a.awarded_at), 'hidden', a.hidden, 'revokedAt', private.iso(a.revoked_at),
               'note', case when v_admin or p.user_id = v_uid then a.note end,
               'awardedBy', case when v_admin then a.awarded_by end,
               'awardedByName', case when v_admin then coalesce(gm.display_name, gp.name) end,
               'revokedBy', case when v_admin then a.revoked_by end,
               'revokeReason', case when v_admin then a.revoke_reason end,
               'canUndo', a.revoked_at is null
                          and (v_owner or (v_can and a.awarded_by = v_uid and a.awarded_at > now() - interval '24 hours')))
               order by a.awarded_at desc, a.id desc)
        from public.league_badge_awards a
        join public.players p on p.id = a.player_id
        left join public.teams t on t.id = a.team_id
        left join public.league_members gm on gm.league_id = a.league_id and gm.user_id = a.awarded_by
        left join public.profiles gp on gp.id = a.awarded_by
       where a.badge_id = b.id
         and (v_admin or (a.revoked_at is null and (not a.hidden or p.user_id = v_uid)))), '[]'::jsonb));
end $$;

-- =====================================================================
-- RPC: reportes y moderación
-- =====================================================================

-- Reportar un diseño de la liga (miembro de la liga; no uno escondido). p_reason ≤ 140 (opcional). Si ya lo tenía
-- reportado (abierto), nada. 5 reportes por día por cuenta (con report_badge): 'rate_limited'. 'no_existe',
-- 'no_permitido', 'invalido'.
create function public.report_league_badge(p_badge uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_reason text := private.badge_clean(p_reason);
  v_rate text := private.rate_key('badge_report');
  b public.league_badges;
begin
  select * into b from public.league_badges x where x.id = p_badge;
  if b.id is null or b.status = 'oculta' then
    perform private.fail('no_existe');
  end if;
  if not private.is_member(b.league_id) then
    perform private.deny();
  end if;
  if char_length(v_reason) > 140 then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from private.badge_reports r where r.badge_id = p_badge and r.user_id = v_uid and r.resolved_at is null) then
    return;
  end if;
  if private.rate_blocked(v_rate, 5, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  perform private.rate_hit(v_rate, interval '1 day');
  insert into private.badge_reports (badge_id, league_id, user_id, reason) values (p_badge, b.league_id, v_uid, v_reason);
end $$;

-- Reportar una insignia automática (§3.9) que se ve (provisional o firme, no oculta): de una liga, un miembro de esa
-- liga; de cuenta, quien puede ver ese perfil (social_can_see). Mismo cupo y reglas que report_league_badge.
create function public.report_badge(p_award uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_reason text := private.badge_clean(p_reason);
  v_rate text := private.rate_key('badge_report');
  a public.badge_awards;
begin
  select * into a from public.badge_awards x where x.id = p_award;
  if a.id is null or a.status not in ('provisional', 'firme') or a.hidden then
    perform private.fail('no_existe');
  end if;
  if (a.league_id is not null and not private.is_member(a.league_id))
     or (a.user_id is not null and not private.social_can_see(a.user_id)) then
    perform private.deny();
  end if;
  if char_length(v_reason) > 140 then
    perform private.fail('invalido');
  end if;
  if exists (select 1 from private.badge_reports r where r.award_id = p_award and r.user_id = v_uid and r.resolved_at is null) then
    return;
  end if;
  if private.rate_blocked(v_rate, 5, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  perform private.rate_hit(v_rate, interval '1 day');
  insert into private.badge_reports (award_id, league_id, user_id, reason) values (p_award, a.league_id, v_uid, v_reason);
end $$;

-- «Descargar mis datos» (badgeReports de export_my_data, …1100, que aquí devolvía []): los reportes de insignias que
-- hizo la cuenta, del más viejo al más nuevo (hasta 5000, como cada tabla del export): [{id, kind: 'diseno'|
-- 'insignia', targetId, leagueId, leagueName, reason, createdAt, resolvedAt, resolution}]. Sin quién lo atendió (como
-- my_reports de …0900).
create or replace function private.my_badge_reports(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id,
           'kind', case when x.badge_id is not null then 'diseno' else 'insignia' end,
           'targetId', coalesce(x.badge_id, x.award_id),
           'leagueId', x.league_id,
           'leagueName', l.name,
           'reason', x.reason,
           'createdAt', private.iso(x.created_at),
           'resolvedAt', private.iso(x.resolved_at),
           'resolution', x.resolution)
           order by x.created_at, x.id), '[]'::jsonb)
    from (select r.* from private.badge_reports r where r.user_id = p_user order by r.created_at, r.id limit 5000) x
    left join public.leagues l on l.id = x.league_id
$$;

-- Superadmin: la cola de reportes (p_open true: abiertos; false: cerrados), más nuevos primero, hasta p_limit (1–200).
-- {open: cuántos abiertos, rows: [{id, kind: 'diseno'|'insignia', reason, createdAt, resolvedAt, resolution,
--  reporterId, reporterName, leagueId, leagueName, sameTarget (abiertos del mismo diseño o insignia), design:
--  LeagueBadge|null, award: {id, key, sport, level, periodKey, status, playerId, playerName, userId, context}|null}]}.
create function public.admin_badge_reports(p_open boolean default true, p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_open boolean := coalesce(p_open, true);
  v_limit integer := private.clamp_int(p_limit, 1, 200, 50);
begin
  perform private.require_super();
  return jsonb_build_object(
    'open', (select count(*)::integer from private.badge_reports r where r.resolved_at is null),
    'rows', coalesce((
      select jsonb_agg(z.item order by z.created_at desc, z.id desc)
        from (
          select r.id, r.created_at, jsonb_build_object(
                   'id', r.id, 'kind', case when r.badge_id is not null then 'diseno' else 'insignia' end,
                   'reason', r.reason, 'createdAt', private.iso(r.created_at), 'resolvedAt', private.iso(r.resolved_at),
                   'resolution', r.resolution, 'reporterId', r.user_id, 'reporterName', pr.name,
                   'leagueId', r.league_id, 'leagueName', l.name,
                   'sameTarget', (select count(*)::integer from private.badge_reports o
                                   where o.resolved_at is null
                                     and (o.badge_id = r.badge_id or o.award_id = r.award_id)),
                   'design', case when r.badge_id is not null then private.league_badge_json(r.badge_id) end,
                   'award', (select jsonb_build_object('id', a.id, 'key', a.badge_key, 'sport', a.sport, 'level', a.level,
                                                      'periodKey', a.period_key, 'status', a.status, 'playerId', a.player_id,
                                                      'playerName', p.name, 'userId', coalesce(a.user_id, p.user_id),
                                                      'context', a.context)
                               from public.badge_awards a left join public.players p on p.id = a.player_id
                              where a.id = r.award_id)) as item
            from private.badge_reports r
            left join public.profiles pr on pr.id = r.user_id
            left join public.leagues l on l.id = r.league_id
           where (r.resolved_at is null) = v_open
           order by r.created_at desc, r.id desc
           limit v_limit) z), '[]'::jsonb));
end $$;

-- Superadmin: cierra reportes sin hacer nada ('descartado'). Auditoría 'resolve_badge_reports' {ids, note}. Nota
-- ≤ 200. Devuelve cuántos cerró.
create function public.admin_resolve_badge_reports(p_ids bigint[], p_note text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_super();
  v_note text := nullif(private.badge_clean(p_note), '');
  v_done bigint[];
begin
  if p_ids is null or coalesce(array_ndims(p_ids), 1) <> 1 or cardinality(p_ids) > 200 or char_length(v_note) > 200 then
    perform private.fail('invalido');
  end if;
  with d as (
    update private.badge_reports r set resolved_at = now(), resolved_by = v_uid, resolution = 'descartado'
     where r.id = any (p_ids) and r.resolved_at is null
    returning r.id)
  select coalesce(array_agg(d.id order by d.id), '{}') into v_done from d;
  if cardinality(v_done) > 0 then
    perform private.audit('resolve_badge_reports', 'app', null, jsonb_build_object('ids', to_jsonb(v_done), 'note', v_note));
  end if;
  return cardinality(v_done);
end $$;

-- Superadmin: palabras bloqueadas del creador. Añade p_add (con p_whole: solo como palabra entera) y quita p_remove;
-- cada una se normaliza como el filtro (private.badge_fold, sin espacios) y tiene que quedar con 2–40 letras
-- ('invalido'); hasta 200 por llamada. Sin nada: solo lista. Auditoría 'blocked_terms' si cambió algo. Devuelve la
-- lista [{term, whole, createdAt}] por orden alfabético.
create function public.admin_blocked_terms(p_add text[] default null, p_remove text[] default null,
                                           p_whole boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_add text[];
  v_remove text[];
  v_added integer;
  v_removed integer;
begin
  perform private.require_super();
  if cardinality(coalesce(p_add, '{}')) > 200 or cardinality(coalesce(p_remove, '{}')) > 200 then
    perform private.fail('invalido');
  end if;
  v_add := array(select distinct replace(private.badge_fold(x), ' ', '') from unnest(coalesce(p_add, '{}')) x);
  v_remove := array(select distinct replace(private.badge_fold(x), ' ', '') from unnest(coalesce(p_remove, '{}')) x);
  if exists (select 1 from unnest(v_add || v_remove) t where t !~ '^[a-z]{2,40}$') then
    perform private.fail('invalido');
  end if;
  insert into private.blocked_terms as b (term, whole)
  select t, coalesce(p_whole, false) from unnest(v_add) t
  on conflict (term) do update set whole = excluded.whole where b.whole is distinct from excluded.whole;
  get diagnostics v_added = row_count;
  delete from private.blocked_terms b where b.term = any (v_remove);
  get diagnostics v_removed = row_count;
  if v_added + v_removed > 0 then
    perform private.audit('blocked_terms', 'app', null,
                          jsonb_build_object('added', to_jsonb(v_add), 'removed', to_jsonb(v_remove), 'whole', coalesce(p_whole, false)));
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('term', b.term, 'whole', b.whole, 'createdAt', private.iso(b.created_at))
                                    order by b.term)
                     from private.blocked_terms b), '[]'::jsonb);
end $$;

-- =====================================================================
-- Perfil y avisos: también las del creador
-- =====================================================================

-- Igual que en 20260929001100_insignias.sql, más leagueAwards (las del creador; nunca cuentan en el total) y
-- leagueTruncated: [LeagueBadgeAward] (private.league_award_json), más nuevas primero, hasta 500.
-- - Otra cuenta: vigentes y no ocultas, de ligas que pasan private.league_badges_public (6+ cuentas, 14+ días, la ve
--   quien mira y sin menores); sin note ni seenAt.
-- - La propia: todas las vigentes (también ocultas y de ligas con menores o pequeñas), con note y seenAt.
-- Nunca las de un diseño escondido por el superadmin.
create or replace function public.profile_badges(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_self boolean := p_user = v_me;
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_awards jsonb;
  v_featured jsonb;
  v_league jsonb;
  v_n integer;
  v_ln integer;
  c_max constant integer := 1000;
  c_league constant integer := 500;
begin
  if p_user is null or not private.social_can_see(p_user) then
    return null;
  end if;
  if not v_self and private.is_blocked(p_user) and not private.is_super() then
    return jsonb_build_object('userId', p_user, 'isMe', false, 'featured', '[]'::jsonb, 'awards', '[]'::jsonb, 'truncated', false,
                              'leagueAwards', '[]'::jsonb, 'leagueTruncated', false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id,
           'key', x.badge_key,
           'sport', x.sport,
           'level', x.level,
           'periodKey', x.period_key,
           'scope', case when x.user_id is not null then 'cuenta' else 'liga' end,
           'status', x.status,
           'awardedAt', private.iso(x.awarded_at),
           'firmAt', private.iso(x.firm_at),
           'leagueId', x.league_id,
           'leagueName', x.league_name,
           'playerId', x.player_id,
           'context', x.ctx,
           'hidden', x.hidden,
           'seenAt', case when v_self then private.iso(x.seen_at) end)
           order by x.awarded_at desc, x.id desc), '[]'::jsonb),
         count(*)::integer
    into v_awards, v_n
    from (
      select a.*, l.name as league_name,
             case
               when v_self then a.context
               when a.league_id is not null or not (a.context ? 'league') then a.context - 'review'
               when coalesce(a.context -> 'league' ->> 'id', '') !~ v_uuid then private.badge_context_hidden(a.context)
               when private.social_league_ok((a.context -> 'league' ->> 'id')::uuid) then a.context - 'review'
               else private.badge_context_hidden(a.context)
             end as ctx
        from public.badge_awards a
        left join public.players p on p.id = a.player_id
        left join public.leagues l on l.id = a.league_id
       where (a.user_id = p_user or p.user_id = p_user)
         and case when v_self then a.status <> 'revocada' or a.seen_at is not null
                  else a.status in ('provisional', 'firme') and not a.hidden
                       and (a.league_id is null or private.social_league_ok(a.league_id)) end
       order by a.awarded_at desc, a.id desc
       limit c_max + 1
    ) x;
  if v_n > c_max then
    v_awards := v_awards - c_max;
  end if;

  select coalesce(jsonb_agg(u.x order by u.n), '[]'::jsonb) into v_featured
    from public.profiles pr
    cross join lateral unnest(pr.featured_badges) with ordinality as u (x, n)
   where pr.id = p_user
     and exists (select 1 from public.badge_awards a left join public.players p on p.id = a.player_id
                  where a.id = u.x and (a.user_id = p_user or p.user_id = p_user)
                    and a.status in ('provisional', 'firme') and not a.hidden
                    and (a.league_id is null or private.social_league_ok(a.league_id)));

  select coalesce(jsonb_agg(private.league_award_json(a, v_self) order by a.awarded_at desc, a.id desc), '[]'::jsonb),
         count(*)::integer
    into v_league, v_ln
    from public.league_badge_awards a
   where a.id in (
     select x.id from public.league_badge_awards x
       join public.players p on p.id = x.player_id
       join public.league_badges b on b.id = x.badge_id
      where p.user_id = p_user and x.revoked_at is null and b.status <> 'oculta'
        and (v_self or (not x.hidden and private.league_badges_public(x.league_id)))
      order by x.awarded_at desc, x.id desc
      limit c_league + 1);
  if v_ln > c_league then
    v_league := v_league - c_league;
  end if;

  return jsonb_build_object('userId', p_user, 'isMe', v_self, 'featured', v_featured, 'awards', v_awards,
                            'truncated', v_n > c_max, 'leagueAwards', v_league, 'leagueTruncated', v_ln > c_league);
end $$;

-- Igual que en 20260929001110_insignias_motor.sql, más las del creador sin ver (el aviso «Liga Los Pinos te dio una
-- insignia», §6.4): leagueAwards [LeagueBadgeAward] (de sus jugadores, vigentes, sin ver, de diseños no escondidos),
-- más nuevas primero, hasta p_limit, y leagueUnseen (cuántas hay). Se marcan con mark_league_badges_seen.
create or replace function public.badge_notices(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_limit integer := private.clamp_int(p_limit, 1, 50, 50);
  v_super boolean := private.is_super();
begin
  return jsonb_build_object(
    'awards', coalesce((
      select jsonb_agg(z.item order by z.at desc, z.id desc)
        from (
          select a.awarded_at as at, a.id, jsonb_build_object(
                   'id', a.id, 'key', a.badge_key, 'sport', a.sport, 'level', a.level, 'periodKey', a.period_key,
                   'scope', case when a.user_id is not null then 'cuenta' else 'liga' end,
                   'status', a.status, 'awardedAt', private.iso(a.awarded_at), 'firmAt', private.iso(a.firm_at),
                   'leagueId', a.league_id, 'leagueName', l.name, 'playerId', a.player_id, 'context', a.context,
                   'hidden', a.hidden, 'history', a.context ? 'historial') as item
            from public.badge_awards a
            left join public.players p on p.id = a.player_id
            left join public.leagues l on l.id = a.league_id
           where (a.user_id = v_me or p.user_id = v_me) and a.status in ('provisional', 'firme') and a.seen_at is null
           order by a.awarded_at desc, a.id desc
           limit v_limit) z), '[]'::jsonb),
    'unseen', (select count(*)::integer from public.badge_awards a left join public.players p on p.id = a.player_id
                where (a.user_id = v_me or p.user_id = v_me) and a.status in ('provisional', 'firme') and a.seen_at is null),
    'reviews', coalesce((
      select jsonb_agg(z.item order by z.at, z.id)
        from (
          select a.awarded_at as at, a.id, jsonb_build_object(
                   'id', a.id, 'key', a.badge_key, 'sport', a.sport, 'level', a.level, 'periodKey', a.period_key,
                   'leagueId', a.league_id, 'leagueName', l.name, 'playerId', a.player_id, 'playerName', p.name,
                   'refs', to_jsonb(a.refs), 'context', a.context, 'awardedAt', private.iso(a.awarded_at),
                   'overdue', a.awarded_at < now() - interval '14 days') as item
            from public.badge_awards a
            join public.leagues l on l.id = a.league_id
            join public.players p on p.id = a.player_id
           where a.status = 'en_revision'
             and ((a.league_id in (select m.league_id from public.league_members m where m.user_id = v_me and m.role in ('owner', 'admin'))
                   and private.badge_can_review(a.id, v_me))
                  or (v_super and (a.awarded_at < now() - interval '14 days'
                                   or not exists (select 1 from public.league_members m join public.profiles pr on pr.id = m.user_id
                                                   where m.league_id = a.league_id and m.role in ('owner', 'admin')
                                                     and pr.blocked_at is null and private.badge_can_review(a.id, m.user_id)))))
           order by a.awarded_at, a.id
           limit v_limit) z), '[]'::jsonb),
    'leagueAwards', coalesce((
      select jsonb_agg(private.league_award_json(a, true) order by a.awarded_at desc, a.id desc)
        from public.league_badge_awards a
       where a.id in (
         select x.id from public.league_badge_awards x
           join public.players p on p.id = x.player_id
           join public.league_badges b on b.id = x.badge_id
          where p.user_id = v_me and x.revoked_at is null and x.seen_at is null and b.status <> 'oculta'
          order by x.awarded_at desc, x.id desc
          limit v_limit)), '[]'::jsonb),
    'leagueUnseen', (select count(*)::integer
                       from public.league_badge_awards x
                       join public.players p on p.id = x.player_id
                       join public.league_badges b on b.id = x.badge_id
                      where p.user_id = v_me and x.revoked_at is null and x.seen_at is null and b.status <> 'oculta'));
end $$;

-- =====================================================================
-- Tiempo real: el mismo aviso 'badges' que las automáticas (…1110, src/lib/data/topics.ts)
-- =====================================================================

-- Por sentencia, solo con los ids ({op, ids, kind: 'diseno'|'liga'}): las pantallas vuelven a leer con sus permisos.
-- - league:<liga>: un diseño que se crea, cambia o borra; un otorgamiento que se da, se retira, se oculta o se muestra.
-- - user:<cuenta del jugador>: cualquier cambio de sus otorgamientos (el aviso de desbloqueo sale en segundos).
-- Al borrar una liga no se avisa nada.
create function private.emit_league_badges() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_kind text := case when tg_table_name = 'league_badges' then 'diseno' else 'liga' end;
begin
  if tg_op = 'DELETE' then
    for r in select o.league_id, jsonb_agg(o.id) as ids from old_rows o group by o.league_id loop
      if not private.deleting(r.league_id) then
        perform private.emit('league:' || r.league_id::text, 'badges', jsonb_build_object('op', 'delete', 'ids', r.ids, 'kind', v_kind));
      end if;
    end loop;
    return null;
  end if;
  if tg_op = 'INSERT' or v_kind = 'diseno' then
    for r in select n.league_id, jsonb_agg(n.id) as ids from new_rows n group by n.league_id loop
      perform private.emit('league:' || r.league_id::text, 'badges', jsonb_build_object('op', lower(tg_op), 'ids', r.ids, 'kind', v_kind));
    end loop;
  else
    for r in select n.league_id, jsonb_agg(n.id) as ids
               from new_rows n join old_rows o on o.id = n.id
              where n.revoked_at is distinct from o.revoked_at or n.hidden is distinct from o.hidden
                 or n.player_id is distinct from o.player_id
              group by n.league_id loop
      perform private.emit('league:' || r.league_id::text, 'badges', jsonb_build_object('op', 'update', 'ids', r.ids, 'kind', v_kind));
    end loop;
  end if;
  if v_kind = 'liga' then
    for r in select p.user_id, jsonb_agg(n.id) as ids
               from new_rows n join public.players p on p.id = n.player_id
              where p.user_id is not null
              group by p.user_id loop
      perform private.emit('user:' || r.user_id::text, 'badges', jsonb_build_object('op', lower(tg_op), 'ids', r.ids, 'kind', v_kind));
    end loop;
  end if;
  return null;
end $$;

create trigger league_badges_emit_insert after insert on public.league_badges referencing new table as new_rows
  for each statement execute function private.emit_league_badges();
create trigger league_badges_emit_update after update on public.league_badges referencing old table as old_rows new table as new_rows
  for each statement execute function private.emit_league_badges();
create trigger league_badges_emit_delete after delete on public.league_badges referencing old table as old_rows
  for each statement execute function private.emit_league_badges();
create trigger league_badge_awards_emit_insert after insert on public.league_badge_awards referencing new table as new_rows
  for each statement execute function private.emit_league_badges();
create trigger league_badge_awards_emit_update after update on public.league_badge_awards
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.emit_league_badges();
create trigger league_badge_awards_emit_delete after delete on public.league_badge_awards referencing old table as old_rows
  for each statement execute function private.emit_league_badges();

-- =====================================================================
-- Permisos: las RPC solo con sesión; las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'set_badge_policy', 'set_member_badge_maker', 'save_league_badge', 'archive_league_badge', 'delete_league_badge',
    'hide_league_badge', 'award_league_badge', 'revoke_league_badge_award', 'set_league_badge_hidden',
    'mark_league_badges_seen', 'league_badge_holders', 'report_league_badge', 'report_badge', 'admin_badge_reports',
    'admin_resolve_badge_reports', 'admin_blocked_terms', 'profile_badges', 'badge_notices', 'remove_member'];
  v_private constant text[] := array[
    'can_badges', 'league_badges_public', 'badge_clean', 'badge_fold', 'badge_text_ok', 'badge_icon_ok',
    'badge_design_text', 'league_badge_look', 'league_badge_json', 'league_award_json', 'badge_reports_on_revoke',
    'emit_league_badges', 'merge_badges', 'badge_slot_key', 'badge_link_guard', 'badges_on_link_guard', 'my_badge_reports'];
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
