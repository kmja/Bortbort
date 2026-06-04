"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

interface Category {
  id: number;
  name: string;
  path: string;
}

interface CategoryPickerProps {
  /** Selected category id, as a string (the source of truth lives in the parent). */
  value: string;
  onChange: (id: string) => void;
}

export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/tradera/categories", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.ok && Array.isArray(d.categories)) setCategories(d.categories);
        else setLoadError(true);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const selected = categories?.find((c) => String(c.id) === value);
  const results =
    query.trim().length >= 2 && categories
      ? categories
          .filter((c) => c.path.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 25)
      : [];

  return (
    <div className="flex flex-col gap-2">
      {categories && (
        <div className="relative">
          <Input
            placeholder="Sök kategori (t.ex. 'fåtölj')"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
          {open && results.length > 0 && (
            <div className="bg-popover absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border p-1 shadow-md">
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="hover:bg-accent flex w-full flex-col items-start rounded px-2 py-1 text-left text-sm"
                  onClick={() => {
                    onChange(String(c.id));
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <span>{c.path}</span>
                  <span className="text-muted-foreground text-xs">#{c.id}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          inputMode="numeric"
          placeholder="Kategori-id"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-40"
        />
        {selected && (
          <span className="text-muted-foreground text-xs">{selected.path}</span>
        )}
      </div>

      {loadError && (
        <p className="text-muted-foreground text-xs">
          Kunde inte hämta kategorilistan (kräver app-nyckel + nätverk till
          Tradera). Ange kategori-id manuellt.
        </p>
      )}
    </div>
  );
}
