-- Add queued status + queue columns (idempotent-ish)
DO $$ BEGIN
  ALTER TYPE extraction_status ADD VALUE IF NOT EXISTS 'queued' BEFORE 'running';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN
    BEGIN
      ALTER TYPE extraction_status ADD VALUE IF NOT EXISTS 'queued';
    EXCEPTION WHEN others THEN NULL;
    END;
END $$;

ALTER TABLE extractions ADD COLUMN IF NOT EXISTS limite integer;
ALTER TABLE extractions ADD COLUMN IF NOT EXISTS delay_min_ms integer;
ALTER TABLE extractions ADD COLUMN IF NOT EXISTS delay_max_ms integer;
ALTER TABLE extractions ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE extractions ALTER COLUMN perfil_alvo_pk SET DEFAULT '0';
