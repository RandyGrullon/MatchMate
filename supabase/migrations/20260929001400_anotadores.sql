-- MatchMate · Anotadores del torneo: elegir de la liga, invitar por @usuario o mandar un link, y asignar ahí mismo
-- (diseño completo en docs/anotadores.md).
--
-- El permiso sigue siendo de liga: la marca que ya existe, league_members.is_scorer. Lo nuevo:
-- 1. league_members.scorer_only: la cuenta entró solo para anotar (link para anotar o invitación de anotador). No tiene
--    jugador y nadie se lo crea solo: ensure_my_player devuelve null (también para un teléfono con la app vieja). Se
--    apaga cuando la cuenta crea su jugador (private.ensure_player: «También juego» con join_league, una inscripción o
--    una invitación a jugar). La vista memberships lo trae.
-- 2. league_invites.as_player / as_scorer / scope / ref_id: la invitación de anotador es una invitación a la liga más
--    (la campana, /invitacion/<id>, el push invitacion:, retirar, una pendiente por cuenta y liga, el tiempo real
--    'invites' y los triggers de entrar y salir siguen igual). Una de anotador sola (as_player = false) no crea jugador.
--    Su parte de anotar vale solo si quien invitó sigue siendo admin y no está bloqueado (private.scorer_invite_ok),
--    también en una liga pública. scope/ref_id ('liga', 'evento' o 'playoff') solo dicen dónde (el texto y a dónde
--    llevar): sin FK, si el evento se borra el texto usa el nombre de la liga.
-- 3. private.scorer_links: el link para anotar (/anotar/<código>), solo por RPC. Código propio de 10 caracteres, uno
--    abierto por contexto, vence a los 7 días, 20 usos, hasta 10 abiertos (sin vencer) por liga y 20 creados o
--    cambiados por día por cuenta. Deja de servir si quien lo creó ya no es admin o está bloqueado, o si la liga tiene
--    menores (en esas ligas no se crea). Quien entra queda anotador (sin jugador), también en una liga privada.
-- 4. Boliche en una liga normal: la marca ahora vale en los eventos 'torneo' (no en las prácticas):
--    private.is_event_scorer en save_game, update_entry, save_verified_games y private.lanes_event.
--    private.can_upload_photo mira la marca sin la regla del boliche (private.has_scorer_flag): el anotador (que puede
--    no tener jugador) sube la foto del marcador. private.is_scorer no cambia (golf, natación, partidos).
-- 5. set_member_scorer: el dueño o un admin. Un admin (que no es el dueño) solo a miembros: ni a sí mismo, ni a otro
--    admin, ni al dueño. Gana p_scope/p_ref opcionales (el push «Ahora puedes anotar en …» lleva a ese torneo): cambia
--    la firma, así que se borra y se crea de nuevo. Quitarle el permiso a quien entró solo para anotar (miembro, sin
--    jugador ni «Diseña insignias») lo saca de la liga.
-- 6. RPC nuevas: invite_scorers, scorer_access, create_scorer_link, rotate_scorer_link, revoke_scorer_link,
--    scorer_link_preview (también sin cuenta, con el mismo límite que invite_preview) y join_as_scorer (con el mismo
--    límite que join_league).
-- 7. Cambian (misma firma, cuerpo copiado de su última versión con el cambio): private.can_upload_photo (…1100),
--    save_game (…0500), update_entry (…1110), save_verified_games (…0500), private.lanes_event (…0600),
--    private.ensure_player (…0100 reclamos), ensure_my_player (…0500), invite_to_league y private.people_item (…0200:
--    una pendiente vale con private.league_invite_valid), respond_league_invite (…0200),
--    private.accept_invites_on_join (…0200), my_league_invites y league_invite_details (…1000) y private.push_category
--    (…1110). Una migración posterior que redefina alguna tiene que copiar esta.
-- 8. Avisos: la invitación usa el tag de siempre, invitacion:<id>. El prefijo nuevo anotador: («Ahora puedes anotar en
--    …», uno por día y liga, y «Ana entró a anotar en …» a quien creó el link) va en 'liga' («Tus ligas»). Tiempo real:
--    'scorers' por league:<liga> {user_id} y user:<cuenta> {league_id} (los cambios de league_members no llegan por
--    tiempo real).
-- 9. Quitar a alguien vale: private.scorer_link_blocks guarda a quien un admin le quitó el permiso de anotar o sacó de
--    la liga; ningún link para anotar de la liga lo deja entrar otra vez ('removed') hasta que un admin lo nombre o lo
--    invite. private.scorer_link_joins guarda quién entró a la liga con un link: si la liga pasa a tener menores, quien
--    sigue solo anotando sale de la liga (nadie lo eligió).

-- =====================================================================
-- 1. Columnas y vista
-- =====================================================================

-- Entró solo para anotar (link para anotar o invitación de anotador): no tiene jugador y nadie se lo crea solo. Se
-- apaga cuando la cuenta crea su jugador (private.ensure_player: «También juego», join_signup, una invitación a jugar).
alter table public.league_members add column scorer_only boolean not null default false;

-- Igual que en 20260929001120_insignias_creador.sql y además scorer_only (al final: create or replace solo añade columnas).
create or replace view public.memberships with (security_invoker = true) as
  select m.league_id, m.user_id, m.role, m.is_scorer, m.display_name, m.joined_at, m.updated_at, p.id as player_id,
         m.badge_maker, m.scorer_only
  from public.league_members m
  left join public.players p on p.league_id = m.league_id and p.user_id = m.user_id;

-- as_player: al aceptar tiene jugador (como siempre). as_scorer: al aceptar anota. Una de anotador sola
-- (as_player = false) no crea jugador. scope/ref_id: dónde se le invitó a anotar (solo el texto y a dónde llevar).
alter table public.league_invites
  add column as_player boolean not null default true,
  add column as_scorer boolean not null default false,
  add column scope text check (scope in ('liga', 'evento', 'playoff')),
  add column ref_id uuid,
  add constraint league_invites_role_check check (as_player or as_scorer),
  add constraint league_invites_scope_ref_check check ((as_scorer = (scope is not null))
                                                   and ((scope is null or scope = 'liga') = (ref_id is null)));

-- =====================================================================
-- 2. El link para anotar
-- =====================================================================

-- Link para anotar (/anotar/<código>): quien entra queda como anotador de la liga, sin jugador. Solo por RPC.
-- Un link abierto (revoked_at null) por liga y contexto. Deja de servir si vence, se llena, se quita o se cambia, si
-- quien lo creó ya no es admin o está bloqueado, o si la liga pasa a tener menores (private.scorer_link_status). El
-- que vence o se llena no se borra: queda revoked_at cuando se crea el siguiente para el mismo contexto.
create table private.scorer_links (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  scope text not null default 'liga' check (scope in ('liga', 'evento', 'playoff')),
  ref_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  uses integer not null default 0,
  max_uses integer not null default 20 check (max_uses between 1 and 50),
  last_used_at timestamptz,
  check ((scope = 'liga') = (ref_id is null)),
  check (uses between 0 and max_uses)
);
create unique index scorer_links_one_open on private.scorer_links
  (league_id, scope, coalesce(ref_id, '00000000-0000-0000-0000-000000000000'::uuid)) where revoked_at is null;
create index scorer_links_league_idx on private.scorer_links (league_id, created_at desc);
revoke all on private.scorer_links from public, anon, authenticated;

-- Quién entró a la liga con un link para anotar (solo 'joined': llegó sin ser miembro; nadie lo eligió). Se va con su
-- membresía. Si la liga pasa a tener menores, quien sigue solo anotando sale (private.scorer_links_minors).
create table private.scorer_link_joins (
  league_id uuid not null,
  user_id uuid not null,
  link_id uuid references private.scorer_links (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id),
  foreign key (league_id, user_id) references public.league_members (league_id, user_id) on delete cascade
);
revoke all on private.scorer_link_joins from public, anon, authenticated;

-- A quién ya no deja entrar ningún link para anotar de la liga: un admin (o el dueño) le quitó el permiso de anotar o
-- lo sacó de la liga (private.scorer_link_block). join_as_scorer y scorer_link_preview: 'removed'. Se borra cuando un
-- admin lo vuelve a hacer anotador (lo nombra o acepta su invitación de anotador: private.scorer_link_unblock).
create table private.scorer_link_blocks (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
revoke all on private.scorer_link_blocks from public, anon, authenticated;

-- =====================================================================
-- 3. Ayudas
-- =====================================================================

-- Código del link: 10 caracteres sin letras que se confundan (32^10 ≈ 1,1·10^15), como private.new_invite_code. Sale
-- de gen_random_uuid: bytes 0-5 y 9-12, que no llevan versión ni variante.
create function private.new_scorer_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  b bytea := uuid_send(gen_random_uuid());
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v text := '';
  i integer;
begin
  foreach i in array array[0, 1, 2, 3, 4, 5, 9, 10, 11, 12] loop
    v := v || substr(chars, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return v;
end $$;

-- ¿El contexto es de esa liga? 'liga': sin p_ref. 'evento': un evento de la liga. 'playoff': un playoff de la liga.
create function private.scorer_ref_ok(p_league uuid, p_scope text, p_ref uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case p_scope
    when 'liga' then p_ref is null
    when 'evento' then p_ref is not null and exists (select 1 from public.events e where e.id = p_ref and e.league_id = p_league)
    when 'playoff' then p_ref is not null and exists (select 1 from public.playoffs p where p.id = p_ref and p.league_id = p_league)
  end, false)
$$;

-- El nombre para los textos: el del evento (vacío: el de la liga si es un torneo sin liga, o 'Torneo del martes 29 de
-- septiembre'), el del playoff o, si no hay otro (o ya no existe), el de la liga.
create function private.scorer_title(p_league uuid, p_scope text, p_ref uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case p_scope
      when 'evento' then (select coalesce(nullif(btrim(e.name), ''), case when l.kind = 'torneo' then l.name end,
                                          private.org_event_label(e.id))
                            from public.events e join public.leagues l on l.id = e.league_id
                           where e.id = p_ref and e.league_id = p_league)
      when 'playoff' then (select p.name from public.playoffs p where p.id = p_ref and p.league_id = p_league)
    end,
    (select l.name from public.leagues l where l.id = p_league))
$$;

-- A dónde llevar: la pantalla del evento, la de los playoffs o la portada de la liga.
create function private.scorer_path(p_league uuid, p_scope text, p_ref uuid) returns text
language sql stable security definer set search_path = '' as $$
  select '/l/' || p_league::text || case
    when p_scope = 'evento' and exists (select 1 from public.events e where e.id = p_ref and e.league_id = p_league)
      then '/e/' || p_ref::text
    when p_scope = 'playoff' and exists (select 1 from public.playoffs p where p.id = p_ref and p.league_id = p_league)
      then '/playoffs'
    else ''
  end
$$;

-- La parte de anotar de una invitación vale si quien invitó existe, no está bloqueado y sigue siendo admin (también
-- en una liga pública: dar el permiso de anotar es de un admin).
create function private.scorer_invite_ok(p_league uuid, p_invited_by uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_invited_by is not null and not private.is_blocked(p_invited_by) and private.user_is_admin(p_league, p_invited_by)
$$;

-- ¿Una invitación pendiente todavía vale? Por su parte de jugar (private.invite_ok) o por la de anotar.
create function private.league_invite_valid(i public.league_invites) returns boolean
language sql stable security definer set search_path = '' as $$
  select (i.as_player and private.invite_ok(i.league_id, i.invited_by))
      or (i.as_scorer and private.scorer_invite_ok(i.league_id, i.invited_by))
$$;

-- ¿La cuenta de la sesión anota en ese evento? Tiene la marca en la liga del evento y: es un torneo sin liga, otro
-- deporte o, en una liga de boliche, un evento 'torneo' (las prácticas siguen siendo del jugador). No mira si es
-- admin: cada llamada sigue con is_admin(...) or is_event_scorer(...).
create function private.is_event_scorer(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
      join public.leagues l on l.id = e.league_id
      join public.league_members m on m.league_id = e.league_id and m.user_id = (select auth.uid()) and m.is_scorer
     where e.id = p_event and (l.kind = 'torneo' or l.sport <> 'bowling' or e.type = 'torneo'))
$$;

-- La cuenta de la sesión tiene la marca de anotador en esa liga (sin la regla del boliche). Solo para can_upload_photo.
create function private.has_scorer_flag(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.league_members m where m.league_id = p_league and m.user_id = (select auth.uid()) and m.is_scorer)
$$;

-- Cómo está un link: 'revoked' (se quitó o se cambió), 'closed' (la liga tiene menores, o quien lo creó ya no existe,
-- está bloqueado o dejó de ser admin), 'expired', 'full' o 'ok' (en ese orden).
create function private.scorer_link_status(k private.scorer_links) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when k.revoked_at is not null then 'revoked'
    when coalesce((select l.has_minors from public.leagues l where l.id = k.league_id), true)
         or k.created_by is null or private.is_blocked(k.created_by)
         or not private.user_is_admin(k.league_id, k.created_by) then 'closed'
    when k.expires_at <= now() then 'expired'
    when k.uses >= k.max_uses then 'full'
    else 'ok'
  end
$$;

-- Un link para la hoja «Anotadores»: {id, code, scope, refId, title, path, expiresAt, uses, maxUses, status,
-- createdBy: {id, name} | null, createdAt}.
create function private.scorer_link_json(k private.scorer_links) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', k.id,
    'code', k.code,
    'scope', k.scope,
    'refId', k.ref_id,
    'title', private.scorer_title(k.league_id, k.scope, k.ref_id),
    'path', private.scorer_path(k.league_id, k.scope, k.ref_id),
    'expiresAt', private.iso(k.expires_at),
    'uses', k.uses,
    'maxUses', k.max_uses,
    'status', private.scorer_link_status(k),
    'createdBy', (select jsonb_build_object('id', p.id, 'name', p.name) from public.profiles p where p.id = k.created_by),
    'createdAt', private.iso(k.created_at))
$$;

-- Tiempo real: cambiaron los anotadores (o los links) de la liga; a la cuenta, que cambió su permiso o su liga.
create function private.emit_scorers(p_league uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.emit('league:' || p_league::text, 'scorers', jsonb_build_object('user_id', p_user));
  if p_user is not null then
    perform private.emit('user:' || p_user::text, 'scorers', jsonb_build_object('league_id', p_league));
  end if;
end $$;

-- Abre un link para ese contexto (el anterior ya se cerró). Hasta 10 intentos si el código ya existe; si otro admin
-- abrió uno para el mismo contexto en el mismo momento, devuelve ese. Si no se logra: 'duplicado'.
create function private.scorer_link_insert(p_league uuid, p_scope text, p_ref uuid, p_by uuid) returns private.scorer_links
language plpgsql security definer set search_path = '' as $$
declare
  k private.scorer_links;
begin
  for n in 1 .. 10 loop
    begin
      insert into private.scorer_links (league_id, code, scope, ref_id, created_by)
      values (p_league, private.new_scorer_code(), p_scope, p_ref, p_by)
      returning * into k;
      return k;
    exception when unique_violation then
      select * into k from private.scorer_links x
       where x.league_id = p_league and x.scope = p_scope and x.ref_id is not distinct from p_ref and x.revoked_at is null;
      if k.id is not null then
        return k;
      end if;
    end;
  end loop;
  perform private.fail('duplicado');
  return k;
end $$;

-- ¿Un admin le quitó el permiso o lo sacó de la liga? Entonces los links para anotar de la liga no lo dejan entrar.
create function private.scorer_link_blocked(p_league uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.scorer_link_blocks b where b.league_id = p_league and b.user_id = p_user)
$$;

-- Otro (un admin, el dueño o el sistema) le quitó a una cuenta el permiso de anotar o la sacó de la liga: ningún link
-- para anotar de la liga la deja volver a entrar (quitar a quien entró con un link reenviado tiene que valer). No si
-- fue ella misma (salir de la liga, el dueño quitándose la marca) ni si se está borrando la liga o la cuenta.
create function private.scorer_link_block() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not distinct from old.user_id
     or not exists (select 1 from public.leagues l where l.id = old.league_id)
     or not exists (select 1 from public.profiles p where p.id = old.user_id) then
    return null;
  end if;
  insert into private.scorer_link_blocks (league_id, user_id) values (old.league_id, old.user_id)
  on conflict (league_id, user_id) do update set created_at = now();
  return null;
end $$;
create trigger league_members_scorer_link_block after update of is_scorer on public.league_members
  for each row when (old.is_scorer and not new.is_scorer) execute function private.scorer_link_block();
create trigger league_members_scorer_link_block_out after delete on public.league_members
  for each row execute function private.scorer_link_block();

-- Vuelve a anotar porque un admin lo decidió (lo nombra, o acepta su invitación de anotador): los links lo dejan entrar
-- otra vez. join_as_scorer no llega aquí con alguien bloqueado.
create function private.scorer_link_unblock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.scorer_link_blocks b where b.league_id = new.league_id and b.user_id = new.user_id;
  return null;
end $$;
create trigger league_members_scorer_link_unblock after insert or update of is_scorer on public.league_members
  for each row when (new.is_scorer) execute function private.scorer_link_unblock();

-- La liga pasa a tener menores: sus links para anotar ya no sirven (private.scorer_link_status) y quien entró con uno
-- (nadie lo eligió) sale de la liga si sigue solo anotando (miembro sin jugador ni «Diseña insignias»). Un admin lo
-- puede invitar por su @usuario.
create function private.scorer_links_minors() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.league_members m
   using private.scorer_link_joins j
   where j.league_id = new.id and m.league_id = j.league_id and m.user_id = j.user_id
     and m.role = 'member' and m.scorer_only and not m.badge_maker
     and not exists (select 1 from public.players p where p.league_id = m.league_id and p.user_id = m.user_id);
  return null;
end $$;
create trigger leagues_scorer_links_minors after update of has_minors on public.leagues
  for each row when (new.has_minors and not old.has_minors) execute function private.scorer_links_minors();

-- =====================================================================
-- 4. Redefinidas: boliche en una liga normal y la foto
-- =====================================================================

-- Igual que en 20260927001100_consola.sql, con private.has_scorer_flag en vez de private.is_scorer: el anotador de una
-- liga de boliche (que puede no tener jugador) sube la foto del marcador de un torneo. Sigue sin fotos en ligas con
-- menores ni para cuentas bloqueadas.
create or replace function private.can_upload_photo(p_league uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.leagues l where l.id = p_league and not l.has_minors)
     and not private.is_blocked((select auth.uid()))
     and (private.is_admin(p_league) or private.has_scorer_flag(p_league) or private.my_player(p_league) is not null)
$$;

-- Igual que en 20260926000500_rpc.sql, con private.is_event_scorer (en una liga de boliche, el anotador anota los
-- torneos, no las prácticas).
create or replace function public.save_game(p_entry uuid, p_game integer, p_score integer default null, p_frames jsonb default null, p_op_id uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.entries;
  v_games integer;
  v_require boolean;
  v_sport text;
  v_scores smallint[];
  v_photos text[];
  v_frames jsonb;
begin
  perform private.require_uid();
  if private.op_begin(p_op_id, 'save_game') is not null then
    return;
  end if;
  select * into e from public.entries x where x.id = p_entry for update;
  if e.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(e.league_id) and not private.is_event_scorer(e.event_id) then
    perform private.deny();
  end if;
  select ev.games into v_games from public.events ev where ev.id = e.event_id;
  select l.require_photo, l.sport into v_require, v_sport from public.leagues l where l.id = e.league_id;
  if p_game is null or p_game < 0 or p_game >= v_games then
    perform private.fail('invalido');
  end if;
  if p_frames is not null and jsonb_typeof(p_frames) not in ('object', 'null') then
    perform private.fail('invalido');
  end if;
  v_scores := private.slots(e.scores, v_games);
  v_photos := private.slots(e.photos, v_games);
  v_scores[p_game + 1] := case when p_score is null then null else private.one_score(to_jsonb(p_score), v_sport) end;
  v_photos[p_game + 1] := case when p_score is not null and not v_require then 'sin-foto' end;
  v_frames := coalesce(e.frames, '{}'::jsonb);
  v_frames := case when p_frames is null or jsonb_typeof(p_frames) = 'null' then v_frames - p_game::text
                   else jsonb_set(v_frames, array[p_game::text], p_frames) end;
  update public.entries set scores = v_scores, photos = v_photos, frames = v_frames where id = p_entry;
  perform private.op_end(p_op_id, null);
end $$;

-- Igual que en 20260929001110_insignias_motor.sql (la última), con private.is_event_scorer. Lo demás no cambia: las
-- marcas de foto, 'importado' y las claves que puede cambiar el anotador (scores, photos y frames).
create or replace function public.update_entry(p_entry uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.entries;
  v_admin boolean;
  v_sport text;
  v_require boolean;
  v_scores smallint[];
  v_photos text[];
  v_mark text;
  k text;
begin
  perform private.require_uid();
  select * into e from public.entries x where x.id = p_entry for update;
  if e.id is null then
    perform private.fail('no_existe');
  end if;
  v_admin := private.is_admin(e.league_id);
  if not v_admin and not private.is_event_scorer(e.event_id) then
    perform private.deny();
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    perform private.fail('invalido');
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (array['team_id', 'average', 'handicap_override', 'scores', 'photos', 'frames']) then
      perform private.fail('invalido');
    end if;
    if not v_admin and k <> all (array['scores', 'photos', 'frames']) then
      perform private.deny();
    end if;
  end loop;
  if p_patch ? 'frames' and jsonb_typeof(p_patch -> 'frames') not in ('object', 'null') then
    perform private.fail('invalido');
  end if;
  select l.sport, l.require_photo into v_sport, v_require from public.leagues l where l.id = e.league_id;
  v_scores := case when p_patch ? 'scores' then coalesce(private.series(p_patch -> 'scores', v_sport), '{}') else e.scores end;
  v_photos := case when p_patch ? 'photos' then coalesce(private.marks(p_patch -> 'photos'), '{}') else e.photos end;
  for g in 1 .. coalesce(cardinality(v_photos), 0) loop
    v_mark := v_photos[g];
    continue when v_mark is null or v_mark = 'sin-foto';
    if v_mark is distinct from e.photos[g] then
      if not private.raq_is_uuid(v_mark)
         or not exists (select 1 from public.photos ph where ph.id = v_mark::uuid and ph.league_id = e.league_id) then
        perform private.fail('invalido');
      end if;
    elsif v_scores[g] is distinct from e.scores[g] then
      v_photos[g] := case when v_scores[g] is not null and not coalesce(v_require, false) then 'sin-foto' end;
    end if;
  end loop;
  update public.entries x set
    team_id = case when p_patch ? 'team_id' then nullif(p_patch ->> 'team_id', '')::uuid else x.team_id end,
    average = case when p_patch ? 'average' then (p_patch ->> 'average')::double precision else x.average end,
    handicap_override = case when p_patch ? 'handicap_override' then (p_patch ->> 'handicap_override')::smallint else x.handicap_override end,
    scores = v_scores,
    photos = v_photos,
    frames = case when p_patch ? 'frames' then nullif(p_patch -> 'frames', 'null'::jsonb) else x.frames end
  where x.id = p_entry;
end $$;

-- Igual que en 20260926000500_rpc.sql, con private.is_event_scorer. v_admin sigue decidiendo quién inscribe.
create or replace function public.save_verified_games(p_event uuid, p_photo jsonb, p_writes jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
  v_games integer;
  v_sport text;
  v_admin boolean;
  v_photo uuid;
  w jsonb;
  k text;
  e public.entries;
  v_scores smallint[];
  v_photos text[];
begin
  perform private.require_uid();
  select ev.league_id, ev.games into v_league, v_games from public.events ev where ev.id = p_event;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  v_admin := private.is_admin(v_league);
  if not v_admin and not private.is_event_scorer(p_event) then
    perform private.deny();
  end if;
  if jsonb_typeof(p_writes) is distinct from 'array' then
    perform private.fail('invalido');
  end if;
  v_sport := (select l.sport from public.leagues l where l.id = v_league);
  v_photo := private.insert_photo(v_league, p_event, p_photo);
  for w in select value from jsonb_array_elements(p_writes) loop
    select * into e from public.entries x where x.event_id = p_event and x.player_id = (w ->> 'player_id')::uuid for update;
    if e.id is null and not v_admin then
      perform private.deny();
    end if;
    if jsonb_typeof(w -> 'values') is distinct from 'object' then
      perform private.fail('invalido');
    end if;
    v_scores := private.slots(e.scores, v_games);
    v_photos := private.slots(e.photos, v_games);
    for k in select jsonb_object_keys(w -> 'values') loop
      if k::integer < 0 or k::integer >= v_games then
        perform private.fail('invalido');
      end if;
      v_scores[k::integer + 1] := private.one_score(w -> 'values' -> k, v_sport);
      v_photos[k::integer + 1] := v_photo::text;
    end loop;
    if e.id is null then
      insert into public.entries (league_id, event_id, player_id, average, scores, photos)
      values (v_league, p_event, (w ->> 'player_id')::uuid, coalesce((w ->> 'average')::double precision, 0), v_scores, v_photos);
    else
      update public.entries set scores = v_scores, photos = v_photos where id = e.id;
    end if;
  end loop;
  return v_photo;
end $$;

-- Igual que en 20260929000600_organizador.sql, con private.is_event_scorer (las pistas de un torneo de la liga).
create or replace function private.lanes_event(p_event uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid;
begin
  select e.league_id into v_league from public.events e where e.id = p_event for update;
  if v_league is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(v_league) and not private.is_event_scorer(p_event) then
    perform private.deny();
  end if;
  if (select l.sport from public.leagues l where l.id = v_league) <> 'bowling' then
    perform private.fail('invalido');
  end if;
  return v_league;
end $$;

-- =====================================================================
-- 5. Redefinidas: el jugador de quien solo anota
-- =====================================================================

-- Igual que en 20260929000100_reclamos.sql y además apaga scorer_only: pedir el jugador es decidir jugar.
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
  update public.league_members m set scorer_only = false where m.league_id = p_league and m.user_id = p_user and m.scorer_only;
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

-- Igual que en 20260926000500_rpc.sql, salvo para quien entró solo para anotar y no tiene jugador: devuelve null sin
-- crear nada (lo llaman la creación automática del teléfono y la app vieja). «También juego» usa join_league.
create or replace function public.ensure_my_player(p_league uuid, p_prefer uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  if exists (select 1 from public.league_members m where m.league_id = p_league and m.user_id = v_uid and m.scorer_only)
     and not exists (select 1 from public.players p where p.league_id = p_league and p.user_id = v_uid) then
    return null;
  end if;
  return private.ensure_player(p_league, v_uid, p_prefer);
end $$;

-- =====================================================================
-- 6. Redefinidas: invitaciones
-- =====================================================================

-- Igual que en 20260929000200_invitaciones.sql, con private.league_invite_valid: una pendiente de anotador (sin la parte
-- de jugar) cuyo invitador dejó de ser admin ya no cuenta como invitada.
create or replace function private.people_item(p_user uuid, p_name text, p_username text, p_league uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p_user,
    'name', p_name,
    'username', p_username,
    'isFollowing', exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.followee_id = p_user),
    'followsYou', exists (select 1 from public.follows f where f.follower_id = p_user and f.followee_id = (select auth.uid())),
    'inLeague', p_league is not null
                and exists (select 1 from public.league_members m where m.league_id = p_league and m.user_id = p_user),
    'invited', p_league is not null
               and exists (select 1 from public.league_invites i
                            where i.league_id = p_league and i.user_id = p_user and i.status = 'pending'
                              and private.league_invite_valid(i)))
$$;

-- Igual que en 20260929000200_invitaciones.sql, con private.league_invite_valid al cancelar la pendiente que ya no vale
-- (una de anotador sola cuyo invitador dejó de ser admin, también en una liga pública).
create or replace function public.invite_to_league(p_league uuid, p_users uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_key text := 'invite:' || v_uid::text;
  l public.leagues;
  v_users uuid[];
  v_user uuid;
  v_from text;
  v_status text;
  v_id uuid;
  v_tag text;
  v_sent integer := 0;
  v_queued boolean := false;
  v_results jsonb := '[]'::jsonb;
begin
  select * into l from public.leagues x where x.id = p_league;
  if l.id is null then
    perform private.fail('no_existe');
  end if;
  if not (private.is_member(p_league) or private.is_super()) then
    perform private.deny();
  end if;
  -- Privada (también las de menores): solo el dueño o un admin.
  if l.visibility <> 'public' and not private.is_admin(p_league) then
    perform private.deny();
  end if;
  v_users := array(select a.u from unnest(p_users) with ordinality as a (u, n)
                    where a.u is not null group by a.u order by min(a.n));
  if coalesce(cardinality(v_users), 0) = 0 or cardinality(v_users) > 50 then
    perform private.fail('invalido');
  end if;
  if private.rate_blocked(v_key, 100, interval '1 day') then
    perform private.fail('rate_limited');
  end if;

  v_from := (select p.name from public.profiles p where p.id = v_uid);
  foreach v_user in array v_users loop
    if v_user <> v_uid then
      -- La pendiente que ya no vale (la liga pasó a privada, quien invitó dejó de ser admin o está bloqueado) no
      -- cuenta como 'pending': se cancela y esta la reemplaza.
      update public.league_invites i set status = 'cancelled', decided_at = now()
       where i.league_id = p_league and i.user_id = v_user and i.status = 'pending'
         and not private.league_invite_valid(i);
    end if;
    if v_user = v_uid or not exists (select 1 from public.profiles p where p.id = v_user and p.blocked_at is null) then
      v_status := 'unavailable';
    elsif exists (select 1 from public.league_members m where m.league_id = p_league and m.user_id = v_user) then
      v_status := 'member';
    elsif exists (select 1 from public.league_invites i where i.league_id = p_league and i.user_id = v_user and i.status = 'pending') then
      v_status := 'pending';
    elsif exists (select 1 from public.league_invites i
                   where i.league_id = p_league and i.user_id = v_user and i.status = 'declined'
                     and i.decided_at > now() - interval '7 days') then
      v_status := 'declined';
    elsif not private.rate_take(v_key, 100, interval '1 day') then
      -- El límite se mira con cada una (y con el candado de la fila, también con llamadas a la vez).
      v_status := 'rate_limited';
    else
      v_id := null;
      insert into public.league_invites (league_id, user_id, invited_by) values (p_league, v_user, v_uid)
      on conflict (league_id, user_id) where status = 'pending' do nothing
      returning id into v_id;
      if v_id is null then
        -- Otro admin la mandó en el mismo momento.
        v_status := 'pending';
      else
        v_status := 'sent';
        v_sent := v_sent + 1;
        -- Push: uno por persona y día de quien invita (como seguir en follow_user). Invitar, retirar y volver a
        -- invitar no le llena el teléfono, y así tampoco se salta los 7 días de «rechazar».
        if not exists (select 1 from public.league_invites i
                        where i.user_id = v_user and i.invited_by = v_uid and i.id <> v_id
                          and i.created_at > now() - interval '1 day') then
          v_tag := 'invitacion:' || v_id::text;
          begin
            insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
            values (v_user, left(coalesce(v_from, 'Alguien') || ' te invitó a ' || l.name, 200), 'Toca para ver la invitación y unirte.',
                    '/invitacion/' || v_id::text, v_tag, 604800, 'normal');
            if exists (select 1 from public.push_outbox o where o.user_id = v_user and o.tag = v_tag and o.sent_at is null) then
              v_queued := true;
            end if;
          exception when others then
            raise warning 'push de invitación %: %', v_user, sqlerrm;
          end;
        end if;
      end if;
    end if;
    v_results := v_results || jsonb_build_array(jsonb_build_object('userId', v_user, 'status', v_status));
  end loop;

  if v_queued then
    perform private.kick_send_push();
  end if;
  return jsonb_build_object('sent', v_sent, 'results', v_results);
end $$;

-- Igual que en 20260929000200_invitaciones.sql, con la parte de anotar:
-- - v_play: la de jugar vale (as_player y private.invite_ok); v_score: la de anotar vale (as_scorer y
--   private.scorer_invite_ok). Si ninguna vale, queda 'cancelled' (como antes).
-- - Entra con is_scorer = v_score y scorer_only si solo anota (si ya era miembro, se suma la marca y scorer_only no se
--   toca). El jugador solo si v_play (p_prefer no se usa si no): si no, el que ya tenga o null.
-- - El push a quien invitó: con v_score, «Luis aceptó anotar en <torneo>» y lleva al torneo.
-- - Devuelve lo de antes y, solo con v_score, scorer: {title, scope, refId, path}.
create or replace function public.respond_league_invite(p_invite uuid, p_accept boolean, p_prefer uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  i public.league_invites;
  l public.leagues;
  v_name text;
  v_player uuid;
  v_tag text;
  v_play boolean;
  v_score boolean;
  v_title text;
  v_path text;
begin
  select * into i from public.league_invites x where x.id = p_invite and x.user_id = v_uid for update;
  if i.id is null then
    perform private.fail('no_existe');
  end if;
  if p_accept is null then
    perform private.fail('invalido');
  end if;
  if i.status <> 'pending' then
    return jsonb_build_object('status', i.status, 'leagueId', i.league_id);
  end if;

  if not p_accept then
    update public.league_invites x set status = 'declined', decided_at = now() where x.id = p_invite;
    return jsonb_build_object('status', 'declined', 'leagueId', i.league_id);
  end if;

  select * into l from public.leagues x where x.id = i.league_id;
  v_play := i.as_player and private.invite_ok(i.league_id, i.invited_by);
  v_score := i.as_scorer and private.scorer_invite_ok(i.league_id, i.invited_by);
  if not (v_play or v_score) then
    update public.league_invites x set status = 'cancelled', decided_at = now() where x.id = p_invite;
    return jsonb_build_object('status', 'cancelled', 'leagueId', i.league_id);
  end if;
  select p.name into v_name from public.profiles p where p.id = v_uid;
  if v_name is null then
    perform private.fail('no_existe');
  end if;
  insert into public.league_members (league_id, user_id, role, display_name, is_scorer, scorer_only)
  values (i.league_id, v_uid, 'member', v_name, v_score, v_score and not v_play)
  on conflict (league_id, user_id) do update set is_scorer = true
   where excluded.is_scorer and not public.league_members.is_scorer;
  if v_play then
    v_player := private.ensure_player(i.league_id, v_uid, p_prefer);
  else
    select p.id into v_player from public.players p where p.league_id = i.league_id and p.user_id = v_uid;
  end if;
  -- El trigger de league_members ya la dejó aceptada si entró ahora; si ya era miembro, aquí.
  update public.league_invites x set status = 'accepted', decided_at = now() where x.id = p_invite and x.status = 'pending';
  if v_score then
    v_title := private.scorer_title(i.league_id, i.scope, i.ref_id);
    v_path := private.scorer_path(i.league_id, i.scope, i.ref_id);
  end if;

  if i.invited_by is not null and exists (select 1 from public.profiles p where p.id = i.invited_by and p.blocked_at is null) then
    v_tag := 'invitacion-ok:' || i.id::text;
    begin
      insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
      values (i.invited_by,
              left(case when v_score then v_name || ' aceptó anotar en ' || v_title else v_name || ' aceptó tu invitación' end, 200),
              left(case when v_score then 'Ya puede anotar.' else 'Ya está en ' || l.name || '.' end, 1000),
              coalesce(v_path, '/l/' || i.league_id::text), v_tag, 86400, 'normal');
      if exists (select 1 from public.push_outbox o where o.user_id = i.invited_by and o.tag = v_tag and o.sent_at is null) then
        perform private.kick_send_push();
      end if;
    exception when others then
      raise warning 'push de invitación aceptada %: %', i.invited_by, sqlerrm;
    end;
  end if;
  if v_score then
    perform private.emit_scorers(i.league_id, v_uid);
  end if;

  return jsonb_build_object('status', 'accepted', 'leagueId', i.league_id, 'playerId', v_player,
    'claimId', (select c.id from public.player_claims c where c.league_id = i.league_id and c.user_id = v_uid and c.status = 'pending'))
    || case when v_score
            then jsonb_build_object('scorer', jsonb_build_object('title', v_title, 'scope', i.scope, 'refId', i.ref_id, 'path', v_path))
            else '{}'::jsonb end;
end $$;

-- Igual que en 20260929000200_invitaciones.sql y además: si tenía una invitación de anotador que vale y entra por otro
-- camino (el código, la liga pública, join_signup…), también queda anotador (con jugador: entró a jugar).
create or replace function private.accept_invites_on_join() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.is_scorer and exists (select 1 from public.league_invites i
                                    where i.league_id = new.league_id and i.user_id = new.user_id and i.status = 'pending'
                                      and i.as_scorer and private.scorer_invite_ok(i.league_id, i.invited_by)) then
    update public.league_members m set is_scorer = true where m.league_id = new.league_id and m.user_id = new.user_id;
    perform private.emit_scorers(new.league_id, new.user_id);
  end if;
  update public.league_invites i set status = 'accepted', decided_at = now()
   where i.league_id = new.league_id and i.user_id = new.user_id and i.status = 'pending';
  return null;
end $$;

-- Igual que en 20260929001000_sueltos_logos.sql, con private.league_invite_valid y, solo en las de anotador que valen,
-- scorer: {title, scope, refId, path, asPlayer} (asPlayer: la parte de jugar que todavía vale). Las demás salen igual.
create or replace function public.my_league_invites() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id,
             'leagueId', x.league_id,
             'leagueName', x.league_name,
             'logoPath', x.logo_path,
             'sport', x.sport,
             'kind', x.kind,
             'visibility', x.visibility,
             'members', x.members,
             'invitedBy', case when x.invited_by is null then null
                               else jsonb_build_object('id', x.invited_by, 'name', x.from_name, 'username', x.from_username) end,
             'createdAt', private.iso(x.created_at)) || x.scorer
             order by x.created_at desc, x.id desc)
      from (select i.id, i.league_id, i.invited_by, i.created_at, l.name as league_name, l.logo_path, l.sport, l.kind, l.visibility,
                   (select count(*) from public.league_members m where m.league_id = l.id)::integer as members,
                   p.name as from_name, p.username as from_username,
                   case when i.as_scorer and private.scorer_invite_ok(i.league_id, i.invited_by)
                        then jsonb_build_object('scorer', jsonb_build_object(
                               'title', private.scorer_title(i.league_id, i.scope, i.ref_id),
                               'scope', i.scope,
                               'refId', i.ref_id,
                               'path', private.scorer_path(i.league_id, i.scope, i.ref_id),
                               'asPlayer', i.as_player and private.invite_ok(i.league_id, i.invited_by)))
                        else '{}'::jsonb end as scorer
              from public.league_invites i
              join public.leagues l on l.id = i.league_id
              left join public.profiles p on p.id = i.invited_by
             where i.user_id = v_uid and i.status = 'pending' and private.league_invite_valid(i)
             order by i.created_at desc, i.id desc
             limit 50) x), '[]'::jsonb);
end $$;

-- Igual que en 20260929001000_sueltos_logos.sql, con private.league_invite_valid. players («¿Quién eres?») sale vacío
-- si la parte de jugar no vale (o es solo de anotador). En una de anotador, scorer: {title, scope, refId, path,
-- asPlayer} (pendiente: solo si su parte de anotar vale; ya decidida: siempre). Las demás salen igual.
create or replace function public.league_invite_details(p_invite uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  i public.league_invites;
  l public.leagues;
  v_open boolean;
  v_play boolean;
  v_show boolean;
begin
  select * into i from public.league_invites x where x.id = p_invite;
  if i.id is null or not (i.user_id = v_uid or private.is_super()) then
    return null;
  end if;
  select * into l from public.leagues x where x.id = i.league_id;
  v_open := i.status = 'pending' and private.league_invite_valid(i);
  v_play := v_open and i.as_player and private.invite_ok(i.league_id, i.invited_by);
  v_show := v_open or l.id in (select private.readable_leagues());
  return jsonb_build_object(
    'id', i.id,
    'status', case when i.status = 'pending' and not v_open then 'cancelled' else i.status end,
    'createdAt', private.iso(i.created_at),
    'invitedBy', (select jsonb_build_object('id', p.id, 'name', p.name, 'username', p.username)
                    from public.profiles p where p.id = i.invited_by),
    'mine', i.user_id = v_uid,
    'member', exists (select 1 from public.league_members m where m.league_id = l.id and m.user_id = i.user_id),
    'league', jsonb_build_object(
      'id', l.id,
      'name', l.name,
      'sport', l.sport,
      'kind', l.kind,
      'visibility', l.visibility,
      'logoPath', l.logo_path,
      'venue', case when v_show then l.venue end,
      'schedule', case when v_show then l.schedule end,
      'seasonStart', case when v_show then l.season_start end,
      'seasonEnd', case when v_show then l.season_end end,
      'members', case when v_show then (select count(*) from public.league_members m where m.league_id = l.id)::integer end),
    'players', case when not v_play then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.name, f.id)
        from (select p.id, p.name from public.players p
               where p.league_id = l.id and p.user_id is null and not p.is_minor
                 and not exists (select 1 from public.player_claims c where c.player_id = p.id and c.status = 'pending')
               order by p.name, p.id
               limit 500) f), '[]'::jsonb) end)
    || case when i.as_scorer and (not v_open or private.scorer_invite_ok(i.league_id, i.invited_by))
            then jsonb_build_object('scorer', jsonb_build_object(
                   'title', private.scorer_title(i.league_id, i.scope, i.ref_id),
                   'scope', i.scope,
                   'refId', i.ref_id,
                   'path', private.scorer_path(i.league_id, i.scope, i.ref_id),
                   'asPlayer', i.as_player and private.invite_ok(i.league_id, i.invited_by)))
            else '{}'::jsonb end;
end $$;

-- =====================================================================
-- 7. Los avisos de anotador en las preferencias del teléfono
-- =====================================================================
-- Igual que en 20260929001110_insignias_motor.sql (la última) y además 'anotador' en 'liga' («Tus ligas»):
-- 'anotador:<liga>' («Ahora puedes anotar en …», set_member_scorer) y 'anotador:<link>' («Ana entró a anotar en …», a
-- quien creó el link, join_as_scorer). La invitación de anotador usa 'invitacion:<id>' (ya en 'liga').
-- Un tag nuevo que se pueda apagar va aquí (o en una migración después de esta), con su categoría.
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
  end
$$;

-- =====================================================================
-- 8. RPC: nombrar e invitar
-- =====================================================================

-- Cambia la firma (p_scope, p_ref): se borra y se crea de nuevo. La llamada de antes (3 argumentos por nombre) sirve.
drop function public.set_member_scorer(uuid, uuid, boolean);

-- Dueño o admin (o superadmin): nombra o quita anotadores. Un admin que no es el dueño solo a miembros (ni a sí mismo,
-- ni a otro admin, ni al dueño). 'no_existe' (no es miembro), 'invalido' (p_scope/p_ref que no son de la liga, o
-- nombrar a una cuenta bloqueada). Nombrar: push 'anotador:<liga>' a la cuenta («Ahora puedes anotar en …», lleva al
-- torneo de p_scope/p_ref), uno por día y liga (nombrar y quitar una y otra vez no le llena el teléfono); ya
-- anotador: nada. Quitar a quien entró solo para anotar (miembro sin jugador ni «Diseña insignias», que es del dueño):
-- sale de la liga (sus invitaciones mandadas y sus reclamos se cancelan por los triggers). A los demás solo se les
-- quita la marca. Quitar (lo haga otro): los links para anotar de la liga ya no lo dejan entrar
-- (private.scorer_link_block).
create function public.set_member_scorer(p_league uuid, p_user uuid, p_scorer boolean,
                                         p_scope text default null, p_ref uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  m public.league_members;
  v_scope text := coalesce(p_scope, 'liga');
begin
  if not private.is_admin(p_league) then
    perform private.deny();
  end if;
  select * into m from public.league_members x where x.league_id = p_league and x.user_id = p_user for update;
  if m.user_id is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_owner(p_league) and m.role <> 'member' then
    perform private.deny();
  end if;
  if not private.scorer_ref_ok(p_league, v_scope, p_ref) then
    perform private.fail('invalido');
  end if;
  if coalesce(p_scorer, false) then
    if m.is_scorer then
      return;
    end if;
    if private.is_blocked(p_user) then
      perform private.fail('invalido');
    end if;
    update public.league_members x set is_scorer = true where x.league_id = p_league and x.user_id = p_user;
    if p_user <> v_uid and private.push_due(p_user, 'anotador:' || p_league::text, interval '1 day') then
      perform private.queue_push(p_user, 'liga', 'Ahora puedes anotar en ' || private.scorer_title(p_league, v_scope, p_ref),
        coalesce((select p.name from public.profiles p where p.id = v_uid), 'Un admin') || ' te nombró anotador. Toca para ir.',
        private.scorer_path(p_league, v_scope, p_ref), 'anotador:' || p_league::text, 86400);
    end if;
  else
    if not m.is_scorer then
      return;
    end if;
    if m.scorer_only and m.role = 'member' and not m.badge_maker
       and not exists (select 1 from public.players p where p.league_id = p_league and p.user_id = p_user) then
      delete from public.league_members x where x.league_id = p_league and x.user_id = p_user;
    else
      -- scorer_only no se toca: un admin (o quien diseña insignias) que entró solo para anotar sigue sin jugador (y
      -- nadie se lo crea solo).
      update public.league_members x set is_scorer = false where x.league_id = p_league and x.user_id = p_user;
    end if;
  end if;
  perform private.emit_scorers(p_league, p_user);
end $$;

-- Dueño o admin: invita a esas cuentas (en su orden, sin repetidas; de 1 a 20) a anotar en la liga, desde un torneo
-- (p_scope/p_ref: el texto y a dónde lleva). Cada una sale con su estado, en este orden: 'unavailable' (yo, no existe o
-- bloqueada), 'member' (ya está: la hoja la nombra con set_member_scorer), 'pending' (ya tiene una de anotador que
-- vale), 'declined' (rechazó una de esta liga hace menos de 7 días), 'rate_limited' (el límite 'invite:' de
-- invite_to_league, 100 por día, se llenó en esta llamada) o 'sent' (nueva). Si tenía una pendiente para jugar, esa se
-- retira y la nueva invita a las dos cosas (as_player). La pendiente que ya no vale se cancela antes. Push
-- 'invitacion:<id>' («Ana te invitó a anotar en <torneo>»): uno por persona y día de quien invita. Devuelve {sent,
-- results: [{userId, status}]}, como invite_to_league. 'no_existe', 'no_permitido', 'invalido', 'rate_limited'.
create function public.invite_scorers(p_league uuid, p_users uuid[], p_scope text default 'liga', p_ref uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_key text := 'invite:' || v_uid::text;
  v_scope text := coalesce(p_scope, 'liga');
  v_batch text := coalesce(current_setting('mm.push_batch', true), '');
  v_users uuid[];
  v_user uuid;
  v_from text;
  v_title text;
  v_status text;
  v_prev uuid;
  v_id uuid;
  v_sent integer := 0;
  v_queued boolean := false;
  v_results jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.leagues l where l.id = p_league) then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(p_league) then
    perform private.deny();
  end if;
  if not private.scorer_ref_ok(p_league, v_scope, p_ref) then
    perform private.fail('invalido');
  end if;
  v_users := array(select a.u from unnest(p_users) with ordinality as a (u, n)
                    where a.u is not null group by a.u order by min(a.n));
  if coalesce(cardinality(v_users), 0) = 0 or cardinality(v_users) > 20 then
    perform private.fail('invalido');
  end if;
  if private.rate_blocked(v_key, 100, interval '1 day') then
    perform private.fail('rate_limited');
  end if;

  v_from := coalesce((select p.name from public.profiles p where p.id = v_uid), 'Alguien');
  v_title := private.scorer_title(p_league, v_scope, p_ref);
  perform set_config('mm.push_batch', 'on', true);
  foreach v_user in array v_users loop
    if v_user <> v_uid then
      update public.league_invites i set status = 'cancelled', decided_at = now()
       where i.league_id = p_league and i.user_id = v_user and i.status = 'pending' and not private.league_invite_valid(i);
    end if;
    v_prev := null;
    if v_user = v_uid or not exists (select 1 from public.profiles p where p.id = v_user and p.blocked_at is null) then
      v_status := 'unavailable';
    elsif exists (select 1 from public.league_members m where m.league_id = p_league and m.user_id = v_user) then
      v_status := 'member';
    elsif exists (select 1 from public.league_invites i
                   where i.league_id = p_league and i.user_id = v_user and i.status = 'pending' and i.as_scorer
                     and private.scorer_invite_ok(i.league_id, i.invited_by)) then
      v_status := 'pending';
    elsif exists (select 1 from public.league_invites i
                   where i.league_id = p_league and i.user_id = v_user and i.status = 'declined'
                     and i.decided_at > now() - interval '7 days') then
      v_status := 'declined';
    elsif not private.rate_take(v_key, 100, interval '1 day') then
      v_status := 'rate_limited';
    else
      -- La pendiente para jugar (vale: las que no, ya se cancelaron) se retira; la nueva invita también a jugar.
      update public.league_invites i set status = 'cancelled', decided_at = now()
       where i.league_id = p_league and i.user_id = v_user and i.status = 'pending'
      returning i.id into v_prev;
      v_id := null;
      insert into public.league_invites (league_id, user_id, invited_by, as_player, as_scorer, scope, ref_id)
      values (p_league, v_user, v_uid, v_prev is not null, true, v_scope, p_ref)
      on conflict (league_id, user_id) where status = 'pending' do nothing
      returning id into v_id;
      if v_id is null then
        -- Otro admin la mandó en el mismo momento.
        v_status := 'pending';
      else
        v_status := 'sent';
        v_sent := v_sent + 1;
        -- Uno por persona y día de quien invita (la regla de invite_to_league).
        if not exists (select 1 from public.league_invites i
                        where i.user_id = v_user and i.invited_by = v_uid and i.id <> v_id
                          and i.created_at > now() - interval '1 day') then
          if private.queue_push(v_user, 'liga', left(v_from || ' te invitó a anotar en ' || v_title, 200),
               case when v_prev is not null then 'También te invitó a jugar. Toca para ver la invitación.'
                    else 'Toca para ver la invitación. No te inscribe como jugador.' end,
               '/invitacion/' || v_id::text, 'invitacion:' || v_id::text, 604800) then
            v_queued := true;
          end if;
        end if;
      end if;
    end if;
    v_results := v_results || jsonb_build_array(jsonb_build_object('userId', v_user, 'status', v_status));
  end loop;
  perform set_config('mm.push_batch', v_batch, true);

  if v_queued and v_batch <> 'on' then
    perform private.kick_send_push();
  end if;
  return jsonb_build_object('sent', v_sent, 'results', v_results);
end $$;

-- Dueño o admin: lo que la hoja «Anotadores» no saca de los miembros. {invites: [{id, user: {id, name, username},
-- invitedBy: {id, name} | null, asPlayer, scope, refId, title, createdAt}], links: [private.scorer_link_json]}.
-- invites: las pendientes de anotador cuya parte de anotar vale, la más nueva primero (hasta 100). links: los abiertos
-- (sin quitar ni cambiar) de la liga, también los vencidos, llenos o cerrados (la hoja dice por qué no sirven).
create function public.scorer_access(p_league uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not private.is_admin(p_league) then
    perform private.deny();
  end if;
  return jsonb_build_object(
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id,
               'user', jsonb_build_object('id', x.user_id, 'name', x.name, 'username', x.username),
               'invitedBy', case when x.invited_by is null then null
                                 else jsonb_build_object('id', x.invited_by, 'name', x.from_name) end,
               'asPlayer', x.as_player,
               'scope', x.scope,
               'refId', x.ref_id,
               'title', private.scorer_title(p_league, x.scope, x.ref_id),
               'createdAt', private.iso(x.created_at))
             order by x.created_at desc, x.id desc)
        from (select i.id, i.user_id, i.invited_by, i.scope, i.ref_id, i.created_at, u.name, u.username, f.name as from_name,
                     i.as_player and private.invite_ok(i.league_id, i.invited_by) as as_player
                from public.league_invites i
                join public.profiles u on u.id = i.user_id
                left join public.profiles f on f.id = i.invited_by
               where i.league_id = p_league and i.status = 'pending' and i.as_scorer
                 and private.scorer_invite_ok(i.league_id, i.invited_by)
               order by i.created_at desc, i.id desc
               limit 100) x), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(private.scorer_link_json(k) order by k.created_at desc, k.id desc)
        from private.scorer_links k
       where k.league_id = p_league and k.revoked_at is null), '[]'::jsonb));
end $$;

-- =====================================================================
-- 9. RPC: el link para anotar
-- =====================================================================

-- Dueño o admin: el link para anotar de ese contexto (p_scope 'liga' | 'evento' | 'playoff', p_ref). Si ya hay uno que
-- sirve, ese (sin costo ni cambios: crear dos veces da el mismo); si el que había venció, se llenó o se cerró, se
-- cierra y se abre otro. 'no_existe' (liga), 'no_permitido', 'invalido' (liga con menores, o el contexto no es de la
-- liga), 'cupo_lleno' (ya hay 10 abiertos sin vencer en la liga), 'rate_limited' (20 creados o cambiados por día por
-- cuenta). Devuelve private.scorer_link_json.
create function public.create_scorer_link(p_league uuid, p_scope text default 'liga', p_ref uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_scope text := coalesce(p_scope, 'liga');
  l public.leagues;
  k private.scorer_links;
begin
  select * into l from public.leagues x where x.id = p_league;
  if l.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(p_league) then
    perform private.deny();
  end if;
  if l.has_minors or not private.scorer_ref_ok(p_league, v_scope, p_ref) then
    perform private.fail('invalido');
  end if;
  select * into k from private.scorer_links x
   where x.league_id = p_league and x.scope = v_scope and x.ref_id is not distinct from p_ref and x.revoked_at is null
   for update;
  if k.id is not null then
    if private.scorer_link_status(k) = 'ok' then
      return private.scorer_link_json(k);
    end if;
    update private.scorer_links x set revoked_at = now() where x.id = k.id;
  end if;
  if (select count(*) from private.scorer_links x
       where x.league_id = p_league and x.revoked_at is null and x.expires_at > now()) >= 10 then
    perform private.fail('cupo_lleno');
  end if;
  if not private.rate_take('scorer-link:' || v_uid::text, 20, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  k := private.scorer_link_insert(p_league, v_scope, p_ref, v_uid);
  perform private.emit_scorers(p_league, null);
  return private.scorer_link_json(k);
end $$;

-- Dueño o admin de su liga: cambia el link (el de antes deja de servir; quien ya entró sigue anotando): otro código
-- para el mismo contexto, con 0 usos y 7 días nuevos. Cuesta como crear ('scorer-link:'). 'no_existe', 'no_permitido',
-- 'invalido' (liga con menores o el contexto ya no existe), 'cupo_lleno', 'rate_limited'. Devuelve el nuevo.
create function public.rotate_scorer_link(p_link uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  k private.scorer_links;
begin
  select * into k from private.scorer_links x where x.id = p_link for update;
  if k.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(k.league_id) then
    perform private.deny();
  end if;
  if coalesce((select l.has_minors from public.leagues l where l.id = k.league_id), true)
     or not private.scorer_ref_ok(k.league_id, k.scope, k.ref_id) then
    perform private.fail('invalido');
  end if;
  update private.scorer_links x set revoked_at = now()
   where x.league_id = k.league_id and x.scope = k.scope and x.ref_id is not distinct from k.ref_id and x.revoked_at is null;
  if (select count(*) from private.scorer_links x
       where x.league_id = k.league_id and x.revoked_at is null and x.expires_at > now()) >= 10 then
    perform private.fail('cupo_lleno');
  end if;
  if not private.rate_take('scorer-link:' || v_uid::text, 20, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  k := private.scorer_link_insert(k.league_id, k.scope, k.ref_id, v_uid);
  perform private.emit_scorers(k.league_id, null);
  return private.scorer_link_json(k);
end $$;

-- Dueño o admin de su liga: quita el link (ya quitado: nada). Quien ya entró sigue anotando. 'no_existe',
-- 'no_permitido'.
create function public.revoke_scorer_link(p_link uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k private.scorer_links;
begin
  perform private.require_uid();
  select * into k from private.scorer_links x where x.id = p_link for update;
  if k.id is null then
    perform private.fail('no_existe');
  end if;
  if not private.is_admin(k.league_id) then
    perform private.deny();
  end if;
  update private.scorer_links x set revoked_at = coalesce(x.revoked_at, now()) where x.id = p_link;
  perform private.emit_scorers(k.league_id, null);
end $$;

-- A qué lleva un link para anotar, con sesión o sin ella (/anotar/<código>). Límite: el mismo de invite_preview (30
-- códigos que no existen por hora, por cuenta o por IP; lleno: 'rate_limited'). Mayúsculas y espacios no importan.
-- Código que no existe: null (y el intento queda contado). Link que no sirve: solo {status} ('expired', 'full',
-- 'revoked' o 'closed'), ni siquiera la liga; a la cuenta que un admin quitó (y no anota): {status: 'removed'}. Si
-- sirve: {status: 'ok', leagueId, name, sport, kind, visibility, logoPath, scope, refId, title, path, expiresAt,
-- member, canScore} (member: la cuenta ya está en la liga; canScore: además es dueño, admin o ya anota; sin cuenta, las
-- dos false). Enseña lo mismo que invite_preview más el torneo.
create function public.scorer_link_preview(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_key text := private.rate_key('preview');
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_status text;
  k private.scorer_links;
  l public.leagues;
  m public.league_members;
begin
  if private.rate_blocked(v_key, 30, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  if v_code <> '' then
    select * into k from private.scorer_links x where x.code = v_code;
  end if;
  if k.id is null then
    perform private.rate_hit(v_key, interval '1 hour');
    return null;
  end if;
  v_status := private.scorer_link_status(k);
  if v_status <> 'ok' then
    return jsonb_build_object('status', v_status);
  end if;
  select * into l from public.leagues x where x.id = k.league_id;
  if v_uid is not null then
    select * into m from public.league_members x where x.league_id = k.league_id and x.user_id = v_uid;
    if not coalesce(m.role in ('owner', 'admin') or m.is_scorer, false) and private.scorer_link_blocked(k.league_id, v_uid) then
      return jsonb_build_object('status', 'removed');
    end if;
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'leagueId', l.id,
    'name', l.name,
    'sport', l.sport,
    'kind', l.kind,
    'visibility', l.visibility,
    'logoPath', l.logo_path,
    'scope', k.scope,
    'refId', k.ref_id,
    'title', private.scorer_title(k.league_id, k.scope, k.ref_id),
    'path', private.scorer_path(k.league_id, k.scope, k.ref_id),
    'expiresAt', private.iso(k.expires_at),
    'member', m.user_id is not null,
    'canScore', coalesce(m.role in ('owner', 'admin') or m.is_scorer, false));
end $$;

-- Entrar con el link para anotar (también en una liga privada, sin el código de la liga). Límite: el de join_league
-- ('join:<cuenta>', 10 códigos que no existen por hora; lleno: 'rate_limited'). Código que no existe: null (y el
-- intento queda contado). Link que no sirve: {status} ('expired', 'full', 'revoked', 'closed'). Si sirve:
-- - dueño, admin o ya anotador: 'already' (no cuenta como uso);
-- - miembro sin la marca: 'upgraded' (queda anotador; conserva su jugador y scorer_only no cambia);
-- - no miembro: 'joined' (miembro anotador con scorer_only, sin jugador; sus invitaciones pendientes quedan aceptadas;
--   private.scorer_link_joins lo recuerda);
-- - a quien un admin le quitó el permiso o sacó de la liga (private.scorer_link_blocks), si no anota: {status:
--   'removed'} y nada cambia (ni cuenta como uso): quitar a alguien vale aunque tenga el link.
-- Con 'joined' o 'upgraded' suma un uso y avisa a quien creó el link ('anotador:<link>', «Luis entró a anotar en …»;
-- si entran varios antes de que salga, «Entraron varias personas a anotar en …»; si no sabe quién es, que lo quite y
-- cambie el link). Devuelve {status, leagueId, scope, refId, title, path}. 'no_existe' (la cuenta sin perfil),
-- 'bloqueada'.
create function public.join_as_scorer(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_name text := (select p.name from public.profiles p where p.id = v_uid);
  v_key text := 'join:' || v_uid::text;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_status text;
  v_title text;
  v_path text;
  k private.scorer_links;
  m public.league_members;
begin
  if v_name is null then
    perform private.fail('no_existe');
  end if;
  if private.rate_blocked(v_key, 10, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  if v_code <> '' then
    select * into k from private.scorer_links x where x.code = v_code for update;
  end if;
  if k.id is null then
    perform private.rate_hit(v_key, interval '1 hour');
    return null;
  end if;
  v_status := private.scorer_link_status(k);
  if v_status <> 'ok' then
    return jsonb_build_object('status', v_status);
  end if;

  select * into m from public.league_members x where x.league_id = k.league_id and x.user_id = v_uid for update;
  if not coalesce(m.role in ('owner', 'admin') or m.is_scorer, false) and private.scorer_link_blocked(k.league_id, v_uid) then
    return jsonb_build_object('status', 'removed');
  end if;
  if m.user_id is null then
    insert into public.league_members (league_id, user_id, role, display_name, is_scorer, scorer_only)
    values (k.league_id, v_uid, 'member', v_name, true, true)
    on conflict (league_id, user_id) do nothing;
    if found then
      v_status := 'joined';
      insert into private.scorer_link_joins (league_id, user_id, link_id) values (k.league_id, v_uid, k.id)
      on conflict (league_id, user_id) do update set link_id = excluded.link_id, joined_at = now();
    else
      -- Entró por otro camino en el mismo momento: se sigue como miembro.
      select * into m from public.league_members x where x.league_id = k.league_id and x.user_id = v_uid for update;
    end if;
  end if;
  if v_status <> 'joined' then
    if m.role in ('owner', 'admin') or m.is_scorer then
      v_status := 'already';
    else
      update public.league_members x set is_scorer = true where x.league_id = k.league_id and x.user_id = v_uid;
      v_status := 'upgraded';
    end if;
  end if;

  v_title := private.scorer_title(k.league_id, k.scope, k.ref_id);
  v_path := private.scorer_path(k.league_id, k.scope, k.ref_id);
  if v_status in ('joined', 'upgraded') then
    update private.scorer_links x set uses = x.uses + 1, last_used_at = now() where x.id = k.id;
    if k.created_by is distinct from v_uid then
      perform private.queue_push(k.created_by, 'liga', left(v_name || ' entró a anotar en ' || v_title, 200),
        'Con tu link para anotar. Si no sabes quién es, quítalo y cambia el link en «Anotadores».', v_path,
        'anotador:' || k.id::text, 86400,
        left('Entraron varias personas a anotar en ' || v_title, 200));
    end if;
    perform private.emit_scorers(k.league_id, v_uid);
  end if;
  return jsonb_build_object('status', v_status, 'leagueId', k.league_id, 'scope', k.scope, 'refId', k.ref_id,
                            'title', v_title, 'path', v_path);
end $$;

-- =====================================================================
-- Permisos: las RPC solo con sesión (scorer_link_preview también sin cuenta); las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array[
    'set_member_scorer', 'invite_scorers', 'scorer_access', 'create_scorer_link', 'rotate_scorer_link', 'revoke_scorer_link',
    'scorer_link_preview', 'join_as_scorer',
    -- Redefinidas (create or replace conserva sus permisos; se dejan igual para asegurarlo).
    'save_game', 'update_entry', 'save_verified_games', 'ensure_my_player', 'invite_to_league', 'respond_league_invite',
    'my_league_invites', 'league_invite_details'];
  v_private constant text[] := array[
    'new_scorer_code', 'scorer_ref_ok', 'scorer_title', 'scorer_path', 'scorer_invite_ok', 'league_invite_valid',
    'is_event_scorer', 'has_scorer_flag', 'scorer_link_status', 'scorer_link_json', 'emit_scorers', 'scorer_link_insert',
    'scorer_link_blocked', 'scorer_link_block', 'scorer_link_unblock', 'scorer_links_minors',
    'can_upload_photo', 'lanes_event', 'ensure_player', 'people_item', 'accept_invites_on_join', 'push_category'];
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

-- Ver a qué lleva un link para anotar también sin cuenta (como invite_preview).
grant execute on function public.scorer_link_preview(text) to anon;
