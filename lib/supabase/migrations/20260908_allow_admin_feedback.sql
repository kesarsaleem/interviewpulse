-- Admins/managers can submit feedback just like interviewers for jobs they manage.
DROP POLICY IF EXISTS "feedback_insert_own_only" ON public.feedback;
CREATE POLICY "feedback_insert_own_only"
  ON public.feedback FOR INSERT
  WITH CHECK (
    interviewer_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.candidates c
      WHERE c.id = candidate_id
        AND (
          public.is_job_panel_member(auth.uid(), c.job_id)
          OR public.is_job_admin(auth.uid(), c.job_id)
        )
    )
  );
