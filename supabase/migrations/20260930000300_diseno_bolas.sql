-- MatchMate · El diseño de las bolas («Diseñar» en Mis bolas): cómo se ve cada bola dibujada (colores, un dibujo de
-- la lista y figuras pegadas). Lo dibuja el teléfono (<BallArt>, src/components/balls/BallArt.tsx); aquí solo se guarda
-- y se revisa.
--
-- 1. public.bowling_balls.design: el diseño (jsonb con versión) o null (la bola se dibuja lisa, con su color). Un
--    CHECK con private.ball_design_ok: ni con la clave secreta se guarda uno que no vale.
-- 2. private.ball_design_ok: la misma revisión que ballDesignProblem de src/lib/ballDesign.ts, clave por clave:
--    {v: 1, base, second, third, pattern, scale, softness, angle, shine, holes, stickers} con justo esas claves;
--    colores '#rrggbb' en minúsculas (second y third también null: el teléfono los saca de la base); pattern de la
--    lista; scale de 0.5 a 2, softness de 0 a 1, angle de 0 a 360; shine y holes sí/no; hasta 5 stickers
--    {shape, color, x, y, size, rotation} (+ text solo en 'numero', 1 a 3 cifras, e 'iniciales', 1 a 3 letras en
--    mayúscula, y en esas es obligatorio), x e y de -1 a 1, size de 0.1 a 0.6, rotation de 0 a 360. Menos de 4 kB.
--    Nada es texto libre: algo lo puede llenar solo más adelante sin inventar nada.
-- 3. public.set_ball_design(p_ball, p_design): pone (o quita, con null) el diseño de una bola suya y copia su color
--    base a bowling_balls.color (el color con que se reconoce en la lista y al anotar). Mismo límite que las otras
--    escrituras de las bolas ('balls:<uid>', 100 por día); poner el mismo que ya tiene no cuenta.
-- 4. public.my_balls: la de 20260930000100_bolas.sql, con `design` en cada bola.
-- 5. export_my_data ya la trae (todas las columnas de las tablas con user_id); save_ball no cambia (no toca el diseño).
-- Contrato del cliente: src/lib/ballDesign.ts (el tipo y la revisión) y src/lib/data/balls.ts.

-- =====================================================================
-- 1. La revisión (pura)
-- =====================================================================

-- Un color '#rrggbb' en minúsculas (como jsonb string). Nunca falla: cualquier otra cosa es false.
create function private.ball_hex_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'string' then (p #>> '{}') ~ '^#[0-9a-f]{6}$' else false end
$$;

-- Un número (jsonb number) entre p_lo y p_hi (incluidos). Nunca falla: cualquier otra cosa es false.
create function private.ball_num_ok(p jsonb, p_lo numeric, p_hi numeric) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric between p_lo and p_hi else false end
$$;

-- ¿Se puede guardar este diseño? (ver arriba, punto 2). Nunca falla: lo que no vale es false.
create function private.ball_design_ok(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  s jsonb;
  v_shape text;
  v_n integer;
  v_known integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) >= 4096 then
    return false;
  end if;
  select count(*), count(*) filter (where k in ('v', 'base', 'second', 'third', 'pattern', 'scale', 'softness', 'angle',
                                                'shine', 'holes', 'stickers'))
    into v_n, v_known from jsonb_object_keys(p) k;
  if v_n <> 11 or v_known <> 11 then
    return false;
  end if;
  if p -> 'v' <> '1'::jsonb
     or not private.ball_hex_ok(p -> 'base')
     or not (p -> 'second' = 'null'::jsonb or private.ball_hex_ok(p -> 'second'))
     or not (p -> 'third' = 'null'::jsonb or private.ball_hex_ok(p -> 'third'))
     or jsonb_typeof(p -> 'pattern') <> 'string'
     or p ->> 'pattern' not in ('solida', 'perlada', 'jaspeada', 'veteada', 'bicolor', 'destellos', 'galaxia', 'camuflaje')
     or not private.ball_num_ok(p -> 'scale', 0.5, 2)
     or not private.ball_num_ok(p -> 'softness', 0, 1)
     or not private.ball_num_ok(p -> 'angle', 0, 360)
     or jsonb_typeof(p -> 'shine') <> 'boolean'
     or jsonb_typeof(p -> 'holes') <> 'boolean'
     or jsonb_typeof(p -> 'stickers') <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p -> 'stickers') > 5 then
    return false;
  end if;
  for s in select x from jsonb_array_elements(p -> 'stickers') x loop
    if jsonb_typeof(s) <> 'object' or jsonb_typeof(s -> 'shape') is distinct from 'string' then
      return false;
    end if;
    v_shape := s ->> 'shape';
    if v_shape not in ('estrella', 'llama', 'rayo', 'corazon', 'calavera', 'numero', 'iniciales', 'logo') then
      return false;
    end if;
    select count(*), count(*) filter (where k in ('shape', 'color', 'x', 'y', 'size', 'rotation'))
      into v_n, v_known from jsonb_object_keys(s) k;
    -- El texto: solo en el número y las iniciales, y ahí es obligatorio (nada de marcado: cifras o letras).
    if v_shape in ('numero', 'iniciales') then
      if v_n <> 7 or v_known <> 6 or jsonb_typeof(s -> 'text') is distinct from 'string'
         or (v_shape = 'numero' and (s ->> 'text') !~ '^[0-9]{1,3}$')
         or (v_shape = 'iniciales' and (s ->> 'text') !~ '^[A-ZÑÁÉÍÓÚÜ]{1,3}$') then
        return false;
      end if;
    elsif v_n <> 6 or v_known <> 6 then
      return false;
    end if;
    if not private.ball_hex_ok(s -> 'color')
       or not private.ball_num_ok(s -> 'x', -1, 1)
       or not private.ball_num_ok(s -> 'y', -1, 1)
       or not private.ball_num_ok(s -> 'size', 0.1, 0.6)
       or not private.ball_num_ok(s -> 'rotation', 0, 360) then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- =====================================================================
-- 2. La columna
-- =====================================================================
alter table public.bowling_balls
  add column design jsonb constraint bowling_balls_design_check check (design is null or private.ball_design_ok(design));

-- =====================================================================
-- 3. Escritura
-- =====================================================================

-- Pone el diseño de una bola suya (p_design null, o el jsonb null, lo quita: vuelve a dibujarse lisa con su color) y
-- le copia el color base (color = base: la bola se sigue reconociendo por su color en la lista y al anotar). Devuelve el
-- diseño que quedó (null si se quitó). 'invalido' (private.ball_design_ok); 'no_existe'; 'no_permitido' si es de otra
-- cuenta (tampoco el superadmin); 'rate_limited' (el mismo límite de save_ball: 100 cambios por día a sus bolas). El
-- mismo diseño que ya tiene (con su color) no cambia nada ni cuenta en el límite: reintentar es seguro.
create function public.set_ball_design(p_ball uuid, p_design jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_design jsonb := nullif(p_design, 'null'::jsonb);
  b public.bowling_balls;
begin
  if v_design is not null and not private.ball_design_ok(v_design) then
    perform private.fail('invalido');
  end if;
  b := private.my_ball(p_ball);
  -- Ya lo tiene (y su color es la base): nada que cambiar.
  if b.design is not distinct from v_design and (v_design is null or b.color = v_design ->> 'base') then
    return v_design;
  end if;
  if not private.rate_take('balls:' || v_uid::text, 100, interval '1 day') then
    perform private.fail('rate_limited');
  end if;
  update public.bowling_balls x set design = v_design, color = coalesce(v_design ->> 'base', x.color) where x.id = b.id;
  return v_design;
end $$;

-- =====================================================================
-- 4. Lectura: my_balls con el diseño (la de 20260930000100_bolas.sql)
-- =====================================================================

-- Mis bolas: {balls: [{id, name, brand, weight, color, cover, drilledOn, resurfacedOn, retired, createdAt, updatedAt,
-- design}], lastUsed: la bola del último juego que marqué (null si ninguno)}. design: el diseño o null. Las que uso
-- primero, cada grupo de la más vieja a la más nueva.
create or replace function public.my_balls() returns jsonb
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
               'updatedAt', private.iso(b.updated_at),
               'design', b.design)
               order by b.retired, b.created_at, b.id)
        from public.bowling_balls b where b.user_id = v_uid), '[]'::jsonb),
    'lastUsed', (select g.ball_id from public.ball_games g where g.user_id = v_uid order by g.created_at desc, g.game desc limit 1));
end $$;

-- =====================================================================
-- Permisos: set_ball_design solo con sesión; la revisión, nadie de la app
-- =====================================================================
-- La clave secreta (service_role) sí ejecuta la revisión: la usa el CHECK de la columna, así una escritura directa
-- con esa clave (un script) choca con el CHECK (23514) y no con un permiso.
do $$
declare
  f record;
  v_rpc constant text[] := array['set_ball_design', 'my_balls'];
  v_private constant text[] := array['ball_hex_ok', 'ball_num_ok', 'ball_design_ok'];
begin
  for f in select p.oid::regprocedure as sig, n.nspname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and p.proname = any (v_rpc))
               or (n.nspname = 'private' and p.proname = any (v_private)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.nspname = 'public' then
      execute format('grant execute on function %s to authenticated', f.sig);
    else
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;
