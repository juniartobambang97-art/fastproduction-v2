-- =========================================================
-- FastProduction V2 — Migration 001
-- Tabel: campaigns (1 Design : N Campaign)
-- =========================================================

BEGIN;

-- 1. Tabel campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  design_id  UUID NOT NULL REFERENCES public.designs(id)  ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_qty INTEGER,
  min_interest INTEGER DEFAULT 0,
  interest_period_days INTEGER,
  po_payment_period_days INTEGER,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','open','closed','cancelled')),
  started_at TIMESTAMPTZ,
  ended_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_design_id  ON public.campaigns(design_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_company_id ON public.campaigns(company_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status     ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_deleted_at ON public.campaigns(deleted_at) WHERE deleted_at IS NULL;

-- 3. Row Level Security
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- 4. Policies (pola sama dengan designs: read_co + write_admin)
DROP POLICY IF EXISTS campaigns_read_co   ON public.campaigns;
DROP POLICY IF EXISTS campaigns_write_admin ON public.campaigns;

CREATE POLICY campaigns_read_co ON public.campaigns
  FOR SELECT
  USING (
    public.is_company_member(company_id)
    OR public.is_admin()
  );

CREATE POLICY campaigns_write_admin ON public.campaigns
  FOR ALL
  USING (
    public.is_company_admin(company_id)
    OR public.is_admin()
  )
  WITH CHECK (
    public.is_company_admin(company_id)
    OR public.is_admin()
  );

-- 5. Trigger updated_at otomatis (jika helper exists, skip jika tidak)
--    Pola ini aman dijalankan meski trigger function belum ada.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'set_updated_at'
  ) THEN
    EXECUTE format(
      'CREATE TRIGGER trg_campaigns_updated_at
       BEFORE UPDATE ON public.campaigns
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()'
    );
  END IF;
END $$;

COMMIT;
