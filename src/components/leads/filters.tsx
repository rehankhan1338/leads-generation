'use client';

import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { MultiSelect, type Option } from './multi-select';

export type FacetMap = Record<string, { value: string; lead_count: number }[]>;

const HAS_FIELDS: { key: string; label: string }[] = [
  { key: 'website', label: 'Website' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'twitter', label: 'Twitter / X' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'contact', label: 'Contact name' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'funding', label: 'Funding' },
];

/** Apollo marks whether an address was verified or merely guessed from a name pattern. */
const EMAIL_STATUS_OPTIONS: Option[] = [
  { value: 'Verified' },
  { value: 'Extrapolated' },
  { value: 'Unavailable' },
];

const MONEY_STEPS = [
  { label: 'Any', value: '' },
  { label: '$100K', value: '100000' },
  { label: '$1M', value: '1000000' },
  { label: '$5M', value: '5000000' },
  { label: '$10M', value: '10000000' },
  { label: '$50M', value: '50000000' },
  { label: '$100M', value: '100000000' },
  { label: '$1B', value: '1000000000' },
];

export function LeadFilters({ facets }: { facets: FacetMap }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  /** Every control funnels through here: patch the URL, let the server re-query. */
  const update = React.useCallback(
    (patch: Record<string, string | string[] | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        next.delete(key);
        if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
        if (Array.isArray(value)) next.set(key, value.join(','));
        else next.set(key, value);
      }
      if (!('page' in patch)) next.delete('page'); // any filter change resets paging
      startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [params, pathname, router],
  );

  const list = (key: string) => params.get(key)?.split(',').filter(Boolean) ?? [];
  const val = (key: string) => params.get(key) ?? '';

  // Debounce the search box so typing does not fire a query per keystroke.
  const urlQ = val('q');
  const [q, setQ] = React.useState(urlQ);
  const [syncedQ, setSyncedQ] = React.useState(urlQ);
  if (urlQ !== syncedQ) {
    // The URL changed under us (back button, cleared filters) — adopt it.
    setSyncedQ(urlQ);
    setQ(urlQ);
  }
  React.useEffect(() => {
    if (q === urlQ) return;
    const t = setTimeout(() => update({ q: q || null }), 350);
    return () => clearTimeout(t);
  }, [q, urlQ, update]);

  const toOptions = (key: string): Option[] =>
    (facets[key] ?? []).map((f) => ({ value: f.value, count: f.lead_count }));

  const activeCount = Array.from(params.keys()).filter(
    (k) => !['page', 'perPage', 'sort', 'dir'].includes(k) && params.get(k),
  ).length;

  return (
    <aside className="flex flex-col gap-5" data-pending={pending ? '' : undefined}>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="size-4" />
          Filters
          {activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
        </h2>
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => startTransition(() => router.push(pathname, { scroll: false }))}
          >
            <X className="size-3" /> Clear
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Company, domain, contact..."
          className="h-9 pl-9"
        />
      </div>

      <Field label="Source">
        <MultiSelect
          options={toOptions('source')}
          selected={list('source')}
          onChange={(v) => update({ source: v })}
          placeholder="All sources"
        />
      </Field>

      <Field label="Industry">
        <MultiSelect
          options={toOptions('industry')}
          selected={list('industry')}
          onChange={(v) => update({ industry: v })}
          placeholder="All industries"
        />
      </Field>

      <Field label="Country">
        <MultiSelect
          options={toOptions('country')}
          selected={list('country')}
          onChange={(v) => update({ country: v })}
          placeholder="All countries"
        />
      </Field>

      {(facets.category?.length ?? 0) > 0 && (
        <Field label="Platform">
          <MultiSelect
            options={toOptions('category')}
            selected={list('category')}
            onChange={(v) => update({ category: v })}
            placeholder="All platforms"
          />
        </Field>
      )}

      <Field label="Email quality">
        <MultiSelect
          options={EMAIL_STATUS_OPTIONS}
          selected={list('emailStatus')}
          onChange={(v) => update({ emailStatus: v })}
          placeholder="Any email status"
        />
      </Field>

      <Separator />

      <MoneyRange
        label="Revenue"
        minValue={val('revenueMin')}
        maxValue={val('revenueMax')}
        onChange={(min, max) => update({ revenueMin: min, revenueMax: max })}
      />
      <MoneyRange
        label="Funding"
        minValue={val('fundingMin')}
        maxValue={val('fundingMax')}
        onChange={(min, max) => update({ fundingMin: min, fundingMax: max })}
      />

      <Field label="Employees">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder="Min"
            className="h-9"
            defaultValue={val('employeesMin')}
            onBlur={(e) => update({ employeesMin: e.target.value || null })}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="number"
            min={0}
            placeholder="Max"
            className="h-9"
            defaultValue={val('employeesMax')}
            onBlur={(e) => update({ employeesMax: e.target.value || null })}
          />
        </div>
      </Field>

      <Field label="Monthly visits">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder="Min"
            className="h-9"
            defaultValue={val('visitsMin')}
            onBlur={(e) => update({ visitsMin: e.target.value || null })}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="number"
            min={0}
            placeholder="Max"
            className="h-9"
            defaultValue={val('visitsMax')}
            onBlur={(e) => update({ visitsMax: e.target.value || null })}
          />
        </div>
      </Field>

      <Field label="Min technologies">
        <Input
          type="number"
          min={0}
          placeholder="e.g. 10"
          className="h-9"
          defaultValue={val('techMin')}
          onBlur={(e) => update({ techMin: e.target.value || null })}
        />
      </Field>

      <Field label="Min growth %">
        <Input
          type="number"
          placeholder="e.g. 50"
          className="h-9"
          defaultValue={val('growthMin')}
          onBlur={(e) => update({ growthMin: e.target.value || null })}
        />
      </Field>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Record has</Label>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {HAS_FIELDS.map((f) => {
            const has = list('has');
            const checked = has.includes(f.key);
            return (
              <label key={f.key} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() =>
                    update({ has: checked ? has.filter((h) => h !== f.key) : [...has, f.key] })
                  }
                />
                <span className="truncate">{f.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function MoneyRange({
  label,
  minValue,
  maxValue,
  onChange,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onChange: (min: string | null, max: string | null) => void;
}) {
  const selectClass =
    'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <select
          value={minValue}
          onChange={(e) => onChange(e.target.value || null, maxValue || null)}
          className={selectClass}
          aria-label={`${label} minimum`}
        >
          {MONEY_STEPS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.value ? `${s.label}+` : 'Any min'}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">to</span>
        <select
          value={maxValue}
          onChange={(e) => onChange(minValue || null, e.target.value || null)}
          className={selectClass}
          aria-label={`${label} maximum`}
        >
          {MONEY_STEPS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.value ? `up to ${s.label}` : 'Any max'}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
