-- ECOM-FABRIC M1b – Zwei-Faktor-Pflicht für Operatoren und Dashboard-Funktionen.
--
-- * Operator-Rechte (Lesen per RLS und alle Operator-Funktionen) gelten nur mit MFA-Anmeldung (JWT-Claim aal = aal2).
-- * Freigabe-Trigger verlangt ebenfalls aal2 (Verteidigung in der Tiefe).
-- * whoami(): Anmeldestatus für das Dashboard, ohne Operator-Rechte vorauszusetzen.
-- * dashboard_overview(): Übersicht für Operatoren.

create or replace function fabric.has_mfa() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

create or replace function fabric.is_operator() returns boolean
language sql stable security definer set search_path = '' as $$
  select fabric.has_mfa() and exists (select 1 from fabric.operators where user_id = auth.uid())
$$;

create or replace function fabric.require_operator() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from fabric.operators where user_id = v_uid) then
    raise exception 'Nur freigeschaltete Operatoren (Menschen) dürfen diese Aktion ausführen'
      using errcode = 'insufficient_privilege';
  end if;
  if not fabric.has_mfa() then
    raise exception 'Zwei-Faktor-Anmeldung (MFA) erforderlich' using errcode = 'insufficient_privilege';
  end if;
  return v_uid;
end $$;

create or replace function fabric.approval_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.payload is distinct from old.payload or new.payload_hash is distinct from old.payload_hash
     or new.level is distinct from old.level or new.action_type is distinct from old.action_type
     or new.requested_by is distinct from old.requested_by then
    raise exception 'Inhalt einer Freigabe ist unveränderlich' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status then
    if new.status in ('approved', 'rejected') then
      if old.status <> 'pending' then
        raise exception 'Freigabe ist nicht mehr offen (Status %)', old.status;
      end if;
      if new.decided_by is null or new.decided_by is distinct from auth.uid()
         or not exists (select 1 from fabric.operators where user_id = new.decided_by)
         or not fabric.has_mfa() then
        raise exception 'Freigaben dürfen nur von einem angemeldeten Operator mit MFA erteilt werden'
          using errcode = 'insufficient_privilege';
      end if;
    elsif new.status = 'executed' and old.status <> 'approved' then
      raise exception 'Nur freigegebene Aktionen können ausgeführt werden';
    elsif new.status = 'expired' and old.status <> 'pending' then
      raise exception 'Nur offene Freigaben können ablaufen';
    elsif new.status = 'pending' then
      raise exception 'Freigaben können nicht wieder geöffnet werden';
    end if;
  elsif new.decided_by is distinct from old.decided_by then
    raise exception 'Entscheider kann nicht nachträglich geändert werden' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create function fabric.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'registered_operator', exists (select 1 from fabric.operators where user_id = auth.uid()),
    'display_name', (select display_name from fabric.operators where user_id = auth.uid())
  )
$$;

create function fabric.dashboard_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform fabric.require_operator();
  return fabric.status_overview();
end $$;

revoke execute on function fabric.has_mfa(), fabric.whoami(), fabric.dashboard_overview()
  from public, anon, authenticated, service_role, fabric_worker;
grant execute on function fabric.whoami(), fabric.dashboard_overview() to authenticated;
