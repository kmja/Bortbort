"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";

interface Category {
  id: number;
  name: string;
  path: string;
  parentId: number | null;
  leaf: boolean;
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
 * Best-effort match of an AI category breadcrumb to a listable (leaf) Tradera
 * category. Weights the most specific segment heaviest. Returns null when
 * nothing matches with reasonable confidence.
 */
function bestCategoryMatch(suggestion: string, leaves: Category[]): Category | null {
  const tokens = normalizeCat(suggestion).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  const leaf = tokens[tokens.length - 1];
  let best: Category | null = null;
  let bestScore = 0;
  for (const c of leaves) {
    const nameTokens = new Set(normalizeCat(c.name).split(" ").filter(Boolean));
    const path = normalizeCat(c.path);
    let score = 0;
    for (const t of tokens) {
      if (nameTokens.has(t)) score += 10;
      else if (path.includes(t)) score += 3;
    }
    if (nameTokens.has(leaf)) score += 15;
    score += Math.min(c.path.split(">").length, 5) * 0.5;
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
  const [parentId, setParentId] = useState<number | null>(null); // current drill level
  const [editing, setEditing] = useState(false);
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

  const byId = useMemo(() => {
    const m = new Map<number, Category>();
    for (const c of categories ?? []) m.set(c.id, c);
    return m;
  }, [categories]);

  // Auto-select the closest leaf from the AI's suggestion, once.
  useEffect(() => {
    if (autoPicked.current || !categories) return;
    if (value) {
      autoPicked.current = true;
      return;
    }
    if (!suggestion?.trim()) return;
    autoPicked.current = true;
    const match = bestCategoryMatch(suggestion, categories.filter((c) => c.leaf));
    if (match) onChange(String(match.id));
  }, [categories, suggestion, value, onChange]);

  const selected = value ? byId.get(Number(value)) : undefined;

  // Search matches listable leaves; otherwise show the children of the current level.
  const q = normalizeCat(query);
  const results = useMemo(() => {
    if (!categories) return [];
    if (q.length >= 2) {
      return categories
        .filter((c) => c.leaf && normalizeCat(c.path).includes(q))
        .slice(0, 40);
    }
    return categories
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [categories, q, parentId]);

  const currentParent = parentId !== null ? byId.get(parentId) : undefined;

  function pick(c: Category) {
    if (c.leaf) {
      onChange(String(c.id));
      setEditing(false);
      setQuery("");
      setParentId(null);
    } else {
      setParentId(c.id);
      setQuery("");
    }
  }

  // ── Collapsed state: show the selected category with a change button ────────
  if (selected && !editing) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{selected.path}</p>
          <p className="text-muted-foreground text-xs">#{selected.id}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-primary shrink-0 text-xs underline"
        >
          Ändra
        </button>
      </div>
    );
  }

  if (!categories && !loadError) {
    return <p className="text-muted-foreground text-sm">Hämtar kategorier…</p>;
  }

  // ── Load failure OR empty list: numeric-only manual id (never free text) ────
  if (loadError || (categories && categories.length === 0)) {
    return (
      <div className="flex flex-col gap-1.5">
        <Input
          inputMode="numeric"
          placeholder="Tradera kategori-id (siffror)"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
          className="max-w-48"
        />
        <p className="text-muted-foreground text-xs">
          Kunde inte hämta kategorilistan från Tradera (0 kategorier). Ange en
          giltig kategori-id (endast siffror) tills listan fungerar.
        </p>
      </div>
    );
  }

  // ── Tree / search picker ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Sök kategori (t.ex. 'solglasögon')"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Breadcrumb + back, only while drilling (not searching) */}
      {q.length < 2 && parentId !== null && (
        <button
          type="button"
          onClick={() => setParentId(currentParent?.parentId ?? null)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {currentParent ? currentParent.path : "Tillbaka"}
        </button>
      )}

      <div className="max-h-64 overflow-auto">
        {results.length === 0 ? (
          <p className="text-muted-foreground px-1 py-2 text-sm">Inga kategorier.</p>
        ) : (
          results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c)}
              className="hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm"
            >
              <span className="min-w-0 flex-1">
                {q.length >= 2 ? (
                  <span className="block truncate">{c.path}</span>
                ) : (
                  c.name
                )}
              </span>
              {c.leaf ? (
                <span className="text-muted-foreground text-xs">välj</span>
              ) : (
                <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
              )}
            </button>
          ))
        )}
      </div>

      {selected && (
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-muted-foreground flex items-center gap-1 self-start text-xs"
        >
          <X className="h-3.5 w-3.5" />
          Behåll {selected.name}
        </button>
      )}
    </div>
  );
}
