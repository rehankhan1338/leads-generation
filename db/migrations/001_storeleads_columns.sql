-- Ecommerce exports carry traffic/tech signals worth filtering on directly
-- (a JSON column would be too slow to filter at this row count).
USE leads_db;

ALTER TABLE leads
  ADD COLUMN monthly_visits BIGINT UNSIGNED DEFAULT NULL AFTER employees,
  ADD COLUMN monthly_sales_usd BIGINT UNSIGNED DEFAULT NULL AFTER monthly_visits,
  ADD COLUMN tech_count SMALLINT UNSIGNED DEFAULT NULL AFTER monthly_sales_usd,
  ADD COLUMN platform_rank BIGINT UNSIGNED DEFAULT NULL AFTER tech_count,
  ADD KEY idx_monthly_visits (monthly_visits),
  ADD KEY idx_tech_count (tech_count),
  ADD KEY idx_platform_rank (platform_rank),
  ADD KEY idx_category (source, category);
