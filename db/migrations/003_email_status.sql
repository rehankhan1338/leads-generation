-- Apollo's person records are mostly guessed addresses: in a 100k sample only
-- 5% were "Verified", 60% "Extrapolated" and 35% had no email at all. That
-- distinction decides whether a contact is usable, so it needs to be a real
-- indexed column rather than a field inside the `raw` JSON.
--
-- The FULLTEXT index on this table rules out ALGORITHM=INSTANT, so this is a
-- table rebuild. Run it before the 93M-row people import, not after.
USE leads_db;

ALTER TABLE leads
  ADD COLUMN email_status VARCHAR(16) DEFAULT NULL AFTER contact_email,
  ADD KEY idx_email_status (email_status),
  ALGORITHM=INPLACE;
