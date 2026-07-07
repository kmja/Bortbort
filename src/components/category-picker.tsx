"use client";

import { useEffect, useRef, useState } from "react";

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
  /** AI category breadcrumb (e.g. "Hem & Hushåll > Möbler") to auto-select on load. */
  suggestion?: string;
}

function normalizeCat(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics so å/ä/ö compare cleanly
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best-effort match of an AI category breadcrumb to a Tradera category.
 * Weights the most specific (leaf) segment heaviest and nudges toward deeper
 * categories. Returns null when nothing matches with reasonable confidence.
 */
function bestCategoryMatch(suggestion: string, cats: Category[]): Category | null {
  const tokens = normalizeCat(suggestion).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  const leaf = tokens[tokens.length - 1];
  let best: Category | null = null;
  let bestScore = 0;
  for (const c of cats) {
    const nameTokens = new Set(normalizeCat(c.name).split(" ").filter(Boolean));
    const path = normalizeCat(c.path);
    let score = 0;
    for (const t of tokens) {
      if (nameTokens.has(t)) score += 10;
      else if (path.includes(t)) score += 3;
    }
    if (nameTokens.has(leaf)) score += 15; // AI's most specific segment == this category
    score += Math.min(c.path.split(">").length, 5) * 0.5; // prefer specific over general
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= 13 ? best : null;
}

export function CategoryPicker({ value, onChange, suggestion }: CategoryPickerProps) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const autoPicked = useRef(false);

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

  // Auto-select the closest category from the AI's suggestion, once, if the user
  // hasn't already chosen one. Waits until both categories and a suggestion exist.
  useEffect(() => {
    if (autoPicked.current || !categories) return;
    if (value) {
      autoPicked.current = true; // already chosen (manual or restored) — don't override
      return;
    }
    if (!suggestion?.trim()) return;
    autoPicked.current = true;
    const match = bestCategoryMatch(suggestion, categories);
    if (match) onChange(String(match.id));
  }, [categories, suggestion, value, onChange]);

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
