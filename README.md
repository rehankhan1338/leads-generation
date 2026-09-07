# Leads Database

One searchable table for lead exports from **Latka**, **StoreLeads** and **Apollo**.
Next.js + shadcn/ui on the front, XAMPP MySQL (MariaDB) behind it.

## Local setup

MySQL runs on **port 3307**, not the usual 3306 — Docker Desktop holds 3306 on this
machine. phpMyAdmin (`http://localhost/phpmyadmin`) is already pointed at 3307.

```bash
npm install
npm run dev          # http://localhost:3000
```

Connection settings live in `.env.local`.

Start MySQL if it is not running:

```powershell
Start-Process C:\xampp\mysql\bin\mysqld.exe -ArgumentList '--defaults-file=C:\xampp\mysql\bin\my.ini','--standalone' -WindowStyle Hidden
```

## Loading a platform export

```bash
# 1. create the schema (idempotent), then any migrations in db/migrations/
npm run db:schema

# 2. import — --file takes a single CSV or a folder of chunk_N.csv files
node scripts/import.mjs --source latka --file "data/Lakta SaaS Database 47,493.csv" --truncate
node scripts/import.mjs --source storeleads --file "path/to/StoreLeads/folder" --truncate

# 3. rebuild the filter dropdown options
npm run db:facets
```

Flags: `--truncate` wipes that source first, `--limit N` and `--dry` are for
checking a mapping before committing to a full run.

### About the StoreLeads export

The vendor zip (`StoreLeads Database 7,797,171.zip`) ships two folders,
`Shopify 3,266,327 stores` and `Woocommerce (4,530,844 Stores)`, but their
chunks are **byte-identical** — and the `platform` column in both reads
WooCommerce for ~97% of rows. So the zip contains the WooCommerce set twice and
the Shopify set is missing. Only one folder is imported; importing the other
would upsert the same rows (they key on domain) and change nothing.

## Adding the next platform

Each export gets one adapter under `scripts/sources/` that maps its raw columns
onto the shared `leads` row shape, then is registered in the `ADAPTERS` map in
`scripts/import.mjs`. Nothing else changes — the page, filters and search all
read the unified table.

`scripts/lib/normalize.mjs` has the shared cleaners: `parseMoney` (`"$54M"` →
`54000000`), `parsePercent`, `sortUrls` (buckets mixed URL columns into
website / linkedin / twitter / facebook / crunchbase) and `slugToName`.

## Data model

`leads` is one row per record, keyed by `(source, source_uid)` so re-running an
import updates rather than duplicates. Platform-specific columns that don't fit
the shared shape are kept in the `raw` JSON column.

`lead_facets` holds pre-counted filter values so the dropdowns never `GROUP BY`
the full table. `import_runs` logs each file load.

## Filters on the page

Search (company / domain / industry / contact, fulltext-indexed), source,
industry, country, category, revenue range, funding range, employee range,
minimum growth %, and "record has" toggles for website, LinkedIn, Twitter,
email, phone, contact name, revenue and funding. Every column header sorts.
All state lives in the URL, so any filtered view is a shareable link.

## Performance notes

Measured on 4.56M rows (`next start`, warm): ~1s for most filtered views, ~2-4s
for the worst combinations. The dev server is 3-5x slower — benchmark against a
production build, not `next dev`.

Three things keep it there, all of which matter more as the table grows:

- **Header counts come from `lead_facets`, not `leads`.** A `GROUP BY source`
  over the full table costs seconds on *every* page load. Re-run
  `npm run db:facets` after each import or the header goes stale.
- **Facet columns need standalone indexes.** `idx_industry` / `idx_country` /
  `idx_category` are composites led by `source`, so filtering on country alone
  cannot use them. `db/migrations/002_filter_indexes.sql` adds the single-column
  versions; without them those filters do a full table scan.
- **Counts are capped and time-limited.** `COUNT_CAP` (100k) bounds rows
  examined and `COUNT_TIMEOUT_SECONDS` (2s) bounds wall time in
  `src/lib/leads.ts`. Predicates like "has email" are not usefully indexable, so
  some combinations fall back to an approximate total shown as `N+`.

## Apollo

Two tab-separated files, 2020 snapshot:

| file | rows | source tag | adapter |
|---|---|---|---|
| `Apollo_V7_V5_org_all_fields` | 6,071,657 in the name; **5,493,265** actually parseable → 5,456,427 loaded (22,423 shifted rows dropped) | `apollo_org` | `scripts/sources/apollo-org.mjs` |
| `Apollo_V7_V5_per_all_fields` | 93,239,628 | `apollo_people` | `scripts/sources/apollo-people.mjs` |

Both exports contain unquoted newlines inside text fields, which split ~10% of
records across lines. The adapters set `expectFields` so the reader rejoins a
record that is still short of its column count — without it, `organization_id`
coverage drops from 100% to 98.8% and later columns shift into the wrong slots.

### Things that broke, and what guards against them now

- **`"` is literal text in these files, not CSV quoting.** One unmatched quote
  put the reader into quote mode for the rest of a 10 GB file and exhausted the
  Node heap. Apollo adapters set `quotes: false`; the reader also has a
  `maxRecordChars` guard (1 MB) that discards a runaway record instead of
  accumulating it.
- **A minority of rows have shifted columns** (a record short of tabs swallows
  the start of its neighbour during the newline repair). `apollo-org.mjs` drops
  rows whose `organization_id` is not a 24-hex ObjectId and passes country /
  state / city through `placeName()`, which rejects digits, brackets, braces,
  quotes and comma-in-country. Before that, the Country facet had 24,279
  "countries" for Apollo orgs; after cleanup it has 258.
- **Two importers upserting into one table deadlock** (InnoDB, especially while
  the facets rebuild runs its `GROUP BY`). Batch inserts retry on errno 1213 /
  1205 with backoff.
- **The source drive drops mid-read** (E:/F: are one USB enclosure that reset
  several times). The importer reopens the file and resyncs to the last row
  instead of dying. It also reads at ~1.7 MB/s, so stage large files on an
  internal disk first — but **never with `robocopy /Z`**: after a dropout it
  silently zero-filled the remaining 3.57 GB of a copy. Verify a staged copy
  against the original (size plus a few byte samples including the tail).
- **`mysql.exe` exits 0 even when a `source`d script fails.** Check the output,
  not the exit code.

### Loading the people file in batches

93M rows is too long for one run, so it goes in bounded slices:

```bash
node scripts/import.mjs --source apollo_people --file "…/Apollo_V7_V5_per_all_fields 93,239,628.csv" --limit 5000000
node scripts/import.mjs --source apollo_people --file "…" --skip 5000000 --limit 5000000
# each run prints the exact --skip for the next one
```

Rows before `--skip` are still parsed (there is no row index to seek to) but
not mapped or inserted, which is far cheaper. `--truncate` is refused when
`--skip` is set so a later batch cannot wipe earlier ones.

After each batch, in this order (none of them alongside a running import — the
facets rebuild's `GROUP BY` is what deadlocked the importers):

```bash
npm run db:facets          # refresh counts; the cleanup reads facet values
npm run db:clean-places    # null shifted-column country/state/city (see below)
npm run db:facets          # refresh again so the Country dropdown is clean
```

`clean-places` nulls place values on Apollo rows whose `country` is not a
country any *other* source has seen. Without it a batch adds a few thousand
"countries" like `England`, `Paris` or `Mumbai` to the dropdown.

### What the people data is actually worth

`person_email_status_cd` tells you whether Apollo verified an address or guessed
it from a name pattern. In a 100k sample: **Verified 5%**, Extrapolated 60%,
Unavailable 35%. That is stored in the `email_status` column and exposed as the
"Email quality" filter; treat it as the primary quality signal on this source.
LinkedIn URLs are present on ~100% of rows, titles on 99%, phones on ~0%.

The `category` column holds seniority for person rows (Entry / Manager / VP …)
so it can share the existing Platform/Category facet.

### Operational

- The importer averages 800-1,000 rows/sec on these wide rows. The full people
  file is ~26 hours through it; that is why batches exist.
- `leads` needs roughly 4-5 GB per 10M person rows. Check free space on the
  MySQL data drive before each batch.
- `innodb_buffer_pool_size` was raised from 16M to 2G in `C:\xampp\mysql\bin\my.ini`
  (backup at `my.ini.bak-claude`).
#   l e a d s - g e n e r a t i o n  
 