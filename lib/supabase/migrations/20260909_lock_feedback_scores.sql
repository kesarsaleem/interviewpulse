-- =========================================================
-- MIGRATION: Enforce feedback edit-lock on feedback_scores too
-- =========================================================

CREATE OR REPLACE FUNCTION public.enforce_feedback_scores_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_editable_until timestamptz;
  target_feedback_id uuid;
BEGIN
  target_feedback_id := COALESCE(NEW.feedback_id, OLD.feedback_id);

  SELECT editable_until INTO parent_editable_until
  FROM public.feedback
  WHERE id = target_feedback_id;

  IF parent_editable_until IS NULL THEN
    RAISE EXCEPTION 'Parent feedback not found';
  END IF;

  IF parent_editable_until <= now() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Feedback is locked and scores can no longer be edited';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_feedback_scores_lock ON public.feedback_scores;
CREATE TRIGGER trg_enforce_feedback_scores_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.feedback_scores
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_feedback_scores_lock();