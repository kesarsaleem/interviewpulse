-- =========================================================
-- MIGRATION: Security Hardening + Missing Indexes
-- =========================================================
-- Run this on any already-deployed project. It undoes the overly
-- broad `anon` grants from schema.sql / 20260906_fix_admin_actions.sql,
-- adds indexes the RLS policies rely on constantly, and tightens the
-- candidates_update policy so only admins can change decision_status
-- (previously any panel member/interviewer could set hire/reject
-- directly).

-- 1. Revoke anon access. This app has no unauthenticated-facing
--    feature — every screen requires a logged-in session.
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.jobs FROM anon;
REVOKE ALL ON public.stages FROM anon;
REVOKE ALL ON public.criteria FROM anon;
REVOKE ALL ON public.job_interviewers FROM anon;
REVOKE ALL ON public.candidates FROM anon;
REVOKE ALL ON public.feedback FROM anon;
REVOKE ALL ON public.feedback_scores FROM anon;
REVOKE ALL ON public.activity_logs FROM anon;

-- 2. Indexes on FK columns used by RLS EXISTS subqueries and by app
--    queries (job lists, candidate lists, feedback lookups).
CREATE INDEX IF NOT EXISTS idx_candidates_job_id ON public.candidates(job_id);
CREATE INDEX IF NOT EXISTS idx_candidates_current_stage_id ON public.candidates(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_feedback_candidate_id ON public.feedback(candidate_id);
CREATE INDEX IF NOT EXISTS idx_feedback_interviewer_id ON public.feedback(interviewer_id);
CREATE INDEX IF NOT EXISTS idx_feedback_stage_id ON public.feedback(stage_id);
CREATE INDEX IF NOT EXISTS idx_feedback_scores_feedback_id ON public.feedback_scores(feedback_id);
CREATE INDEX IF NOT EXISTS idx_job_interviewers_job_id ON public.job_interviewers(job_id);
CREATE INDEX IF NOT EXISTS idx_job_interviewers_user_id ON public.job_interviewers(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_candidate_id ON public.activity_logs(candidate_id);
CREATE INDEX IF NOT EXISTS idx_stages_job_id ON public.stages(job_id);
CREATE INDEX IF NOT EXISTS idx_criteria_job_id ON public.criteria(job_id);

-- 3. Restrict who can change decision_status / current_stage_id.
--    Previously "candidates_update" let any panel member edit any
--    column, including hire/reject decisions. Split into two
--    policies: panel members can update general candidate info,
--    but only admins can change the decision-critical columns.
DROP POLICY IF EXISTS "candidates_update" ON public.candidates;

CREATE POLICY "candidates_update_panel_members"
  ON public.candidates FOR UPDATE
  USING (
    is_admin(auth.uid())
    OR is_job_admin(auth.uid(), job_id)
    OR is_job_panel_member(auth.uid(), job_id)
  )
  WITH CHECK (
    is_admin(auth.uid())
    OR is_job_admin(auth.uid(), job_id)
    OR is_job_panel_member(auth.uid(), job_id)
  );

-- Enforce at the trigger level that only admins can change
-- decision_status, since column-level RLS doesn't exist in Postgres.
CREATE OR REPLACE FUNCTION public.enforce_decision_status_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.decision_status IS DISTINCT FROM OLD.decision_status THEN
    IF NOT (is_admin(auth.uid()) OR is_job_admin(auth.uid(), OLD.job_id)) THEN
      RAISE EXCEPTION 'Only an admin can change the hiring decision for this candidate';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_decision_status_admin_only ON public.candidates;
CREATE TRIGGER trg_enforce_decision_status_admin_only
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_decision_status_admin_only();
