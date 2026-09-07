-- The facet columns were only indexed behind `source` (idx_industry, idx_country,
-- idx_category are composites led by source), so filtering on country or industry
-- alone could not use them and fell back to a full scan. Standalone indexes fix that.
USE leads_db;

ALTER TABLE leads
  ADD KEY idx_country_only  (country),
  ADD KEY idx_industry_only (industry),
  ADD KEY idx_category_only (category);
