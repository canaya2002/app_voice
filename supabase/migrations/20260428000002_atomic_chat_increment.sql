-- Atomic increment helpers for chat-notes and convert-mode counters.
-- Closes the race condition where two simultaneous requests could both see
-- count=N, both pass the limit check, and both write N+1 (instead of N+2).

CREATE OR REPLACE FUNCTION public.increment_chat_count(
  user_id_input UUID,
  max_count INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  caller_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';

  IF caller_role IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> user_id_input THEN
      RAISE EXCEPTION 'Cannot increment counters for another user' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Auto-reset if new day (atomic single UPDATE).
  UPDATE public.profiles
  SET daily_count = 0,
      daily_audio_minutes = 0,
      daily_chat_count = 0,
      daily_convert_count = 0,
      last_reset_date = CURRENT_DATE
  WHERE id = user_id_input
    AND last_reset_date < CURRENT_DATE;

  -- Atomic increment-if-under-limit. Postgres serializes UPDATE on the same row
  -- via row-level locking, so two concurrent calls cannot both pass the WHERE clause.
  UPDATE public.profiles
  SET daily_chat_count = daily_chat_count + 1
  WHERE id = user_id_input
    AND daily_chat_count < max_count;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_chat_count(UUID, INT) TO authenticated;
