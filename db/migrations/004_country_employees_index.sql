-- "Country X sorted by staff" walked idx_employees backwards testing every row
-- for country (6-15 s on 13M rows). A composite index lets MySQL seek to the
-- country and read rows already in employee order.
USE leads_db;

ALTER TABLE leads
  ADD KEY idx_country_employees (country, employees),
  ADD KEY idx_source_employees  (source, employees),
  ALGORITHM=INPLACE, LOCK=NONE;
