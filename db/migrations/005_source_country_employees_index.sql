-- With both a source and a country filter the optimizer still preferred a full
-- backwards scan of idx_employees over idx_country_employees. An index that
-- covers the exact filter shape plus the sort column removes the guesswork.
USE leads_db;

ALTER TABLE leads
  ADD KEY idx_source_country_employees (source, country, employees),
  ALGORITHM=INPLACE, LOCK=NONE;
