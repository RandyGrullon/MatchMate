-- MatchMate · Pagos con Azul: la empresa paga en la app para destacar un espacio (docs/empresas.md › Monetización).
--
-- 1. promotion_prices: lo que cuesta destacar un espacio por tantos días (RD$, ITBIS incluido). Lo pone el superadmin
--    (admin_set_promotion_price); sin precios, la empresa lo pide y se cobra aparte (como antes).
-- 2. payments: cada intento de pago. `order_number` es el OrderNumber que va a Azul. La Edge Function azul-pay
--    (supabase/functions/azul-pay) arma el formulario firmado con la AuthKey (que nunca sale del servidor) y, al
--    volver de Azul, revisa la firma de la respuesta y el monto antes de llamar a finish_payment.
-- 3. begin_promotion_payment (la dueña, con su sesión): pide destacar con un precio vigente y deja el pago pendiente.
--    finish_payment (solo service_role): aprobado → la promoción se activa sola desde ese momento; declinado,
--    cancelado o error → queda anotado. Las dos son seguras de repetir.
-- 4. cancel_payment (la dueña): volvió con «Cancelar» de Azul (sin parámetros): el pago pendiente queda cancelado.
-- 5. La consola: los pagos en admin_business y la lista admin_payments.
-- Pruebas: tests/sql/pagos-azul.test.ts.

create table public.promotion_prices (
  days smallint primary key check (days between 1 and 365),
  -- Pesos dominicanos, ITBIS incluido.
  amount numeric(12, 2) not null check (amount > 0 and amount <= 1000000),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  -- El OrderNumber de Azul (solo números).
  order_number bigint generated always as identity unique,
  -- Quién pagó: el pago queda aunque la empresa se borre (con su nombre de ese momento).
  business_id uuid references public.businesses (id) on delete set null,
  business_name text not null check (char_length(business_name) <= 120),
  -- Lo que se pagó. Sin FK: el borrado en cascada de la empresa (espacios y promociones) no puede chocar con el
  -- `set null` de business_id, y el pago guarda a qué promoción fue aunque ya no exista.
  promotion_id uuid,
  purpose text not null default 'promotion' check (purpose in ('promotion')),
  provider text not null default 'azul' check (provider in ('azul')),
  amount numeric(12, 2) not null check (amount > 0),
  itbis numeric(12, 2) not null default 0 check (itbis >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled', 'error')),
  -- Lo que contestó Azul (sin la firma ni datos de la tarjeta: Azul no los manda).
  authorization_code text check (char_length(authorization_code) <= 20),
  rrn text check (char_length(rrn) <= 40),
  azul_order_id text check (char_length(azul_order_id) <= 40),
  iso_code text check (char_length(iso_code) <= 10),
  response_message text check (char_length(response_message) <= 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz
);
create index payments_business_idx on public.payments (business_id, created_at desc);

alter table public.promotion_prices enable row level security;
alter table public.payments enable row level security;
revoke all on public.promotion_prices, public.payments from anon, authenticated;

-- Los precios vigentes, del más corto al más largo.
create function public.promotion_prices() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_uid();
  return (select coalesce(jsonb_agg(jsonb_build_object('days', p.days, 'amount', p.amount) order by p.days), '[]'::jsonb)
            from public.promotion_prices p);
end $$;

-- Pone (o quita, con p_amount null) el precio de destacar por p_days días.
create function public.admin_set_promotion_price(p_days integer, p_amount numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_super();
  if p_days is null or p_days not between 1 and 365 or (p_amount is not null and (p_amount <= 0 or p_amount > 1000000)) then
    perform private.fail('invalido');
  end if;
  if p_amount is null then
    delete from public.promotion_prices p where p.days = p_days;
  else
    insert into public.promotion_prices (days, amount) values (p_days, round(p_amount, 2))
    on conflict (days) do update set amount = excluded.amount, updated_at = now();
  end if;
  perform private.audit('promotion_price', 'app', p_days::text, jsonb_build_object('amount', p_amount));
  return public.promotion_prices();
end $$;

-- Pide destacar p_venue por p_days días y deja el pago pendiente (el precio lo pone la base, nunca la app). Si ya
-- había una pedida para ese espacio, la usa (y la cambia a esos días). → {orderNumber, amount, days, venueName}.
create function public.begin_promotion_payment(p_venue uuid, p_days integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
  v_business uuid;
  v_business_name text;
  v_name text;
  v_amount numeric(12, 2);
  v_promotion uuid;
  v_order bigint;
begin
  select v.business_id, b.name, v.name into v_business, v_business_name, v_name
    from public.venues v join public.businesses b on b.id = v.business_id
   where v.id = p_venue and b.user_id = v_uid and b.status = 'approved';
  if v_business is null then
    perform private.fail('no_permitido');
  end if;
  select p.amount into v_amount from public.promotion_prices p where p.days = p_days;
  if v_amount is null then
    perform private.fail('invalido');
  end if;
  if not private.rate_take('pago:' || v_uid::text, 10, interval '1 hour') then
    perform private.fail('rate_limited');
  end if;
  select p.id into v_promotion from public.venue_promotions p where p.venue_id = p_venue and p.status = 'requested' for update;
  if v_promotion is null then
    insert into public.venue_promotions (venue_id, days, note, requested_by)
    values (p_venue, p_days, 'Pago con Azul', v_uid) returning id into v_promotion;
  else
    update public.venue_promotions p set days = p_days where p.id = v_promotion;
  end if;
  -- Lo que quedó pendiente de antes para esa promoción ya no sirve.
  update public.payments x set status = 'cancelled', decided_at = clock_timestamp()
   where x.promotion_id = v_promotion and x.status = 'pending';
  insert into public.payments (business_id, business_name, promotion_id, amount, created_by)
  values (v_business, v_business_name, v_promotion, v_amount, v_uid) returning order_number into v_order;
  return jsonb_build_object('orderNumber', v_order, 'amount', v_amount, 'days', p_days, 'venueName', v_name);
end $$;

-- La respuesta de Azul ya revisada (la firma) por azul-pay. p_status: 'approved', 'declined' o 'error'. p_data: lo que
-- contestó Azul (authorizationCode, rrn, azulOrderId, isoCode, responseMessage) y el itbis.
-- Aprobado: la promoción se activa desde ahora por sus días, con lo pagado. Repetirla no cambia nada.
-- → {status, venueId, endsAt} (o null si el número de orden no existe).
create function public.finish_payment(p_order bigint, p_status text, p_amount numeric, p_data jsonb default '{}')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.payments;
  v_promotion public.venue_promotions;
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
begin
  if p_status is null or p_status not in ('approved', 'declined', 'error') then
    perform private.fail('invalido');
  end if;
  select * into v from public.payments x where x.order_number = p_order for update;
  if not found then
    return null;
  end if;
  -- El monto que volvió tiene que ser el que se cobró.
  if p_amount is null or round(p_amount, 2) <> v.amount then
    perform private.fail('invalido');
  end if;
  if v.status = 'pending' or (v.status in ('cancelled', 'declined', 'error') and p_status = 'approved') then
    update public.payments x
       set status = p_status, decided_at = clock_timestamp(),
           authorization_code = left(nullif(v_data ->> 'authorizationCode', ''), 20),
           rrn = left(nullif(v_data ->> 'rrn', ''), 40),
           azul_order_id = left(nullif(v_data ->> 'azulOrderId', ''), 40),
           iso_code = left(nullif(v_data ->> 'isoCode', ''), 10),
           response_message = left(nullif(v_data ->> 'responseMessage', ''), 200),
           -- El ITBIS que iba dentro (lo calcula azul-pay con AZUL_ITBIS_PCT).
           itbis = case when jsonb_typeof(v_data -> 'itbis') = 'number' and (v_data ->> 'itbis')::numeric between 0 and x.amount
                        then round((v_data ->> 'itbis')::numeric, 2) else x.itbis end
     where x.id = v.id
    returning * into v;
    if p_status = 'approved' and v.promotion_id is not null then
      -- Si el espacio ya está destacado, la pagada empieza cuando termine la que va.
      update public.venue_promotions p
         set status = 'active', starts_at = s.start_at, ends_at = s.start_at + make_interval(days => p.days),
             amount = v.amount, decided_at = clock_timestamp()
        from (select greatest(now(), coalesce(max(a.ends_at), now())) as start_at
                from public.venue_promotions a join public.venue_promotions me on me.venue_id = a.venue_id
               where me.id = v.promotion_id and a.id <> me.id and a.status = 'active' and a.ends_at > now()) s
       where p.id = v.promotion_id and p.status in ('requested', 'rejected', 'cancelled');
    end if;
  end if;
  select * into v_promotion from public.venue_promotions p where p.id = v.promotion_id;
  return jsonb_build_object('status', v.status, 'venueId', v_promotion.venue_id, 'endsAt', v_promotion.ends_at,
                            'days', v_promotion.days, 'amount', v.amount);
end $$;

-- Volvió de Azul con «Cancelar»: el pago pendiente de la cuenta queda cancelado (la promoción sigue pedida).
create function public.cancel_payment(p_order bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_uid();
begin
  update public.payments x set status = 'cancelled', decided_at = clock_timestamp()
   where x.order_number = p_order and x.created_by = v_uid and x.status = 'pending';
  return found;
end $$;

-- Los pagos, los más nuevos primero (p_status: solo esos). → {rows, total, approvedTotal}.
create function public.admin_payments(p_status text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
begin
  perform private.require_super();
  if v_status is not null and v_status not in ('pending', 'approved', 'declined', 'cancelled', 'error') then
    perform private.fail('invalido');
  end if;
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(r order by r ->> 'createdAt' desc) from (
              select jsonb_build_object('id', x.id, 'orderNumber', x.order_number, 'businessId', x.business_id,
                                        'businessName', coalesce(b.name, x.business_name), 'amount', x.amount,
                                        'status', x.status,
                                        'authorizationCode', x.authorization_code, 'responseMessage', x.response_message,
                                        'createdAt', x.created_at, 'decidedAt', x.decided_at) as r
                from public.payments x left join public.businesses b on b.id = x.business_id
               where v_status is null or x.status = v_status
               order by x.created_at desc
               limit private.clamp_int(p_limit, 1, 100, 50) offset greatest(coalesce(p_offset, 0), 0)) q), '[]'::jsonb),
    'total', (select count(*) from public.payments x where v_status is null or x.status = v_status)::integer,
    'approvedTotal', coalesce((select sum(x.amount) from public.payments x where x.status = 'approved'), 0));
end $$;

-- admin_business con sus pagos (igual que en 20261105000100_empresas.sql y además `payments` y `paid` con lo cobrado
-- por la app).
create or replace function public.admin_business(p_business uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_super();
  if not exists (select 1 from public.businesses b where b.id = p_business) then
    return null;
  end if;
  return private.business_json(p_business) || (
    select jsonb_build_object(
      'owner', jsonb_build_object('id', o.id, 'name', o.name, 'email', o.email, 'blocked', o.blocked_at is not null),
      'promotions', coalesce((select jsonb_agg(jsonb_build_object(
                       'id', p.id, 'venueId', p.venue_id, 'venueName', v.name, 'status', p.status, 'days', p.days,
                       'startsAt', p.starts_at, 'endsAt', p.ends_at, 'amount', p.amount, 'note', p.note,
                       'createdAt', p.created_at, 'decidedAt', p.decided_at) order by p.created_at desc, p.id)
                         from public.venue_promotions p join public.venues v on v.id = p.venue_id
                        where v.business_id = p_business), '[]'::jsonb),
      'leagues', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'kind', l.kind, 'sport', l.sport,
                                                               'venueId', l.venue_id, 'createdAt', l.created_at)
                                            order by l.created_at desc)
                              from public.leagues l join public.venues v on v.id = l.venue_id
                             where v.business_id = p_business), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(jsonb_build_object(
                     'id', x.id, 'orderNumber', x.order_number, 'amount', x.amount, 'status', x.status,
                     'authorizationCode', x.authorization_code, 'responseMessage', x.response_message,
                     'createdAt', x.created_at, 'decidedAt', x.decided_at) order by x.created_at desc)
                       from public.payments x where x.business_id = p_business), '[]'::jsonb),
      'paid', coalesce((select sum(p.amount) from public.venue_promotions p join public.venues v on v.id = p.venue_id
                         where v.business_id = p_business and p.status in ('active', 'cancelled') and p.amount is not null), 0))
      from public.businesses b join public.profiles o on o.id = b.user_id where b.id = p_business);
end $$;

do $$
declare
  f record;
  v_rpc constant text[] := array['promotion_prices', 'admin_set_promotion_price', 'begin_promotion_payment',
                                 'cancel_payment', 'admin_payments', 'admin_business'];
  v_service constant text[] := array['finish_payment'];
begin
  for f in select p.oid::regprocedure as sig, p.proname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname = any (v_rpc) or p.proname = any (v_service)) loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.proname = any (v_rpc) then
      execute format('grant execute on function %s to authenticated', f.sig);
    else
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;
