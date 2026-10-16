-- ECOM-FABRIC M1 – Factory Core
-- Agent-Registry, Job-Queue, Freigaben, Budgets/Kostenbuch, Audit-Log, Kill-Switch, Worker-Registry.
--
-- Sicherheitsmodell (siehe docs/adr/0001-factory-core-in-postgres.md):
-- * Alle Schreibzugriffe laufen über SECURITY-DEFINER-Funktionen; Tabellen sind für niemanden direkt beschreibbar.
-- * Rolle fabric_worker (Worker/Agenten): nur EXECUTE auf Worker-Funktionen, keinerlei Tabellenrechte,
--   kein Zugriff auf Freigabe-Entscheidungen.
-- * Rolle authenticated + Eintrag in fabric.operators (Menschen): Freigaben, Kill-Switch, Budgets, Agenten.
-- * Zusätzlich verhindert ein Trigger jede Freigabe-Entscheidung ohne Operator-Identität (auch für Admins).
-- * audit_log ist append-only (Trigger blockiert UPDATE/DELETE/TRUNCATE).

create schema if not exists fabric;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'fabric_worker') then
    -- Login und Passwort setzt scripts/db-setup-worker-role.ts (Passwort nie im Repo).
    create role fabric_worker nologin noinherit;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table fabric.operators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table fabric.agents (
  id text primary key check (id ~ '^[a-z][a-z0-9-]*$'),
  name text not null,
  description text not null default '',
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table fabric.workers (
  id text primary key,
  host text not null,
  pid integer not null,
  version text,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  stopped_at timestamptz
);

create table fabric.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create type fabric.approval_status as enum ('pending', 'approved', 'rejected', 'expired', 'executed');

create table fabric.approvals (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  level text not null check (level in ('B', 'C')),
  summary text not null,
  payload jsonb not null,
  payload_hash text not null,
  cost_estimate_cents integer not null default 0 check (cost_estimate_cents >= 0),
  requested_by text not null,
  status fabric.approval_status not null default 'pending',
  decided_by uuid references fabric.operators (user_id),
  decided_at timestamptz,
  decision_note text,
  expires_at timestamptz not null,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);
create index approvals_pending_idx on fabric.approvals (expires_at) where status = 'pending';

create type fabric.job_status as enum (
  'awaiting_approval', 'queued', 'running', 'succeeded', 'failed', 'dead', 'cancelled'
);

create table fabric.jobs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references fabric.agents (id),
  type text not null check (type ~ '^[a-z][a-z0-9_.-]*$'),
  priority integer not null default 0 check (priority between -100 and 100),
  status fabric.job_status not null default 'queued',
  payload jsonb not null default '{}',
  result jsonb,
  errors jsonb not null default '[]',
  attempts integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  run_at timestamptz not null default now(),
  locked_by text references fabric.workers (id),
  locked_until timestamptz,
  idempotency_key text unique,
  approval_id uuid references fabric.approvals (id),
  cost_estimate_cents integer not null default 0 check (cost_estimate_cents >= 0),
  cost_actual_cents integer not null default 0 check (cost_actual_cents >= 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index jobs_claim_idx on fabric.jobs (priority desc, run_at, created_at) where status = 'queued';
create index jobs_running_idx on fabric.jobs (locked_until) where status = 'running';
create index jobs_approval_idx on fabric.jobs (approval_id) where approval_id is not null;

create table fabric.budgets (
  category text not null check (category ~ '^[a-z][a-z0-9_-]*$'),
  period text not null check (period in ('day', 'month')),
  limit_cents integer not null check (limit_cents >= 0),
  warn_ratio numeric(4, 3) not null default 0.8 check (warn_ratio > 0 and warn_ratio <= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (category, period)
);

create type fabric.cost_status as enum ('reserved', 'settled', 'released');

create table fabric.cost_ledger (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category ~ '^[a-z][a-z0-9_-]*$' and category <> 'total'),
  provider text not null,
  job_id uuid references fabric.jobs (id),
  estimated_cents integer not null check (estimated_cents >= 0),
  actual_cents integer check (actual_cents >= 0),
  status fabric.cost_status not null default 'reserved',
  note text,
  created_by text not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index cost_ledger_period_idx on fabric.cost_ledger (category, created_at) where status <> 'released';

create table fabric.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('human', 'worker', 'system')),
  actor_id text not null,
  action text not null,
  entity_type text,
  entity_id text,
  data jsonb not null default '{}'
);
create index audit_log_entity_idx on fabric.audit_log (entity_type, entity_id);
create index audit_log_at_idx on fabric.audit_log (at desc);

-- ---------------------------------------------------------------------------
-- Interne Hilfsfunktionen
-- ---------------------------------------------------------------------------

create function fabric.payload_hash(p_payload jsonb) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex')
$$;

create function fabric.audit(
  p_actor_type text, p_actor_id text, p_action text,
  p_entity_type text default null, p_entity_id text default null, p_data jsonb default '{}'
) returns void
language sql security definer set search_path = '' as $$
  insert into fabric.audit_log (actor_type, actor_id, action, entity_type, entity_id, data)
  values (p_actor_type, p_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_data, '{}'));
$$;

create function fabric.kill_switch_active() returns boolean
language sql stable security definer set search_path = '' as $$
  -- Fail closed: fehlt der Eintrag, gilt der Kill-Switch als aktiv.
  select coalesce((select (value ->> 'active')::boolean from fabric.settings where key = 'kill_switch'), true)
$$;

create function fabric.is_operator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from fabric.operators where user_id = auth.uid())
$$;

create function fabric.require_operator() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from fabric.operators where user_id = v_uid) then
    raise exception 'Nur freigeschaltete Operatoren (Menschen) dürfen diese Aktion ausführen'
      using errcode = 'insufficient_privilege';
  end if;
  return v_uid;
end $$;

create function fabric.period_start(p_period text) returns timestamptz
language sql stable set search_path = '' as $$
  select date_trunc(p_period, now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin'
$$;

-- ---------------------------------------------------------------------------
-- Trigger: Audit-Log unveränderlich, Freigaben geschützt
-- ---------------------------------------------------------------------------

create function fabric.forbid_audit_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log ist unveränderlich (append-only)' using errcode = 'insufficient_privilege';
end $$;

create trigger audit_log_no_update_delete before update or delete on fabric.audit_log
  for each row execute function fabric.forbid_audit_change();
create trigger audit_log_no_truncate before truncate on fabric.audit_log
  for each statement execute function fabric.forbid_audit_change();

create function fabric.approval_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.payload_hash := fabric.payload_hash(new.payload);
  new.status := 'pending';
  new.decided_by := null;
  new.decided_at := null;
  new.executed_at := null;
  return new;
end $$;

create trigger approvals_before_insert before insert on fabric.approvals
  for each row execute function fabric.approval_before_insert();

create function fabric.approval_before_update() returns trigger
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
         or not exists (select 1 from fabric.operators where user_id = new.decided_by) then
        raise exception 'Freigaben dürfen nur von einem angemeldeten Operator erteilt werden'
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

create trigger approvals_before_update before update on fabric.approvals
  for each row execute function fabric.approval_before_update();

-- ---------------------------------------------------------------------------
-- Wartung: abgelaufene Freigaben und Leases
-- ---------------------------------------------------------------------------

create function fabric.reap() returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    update fabric.approvals set status = 'expired'
    where status = 'pending' and expires_at <= now()
    returning id
  loop
    update fabric.jobs set status = 'cancelled', finished_at = now(), updated_at = now()
    where approval_id = r.id and status = 'awaiting_approval';
    perform fabric.audit('system', 'reaper', 'approval.expired', 'approval', r.id::text);
  end loop;

  for r in
    update fabric.jobs set
      status = case when attempts >= max_attempts then 'dead'::fabric.job_status else 'queued'::fabric.job_status end,
      errors = errors || jsonb_build_array(jsonb_build_object(
        'at', now(), 'worker', locked_by, 'attempt', attempts,
        'error', 'Lease abgelaufen (Worker nicht mehr erreichbar)')),
      finished_at = case when attempts >= max_attempts then now() end,
      locked_by = null, locked_until = null, updated_at = now()
    where status = 'running' and locked_until < now()
    returning id, status
  loop
    perform fabric.audit('system', 'reaper', 'job.lease_expired', 'job', r.id::text,
      jsonb_build_object('new_status', r.status));
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Worker-Funktionen (Rolle fabric_worker)
-- ---------------------------------------------------------------------------

create function fabric.register_worker(p_worker_id text, p_host text, p_pid integer, p_version text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into fabric.workers (id, host, pid, version)
  values (p_worker_id, p_host, p_pid, p_version)
  on conflict (id) do update set host = excluded.host, pid = excluded.pid, version = excluded.version,
    started_at = now(), last_heartbeat_at = now(), stopped_at = null;
  perform fabric.audit('worker', p_worker_id, 'worker.started', 'worker', p_worker_id,
    jsonb_build_object('host', p_host, 'pid', p_pid, 'version', p_version));
end $$;

create function fabric.stop_worker(p_worker_id text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_released integer;
begin
  update fabric.workers set stopped_at = now() where id = p_worker_id and stopped_at is null;
  -- Noch laufende Jobs dieses Workers wieder freigeben (Versuch zählt bereits).
  update fabric.jobs set status = 'queued', locked_by = null, locked_until = null, updated_at = now()
  where locked_by = p_worker_id and status = 'running';
  get diagnostics v_released = row_count;
  perform fabric.audit('worker', p_worker_id, 'worker.stopped', 'worker', p_worker_id,
    jsonb_build_object('released_jobs', v_released));
  return v_released;
end $$;

create function fabric.heartbeat(p_worker_id text, p_job_ids uuid[] default '{}', p_lease_seconds integer default 300)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_extended integer;
begin
  update fabric.workers set last_heartbeat_at = now() where id = p_worker_id and stopped_at is null;
  if not found then
    raise exception 'Worker % ist nicht registriert oder gestoppt', p_worker_id;
  end if;
  update fabric.jobs
  set locked_until = now() + make_interval(secs => greatest(5, least(p_lease_seconds, 3600))), updated_at = now()
  where id = any (p_job_ids) and locked_by = p_worker_id and status = 'running';
  get diagnostics v_extended = row_count;
  return jsonb_build_object('kill_switch', fabric.kill_switch_active(), 'leases_extended', v_extended);
end $$;

create function fabric.enqueue_job(
  p_created_by text,
  p_agent_id text,
  p_type text,
  p_payload jsonb default '{}',
  p_priority integer default 0,
  p_run_at timestamptz default null,
  p_max_attempts integer default 3,
  p_idempotency_key text default null,
  p_cost_estimate_cents integer default 0,
  p_approval jsonb default null
) returns fabric.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v_job fabric.jobs;
  v_approval_id uuid;
begin
  if p_idempotency_key is not null then
    select * into v_job from fabric.jobs where idempotency_key = p_idempotency_key;
    if found then
      return v_job;
    end if;
  end if;

  if not exists (select 1 from fabric.agents where id = p_agent_id and enabled) then
    raise exception 'Agent % ist nicht registriert oder deaktiviert', p_agent_id;
  end if;

  if p_approval is not null then
    insert into fabric.approvals (action_type, level, summary, payload, cost_estimate_cents, requested_by, expires_at)
    values (
      coalesce(p_approval ->> 'action_type', p_type),
      p_approval ->> 'level',
      coalesce(p_approval ->> 'summary', p_type),
      coalesce(p_payload, '{}'),
      coalesce(p_cost_estimate_cents, 0),
      p_created_by,
      now() + make_interval(hours => coalesce((p_approval ->> 'expires_hours')::integer, 72))
    )
    returning id into v_approval_id;
  end if;

  insert into fabric.jobs (agent_id, type, priority, status, payload, max_attempts, run_at,
                           idempotency_key, approval_id, cost_estimate_cents, created_by)
  values (p_agent_id, p_type, coalesce(p_priority, 0),
          case when v_approval_id is null then 'queued'::fabric.job_status else 'awaiting_approval'::fabric.job_status end,
          coalesce(p_payload, '{}'), coalesce(p_max_attempts, 3), coalesce(p_run_at, now()),
          p_idempotency_key, v_approval_id, coalesce(p_cost_estimate_cents, 0), p_created_by)
  on conflict (idempotency_key) do nothing
  returning * into v_job;

  if v_job.id is null then
    -- Paralleler Aufruf mit gleichem Idempotency-Key war schneller.
    if v_approval_id is not null then
      delete from fabric.approvals where id = v_approval_id;
    end if;
    select * into v_job from fabric.jobs where idempotency_key = p_idempotency_key;
    return v_job;
  end if;

  perform fabric.audit('worker', p_created_by, 'job.enqueued', 'job', v_job.id::text,
    jsonb_build_object('agent', p_agent_id, 'type', p_type, 'approval_id', v_approval_id));
  if v_approval_id is not null then
    perform fabric.audit('worker', p_created_by, 'approval.requested', 'approval', v_approval_id::text,
      jsonb_build_object('level', p_approval ->> 'level', 'job_id', v_job.id));
  end if;
  return v_job;
end $$;

create function fabric.claim_jobs(
  p_worker_id text,
  p_limit integer default 1,
  p_lease_seconds integer default 300,
  p_types text[] default null
) returns setof fabric.jobs
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from fabric.workers where id = p_worker_id and stopped_at is null) then
    raise exception 'Worker % ist nicht registriert oder gestoppt', p_worker_id;
  end if;
  if fabric.kill_switch_active() then
    return;
  end if;

  perform fabric.reap();
  update fabric.workers set last_heartbeat_at = now() where id = p_worker_id;

  return query
  with candidates as (
    select j.id
    from fabric.jobs j
    join fabric.agents a on a.id = j.agent_id and a.enabled
    where j.status = 'queued'
      and j.run_at <= now()
      and (p_types is null or j.type = any (p_types))
    order by j.priority desc, j.run_at, j.created_at
    for update of j skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 50))
  ),
  claimed as (
    update fabric.jobs j set
      status = 'running',
      locked_by = p_worker_id,
      locked_until = now() + make_interval(secs => greatest(5, least(coalesce(p_lease_seconds, 300), 3600))),
      attempts = j.attempts + 1,
      started_at = now(),
      updated_at = now()
    from candidates c
    where j.id = c.id
    returning j.*
  ),
  logged as (
    insert into fabric.audit_log (actor_type, actor_id, action, entity_type, entity_id, data)
    select 'worker', p_worker_id, 'job.claimed', 'job', claimed.id::text,
           jsonb_build_object('attempt', claimed.attempts, 'type', claimed.type)
    from claimed
  )
  select * from claimed;
end $$;

create function fabric.complete_job(p_worker_id text, p_job_id uuid, p_result jsonb default '{}')
returns fabric.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v_job fabric.jobs;
begin
  update fabric.jobs set status = 'succeeded', result = coalesce(p_result, '{}'),
    locked_by = null, locked_until = null, finished_at = now(), updated_at = now()
  where id = p_job_id and status = 'running' and locked_by = p_worker_id
  returning * into v_job;
  if v_job.id is null then
    raise exception 'Job % ist nicht (mehr) von Worker % gesperrt', p_job_id, p_worker_id
      using errcode = 'lock_not_available';
  end if;
  perform fabric.audit('worker', p_worker_id, 'job.succeeded', 'job', p_job_id::text,
    jsonb_build_object('attempt', v_job.attempts));
  return v_job;
end $$;

create function fabric.fail_job(
  p_worker_id text,
  p_job_id uuid,
  p_error text,
  p_retryable boolean default true,
  p_retry_in_seconds integer default null
) returns fabric.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v_job fabric.jobs;
  v_retry boolean;
  v_delay integer;
begin
  select * into v_job from fabric.jobs
  where id = p_job_id and status = 'running' and locked_by = p_worker_id
  for update;
  if not found then
    raise exception 'Job % ist nicht (mehr) von Worker % gesperrt', p_job_id, p_worker_id
      using errcode = 'lock_not_available';
  end if;

  v_retry := p_retryable and v_job.attempts < v_job.max_attempts;
  -- Exponentielles Backoff: 30 s, 60 s, 120 s … max. 1 h
  -- Achtung: greatest() ignoriert NULL, daher explizite Fallunterscheidung.
  v_delay := case
    when p_retry_in_seconds is null then least(3600, (30 * power(2, v_job.attempts - 1))::integer)
    else greatest(p_retry_in_seconds, 0)
  end;

  update fabric.jobs set
    status = case when v_retry then 'queued'::fabric.job_status
                  when p_retryable then 'dead'::fabric.job_status
                  else 'failed'::fabric.job_status end,
    run_at = case when v_retry then now() + make_interval(secs => v_delay) else run_at end,
    errors = errors || jsonb_build_array(jsonb_build_object(
      'at', now(), 'worker', p_worker_id, 'attempt', v_job.attempts, 'error', left(p_error, 2000))),
    locked_by = null, locked_until = null, updated_at = now(),
    finished_at = case when v_retry then null else now() end
  where id = p_job_id
  returning * into v_job;

  perform fabric.audit('worker', p_worker_id,
    case v_job.status when 'queued' then 'job.retry_scheduled' when 'dead' then 'job.dead' else 'job.failed' end,
    'job', p_job_id::text,
    jsonb_build_object('attempt', v_job.attempts, 'error', left(p_error, 500), 'run_at', v_job.run_at));
  return v_job;
end $$;

create function fabric.request_approval(
  p_requested_by text,
  p_action_type text,
  p_level text,
  p_summary text,
  p_payload jsonb,
  p_cost_estimate_cents integer default 0,
  p_expires_hours integer default 72
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into fabric.approvals (action_type, level, summary, payload, cost_estimate_cents, requested_by, expires_at)
  values (p_action_type, p_level, p_summary, coalesce(p_payload, '{}'), coalesce(p_cost_estimate_cents, 0),
          p_requested_by, now() + make_interval(hours => greatest(1, least(coalesce(p_expires_hours, 72), 720))))
  returning id into v_id;
  perform fabric.audit('worker', p_requested_by, 'approval.requested', 'approval', v_id::text,
    jsonb_build_object('level', p_level, 'action_type', p_action_type));
  return v_id;
end $$;

-- Einmalig einlösbar: Nur wenn freigegeben, nicht abgelaufen und Payload-Hash identisch.
create function fabric.consume_approval(p_worker_id text, p_approval_id uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v fabric.approvals;
  v_reason text;
begin
  if fabric.kill_switch_active() then
    v_reason := 'kill_switch';
  else
    update fabric.approvals set status = 'executed', executed_at = now()
    where id = p_approval_id and status = 'approved' and expires_at > now()
      and payload_hash = fabric.payload_hash(coalesce(p_payload, '{}'))
    returning * into v;
    if v.id is not null then
      perform fabric.audit('worker', p_worker_id, 'approval.consumed', 'approval', p_approval_id::text,
        jsonb_build_object('level', v.level, 'action_type', v.action_type));
      return jsonb_build_object('ok', true, 'approval_id', v.id, 'level', v.level);
    end if;
    select * into v from fabric.approvals where id = p_approval_id;
    v_reason := case
      when v.id is null then 'not_found'
      when v.status = 'executed' then 'already_executed'
      when v.status <> 'approved' then 'not_approved:' || v.status
      when v.expires_at <= now() then 'expired'
      else 'payload_mismatch'
    end;
  end if;
  perform fabric.audit('worker', p_worker_id, 'approval.consume_denied', 'approval', p_approval_id::text,
    jsonb_build_object('reason', v_reason));
  return jsonb_build_object('ok', false, 'reason', v_reason);
end $$;

create function fabric.reserve_cost(
  p_worker_id text,
  p_category text,
  p_provider text,
  p_estimated_cents integer,
  p_job_id uuid default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b record;
  v_spent bigint;
  v_has_budget boolean := false;
  v_warnings jsonb := '[]';
  v_id uuid;
  v_denied jsonb;
begin
  if p_estimated_cents is null or p_estimated_cents < 0 then
    raise exception 'Kostenschätzung muss >= 0 sein';
  end if;

  if fabric.kill_switch_active() then
    v_denied := jsonb_build_object('allowed', false, 'reason', 'kill_switch');
  else
    -- Serialisiert alle Reservierungen, damit parallele Worker Limits nicht gemeinsam überschreiten.
    perform pg_advisory_xact_lock(hashtext('fabric.budget'));
    for b in select * from fabric.budgets where category in (p_category, 'total') order by category, period loop
      if b.category = p_category then
        v_has_budget := true;
      end if;
      select coalesce(sum(coalesce(actual_cents, estimated_cents)), 0) into v_spent
      from fabric.cost_ledger
      where status <> 'released'
        and created_at >= fabric.period_start(b.period)
        and (b.category = 'total' or category = b.category);
      if v_spent + p_estimated_cents > b.limit_cents then
        v_denied := jsonb_build_object('allowed', false, 'reason', 'budget_exceeded',
          'category', b.category, 'period', b.period, 'limit_cents', b.limit_cents,
          'spent_cents', v_spent, 'estimated_cents', p_estimated_cents);
        exit;
      end if;
      if v_spent + p_estimated_cents >= b.limit_cents * b.warn_ratio then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'category', b.category, 'period', b.period,
          'used_ratio', round((v_spent + p_estimated_cents)::numeric / nullif(b.limit_cents, 0), 3)));
      end if;
    end loop;
    if v_denied is null and not v_has_budget then
      -- Fail closed: ohne definiertes Budget keine Ausgaben.
      v_denied := jsonb_build_object('allowed', false, 'reason', 'no_budget', 'category', p_category);
    end if;
  end if;

  if v_denied is not null then
    perform fabric.audit('worker', p_worker_id, 'cost.denied', 'budget', p_category,
      v_denied || jsonb_build_object('provider', p_provider, 'job_id', p_job_id));
    return v_denied;
  end if;

  insert into fabric.cost_ledger (category, provider, job_id, estimated_cents, note, created_by)
  values (p_category, p_provider, p_job_id, p_estimated_cents, p_note, p_worker_id)
  returning id into v_id;
  perform fabric.audit('worker', p_worker_id, 'cost.reserved', 'cost', v_id::text,
    jsonb_build_object('category', p_category, 'provider', p_provider, 'estimated_cents', p_estimated_cents,
                       'job_id', p_job_id, 'warnings', v_warnings));
  if jsonb_array_length(v_warnings) > 0 then
    perform fabric.audit('system', 'budget-guard', 'budget.warning', 'budget', p_category, jsonb_build_object('warnings', v_warnings));
  end if;
  return jsonb_build_object('allowed', true, 'reservation_id', v_id, 'warnings', v_warnings);
end $$;

create function fabric.settle_cost(p_worker_id text, p_reservation_id uuid, p_actual_cents integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v fabric.cost_ledger;
begin
  if p_actual_cents is null or p_actual_cents < 0 then
    raise exception 'Tatsächliche Kosten müssen >= 0 sein';
  end if;
  update fabric.cost_ledger set status = 'settled', actual_cents = p_actual_cents, settled_at = now()
  where id = p_reservation_id and status = 'reserved'
  returning * into v;
  if v.id is null then
    raise exception 'Reservierung % ist nicht offen', p_reservation_id;
  end if;
  if v.job_id is not null then
    update fabric.jobs set cost_actual_cents = cost_actual_cents + p_actual_cents, updated_at = now()
    where id = v.job_id;
  end if;
  perform fabric.audit('worker', p_worker_id,
    case when p_actual_cents > v.estimated_cents then 'cost.settled_over_estimate' else 'cost.settled' end,
    'cost', v.id::text,
    jsonb_build_object('category', v.category, 'estimated_cents', v.estimated_cents, 'actual_cents', p_actual_cents));
end $$;

create function fabric.release_cost(p_worker_id text, p_reservation_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update fabric.cost_ledger set status = 'released', settled_at = now()
  where id = p_reservation_id and status = 'reserved';
  if not found then
    raise exception 'Reservierung % ist nicht offen', p_reservation_id;
  end if;
  perform fabric.audit('worker', p_worker_id, 'cost.released', 'cost', p_reservation_id::text);
end $$;

create function fabric.status_overview() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kill_switch', fabric.kill_switch_active(),
    'jobs', coalesce((select jsonb_object_agg(status, n) from (
      select status::text, count(*) as n from fabric.jobs group by status) s), '{}'),
    'pending_approvals', (select count(*) from fabric.approvals where status = 'pending' and expires_at > now()),
    'active_workers', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'host', host, 'last_heartbeat_at', last_heartbeat_at))
      from fabric.workers where stopped_at is null and last_heartbeat_at > now() - interval '2 minutes'), '[]'),
    'budgets', coalesce((select jsonb_agg(jsonb_build_object(
        'category', b.category, 'period', b.period, 'limit_cents', b.limit_cents,
        'spent_cents', (select coalesce(sum(coalesce(c.actual_cents, c.estimated_cents)), 0)
                        from fabric.cost_ledger c
                        where c.status <> 'released' and c.created_at >= fabric.period_start(b.period)
                          and (b.category = 'total' or c.category = b.category)))
        order by b.category, b.period)
      from fabric.budgets b), '[]'),
    'agents', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'enabled', enabled) order by id) from fabric.agents), '[]')
  )
$$;

-- ---------------------------------------------------------------------------
-- Operator-Funktionen (Rolle authenticated + Eintrag in fabric.operators)
-- ---------------------------------------------------------------------------

create function fabric.decide_approval(p_approval_id uuid, p_approve boolean, p_note text default null)
returns fabric.approvals
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := fabric.require_operator();
  v fabric.approvals;
begin
  select * into v from fabric.approvals where id = p_approval_id for update;
  if v.id is null or v.status <> 'pending' or v.expires_at <= now() then
    raise exception 'Freigabe % ist nicht offen oder abgelaufen', p_approval_id;
  end if;
  if p_approve and v.level = 'C' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Stufe-C-Freigaben brauchen eine ausdrückliche Begründung';
  end if;

  update fabric.approvals set
    status = case when p_approve then 'approved'::fabric.approval_status else 'rejected'::fabric.approval_status end,
    decided_by = v_uid, decided_at = now(), decision_note = p_note
  where id = p_approval_id
  returning * into v;

  if p_approve then
    update fabric.jobs set status = 'queued', updated_at = now()
    where approval_id = p_approval_id and status = 'awaiting_approval';
  else
    update fabric.jobs set status = 'cancelled', finished_at = now(), updated_at = now()
    where approval_id = p_approval_id and status = 'awaiting_approval';
  end if;

  perform fabric.audit('human', v_uid::text,
    case when p_approve then 'approval.approved' else 'approval.rejected' end,
    'approval', p_approval_id::text, jsonb_build_object('level', v.level, 'note', p_note));
  return v;
end $$;

create function fabric.set_kill_switch(p_active boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := fabric.require_operator();
begin
  insert into fabric.settings (key, value, updated_at, updated_by)
  values ('kill_switch', jsonb_build_object('active', p_active, 'reason', p_reason), now(), v_uid)
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = v_uid;
  perform fabric.audit('human', v_uid::text,
    case when p_active then 'kill_switch.activated' else 'kill_switch.deactivated' end,
    'settings', 'kill_switch', jsonb_build_object('reason', p_reason));
end $$;

create function fabric.set_budget(p_category text, p_period text, p_limit_cents integer, p_warn_ratio numeric default 0.8)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := fabric.require_operator();
  v_old integer;
begin
  select limit_cents into v_old from fabric.budgets where category = p_category and period = p_period;
  insert into fabric.budgets (category, period, limit_cents, warn_ratio, updated_at, updated_by)
  values (p_category, p_period, p_limit_cents, coalesce(p_warn_ratio, 0.8), now(), v_uid)
  on conflict (category, period) do update set limit_cents = excluded.limit_cents,
    warn_ratio = excluded.warn_ratio, updated_at = now(), updated_by = v_uid;
  perform fabric.audit('human', v_uid::text, 'budget.set', 'budget', p_category || '/' || p_period,
    jsonb_build_object('old_limit_cents', v_old, 'new_limit_cents', p_limit_cents, 'warn_ratio', p_warn_ratio));
end $$;

create function fabric.set_agent_enabled(p_agent_id text, p_enabled boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := fabric.require_operator();
begin
  update fabric.agents set enabled = p_enabled, updated_at = now() where id = p_agent_id;
  if not found then
    raise exception 'Agent % existiert nicht', p_agent_id;
  end if;
  perform fabric.audit('human', v_uid::text,
    case when p_enabled then 'agent.enabled' else 'agent.disabled' end, 'agent', p_agent_id);
end $$;

create function fabric.cancel_job(p_job_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := fabric.require_operator();
begin
  update fabric.jobs set status = 'cancelled', finished_at = now(), updated_at = now()
  where id = p_job_id and status in ('queued', 'awaiting_approval');
  if not found then
    raise exception 'Job % ist nicht abbrechbar (nur wartende Jobs)', p_job_id;
  end if;
  perform fabric.audit('human', v_uid::text, 'job.cancelled', 'job', p_job_id::text,
    jsonb_build_object('reason', p_reason));
end $$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------

revoke all on schema fabric from public;
grant usage on schema fabric to fabric_worker, authenticated;

revoke all on all tables in schema fabric from public, anon, authenticated, service_role, fabric_worker;
revoke all on all sequences in schema fabric from public, anon, authenticated, service_role, fabric_worker;
revoke execute on all functions in schema fabric from public, anon, authenticated, service_role, fabric_worker;
alter default privileges in schema fabric revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema fabric revoke execute on functions from public, anon, authenticated, service_role;

grant execute on function
  fabric.register_worker(text, text, integer, text),
  fabric.stop_worker(text),
  fabric.heartbeat(text, uuid[], integer),
  fabric.enqueue_job(text, text, text, jsonb, integer, timestamptz, integer, text, integer, jsonb),
  fabric.claim_jobs(text, integer, integer, text[]),
  fabric.complete_job(text, uuid, jsonb),
  fabric.fail_job(text, uuid, text, boolean, integer),
  fabric.request_approval(text, text, text, text, jsonb, integer, integer),
  fabric.consume_approval(text, uuid, jsonb),
  fabric.reserve_cost(text, text, text, integer, uuid, text),
  fabric.settle_cost(text, uuid, integer),
  fabric.release_cost(text, uuid),
  fabric.status_overview()
to fabric_worker;

grant execute on function
  fabric.is_operator(),
  fabric.decide_approval(uuid, boolean, text),
  fabric.set_kill_switch(boolean, text),
  fabric.set_budget(text, text, integer, numeric),
  fabric.set_agent_enabled(text, boolean),
  fabric.cancel_job(uuid, text)
to authenticated;

-- Lesen für Operatoren (Dashboard ab M1b); Schreiben nur über Funktionen.
grant select on all tables in schema fabric to authenticated;
do $$
declare
  t text;
begin
  foreach t in array array['operators', 'agents', 'workers', 'settings', 'approvals', 'jobs',
                           'budgets', 'cost_ledger', 'audit_log'] loop
    execute format('alter table fabric.%I enable row level security', t);
    execute format('alter table fabric.%I force row level security', t);
    execute format('create policy operators_read on fabric.%I for select to authenticated using (fabric.is_operator())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Startwerte
-- ---------------------------------------------------------------------------

insert into fabric.settings (key, value) values ('kill_switch', '{"active": false}');

insert into fabric.agents (id, name, description, enabled) values
  ('system', 'System', 'Interne Wartungs- und Testjobs', true),
  ('unit-economics', 'Unit Economics', 'Deckungsbeitrag, max. CPA, Break-even-ROAS (ohne KI)', true),
  ('product-research', 'Product Research', 'Produktideen, Scoring, Opportunity Cards (M2)', false),
  ('compliance', 'Supplier & Compliance', 'Lieferanten- und Rechtsvorprüfung (M2)', false),
  ('shopify', 'Shopify Factory', 'Produktentwürfe und Veröffentlichung nach Freigabe (M3)', false),
  ('creative', 'Creative Factory', 'Hooks, Skripte, Bilder, Videos (M4)', false),
  ('meta-ads', 'Meta Ads', 'Reporting und Kampagnenentwürfe (M5)', false),
  ('tiktok-ads', 'TikTok Ads', 'Reporting und Kampagnenentwürfe', false),
  ('tiktok-organic', 'TikTok Organic', 'Content-Kalender und Entwurfs-Upload', false),
  ('profit', 'Profit Intelligence', 'Gewinnrechnung aus Shop- und Werbedaten', false),
  ('customer', 'Customer Intelligence', 'Retouren- und Beschwerdeanalyse', false);

-- Startbudgets für API-Kosten (Annahme aus Phase 0, über fabric.set_budget änderbar).
insert into fabric.budgets (category, period, limit_cents) values
  ('llm', 'day', 300),
  ('llm', 'month', 5000),
  ('media', 'day', 500),
  ('media', 'month', 5000),
  ('research', 'month', 2500),
  ('total', 'month', 10000);
