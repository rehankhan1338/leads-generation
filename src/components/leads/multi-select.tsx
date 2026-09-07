'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export type Option = { value: string; count?: number };

/** Searchable multi-select used for industry / country / source facets. */
export function MultiSelect({
  options, selected, onChange, placeholder, emptyText = 'No matches.',
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  emptyText?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9"
        >
          <span className="truncate text-left">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : selected.length === 1 ? (
              selected[0]
            ) : (
              `${selected.length} selected`
            )}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
          <CommandList className="max-h-64">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.value} onSelect={() => toggle(o.value)}>
                  <Check className={cn('mr-2 size-4', selected.includes(o.value) ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1 truncate">{o.value}</span>
                  {o.count != null && (
                    <Badge variant="secondary" className="ml-2 tabular-nums text-[10px]">
                      {o.count.toLocaleString()}
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
