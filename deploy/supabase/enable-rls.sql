-- REVIEW BEFORE EXECUTING. Not run by deployment scripts.
-- For a server-only app whose trusted Prisma role bypasses RLS.
-- Confirm no browser/other app needs anonymous or authenticated Data API access.
-- No public policies are created: direct Data API access is denied by default.
-- Existing rows and schema columns are preserved.
BEGIN;
ALTER TABLE public."Player" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CategoryRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Match" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PointTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Setting" ENABLE ROW LEVEL SECURITY;
COMMIT;
