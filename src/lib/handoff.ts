/**
 * Marketplace handoff helpers (client-safe, no secrets).
 *
 * Blocket and Facebook Marketplace offer no open listing API and no reliable
 * URL prefill for their create forms. So the "handoff" is deliberately manual:
 * format clean text, copy it, deep-link to the create page, and let the user
 * paste + attach photos. This is by design — see the build brief.
 */

export interface ListingFields {
  title: string;
  description: string;
  category: string;
  condition: string;
  keywords: string[];
  priceSEK: number | null;
}

export type Marketplace = "blocket" | "facebook";

export interface MarketplaceInfo {
  label: string;
  /** Best-effort deep link to the create-listing flow (a public web page). */
  createUrl: string;
  note: string;
}

export const MARKETPLACES: Record<Marketplace, MarketplaceInfo> = {
  blocket: {
    label: "Blocket",
    createUrl: "https://www.blocket.se/annonsera",
    note: "Inget öppet API. Klistra in texten och ladda upp bilderna manuellt.",
  },
  facebook: {
    label: "Facebook Marketplace",
    createUrl: "https://www.facebook.com/marketplace/create/item",
    note: "Inget öppet annons-API. Klistra in texten och ladda upp bilderna manuellt.",
  },
};

export const MARKETPLACE_ORDER: Marketplace[] = ["blocket", "facebook"];

/** The body text a seller pastes into a marketplace's description field. */
export function formatDescription(fields: ListingFields): string {
  const parts: string[] = [];
  if (fields.description.trim()) parts.push(fields.description.trim());

  const meta: string[] = [];
  if (fields.condition.trim()) meta.push(`Skick: ${fields.condition.trim()}`);
  if (fields.priceSEK !== null) meta.push(`Pris: ${fields.priceSEK} kr`);
  if (meta.length > 0) parts.push(meta.join("\n"));

  return parts.join("\n\n");
}

/** Title + description block, for a single copy-all action. */
export function formatFullListing(fields: ListingFields): string {
  const title = fields.title.trim();
  const body = formatDescription(fields);
  return [title, body].filter(Boolean).join("\n\n");
}
