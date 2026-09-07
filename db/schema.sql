-- Leads warehouse: one unified table fed by Latka / StoreLeads / Apollo
CREATE DATABASE IF NOT EXISTS leads_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE leads_db;

CREATE TABLE IF NOT EXISTS leads (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source           VARCHAR(32)  NOT NULL,           -- latka | storeleads | apollo
  source_uid       VARCHAR(191) NOT NULL,           -- stable key within that source

  company_name     VARCHAR(255) DEFAULT NULL,
  domain           VARCHAR(191) DEFAULT NULL,       -- normalised, no scheme/www
  website_url      VARCHAR(512) DEFAULT NULL,
  linkedin_url     VARCHAR(512) DEFAULT NULL,
  twitter_url      VARCHAR(512) DEFAULT NULL,
  facebook_url     VARCHAR(512) DEFAULT NULL,
  crunchbase_url   VARCHAR(512) DEFAULT NULL,
  logo_url         VARCHAR(512) DEFAULT NULL,
  source_url       VARCHAR(512) DEFAULT NULL,       -- profile page on the source platform

  industry         VARCHAR(128) DEFAULT NULL,
  category         VARCHAR(128) DEFAULT NULL,       -- sub-category / platform (StoreLeads)
  country          VARCHAR(96)  DEFAULT NULL,
  country_code     CHAR(2)      DEFAULT NULL,
  state            VARCHAR(128) DEFAULT NULL,
  city             VARCHAR(128) DEFAULT NULL,

  employees        INT UNSIGNED DEFAULT NULL,
  founded_year     SMALLINT UNSIGNED DEFAULT NULL,
  revenue_usd      BIGINT UNSIGNED DEFAULT NULL,    -- canonical, parsed from text
  revenue_text     VARCHAR(32)  DEFAULT NULL,
  revenue_alt_usd  BIGINT UNSIGNED DEFAULT NULL,    -- secondary revenue figure (Latka)
  funding_usd      BIGINT UNSIGNED DEFAULT NULL,
  funding_text     VARCHAR(32)  DEFAULT NULL,
  growth_percent   DECIMAL(10,2) DEFAULT NULL,

  contact_name     VARCHAR(191) DEFAULT NULL,
  contact_title    VARCHAR(191) DEFAULT NULL,
  contact_email    VARCHAR(255) DEFAULT NULL,
  contact_phone    VARCHAR(64)  DEFAULT NULL,
  contact_linkedin_url VARCHAR(512) DEFAULT NULL,

  raw              LONGTEXT     DEFAULT NULL,       -- original row as JSON
  imported_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_source_uid (source, source_uid),
  KEY idx_source        (source),
  KEY idx_company       (company_name),
  KEY idx_domain        (domain),
  KEY idx_industry      (source, industry),
  KEY idx_country       (source, country),
  KEY idx_revenue       (revenue_usd),
  KEY idx_funding       (funding_usd),
  KEY idx_employees     (employees),
  KEY idx_growth        (growth_percent),
  KEY idx_email         (contact_email),
  FULLTEXT KEY ft_leads (company_name, domain, industry, contact_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

-- Pre-computed filter options so dropdowns never scan the big table
CREATE TABLE IF NOT EXISTS lead_facets (
  facet      VARCHAR(32)  NOT NULL,   -- source | industry | country | category
  value      VARCHAR(191) NOT NULL,
  source     VARCHAR(32)  NOT NULL DEFAULT '',
  lead_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (facet, source, value),
  KEY idx_facet_count (facet, lead_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Import bookkeeping: which file gave us which rows
CREATE TABLE IF NOT EXISTS import_runs (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  source       VARCHAR(32)  NOT NULL,
  file_name    VARCHAR(512) NOT NULL,
  rows_read    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rows_written BIGINT UNSIGNED NOT NULL DEFAULT 0,
  started_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at  TIMESTAMP NULL DEFAULT NULL,
  status       VARCHAR(16) NOT NULL DEFAULT 'running',
  note         TEXT DEFAULT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
