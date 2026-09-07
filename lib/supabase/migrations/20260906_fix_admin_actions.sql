-- =========================================================
-- MIGRATION: Fix Admin Decision Actions, Cascade Deletes & Feedback Scores
-- =========================================================

-- 1. Ensure decision_status column exists on candidates table
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS decision_status text DEFAULT 'pending';

-- 2. Grant table privileges to authenticated role only.
-- (Previously also granted to `anon` — removed. This app has no
-- unauthenticated-facing feature; RLS is the only real gate, and
-- `anon` should not have table-level privileges at all. See
-- migrations/20260907_security_and_indexes.sql for the follow-up
-- REVOKE that cleans up projects that already ran the old version
-- of this migration.)
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.jobs TO authenticated;
GRANT ALL ON public.stages TO authenticated;
GRANT ALL ON public.criteria TO authenticated;
GRANT ALL ON public.job_interviewers TO authenticated;
GRANT ALL ON public.candidates TO authenticated;
GRANT ALL ON public.feedback TO authenticated;
GRANT ALL ON public.feedback_scores TO authenticated;
GRANT ALL ON public.activity_logs TO authenticated;

-- 3. Update Activity Logs insert policy to allow platform admins & job admins
DROP POLICY IF EXISTS "activity_logs_insert" ON public.activity_logs;
CREATE POLICY "activity_logs_insert"
  ON public.activity_logs FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.candidates c
        WHERE c.id = candidate_id
          AND (
            is_job_admin(auth.uid(), c.job_id)
            OR is_job_panel_member(auth.uid(), c.job_id)
          )
      )
    )
  );

-- 4. Allow authenticated write and delete policies for feedback_scores
DROP POLICY IF EXISTS "feedback_scores_write" ON public.feedback_scores;
DROP POLICY IF EXISTS "feedback_scores_write_own_only" ON public.feedback_scores;
CREATE POLICY "feedback_scores_write"
  ON public.feedback_scores FOR ALL
  USING (
    is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.feedback f WHERE f.id = feedback_id AND f.interviewer_id = auth.uid())
  )
  WITH CHECK (
    is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.feedback f WHERE f.id = feedback_id AND f.interviewer_id = auth.uid())
  );

-- 5. Cascade Delete Policies for Admin
DROP POLICY IF EXISTS "jobs_delete_admin_only" ON public.jobs;
CREATE POLICY "jobs_delete_admin_only" ON public.jobs FOR DELETE USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "candidates_delete_admin_only" ON public.candidates;
CREATE POLICY "candidates_delete_admin_only" ON public.candidates FOR DELETE USING (is_admin(auth.uid()) OR is_job_admin(auth.uid(), job_id));

DROP POLICY IF EXISTS "feedback_delete_admin_only" ON public.feedback;
CREATE POLICY "feedback_delete_admin_only" ON public.feedback FOR DELETE USING (is_admin(auth.uid()) OR interviewer_id = auth.uid());

DROP POLICY IF EXISTS "feedback_scores_delete_admin_only" ON public.feedback_scores;
CREATE POLICY "feedback_scores_delete_admin_only" ON public.feedback_scores FOR DELETE USING (
  is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.feedback f WHERE f.id = feedback_id AND f.interviewer_id = auth.uid())
);

DROP POLICY IF EXISTS "activity_logs_delete_admin_only" ON public.activity_logs;
CREATE POLICY "activity_logs_delete_admin_only" ON public.activity_logs FOR DELETE USING (is_admin(auth.uid()));