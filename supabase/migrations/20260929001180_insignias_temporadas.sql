-- MatchMate · Insignias: lo que toca a las temporadas (docs/insignias.md §2.11 y §3.3). Las temporadas las trae
-- 20260929000700_temporadas.sql (otra rama) con este contrato:
--   public.seasons (id, league_id, name, starts_on, ends_on, status 'active'|'closed', closed_at, closed_by,
--                   standings jsonb = la tabla final tal como la calculó el teléfono, created_at, updated_at)
--   public.season_awards (id, season_id, league_id, kind 'campeon'|'subcampeon'|'tercero'|'mvp'|'mas_mejorado'|
--                         'fair_play'|'otro', label, player_id | team_id, note)
--   public.close_season(p_season, p_standings, p_awards): el admin cierra la temporada.
--
-- Todo va dentro de un guardia: si public.seasons (o public.season_awards) no existe, no hace nada (así corre antes de
-- juntar las ramas). NO se activa sola después: una migración corre una sola vez. Con las ramas juntas, …0700 va antes
-- que esta y todo sale bien. Si una base ya tiene esta aplicada sin temporadas y …0700 llega después (db push
-- --include-all), hay que volver a correr este archivo a mano (se puede: es idempotente) para activar las insignias de
-- temporada. Cuando existen:
-- 1. private.badge_season_rows(liga, temporada, desde, hasta) (de …1110, misma firma) lee las temporadas y sus premios
--    para la foto del motor ('temporada' y 'anio': «Figura del año» no se da si hubo una temporada igual al año).
-- 2. Trigger en public.seasons: cuando una temporada queda 'closed' se encola 'temporada' (ref 'season:<id>').
-- No hay cierre automático: las temporadas solo las cierra el admin.
do $guard$
begin
  if to_regclass('public.seasons') is null or to_regclass('public.season_awards') is null then
    raise notice 'Sin public.seasons: las insignias de temporada quedan apagadas; con 20260929000700_temporadas.sql aplicada, vuelve a correr este archivo';
    return;
  end if;

  execute $f$
    create or replace function private.badge_season_rows(p_league uuid, p_season uuid, p_from date, p_to date) returns jsonb
    language sql stable security definer set search_path = '' as $b$
      with s as (
        select x.* from public.seasons x
         where x.league_id = p_league and (p_season is null or x.id = p_season)
           and (p_from is null or x.ends_on >= p_from) and (p_to is null or x.starts_on <= p_to)
      )
      select jsonb_build_object(
        'seasons', coalesce((select jsonb_agg(to_jsonb(s) order by s.starts_on, s.id) from s), '[]'::jsonb),
        'season_awards', coalesce((select jsonb_agg(to_jsonb(a) order by a.season_id, a.kind, a.id)
                                     from public.season_awards a where a.season_id in (select s.id from s)), '[]'::jsonb))
    $b$
  $f$;

  execute $f$
    create or replace function private.badges_on_season() returns trigger
    language plpgsql security definer set search_path = '' as $b$
    begin
      if new.status = 'closed' and (tg_op = 'INSERT' or old.status is distinct from 'closed') then
        perform private.badge_enqueue('temporada', new.league_id, null, 'season:' || new.id::text);
      end if;
      return null;
    exception when others then
      raise warning 'insignias (temporada %): %', new.id, sqlerrm;
      return null;
    end $b$
  $f$;

  execute 'drop trigger if exists seasons_badges on public.seasons';
  execute 'create trigger seasons_badges after insert or update of status on public.seasons
             for each row execute function private.badges_on_season()';

  execute 'revoke execute on function private.badge_season_rows(uuid, uuid, date, date) from public, anon, authenticated';
  execute 'revoke execute on function private.badges_on_season() from public, anon, authenticated';
end $guard$;
