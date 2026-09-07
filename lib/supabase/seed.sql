-- =========================================================
-- DEMO SEED DATA — clearly marked, never real production data.
-- Run after schema.sql. Assumes 4 auth users already exist
-- (1 admin + 3 interviewers) created via Supabase Auth,
-- with ids substituted below.
-- =========================================================

-- Replace these with real auth.users ids after creating the demo accounts.
-- admin@demo.interviewpulse.app       -> :admin_id
-- sam@demo.interviewpulse.app         -> :sam_id
-- kesar@demo.interviewpulse.app       -> :kesar_id
-- priya@demo.interviewpulse.app       -> :priya_id

update profiles set role = 'admin' where email = 'admin@demo.interviewpulse.app';

insert into jobs (id, title, department, description, created_by, status)
values ('11111111-1111-1111-1111-111111111111', 'Frontend Developer', 'Engineering',
        '[DEMO DATA] React Native focused frontend role.',
        (select id from profiles where email = 'admin@demo.interviewpulse.app'), 'open');

insert into stages (job_id, name, position) values
  ('11111111-1111-1111-1111-111111111111', 'Phone Screen', 1),
  ('11111111-1111-1111-1111-111111111111', 'Technical Round', 2),
  ('11111111-1111-1111-1111-111111111111', 'Culture Fit / Final Round', 3);

insert into criteria (job_id, name, position) values
  ('11111111-1111-1111-1111-111111111111', 'Communication', 1),
  ('11111111-1111-1111-1111-111111111111', 'Problem Solving', 2),
  ('11111111-1111-1111-1111-111111111111', 'System Design', 3),
  ('11111111-1111-1111-1111-111111111111', 'Team Fit', 4);

insert into job_interviewers (job_id, user_id, invited_email, status)
select '11111111-1111-1111-1111-111111111111', id, email, 'active'
from profiles where email in (
  'sam@demo.interviewpulse.app', 'kesar@demo.interviewpulse.app', 'priya@demo.interviewpulse.app'
);

insert into candidates (id, job_id, full_name, email, "current_role", current_company, referral_source, current_stage_id, created_by)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  '[DEMO] Sarah Chen', 'sarah.chen.demo@example.com', 'Frontend Engineer', 'PixelCraft',
  'linkedin',
  (select id from stages where job_id = '11111111-1111-1111-1111-111111111111' and name = 'Technical Round'),
  (select id from profiles where email = 'admin@demo.interviewpulse.app')
);

-- Additional demo candidates
insert into candidates (job_id, full_name, email, "current_role", current_company, referral_source, current_stage_id, created_by)
values
  ('11111111-1111-1111-1111-111111111111', '[DEMO] Marcus Webb', 'marcus.webb.demo@example.com', 'UI Engineer', 'Northlane',
   'referral', (select id from stages where job_id = '11111111-1111-1111-1111-111111111111' and name = 'Phone Screen'),
   (select id from profiles where email = 'admin@demo.interviewpulse.app')),
  ('11111111-1111-1111-1111-111111111111', '[DEMO] Aisha Rahman', 'aisha.rahman.demo@example.com', 'React Native Dev', 'Fluxwave',
   'website', (select id from stages where job_id = '11111111-1111-1111-1111-111111111111' and name = 'Culture Fit / Final Round'),
   (select id from profiles where email = 'admin@demo.interviewpulse.app'));

-- Two conflicting feedback rows for Sarah's Technical Round, to demo the
-- radar-chart disagreement and the panel summary blind-view unlock.
insert into feedback (candidate_id, stage_id, interviewer_id, overall_verdict, positives, concerns, questions, duration_minutes, interview_mode, would_hire_solo)
values (
  '22222222-2222-2222-2222-222222222222',
  (select id from stages where job_id = '11111111-1111-1111-1111-111111111111' and name = 'Technical Round'),
  (select id from profiles where email = 'sam@demo.interviewpulse.app'),
  'strong_yes', '[DEMO] Excellent grasp of React internals, clear communicator.',
  '[DEMO] Limited exposure to large-scale system design.',
  '[DEMO] Probe on experience with monorepos and CI pipelines.',
  50, 'video', true
);

insert into feedback (candidate_id, stage_id, interviewer_id, overall_verdict, positives, concerns, questions, duration_minutes, interview_mode, would_hire_solo)
values (
  '22222222-2222-2222-2222-222222222222',
  (select id from stages where job_id = '11111111-1111-1111-1111-111111111111' and name = 'Technical Round'),
  (select id from profiles where email = 'kesar@demo.interviewpulse.app'),
  'maybe', '[DEMO] Solid fundamentals.',
  '[DEMO] Struggled with the system design whiteboard exercise.',
  '[DEMO] Revisit system design depth in the final round.',
  55, 'video', false
);
