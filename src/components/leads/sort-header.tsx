'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/** Column header that toggles sort direction through the URL. */
export function SortHeader({
  field,
  children,
  numeric,
  className,
}: {
  field: string;
  children: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const active = params.get('sort') === field;
  const dir = params.get('dir') === 'asc' ? 'asc' : 'desc';

  const toggle = () => {
    const next = new URLSearchParams(params.toString());
    next.set('sort', field);
    next.set('dir', active && dir === 'desc' ? 'asc' : 'desc');
    next.delete('page');
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown;

  return (
    <TableHead className={cn(numeric && 'text-right', className)}>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          active ? 'text-foreground' : 'text-muted-foreground',
          numeric && 'flex-row-reverse',
        )}
      >
        {children}
        <Icon className={cn('size-3', !active && 'opacity-40')} />
      </button>
    </TableHead>
  );
}
