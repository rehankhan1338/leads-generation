-- Two facets without a source (e.g. country + industry) had no index covering
-- both. Whichever single-column index the optimizer or our hint picked, it
-- walked that facet's rows in id order testing the other column row by row:
-- Sweden + Home & Garden took 11 s, United States + Home & Garden 14-20 s.
-- A composite per facet pair makes it an exact ref lookup already in id order,
-- the same plan on MariaDB and MySQL 8.
--
-- Secondary index adds are ALGORITHM=INPLACE (no table copy) but each one
-- sorts ~15M entries through the server's temp directory (roughly 1 GB per
-- index). Check free space there before running this on a managed instance.
USE leads_db;

ALTER TABLE leads
  ADD KEY idx_country_industry (country, industry),
  ADD KEY idx_country_category (country, category),
  ADD KEY idx_industry_category (industry, category),
  ALGORITHM=INPLACE, LOCK=NONE;
