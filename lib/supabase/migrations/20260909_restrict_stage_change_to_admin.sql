-- =========================================================
-- MIGRATION: Only admins can change current_stage_id directly
-- =========================================================

CREATE OR REPLACE FUNCTION public.enforce_stage_change_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.current_stage_id IS DISTINCT FROM OLD.current_stage_id THEN
    IF NOT (public.is_admin(auth.uid()) OR public.is_job_admin(auth.uid(), OLD.job_id)) THEN
      RAISE EXCEPTION 'Only an admin can move a candidate to a different stage';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_stage_change_admin_only ON public.candidates;
CREATE TRIGGER trg_enforce_stage_change_admin_only
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_stage_change_admin_only();