-- MatchMate · Insignias en el perfil: las de la liga (las del creador y los premios del torneo) también se destacan y
-- salen en el perfil (docs/insignias.md §6, docs/premios-torneo.md §7). Las automáticas no cambian.
--
-- 1. Destacadas: profiles.featured_badges (hasta 3) guarda ids de badge_awards o de league_badge_awards.
--    set_featured_badges acepta también un otorgamiento de la liga de uno de sus jugadores: vigente, no oculto, de un
--    diseño que el superadmin no escondió y de una liga sin menores ('invalido'). profile_badges devuelve en featured
--    las de las dos tablas que quien mira puede ver hoy, en su orden, y en featuredLeague cuáles de esas son de la liga;
--    hasChosen dice si la cuenta eligió alguna que todavía vale (aunque quien mira no la vea): sin ninguna elegida, el
--    teléfono arma las que salen solas; si eligió y quien mira no ve ninguna, no sale nada.
-- 2. Quién ve un premio del torneo en el perfil de otra cuenta (private.league_award_public): si el servidor comprobó
--    el orden (league_badge_awards.prize_verified) y en la competencia jugaron al menos 2 cuentas distintas
--    (league_badge_awards.prize_accounts, que se cuenta al entregar), basta con que la liga pase
--    private.social_league_ok (la ve quien mira y sin menores), aunque sea pequeña o nueva. El orden verificado solo
--    dice que el servidor ordenó lo que le dieron, no que jugó alguien más: el dueño de una liga de uno que se arma un
--    torneo con jugadores sin cuenta no se fabrica un «Campeón» público. Con menos de 2 cuentas, los premios sin orden
--    verificado (golf, natación, noches) y las que da una persona siguen con private.league_badges_public (6+ cuentas y
--    14+ días). Nunca las ocultas ni las de un diseño escondido.
-- 3. Cada LeagueBadgeAward (private.league_award_json, en el perfil y en los avisos) trae prizeSlotId y prize: el lugar
--    del podio, su título y el nombre de la competencia (private.league_award_prize); en el perfil, además, onProfile
--    (en el propio: si otra cuenta que ve la liga la ve en el perfil).
-- 4. Una insignia de la liga que se oculta o se retira, o cuyo diseño esconde el superadmin, sale de las destacadas
--    (como set_badge_hidden con las automáticas): si después vuelve a verse, no vuelve sola a las destacadas.
-- 5. league_badge_awards.prize_accounts (sin grant: solo la leen las funciones de la base): cuántas cuentas jugaron la
--    competencia de un premio verificado, contadas al entregarlo (private.prize_accounts, con un disparador); los que
--    ya estaban entregados se cuentan aquí con su competencia.
--
-- Cambian (misma firma, cuerpo copiado de su última versión con el cambio): public.profile_badges (la de
-- 20260929001120_insignias_creador.sql), public.set_featured_badges (la de 20260929001100_insignias.sql) y
-- private.league_award_json (la de …1120).

-- =====================================================================
-- Cuántas cuentas jugaron la competencia de un premio
-- =====================================================================

-- Cuántas cuentas distintas jugaron la competencia de un premio con el orden verificado (private.prize_accounts), al
-- entregarlo; null en los demás. Va en el otorgamiento (como prize_verified) para que siga valiendo aunque después se
-- borre la competencia. Sin grant: solo la leen las funciones de la base (no sale en las lecturas de la app).
alter table public.league_badge_awards add column prize_accounts integer check (prize_accounts >= 0);

-- =====================================================================
-- Ayudas
-- =====================================================================

-- Cuántas cuentas distintas (no bloqueadas) jugaron una competencia con el orden verificado por el servidor: las de
-- los jugadores que tienen algún juego que cuenta en el boliche (private.prize_bowling_lines) o que estuvieron en un
-- partido no anulado del cuadro de raqueta, del relámpago o del playoff (su alineación y la plantilla de su equipo o
-- pareja; en el playoff, también la plantilla de los equipos de sus series). Los jugadores sin cuenta no cuentan. 0 si
-- la premiación no existe o no es de esas.
create function private.prize_accounts(p_prize uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  z public.tournament_prizes;
  v_kind text;
  v_ms uuid[] := '{}';
  v_players uuid[] := '{}';
begin
  select * into z from public.tournament_prizes x where x.id = p_prize;
  if z.id is null then
    return 0;
  end if;
  v_kind := private.prize_comp(z.league_id, z.scope, coalesce(z.event_id, z.golf_tournament_id, z.playoff_id));
  if v_kind = 'bowling' then
    v_players := array(select l.player_id from private.prize_bowling_lines(z.event_id) l);
  elsif v_kind in ('racket_tourney', 'team_ko', 'playoff') then
    -- Los partidos de la competencia, como los lee su podio (prize_racket_place, prize_team_ko_place,
    -- prize_playoff_place).
    v_ms := array(select m.id from public.matches m
                   where m.status <> 'void'
                     and case v_kind
                           when 'racket_tourney' then m.event_id = z.event_id
                           when 'team_ko' then m.league_id = z.league_id and m.series_id is null
                           else m.series_id in (select y.id from public.playoff_series y where y.playoff_id = z.playoff_id)
                         end);
    v_players := array(
      select mp.player_id from public.match_players mp where mp.match_id = any (v_ms)
      union
      select tp.player_id from public.match_sides s join public.team_players tp on tp.team_id = s.team_id
       where s.match_id = any (v_ms)
      union
      select tp.player_id from public.playoff_series y join public.team_players tp on tp.team_id in (y.team_a, y.team_b)
       where v_kind = 'playoff' and y.playoff_id = z.playoff_id);
  end if;
  return (select count(distinct p.user_id)::integer
            from public.players p join public.profiles pr on pr.id = p.user_id
           where p.id = any (v_players) and pr.blocked_at is null);
end $$;

-- ¿Una insignia de la liga (vigente, no oculta y de un diseño no escondido) sale en el perfil de su dueño para la
-- cuenta de la sesión? Un premio del torneo con el orden verificado por el servidor y al menos 2 cuentas que jugaron
-- (prize_accounts): si la liga pasa private.social_league_ok (la ve y no tiene menores). Lo demás (también un premio
-- verificado de una competencia que jugó una sola cuenta, o de antes de esta migración cuya competencia ya se borró):
-- private.league_badges_public (además 6+ cuentas miembro no bloqueadas y 14+ días de creada).
create function private.league_award_public(a public.league_badge_awards) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when a.prize_slot_id is not null and a.prize_verified and coalesce(a.prize_accounts, 0) >= 2
              then private.social_league_ok(a.league_id)
              else private.league_badges_public(a.league_id) end
$$;

-- El premio del torneo de un otorgamiento, o null si lo dio una persona (award_league_badge): {slotId, verified,
-- place, placeLabel, category, title, competition}. verified = el servidor comprobó el orden (prize_verified); place
-- 1–3 y placeLabel «1.er lugar»; category 'equipo' | 'individual' | 'pareja'; title «Individual (handicap)»,
-- «Parejas · Categoría A»… (private.prize_slot_title); competition el nombre de la competencia («Copa Aniversario»,
-- «Torneo del 12 oct»: private.prize_comp_name). Si la competencia se borró (su lugar premiado se fue con ella), todo
-- menos slotId y verified va null: la insignia se queda con su periodo y su liga.
create function private.league_award_prize(a public.league_badge_awards) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when a.prize_slot_id is not null then jsonb_build_object(
           'slotId', a.prize_slot_id,
           'verified', a.prize_verified,
           'place', s.place,
           'placeLabel', case when s.id is not null then private.prize_place_label(s.place) end,
           'category', s.category,
           'title', case when s.id is not null then private.prize_slot_title(s) end,
           'competition', case when s.id is not null then private.prize_comp_name(s.prize_id) end) end
    from (select 1) as one
    left join public.tournament_prize_slots s on s.id = a.prize_slot_id
$$;

-- Igual que en 20260929001120_insignias_creador.sql, más prizeSlotId y prize (private.league_award_prize): {id,
-- badgeId, leagueId, leagueName, sport, playerId, teamId, teamName, period, division, awardedAt, hidden, note, seenAt,
-- badge: look, prizeSlotId, prize}. note y seenAt solo si p_mine (es del jugador de quien mira); si no, null.
create or replace function private.league_award_json(a public.league_badge_awards, p_mine boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'id', a.id, 'badgeId', a.badge_id, 'leagueId', a.league_id, 'leagueName', l.name, 'sport', l.sport,
           'playerId', a.player_id, 'teamId', a.team_id,
           'teamName', (select t.name from public.teams t where t.id = a.team_id),
           'period', a.period, 'division', a.division, 'awardedAt', private.iso(a.awarded_at), 'hidden', a.hidden,
           'note', case when p_mine then a.note end, 'seenAt', case when p_mine then private.iso(a.seen_at) end,
           'badge', private.league_badge_look(b),
           'prizeSlotId', a.prize_slot_id, 'prize', private.league_award_prize(a))
    from public.leagues l, public.league_badges b
   where l.id = a.league_id and b.id = a.badge_id
$$;

-- Al entregar un premio con el orden verificado (deliver_tournament_prizes), cuenta las cuentas que jugaron su
-- competencia (lo que venga en prize_accounts no cuenta: lo pone la base).
create function private.league_award_accounts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.prize_accounts := private.prize_accounts((select s.prize_id from public.tournament_prize_slots s where s.id = new.prize_slot_id));
  return new;
end $$;
create trigger league_badge_awards_accounts before insert on public.league_badge_awards
  for each row when (new.prize_slot_id is not null and new.prize_verified)
  execute function private.league_award_accounts();

-- Los premios verificados que ya se entregaron: se cuentan con su competencia (si ya se borró, quedan en null y siguen
-- la regla de private.league_badges_public).
update public.league_badge_awards a set prize_accounts = private.prize_accounts(s.prize_id)
  from public.tournament_prize_slots s
 where s.id = a.prize_slot_id and a.prize_verified and a.prize_accounts is null;

-- =====================================================================
-- Destacadas: las de la liga salen solas al ocultarse, retirarse o esconderse su diseño
-- =====================================================================

-- Un otorgamiento que se oculta (set_league_badge_hidden) o se retira (deshacer, quitar, corrección del podio, fusión,
-- el guardia del vínculo) sale de las destacadas de la cuenta de su jugador.
create function private.league_award_unfeature() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p set featured_badges = array_remove(p.featured_badges, new.id)
   where p.id = (select x.user_id from public.players x where x.id = new.player_id)
     and new.id = any (p.featured_badges);
  return null;
end $$;
create trigger league_badge_awards_unfeature after update of hidden, revoked_at on public.league_badge_awards
  for each row when ((new.hidden and not old.hidden) or (new.revoked_at is not null and old.revoked_at is null))
  execute function private.league_award_unfeature();

-- Un diseño que esconde el superadmin (hide_league_badge: 'oculta'): sus otorgamientos salen de todas las destacadas.
create function private.league_badge_unfeature() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_gone uuid[] := array(select a.id from public.league_badge_awards a where a.badge_id = new.id);
begin
  if cardinality(v_gone) > 0 then
    update public.profiles p
       set featured_badges = array(select u.x from unnest(p.featured_badges) with ordinality as u (x, n)
                                    where u.x <> all (v_gone) order by u.n)
     where p.featured_badges && v_gone;
  end if;
  return null;
end $$;
create trigger league_badges_unfeature after update of status on public.league_badges
  for each row when (new.status = 'oculta' and old.status is distinct from 'oculta')
  execute function private.league_badge_unfeature();

-- =====================================================================
-- RPC
-- =====================================================================

-- Igual que en 20260929001120_insignias_creador.sql, más:
-- - leagueAwards (hasta 500, más nuevas primero): para otra cuenta, un premio del torneo con el orden verificado de una
--   competencia que jugaron 2+ cuentas sale si la liga pasa private.social_league_ok (la ve quien mira y sin menores),
--   aunque no pase private.league_badges_public; lo demás, como antes (private.league_award_public). Cada una con prizeSlotId y
--   prize (private.league_award_json) y onProfile: para otra cuenta, true; en el propio, si otra cuenta que ve la liga
--   la ve en el perfil (no oculta y pasa private.league_award_public).
-- - featured: las destacadas de las dos tablas (badge_awards y league_badge_awards) que quien mira puede ver hoy, en
--   su orden; featuredLeague: cuáles de esas son de la liga (el mismo orden). Una de la liga destacada vale si es de un
--   jugador de la cuenta, vigente, no oculta, de un diseño no escondido y de una liga sin menores; para otra cuenta,
--   además private.league_award_public.
-- - hasChosen: la cuenta eligió alguna destacada que todavía vale para ella (la regla de set_featured_badges), la vea o
--   no quien mira. false = no eligió ninguna: las que salen solas las arma el teléfono (docs/insignias.md §6.1); true y
--   featured vacío = eligió, pero quien mira no ve ninguna: no sale nada.
-- {userId, isMe, featured: [id], featuredLeague: [id], hasChosen, awards: [insignia], truncated, leagueAwards:
--  [LeagueBadgeAward + onProfile], leagueTruncated}.
create or replace function public.profile_badges(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_uid();
  v_self boolean := p_user = v_me;
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_awards jsonb;
  v_featured jsonb;
  v_featured_league jsonb;
  v_chosen boolean;
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
    return jsonb_build_object('userId', p_user, 'isMe', false, 'featured', '[]'::jsonb, 'featuredLeague', '[]'::jsonb,
                              'hasChosen', false, 'awards', '[]'::jsonb, 'truncated', false, 'leagueAwards', '[]'::jsonb,
                              'leagueTruncated', false);
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

  select coalesce(jsonb_agg(u.x order by u.n), '[]'::jsonb),
         coalesce(jsonb_agg(u.x order by u.n) filter (where k.league), '[]'::jsonb)
    into v_featured, v_featured_league
    from public.profiles pr
    cross join lateral unnest(pr.featured_badges) with ordinality as u (x, n)
    cross join lateral (
      select exists (select 1 from public.badge_awards a left join public.players p on p.id = a.player_id
                      where a.id = u.x and (a.user_id = p_user or p.user_id = p_user)
                        and a.status in ('provisional', 'firme') and not a.hidden
                        and (a.league_id is null or private.social_league_ok(a.league_id))) as auto,
             exists (select 1 from public.league_badge_awards a
                       join public.players p on p.id = a.player_id
                       join public.league_badges b on b.id = a.badge_id
                       join public.leagues l on l.id = a.league_id
                      where a.id = u.x and p.user_id = p_user and a.revoked_at is null and not a.hidden
                        and b.status <> 'oculta' and not l.has_minors
                        and (v_self or private.league_award_public(a))) as league
    ) k
   where pr.id = p_user and (k.auto or k.league);

  -- ¿Eligió alguna que todavía vale para ella (la regla de set_featured_badges), la vea o no quien mira?
  select exists (
    select 1 from public.profiles pr
     cross join lateral unnest(pr.featured_badges) as u (x)
     where pr.id = p_user
       and (exists (select 1 from public.badge_awards a
                      left join public.players p on p.id = a.player_id
                      left join public.leagues l on l.id = a.league_id
                     where a.id = u.x and (a.user_id = p_user or p.user_id = p_user)
                       and a.status in ('provisional', 'firme') and not a.hidden and not coalesce(l.has_minors, false))
            or exists (select 1 from public.league_badge_awards a
                         join public.players p on p.id = a.player_id
                         join public.league_badges b on b.id = a.badge_id
                         join public.leagues l on l.id = a.league_id
                        where a.id = u.x and p.user_id = p_user and a.revoked_at is null and not a.hidden
                          and b.status <> 'oculta' and not l.has_minors)))
    into v_chosen;

  select coalesce(jsonb_agg(private.league_award_json(a, v_self)
                              || jsonb_build_object('onProfile', case when v_self
                                                                      then not a.hidden and private.league_award_public(a)
                                                                      else true end)
                            order by a.awarded_at desc, a.id desc), '[]'::jsonb),
         count(*)::integer
    into v_league, v_ln
    from public.league_badge_awards a
   where a.id in (
     select x.id from public.league_badge_awards x
       join public.players p on p.id = x.player_id
       join public.league_badges b on b.id = x.badge_id
      where p.user_id = p_user and x.revoked_at is null and b.status <> 'oculta'
        and (v_self or (not x.hidden and private.league_award_public(x)))
      order by x.awarded_at desc, x.id desc
      limit c_league + 1);
  if v_ln > c_league then
    v_league := v_league - c_league;
  end if;

  return jsonb_build_object('userId', p_user, 'isMe', v_self, 'featured', v_featured, 'featuredLeague', v_featured_league,
                            'hasChosen', v_chosen, 'awards', v_awards, 'truncated', v_n > c_max, 'leagueAwards', v_league,
                            'leagueTruncated', v_ln > c_league);
end $$;

-- Igual que en 20260929001100_insignias.sql, y ahora cada id puede ser de badge_awards o de league_badge_awards.
-- Destacadas del perfil: hasta 3 (repetidas cuentan una vez; null o [] las quita), en ese orden. Cada una suya (de la
-- cuenta o de uno de sus jugadores; si no: 'no_permitido'). Automática: provisional o firme, no oculta y no de una liga
-- con menores. De la liga (del creador o un premio del torneo): vigente, no oculta, de un diseño que el superadmin no
-- escondió y de una liga sin menores. Si no: 'invalido'. Id que no está en ninguna de las dos: 'no_existe'. Devuelve
-- cómo quedaron. Una de la liga que todavía no sale en el perfil de otros (liga pequeña o nueva) se puede destacar:
-- profile_badges la muestra a otra cuenta cuando pase private.league_award_public.
create or replace function public.set_featured_badges(p_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_ids uuid[];
  v_id uuid;
  v_found boolean;
  v_owner uuid;
  v_ok boolean;
begin
  if coalesce(array_ndims(p_ids), 1) <> 1 then
    perform private.fail('invalido');
  end if;
  v_ids := array(select u.x from unnest(coalesce(p_ids, '{}'::uuid[])) with ordinality as u (x, n)
                  where u.x is not null group by u.x order by min(u.n));
  if cardinality(v_ids) > 3 then
    perform private.fail('invalido');
  end if;
  foreach v_id in array v_ids loop
    v_found := null;
    select true, coalesce(a.user_id, p.user_id),
           a.status in ('provisional', 'firme') and not a.hidden and not coalesce(l.has_minors, false)
      into v_found, v_owner, v_ok
      from public.badge_awards a
      left join public.players p on p.id = a.player_id
      left join public.leagues l on l.id = a.league_id
     where a.id = v_id;
    if v_found is null then
      select true, p.user_id, a.revoked_at is null and not a.hidden and b.status <> 'oculta' and not l.has_minors
        into v_found, v_owner, v_ok
        from public.league_badge_awards a
        join public.players p on p.id = a.player_id
        join public.league_badges b on b.id = a.badge_id
        join public.leagues l on l.id = a.league_id
       where a.id = v_id;
    end if;
    if v_found is null then
      perform private.fail('no_existe');
    end if;
    if v_owner is distinct from v_uid then
      perform private.deny();
    end if;
    if not v_ok then
      perform private.fail('invalido');
    end if;
  end loop;
  update public.profiles p set featured_badges = v_ids where p.id = v_uid and p.featured_badges is distinct from v_ids;
  return v_ids;
end $$;

-- =====================================================================
-- Permisos: las RPC solo con sesión; las ayudas, nadie de la app
-- =====================================================================
do $$
declare
  f record;
  v_rpc constant text[] := array['profile_badges', 'set_featured_badges'];
  v_private constant text[] := array['league_award_public', 'league_award_prize', 'league_award_json',
                                     'league_award_unfeature', 'league_badge_unfeature', 'prize_accounts',
                                     'league_award_accounts'];
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
