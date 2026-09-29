-- MatchMate · Legal: términos y privacidad con versión y aceptación guardada, y reportes de contenido.
--
-- Términos y privacidad (F22a)
-- 1. private.legal_versions() → {terms, privacy}: las versiones vigentes ('YYYY-MM-DD'). Son las mismas de
--    src/lib/legal.ts (TERMS_VERSION, PRIVACY_VERSION); tests/sql/legal.test.ts revisa que coincidan. Cambiar un
--    texto = una migración nueva que redefine esta función + las constantes del cliente (con su lista de cambios).
-- 2. public.legal_acceptances: qué versión de cada documento ('terminos' | 'privacidad') aceptó cada cuenta, cuándo
--    y con qué navegador. La lee la propia cuenta (y el superadmin); nadie escribe directo. Se borra con la cuenta y
--    sale sola en export_my_data (tiene user_id).
-- 3. accept_legal(p_terms, p_privacy): la cuenta acepta las versiones vigentes (otras: 'invalido'). Guarda el
--    navegador de la cabecera user-agent que deja PostgREST (en PGlite, null). Idempotente. También sirve a una
--    cuenta bloqueada (aceptar no es escribir en una liga).
-- 4. Registro con correo: si la metadata trae {legal: {terms, privacy}} con las versiones vigentes (marcó
--    «Acepto los Términos y la Política de privacidad»), el trigger on_auth_user_legal lo guarda al crear la cuenta
--    (también si falta confirmar el correo). Google no pasa metadata: la app lo acepta al volver
--    (src/components/LegalGate.tsx). Nunca hace fallar el registro.
-- 5. admin_legal_stats(): cuántas cuentas aceptaron lo vigente, cuántas no aceptaron nada y por versión.
--
-- Reportes (F22b)
-- 6. public.reports: «esto no debería estar aquí». Qué (comentario, liga, cuenta, juego o aviso de liga), por qué
--    ('spam' | 'ofensivo' | 'acoso' | 'falso' | 'menores' | 'otro'), una nota opcional y cómo quedó ('open' →
--    'dismissed' | 'actioned', con quién, cuándo y una nota). La leen quien reportó (las suyas), el superadmin
--    (todas) y los admins de la liga (solo comentarios, avisos y juegos de su liga, y nunca los de lo suyo:
--    target_owner_id, de quién era lo reportado al reportarlo; si no, la nota y la hora le dirían quién fue).
--    reporter_id, handled_by y target_owner_id no se leen directo (así un admin de liga no sabe quién reportó): la
--    lista va por list_reports. Nadie escribe directo.
-- 7. report_content(p_kind, p_target, p_reason, p_note): lo que se reporta tiene que existir y verse (si no,
--    'no_existe'); lo propio (su comentario, aviso, juego, liga o cuenta) no ('invalido'). Uno abierto por cuenta y
--    cosa (otra vez = el mismo id). 10 por día ('rate_limited'). Push a los superadmins «Nuevo reporte: <motivo>» a
--    la consola, uno por cosa reportada (lo que no salió todavía se reemplaza: tag 'reporte:<tipo>:<id>').
-- 8. resolve_report(p_report, p_status, p_note): 'dismissed' (descartado) o 'actioned' (atendido), solo si sigue
--    abierto ('cerrado': lo que decidió otro no se cambia). El superadmin (queda en la auditoría: resolve_report) o
--    un admin de la liga para comentarios, avisos y juegos de su liga (no los que son suyos). Cierra también los
--    demás reportes abiertos de la misma cosa.
-- 9. list_reports(p_status, p_league, p_kind, p_limit, p_offset): la lista con lo reportado a la vista (texto,
--    autor, liga y link; null si ya se borró) y cuántos hay de lo mismo. El superadmin, todo; un admin de liga,
--    solo su liga (p_league), sin lo suyo y sin saber quién reportó.
-- 10. my_reports(): los reportes que hizo la cuenta (para «Descargar mis datos»: reports no tiene user_id, así que
--    export_my_data no los trae solo; la app los junta en el mismo archivo). Sin quién los atendió.
--
-- Todo corre igual en PGlite (no hay parte solo de Supabase). Contrato del cliente: src/lib/data/legal.ts y
-- src/lib/data/reports.ts.

-- =====================================================================
-- 1-2. Versiones y aceptaciones
-- =====================================================================

-- Las versiones vigentes (las mismas de src/lib/legal.ts).
create function private.legal_versions() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('terms', '2026-09-29', 'privacy', '2026-09-29')
$$;

create table public.legal_acceptances (
  user_id uuid not null references public.profiles (id) on delete cascade,
  doc text not null check (doc in ('terminos', 'privacidad')),
  version text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  accepted_at timestamptz not null default now(),
  user_agent text check (char_length(user_agent) <= 300),
  primary key (user_id, doc, version)
);
-- Cuántas cuentas aceptaron cada versión (consola).
create index legal_acceptances_version_idx on public.legal_acceptances (doc, version);

alter table public.legal_acceptances enable row level security;
create policy legal_acceptances_read on public.legal_acceptances for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_super()));
revoke all on public.legal_acceptances from public, anon, authenticated;
grant select on public.legal_acceptances to authenticated;

-- =====================================================================
-- 3. Aceptar
-- =====================================================================

-- La cuenta de la sesión acepta las versiones vigentes de los dos documentos. Ver el encabezado.
create function public.accept_legal(p_terms text, p_privacy text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v jsonb := private.legal_versions();
  v_headers jsonb;
  v_ua text;
begin
  if v_uid is null then
    perform private.deny();
  end if;
  if p_terms is distinct from v ->> 'terms' or p_privacy is distinct from v ->> 'privacy' then
    perform private.fail('invalido');
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    perform private.fail('no_existe');
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_ua := private.clean_line(v_headers ->> 'user-agent', 300);
  insert into public.legal_acceptances (user_id, doc, version, user_agent)
  values (v_uid, 'terminos', p_terms, v_ua), (v_uid, 'privacidad', p_privacy, v_ua)
  on conflict (user_id, doc, version) do nothing;
end $$;

-- =====================================================================
-- 4. Registro con correo: la casilla «Acepto…» viaja en la metadata
-- =====================================================================

-- Corre después de private.handle_new_user (los triggers del mismo evento van por nombre: 'created' < 'legal'), así
-- el perfil ya existe. Solo las versiones vigentes; lo demás no se guarda (la app pregunta al entrar).
create function private.record_signup_legal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_legal jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb) -> 'legal';
  v jsonb := private.legal_versions();
begin
  if jsonb_typeof(v_legal) is distinct from 'object'
     or v_legal ->> 'terms' is distinct from v ->> 'terms'
     or v_legal ->> 'privacy' is distinct from v ->> 'privacy'
     or not exists (select 1 from public.profiles p where p.id = new.id) then
    return new;
  end if;
  insert into public.legal_acceptances (user_id, doc, version)
  values (new.id, 'terminos', v ->> 'terms'), (new.id, 'privacidad', v ->> 'privacy')
  on conflict (user_id, doc, version) do nothing;
  return new;
exception when others then
  raise warning 'aceptación legal de %: %', new.id, sqlerrm;
  return new;
end $$;

create trigger on_auth_user_legal after insert on auth.users for each row execute function private.record_signup_legal();

-- =====================================================================
-- 5. Consola: quién aceptó
-- =====================================================================

-- {terms, privacy, accounts, accepted (las dos vigentes), acceptedTerms, acceptedPrivacy, never (ninguna versión),
--  last7d (aceptaron lo vigente en 7 días), byVersion: [{doc, version, accounts}]}. Solo superadmin.
create function public.admin_legal_stats() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := private.legal_versions();
  v_terms text := v ->> 'terms';
  v_privacy text := v ->> 'privacy';
begin
  perform private.require_super();
  return (
    with cur as (
      select a.user_id,
             bool_or(a.doc = 'terminos' and a.version = v_terms) as t,
             bool_or(a.doc = 'privacidad' and a.version = v_privacy) as p,
             max(a.accepted_at) filter (where (a.doc = 'terminos' and a.version = v_terms)
                                           or (a.doc = 'privacidad' and a.version = v_privacy)) as at
        from public.legal_acceptances a
       group by a.user_id
    )
    select jsonb_build_object(
      'terms', v_terms,
      'privacy', v_privacy,
      'accounts', (select count(*) from public.profiles)::integer,
      'accepted', (select count(*) from cur where cur.t and cur.p)::integer,
      'acceptedTerms', (select count(*) from cur where cur.t)::integer,
      'acceptedPrivacy', (select count(*) from cur where cur.p)::integer,
      'never', (select count(*) from public.profiles pr
                 where not exists (select 1 from public.legal_acceptances a where a.user_id = pr.id))::integer,
      'last7d', (select count(*) from cur where cur.t and cur.p and cur.at > now() - interval '7 days')::integer,
      'byVersion', coalesce((
        select jsonb_agg(jsonb_build_object('doc', x.doc, 'version', x.version, 'accounts', x.n) order by x.doc, x.version desc)
          from (select a.doc, a.version, count(*)::integer as n from public.legal_acceptances a group by a.doc, a.version) x),
        '[]'::jsonb)));
end $$;

-- =====================================================================
-- 6. Reportes
-- =====================================================================
-- league_id: de qué liga es lo reportado (la liga misma si es una liga; null si es una cuenta). Sin FK estricta a
-- lo reportado (puede ser de cinco tablas): si se borra, el reporte queda (la vista previa dice que ya no existe).
-- target_owner_id: de quién era lo reportado al reportarlo (autor, dueño, jugador o la cuenta; null si no hay uno
-- solo, como un partido): si es admin de la liga, no ve ese reporte.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_kind text not null check (target_kind in ('comment', 'league', 'user', 'game', 'announcement')),
  target_id uuid not null,
  league_id uuid references public.leagues (id) on delete set null,
  target_owner_id uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('spam', 'ofensivo', 'acoso', 'falso', 'menores', 'otro')),
  note text check (char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  action_note text check (char_length(action_note) <= 500),
  check ((status = 'open') = (handled_at is null))
);
-- Uno abierto por cuenta y cosa reportada.
create unique index reports_open_key on public.reports (reporter_id, target_kind, target_id) where status = 'open';
create index reports_status_idx on public.reports (status, created_at desc, id desc);
create index reports_league_idx on public.reports (league_id, created_at desc) where league_id is not null;
create index reports_target_idx on public.reports (target_kind, target_id, status);
create index reports_reporter_idx on public.reports (reporter_id);
create index reports_handled_idx on public.reports (handled_by) where handled_by is not null;
create index reports_target_owner_idx on public.reports (target_owner_id) where target_owner_id is not null;

alter table public.reports enable row level security;
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = (select auth.uid())
         or (select private.is_super())
         or (target_kind in ('comment', 'announcement', 'game') and league_id in (select private.admin_leagues())
             and target_owner_id is distinct from (select auth.uid())));
revoke all on public.reports from public, anon, authenticated;
-- Todas las columnas menos quién reportó, quién lo atendió y de quién era (list_reports da lo que cada uno puede ver).
grant select (id, target_kind, target_id, league_id, reason, note, status, created_at, handled_at, action_note)
  on public.reports to authenticated;

-- =====================================================================
-- Ayudas de los reportes
-- =====================================================================

-- El motivo en palabras (título del push).
create function private.report_reason_label(p_reason text) returns text
language sql immutable set search_path = '' as $$
  select case p_reason
    when 'spam' then 'spam o publicidad'
    when 'ofensivo' then 'contenido ofensivo'
    when 'acoso' then 'acoso'
    when 'falso' then 'resultado falso o trampa'
    when 'menores' then 'riesgo para un menor'
    else 'otro motivo'
  end
$$;

-- Qué es lo reportado, en palabras.
create function private.report_kind_label(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'comment' then 'Un comentario'
    when 'league' then 'Una liga'
    when 'user' then 'Una cuenta'
    when 'game' then 'Un juego'
    when 'announcement' then 'Un aviso de liga'
    else 'Algo'
  end
$$;

-- Lo reportado a la vista: {title, text, url, userId, userName, leagueId, leagueName, sport, …} (sin mirar
-- permisos: lo usan las RPC). null = ya no existe. En una liga, además kind, visibility, members y events (para
-- borrarla desde la consola); en una cuenta, blocked.
create function private.report_target(p_kind text, p_target uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v jsonb;
begin
  if p_kind = 'comment' then
    select jsonb_build_object(
             'title', 'Comentario de ' || c.author_name, 'text', c.text, 'userId', c.user_id, 'userName', c.author_name,
             'leagueId', c.league_id,
             'url', '/l/' || c.league_id::text || '/juegos?juego=' || c.entry_id::text || '&evento=' || c.event_id::text)
      into v from public.comments c where c.id = p_target;
  elsif p_kind = 'announcement' then
    select jsonb_build_object(
             'title', 'Aviso' || coalesce(' de ' || nullif(a.author_name, ''), ''), 'text', a.body, 'userId', a.sent_by,
             'userName', nullif(a.author_name, ''), 'leagueId', a.league_id, 'url', '/l/' || a.league_id::text)
      into v from public.league_announcements a where a.id = p_target;
  elsif p_kind = 'league' then
    select jsonb_build_object(
             'title', l.name, 'text', null, 'userId', l.owner_id, 'userName', o.name, 'leagueId', l.id,
             'url', '/l/' || l.id::text, 'kind', l.kind, 'visibility', l.visibility,
             'members', (select count(*) from public.league_members m where m.league_id = l.id)::integer,
             'events', (select count(*) from public.events e where e.league_id = l.id)::integer)
      into v from public.leagues l left join public.profiles o on o.id = l.owner_id where l.id = p_target;
  elsif p_kind = 'user' then
    select jsonb_build_object(
             'title', p.name, 'text', null, 'userId', p.id, 'userName', p.name, 'leagueId', null,
             'url', '/u/' || p.id::text, 'blocked', p.blocked_at is not null)
      into v from public.profiles p where p.id = p_target;
  elsif p_kind = 'game' then
    -- Boliche (participación), partido, tarjeta de golf o resultado de natación: el id es de una sola.
    select jsonb_build_object(
             'title', 'Juego de ' || p.name, 'text', nullif(array_to_string(e.scores, ' · '), ''), 'userId', p.user_id,
             'userName', p.name, 'leagueId', e.league_id,
             'url', '/l/' || e.league_id::text || '/juegos?juego=' || e.id::text || '&evento=' || e.event_id::text)
      into v from public.entries e join public.players p on p.id = e.player_id where e.id = p_target;
    if v is null then
      select jsonb_build_object(
               'title', 'Partido',
               'text', nullif(concat_ws(' · ',
                          (select string_agg(s.label, ' vs ' order by s.side) from public.match_sides s where s.match_id = m.id),
                          nullif(btrim(coalesce(m.score ->> 'text', '')), '')), ''),
               'userId', null, 'userName', null, 'leagueId', m.league_id,
               'url', '/l/' || m.league_id::text || '/juegos?partido=' || m.id::text)
        into v from public.matches m where m.id = p_target;
    end if;
    if v is null then
      select jsonb_build_object(
               'title', 'Tarjeta de golf de ' || p.name, 'text', null, 'userId', p.user_id, 'userName', p.name,
               'leagueId', c.league_id, 'url', '/l/' || c.league_id::text || '/e/' || c.event_id::text)
        into v from public.golf_cards c join public.players p on p.id = c.player_id where c.id = p_target;
    end if;
    if v is null then
      select jsonb_build_object(
               'title', 'Resultado de natación de ' || p.name, 'text', null, 'userId', p.user_id, 'userName', p.name,
               'leagueId', s.league_id, 'url', '/l/' || s.league_id::text || '/e/' || s.event_id::text)
        into v from public.swim_entries s join public.players p on p.id = s.player_id where s.id = p_target;
    end if;
  end if;
  if v is not null and v ->> 'leagueId' is not null then
    v := v || coalesce((select jsonb_build_object('leagueName', l.name, 'sport', l.sport)
                          from public.leagues l where l.id = (v ->> 'leagueId')::uuid), '{}'::jsonb);
  end if;
  return v;
end $$;

-- Push a los superadmins (sin bloquear; no a quien reportó). Uno por cosa reportada: lo que todavía no salió con el
-- mismo tag se reemplaza, así diez reportes de lo mismo son un solo aviso que dice cuántos hay.
create function private.report_push(p_report uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.reports;
  v_tag text;
  v_open integer;
  v_league text;
begin
  select * into r from public.reports x where x.id = p_report;
  v_tag := 'reporte:' || r.target_kind || ':' || r.target_id::text;
  v_open := (select count(*) from public.reports x
              where x.target_kind = r.target_kind and x.target_id = r.target_id and x.status = 'open')::integer;
  v_league := (select l.name from public.leagues l where l.id = r.league_id);
  delete from public.push_outbox o
   where o.user_id in (select p.id from public.profiles p where p.is_superadmin)
     and o.tag = v_tag and o.sent_at is null and o.claimed_at is null;
  insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency)
  select p.id,
         left('Nuevo reporte: ' || private.report_reason_label(r.reason), 200),
         left(private.report_kind_label(r.target_kind)
              || case when r.target_kind <> 'league' and v_league is not null then ' en ' || v_league else '' end
              || case when v_open > 1 then '. Hay ' || v_open || ' reportes abiertos de lo mismo.' else '.' end
              || ' Toca para revisarlo.', 1000),
         '/superadmin/reportes',
         v_tag,
         86400,
         'normal'
    from public.profiles p
   where p.is_superadmin and p.blocked_at is null and p.id is distinct from r.reporter_id;
  -- Que salga ya (sin esperar la vuelta del cron). En PGlite no hace nada.
  if exists (select 1 from public.push_outbox o where o.tag = v_tag and o.sent_at is null) then
    perform private.kick_send_push();
  end if;
end $$;

-- =====================================================================
-- 7-9. RPC de los reportes
-- =====================================================================

-- Reportar. Ver el encabezado. Devuelve el id del reporte (el abierto que ya tenía, si lo reportó antes).
create function public.report_content(p_kind text, p_target uuid, p_reason text, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  -- Varias líneas sí; los demás caracteres de control, no.
  v_note text := nullif(btrim(regexp_replace(replace(coalesce(p_note, ''), E'\r\n', E'\n'), '[\x01-\x09\x0b-\x1f\x7f]', ' ', 'g')), '');
  v_key text := 'report:' || v_uid::text;
  v_league uuid;
  v_owner uuid;
  v_seen boolean;
  v_id uuid;
begin
  if v_kind not in ('comment', 'league', 'user', 'game', 'announcement')
     or v_reason not in ('spam', 'ofensivo', 'acoso', 'falso', 'menores', 'otro')
     or p_target is null or char_length(v_note) > 500 then
    perform private.fail('invalido');
  end if;

  -- De qué liga es y de quién; tiene que existir y verse (si no se ve, es como si no existiera).
  if v_kind = 'comment' then
    select c.league_id, c.user_id into v_league, v_owner from public.comments c where c.id = p_target;
  elsif v_kind = 'announcement' then
    select a.league_id, a.sent_by into v_league, v_owner from public.league_announcements a where a.id = p_target;
  elsif v_kind = 'league' then
    select l.id, l.owner_id into v_league, v_owner from public.leagues l where l.id = p_target;
  elsif v_kind = 'game' then
    -- Boliche, partido (sin un solo dueño), tarjeta de golf o resultado de natación: de quién es, su jugador.
    select e.league_id, p.user_id into v_league, v_owner
      from public.entries e join public.players p on p.id = e.player_id where e.id = p_target;
    if v_league is null then
      select m.league_id into v_league from public.matches m where m.id = p_target;
    end if;
    if v_league is null then
      select c.league_id, p.user_id into v_league, v_owner
        from public.golf_cards c join public.players p on p.id = c.player_id where c.id = p_target;
    end if;
    if v_league is null then
      select s.league_id, p.user_id into v_league, v_owner
        from public.swim_entries s join public.players p on p.id = s.player_id where s.id = p_target;
    end if;
  end if;
  if v_kind = 'user' then
    v_owner := p_target;
    v_seen := private.social_can_see(p_target);
  else
    v_seen := v_league is not null and exists (select 1 from private.readable_leagues() l where l = v_league);
  end if;
  if not v_seen then
    perform private.fail('no_existe');
  end if;
  if v_owner = v_uid then
    perform private.fail('invalido');
  end if;

  select r.id into v_id from public.reports r
   where r.reporter_id = v_uid and r.target_kind = v_kind and r.target_id = p_target and r.status = 'open';
  if v_id is not null then
    return v_id;
  end if;
  if private.rate_blocked(v_key, 10, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  perform private.rate_hit(v_key, interval '1 day');
  insert into public.reports (reporter_id, target_kind, target_id, league_id, target_owner_id, reason, note)
  values (v_uid, v_kind, p_target, v_league, v_owner, v_reason, v_note)
  on conflict (reporter_id, target_kind, target_id) where status = 'open' do nothing
  returning id into v_id;
  -- Dos toques a la vez: el otro ya lo guardó.
  if v_id is null then
    select r.id into v_id from public.reports r
     where r.reporter_id = v_uid and r.target_kind = v_kind and r.target_id = p_target and r.status = 'open';
    return v_id;
  end if;
  perform private.report_push(v_id);
  return v_id;
end $$;

-- Descartar ('dismissed') o marcar como atendido ('actioned', con nota). Ver el encabezado.
create function public.resolve_report(p_report uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_note text := nullif(btrim(regexp_replace(replace(coalesce(p_note, ''), E'\r\n', E'\n'), '[\x01-\x09\x0b-\x1f\x7f]', ' ', 'g')), '');
  v_super boolean := private.is_super();
  r public.reports;
  n integer;
begin
  if v_status not in ('dismissed', 'actioned') or char_length(v_note) > 500 then
    perform private.fail('invalido');
  end if;
  select * into r from public.reports x where x.id = p_report for update;
  if r.id is null then
    perform private.fail('no_existe');
  end if;
  if not v_super then
    -- Un admin de liga: solo comentarios, avisos y juegos de su liga, y nunca lo que es suyo (al reportarlo o ahora).
    if r.league_id is null or r.target_kind not in ('comment', 'announcement', 'game') or not private.is_admin(r.league_id)
       or r.target_owner_id = v_uid
       or coalesce(private.report_target(r.target_kind, r.target_id) ->> 'userId', '') = v_uid::text then
      perform private.deny();
    end if;
  end if;
  -- Ya lo decidió alguien (otro admin o el superadmin): su decisión y su nota se quedan. El for update de arriba
  -- espera al que lo estaba cerrando a la vez y ve cómo quedó.
  if r.status <> 'open' then
    perform private.fail('cerrado');
  end if;
  -- Este y los demás abiertos de lo mismo.
  update public.reports x
     set status = v_status, handled_by = v_uid, handled_at = now(), action_note = v_note
   where x.target_kind = r.target_kind and x.target_id = r.target_id and x.status = 'open';
  get diagnostics n = row_count;
  if v_super then
    perform private.audit('resolve_report', 'app', p_report::text, jsonb_build_object(
      'kind', r.target_kind, 'targetId', r.target_id, 'leagueId', r.league_id, 'reason', r.reason, 'status', v_status,
      'note', v_note, 'closed', n));
  end if;
end $$;

-- La lista. p_status: 'open' (por defecto), 'closed' (descartados y atendidos), 'dismissed', 'actioned' o 'all'.
-- El superadmin ve todo (p_league opcional); un admin de liga pasa p_league y ve comentarios, avisos y juegos de esa
-- liga que no son suyos, sin quién reportó. Lo más nuevo primero. → {rows, total (con el filtro), open (abiertos, sin el filtro de
-- estado), all}. Cada fila: {id, kind, targetId, leagueId, leagueName, reason, note, status, createdAt, handledAt,
-- handledByName, actionNote, reporterId, reporterName, sameTarget (abiertos de lo mismo), target (report_target)}.
create function public.list_reports(
  p_status text default 'open',
  p_league uuid default null,
  p_kind text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_super boolean := private.is_super();
  v_status text := coalesce(nullif(lower(btrim(coalesce(p_status, ''))), ''), 'open');
  v_kind text := nullif(lower(btrim(coalesce(p_kind, ''))), '');
  v_limit integer := private.clamp_int(p_limit, 1, 100, 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_open integer;
  v_all integer;
  v_rows jsonb;
begin
  if v_uid is null then
    perform private.deny();
  end if;
  if v_status not in ('open', 'closed', 'dismissed', 'actioned', 'all')
     or (v_kind is not null and v_kind not in ('comment', 'league', 'user', 'game', 'announcement')) then
    perform private.fail('invalido');
  end if;
  if not v_super and (p_league is null or not private.is_admin(p_league)) then
    perform private.deny();
  end if;

  with f as (
    select r.* from public.reports r
     where (p_league is null or r.league_id = p_league)
       and (v_super or (r.target_kind in ('comment', 'announcement', 'game') and r.target_owner_id is distinct from v_uid))
       and (v_kind is null or r.target_kind = v_kind)
  ), s as (
    select f.* from f
     where case v_status
             when 'open' then f.status = 'open'
             when 'closed' then f.status <> 'open'
             when 'all' then true
             else f.status = v_status
           end
  ), page as (
    select s.*, row_number() over (order by s.created_at desc, s.id desc) as rn
      from s order by s.created_at desc, s.id desc limit v_limit offset v_offset
  )
  select (select count(*) from s)::integer,
         (select count(*) from f where f.status = 'open')::integer,
         (select count(*) from f)::integer,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', pg.id,
                    'kind', pg.target_kind,
                    'targetId', pg.target_id,
                    'leagueId', pg.league_id,
                    'leagueName', l.name,
                    'reason', pg.reason,
                    'note', pg.note,
                    'status', pg.status,
                    'createdAt', private.iso(pg.created_at),
                    'handledAt', private.iso(pg.handled_at),
                    'handledByName', hb.name,
                    'actionNote', pg.action_note,
                    'reporterId', case when v_super then pg.reporter_id end,
                    'reporterName', case when v_super then rp.name end,
                    'sameTarget', (select count(*) from public.reports x
                                    where x.target_kind = pg.target_kind and x.target_id = pg.target_id and x.status = 'open')::integer,
                    'target', private.report_target(pg.target_kind, pg.target_id))
                    order by pg.rn)
             from page pg
             left join public.leagues l on l.id = pg.league_id
             left join public.profiles hb on hb.id = pg.handled_by
             left join public.profiles rp on rp.id = pg.reporter_id), '[]'::jsonb)
    into v_total, v_open, v_all, v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'open', v_open, 'all', v_all);
end $$;

-- Los reportes que hizo la cuenta, del más viejo al más nuevo (hasta 5000, como cada tabla de export_my_data):
-- [{id, kind, targetId, leagueId, leagueName, reason, note, status, createdAt, handledAt, actionNote}]. Sin quién
-- lo atendió ni de quién era lo reportado. Una cuenta bloqueada tampoco (como export_my_data).
create function public.my_reports() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id,
             'kind', x.target_kind,
             'targetId', x.target_id,
             'leagueId', x.league_id,
             'leagueName', l.name,
             'reason', x.reason,
             'note', x.note,
             'status', x.status,
             'createdAt', private.iso(x.created_at),
             'handledAt', private.iso(x.handled_at),
             'actionNote', x.action_note)
             order by x.created_at, x.id)
      from (select r.* from public.reports r where r.reporter_id = v_uid order by r.created_at, r.id limit 5000) x
      left join public.leagues l on l.id = x.league_id), '[]'::jsonb);
end $$;

-- =====================================================================
-- Permisos: las RPC solo con sesión; las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['accept_legal', 'admin_legal_stats', 'report_content', 'resolve_report', 'list_reports',
                                 'my_reports'];
  v_private constant text[] := array['legal_versions', 'record_signup_legal', 'report_reason_label', 'report_kind_label',
                                     'report_target', 'report_push'];
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
