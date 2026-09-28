-- MatchMate · Migración de BowlingX: volver a cargar al corte sin perder los cambios de contraseña.
--
-- La importación (scripts/migrar, docs/migracion.md) crea las cuentas de BowlingX con la API de administración de
-- Auth: auth.admin.createUser con password_hash = el hash scrypt de Firebase ($fbscrypt$…), y cada quien entra con
-- su contraseña de siempre. Esa API no deja cambiar el hash de una cuenta que ya existe (updateUserById no lee
-- password_hash). Como hay un solo proyecto, la primera carga se hace antes del corte y al corte se vuelve a
-- correr con la exportación final: si en el medio alguien cambió su contraseña en BowlingX, su cuenta de MatchMate
-- se quedaría con la vieja.
--
-- public.migration_sync_passwords(p_users) recibe [{id, hash}] y pone el hash nuevo SOLO a las cuentas que:
--   - creó la migración (app_metadata.firebase_uid; nunca a una cuenta registrada en MatchMate),
--   - nunca entraron a MatchMate (last_sign_in_at vacío: si ya entraron, la contraseña de MatchMate manda),
--   - y reciben un hash de Firebase ($fbscrypt$) distinto del que tienen.
-- Devuelve cuántas cambió. Solo la ejecuta service_role (la clave secreta del importador); nadie de la app.
-- Todo corre igual en PGlite (el shim tiene auth.users con esas columnas).

create function public.migration_sync_passwords(p_users jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if p_users is null or jsonb_typeof(p_users) <> 'array' then
    raise exception 'invalido' using errcode = 'P0001', detail = 'Se espera una lista [{id, hash}].';
  end if;
  update auth.users u
     set encrypted_password = x.hash,
         updated_at = now()
    from jsonb_to_recordset(p_users) as x (id uuid, hash text)
   where u.id = x.id
     and left(x.hash, 10) = '$fbscrypt$'
     and u.last_sign_in_at is null
     and coalesce(u.raw_app_meta_data ->> 'firebase_uid', '') <> ''
     and u.encrypted_password is distinct from x.hash;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.migration_sync_passwords(jsonb) from public, anon, authenticated;
grant execute on function public.migration_sync_passwords(jsonb) to service_role;
