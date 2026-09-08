-- =========================================================
-- INTERVIEWPULSE DATABASE SCHEMA
-- Postgres / Supabase
-- =========================================================

create extension if not exists "uuid-ossp";

-- =========================================================
-- ENUM TYPES
-- =========================================================
create type user_role as enum ('interviewer', 'admin');
create type job_status as enum ('open', 'closed', 'archived');
create type referral_source as enum ('linkedin', 'referral', 'website', 'other');
create type overall_verdict as enum ('strong_yes', 'maybe', 'no');
create type interview_mode as enum ('onsite', 'video', 'phone');
create type sync_status as enum ('synced', 'pending', 'conflict', 'failed');
create type panel_status as enum ('invited', 'active', 'removed');

-- =========================================================
-- PROFILES (mirrors auth.users, 1:1)
-- =========================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role user_role not null default 'interviewer',
  avatar_url text,
  theme_mode text not null default 'light' check (theme_mode in ('light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), new.email, 'interviewer');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- JOBS
-- =========================================================
create table jobs (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  department text,
  description text,
  jd_url text,
  created_by uuid not null references profiles(id),
  status job_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- STAGES (per job, ordered)
-- =========================================================
create table stages (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete cascade,
  name text not null,
  position int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, position)
);

-- =========================================================
-- CRITERIA (per job, ordered, never hard-coded)
-- =========================================================
create table criteria (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete cascade,
  name text not null,
  position int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, position)
);

-- =========================================================
-- JOB <-> INTERVIEWER PANEL MEMBERSHIP
-- =========================================================
create table job_interviewers (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete cascade,
  user_id uuid references profiles(id),
  invited_email text not null,
  status panel_status not null default 'invited',
  created_at timestamptz not null default now(),
  unique (job_id, invited_email)
);

-- =========================================================
-- CANDIDATES
-- =========================================================
create table candidates (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references jobs(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  "current_role" text,
  current_company text,
  resume_url text,
  referral_source referral_source not null default 'other',
  current_stage_id uuid references stages(id),
  decision_status text default 'pending',
  interview_date date,
  interview_time time,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- FEEDBACK
-- =========================================================
create table feedback (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  stage_id uuid not null references stages(id),
  interviewer_id uuid not null references profiles(id),
  overall_verdict overall_verdict not null,
  positives text not null,
  concerns text not null,
  questions text not null,
  duration_minutes int not null check (duration_minutes > 0 and duration_minutes <= 480),
  interview_mode interview_mode not null,
  would_hire_solo boolean not null,
  submitted_at timestamptz not null default now(),
  editable_until timestamptz not null default (now() + interval '1 hour'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_status sync_status not null default 'synced',
  version int not null default 1,
  unique (candidate_id, stage_id, interviewer_id)
);

-- Server-side enforcement of the 1-hour edit lock.
-- editable_until is set once at insert and can never be pushed forward by a client update.
create function public.enforce_feedback_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.editable_until <= now() then
    raise exception 'Feedback is locked and can no longer be edited';
  end if;
  -- editable_until and submitted_at are immutable after creation
  new.editable_until := old.editable_until;
  new.submitted_at := old.submitted_at;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_enforce_feedback_lock
  before update on feedback
  for each row execute procedure public.enforce_feedback_lock();

-- =========================================================
-- FEEDBACK SCORES
-- =========================================================
create table feedback_scores (
  id uuid primary key default uuid_generate_v4(),
  feedback_id uuid not null references feedback(id) on delete cascade,
  criterion_id uuid not null references criteria(id),
  score smallint not null check (score >= 0 and score <= 5),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feedback_id, criterion_id)
);

-- =========================================================
-- ACTIVITY LOGS
-- =========================================================
create table activity_logs (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  user_id uuid not null references profiles(id),
  action text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- HELPER FUNCTIONS FOR RLS
-- =========================================================

create function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = uid and role = 'admin');
$$;

-- Job owner (created_by) or a platform admin. Platform admin is
-- single-tenant on purpose: this app is one hiring org, not a marketplace.
create function public.is_job_admin(uid uuid, jid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from jobs where id = jid and created_by = uid)
      or public.is_admin(uid);
$$;

create function public.is_job_panel_member(uid uuid, jid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from job_interviewers
    where job_id = jid and user_id = uid and status = 'active'
  );
$$;

-- True if uid has submitted feedback for this candidate+stage.
create function public.has_submitted_feedback(uid uuid, cand_id uuid, stg_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from feedback
    where candidate_id = cand_id and stage_id = stg_id and interviewer_id = uid
  );
$$;

-- =========================================================
-- ENABLE RLS
-- =========================================================
alter table profiles enable row level security;
alter table jobs enable row level security;
alter table stages enable row level security;
alter table criteria enable row level security;
alter table job_interviewers enable row level security;
alter table candidates enable row level security;
alter table feedback enable row level security;
alter table feedback_scores enable row level security;
alter table activity_logs enable row level security;

-- =========================================================
-- PROFILES POLICIES
-- =========================================================
-- Interviewers need peer names on the panel summary. Limit to people
-- who share an active job panel (or self / admin).
create policy "profiles_select_self_admin_or_panel_peer"
  on profiles for select
  using (
    id = auth.uid()
    or is_admin(auth.uid())
    or exists (
      select 1
      from job_interviewers mine
      join job_interviewers peer on peer.job_id = mine.job_id
      where mine.user_id = auth.uid()
        and mine.status = 'active'
        and peer.user_id = profiles.id
        and peer.status = 'active'
    )
  );

create policy "profiles_update_self"
  on profiles for update
  using (id = auth.uid());

-- =========================================================
-- JOBS POLICIES
-- =========================================================
create policy "jobs_select_panel_or_admin"
  on jobs for select
  using (
    is_job_admin(auth.uid(), id)
    or is_job_panel_member(auth.uid(), id)
  );

create policy "jobs_insert_admin_only"
  on jobs for insert
  with check (is_admin(auth.uid()));

create policy "jobs_update_admin_only"
  on jobs for update
  using (is_admin(auth.uid()));

-- =========================================================
-- STAGES / CRITERIA POLICIES (read: panel+admin, write: admin)
-- =========================================================
create policy "stages_select"
  on stages for select
  using (is_job_admin(auth.uid(), job_id) or is_job_panel_member(auth.uid(), job_id));

create policy "stages_write_admin_only"
  on stages for all
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

create policy "criteria_select"
  on criteria for select
  using (is_job_admin(auth.uid(), job_id) or is_job_panel_member(auth.uid(), job_id));

create policy "criteria_write_admin_only"
  on criteria for all
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

-- =========================================================
-- JOB_INTERVIEWERS POLICIES
-- =========================================================
create policy "job_interviewers_select"
  on job_interviewers for select
  using (is_admin(auth.uid()) or user_id = auth.uid());

create policy "job_interviewers_write_admin_only"
  on job_interviewers for all
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

-- =========================================================
-- CANDIDATES POLICIES
-- =========================================================
create policy "candidates_select"
  on candidates for select
  using (is_job_admin(auth.uid(), job_id) or is_job_panel_member(auth.uid(), job_id));

create policy "candidates_insert"
  on candidates for insert
  with check (is_job_admin(auth.uid(), job_id) or is_job_panel_member(auth.uid(), job_id));

create policy "candidates_update"
  on candidates for update
  using (is_job_admin(auth.uid(), job_id) or is_job_panel_member(auth.uid(), job_id));

-- =========================================================
-- FEEDBACK POLICIES  ***BLIND-VIEW RULE ENFORCED HERE***
-- =========================================================

-- A user may always see their OWN feedback.
-- A user may see ANOTHER interviewer's feedback for a candidate+stage
--   only if they have already submitted their own for that pair, OR
--   they administer that job (owner or platform admin).
create policy "feedback_select_blind_view"
  on feedback for select
  using (
    interviewer_id = auth.uid()
    or has_submitted_feedback(auth.uid(), candidate_id, stage_id)
    or exists (
      select 1 from candidates c
      where c.id = candidate_id and is_job_admin(auth.uid(), c.job_id)
    )
  );

create policy "feedback_insert_own_only"
  on feedback for insert
  with check (
    interviewer_id = auth.uid()
    and exists (
      select 1 from candidates c
      where c.id = candidate_id
        and (
          is_job_panel_member(auth.uid(), c.job_id)
          or is_job_admin(auth.uid(), c.job_id)
        )
    )
  );

-- Update is restricted to the author; the trigger above enforces the
-- 1-hour lock itself, so RLS just needs to confirm ownership.
create policy "feedback_update_own_only"
  on feedback for update
  using (interviewer_id = auth.uid())
  with check (interviewer_id = auth.uid());

-- =========================================================
-- FEEDBACK_SCORES POLICIES (inherit blind-view via parent feedback row)
-- =========================================================
create policy "feedback_scores_select"
  on feedback_scores for select
  using (
    exists (
      select 1 from feedback f
      join candidates c on c.id = f.candidate_id
      where f.id = feedback_id
        and (
          f.interviewer_id = auth.uid()
          or has_submitted_feedback(auth.uid(), f.candidate_id, f.stage_id)
          or is_job_admin(auth.uid(), c.job_id)
        )
    )
  );

create policy "feedback_scores_write"
  on feedback_scores for all
  using (
    is_admin(auth.uid())
    or exists (select 1 from feedback f where f.id = feedback_id and f.interviewer_id = auth.uid())
  )
  with check (
    is_admin(auth.uid())
    or exists (select 1 from feedback f where f.id = feedback_id and f.interviewer_id = auth.uid())
  );

-- =========================================================
-- ACTIVITY LOGS POLICIES
-- =========================================================
create policy "activity_logs_select"
  on activity_logs for select
  using (
    is_admin(auth.uid())
    or exists (
      select 1 from candidates c
      where c.id = candidate_id
        and (
          is_job_admin(auth.uid(), c.job_id)
          or is_job_panel_member(auth.uid(), c.job_id)
        )
    )
  );

create policy "activity_logs_insert"
  on activity_logs for insert
  with check (
    user_id = auth.uid()
    and (
      is_admin(auth.uid())
      or exists (
        select 1 from candidates c
        where c.id = candidate_id
          and (
            is_job_admin(auth.uid(), c.job_id)
            or is_job_panel_member(auth.uid(), c.job_id)
          )
      )
    )
  );

create policy "activity_logs_delete_admin_only"
  on activity_logs for delete
  using (is_admin(auth.uid()));

-- =========================================================
-- CASCADE DELETE POLICIES
-- =========================================================
create policy "jobs_delete_admin_only"
  on jobs for delete
  using (is_admin(auth.uid()));

create policy "candidates_delete_admin_only"
  on candidates for delete
  using (is_admin(auth.uid()) or is_job_admin(auth.uid(), job_id));

create policy "feedback_delete_admin_only"
  on feedback for delete
  using (is_admin(auth.uid()) or interviewer_id = auth.uid());

-- =========================================================
-- TABLE PRIVILEGES FOR AUTHENTICATED & ANON ROLES
-- =========================================================
revoke all on public.profiles from anon;
revoke all on public.jobs from anon;
revoke all on public.stages from anon;
revoke all on public.criteria from anon;
revoke all on public.job_interviewers from anon;
revoke all on public.candidates from anon;
revoke all on public.feedback from anon;
revoke all on public.feedback_scores from anon;
revoke all on public.activity_logs from anon;

grant all on public.profiles to authenticated;
grant all on public.jobs to authenticated;
grant all on public.stages to authenticated;
grant all on public.criteria to authenticated;
grant all on public.job_interviewers to authenticated;
grant all on public.candidates to authenticated;
grant all on public.feedback to authenticated;
grant all on public.feedback_scores to authenticated;
grant all on public.activity_logs to authenticated;

-- =========================================================
-- INDEXES ON FOREIGN KEYS
-- =========================================================

create index if not exists idx_candidates_job_id
on public.candidates(job_id);

create index if not exists idx_candidates_current_stage_id
on public.candidates(current_stage_id);

create index if not exists idx_feedback_candidate_id
on public.feedback(candidate_id);

create index if not exists idx_feedback_interviewer_id
on public.feedback(interviewer_id);

create index if not exists idx_feedback_stage_id
on public.feedback(stage_id);

create index if not exists idx_feedback_scores_feedback_id
on public.feedback_scores(feedback_id);

create index if not exists idx_job_interviewers_job_id
on public.job_interviewers(job_id);

create index if not exists idx_job_interviewers_user_id
on public.job_interviewers(user_id);

create index if not exists idx_activity_logs_candidate_id
on public.activity_logs(candidate_id);

create index if not exists idx_stages_job_id
on public.stages(job_id);

create index if not exists idx_criteria_job_id
on public.criteria(job_id);

-- =========================================================
-- STORAGE BUCKETS (resumes, JD PDFs)
-- =========================================================
insert into storage.buckets (id, name, public) values ('resumes', 'resumes', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('job-descriptions', 'job-descriptions', false)
  on conflict (id) do nothing;

-- Object paths must be `{job_id}/...` so access can be scoped per job.
create policy "resume_upload_panel_members"
  on storage.objects for insert
  with check (
    bucket_id = 'resumes'
    and (
      is_job_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
      or is_job_panel_member(auth.uid(), (storage.foldername(name))[1]::uuid)
    )
  );

create policy "resume_read_panel_members"
  on storage.objects for select
  using (
    bucket_id = 'resumes'
    and (
      is_job_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
      or is_job_panel_member(auth.uid(), (storage.foldername(name))[1]::uuid)
    )
  );

create policy "jd_upload_admin_only"
  on storage.objects for insert
  with check (
    bucket_id = 'job-descriptions'
    and is_job_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

create policy "jd_read_panel_members"
  on storage.objects for select
  using (
    bucket_id = 'job-descriptions'
    and (
      is_job_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
      or is_job_panel_member(auth.uid(), (storage.foldername(name))[1]::uuid)
    )
  );
