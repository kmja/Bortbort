/**
 * Marketplace handoff helpers (client-safe, no secrets).
 *
 * Most marketplaces offer no open listing API and no reliable URL prefill for
 * their create forms. So the "handoff" is deliberately manual: format clean
 * text, copy it, deep-link to the create page, and let the user paste + attach
 * photos. This is by design — see the build brief.
 */

export interface ListingFields {
  title: string;
  description: string;
  category: string;
  condition: string;
  keywords: string[];
  priceSEK: number | null;
}

export type Region =
  | "nordic"
  | "europe"
  | "northAmerica"
  | "asiaPacific"
  | "latinAmerica"
  | "global";

export interface RegionInfo {
  label: string;
}

export const REGIONS: Record<Region, RegionInfo> = {
  nordic: { label: "Norden" },
  europe: { label: "Europa" },
  northAmerica: { label: "Nordamerika" },
  asiaPacific: { label: "Asien & Stillahavsregionen" },
  latinAmerica: { label: "Latinamerika" },
  global: { label: "Globalt" },
};

export type Marketplace =
  | "blocket"
  | "finn"
  | "tori"
  | "dba"
  | "facebook"
  | "vinted"
  | "kleinanzeigen"
  | "leboncoin"
  | "wallapop"
  | "subito"
  | "marktplaats"
  | "gumtree"
  | "ebay"
  | "shpock"
  | "willhaben"
  | "depop"
  | "craigslist"
  | "offerup"
  | "mercariUS"
  | "poshmark"
  | "carousell"
  | "mercariJP"
  | "yahooJP"
  | "trademe"
  | "mercadolibre"
  | "olx";

export interface MarketplaceInfo {
  label: string;
  /** Best-effort deep link to the create-listing flow (a public web page). */
  createUrl: string;
  note: string;
  region: Region;
}

export const MARKETPLACES: Record<Marketplace, MarketplaceInfo> = {
  // ── Norden ──────────────────────────────────────────────────────────────
  blocket: {
    label: "Blocket",
    createUrl: "https://www.blocket.se/annonsera",
    note: "Inget öppet API. Klistra in texten och ladda upp bilderna manuellt.",
    region: "nordic",
  },
  finn: {
    label: "Finn.no",
    createUrl: "https://www.finn.no/torget/newad/create",
    note: "Norges största annonssite. Klistra in och ladda upp bilder.",
    region: "nordic",
  },
  tori: {
    label: "Tori.fi",
    createUrl: "https://www.tori.fi/ilmoita",
    note: "Finlands ledande annonssite. Klistra in och ladda upp bilder.",
    region: "nordic",
  },
  dba: {
    label: "DBA.dk",
    createUrl: "https://www.dba.dk/opret-annonce/",
    note: "Danmarks stora begagnatmarknad. Klistra in och ladda upp bilder.",
    region: "nordic",
  },

  // ── Europa ──────────────────────────────────────────────────────────────
  facebook: {
    label: "Facebook Marketplace",
    createUrl: "https://www.facebook.com/marketplace/create/item",
    note: "Inget öppet annons-API. Klistra in texten och ladda upp bilderna manuellt.",
    region: "europe",
  },
  vinted: {
    label: "Vinted",
    createUrl: "https://www.vinted.com/sell",
    note: "Störst i Europa för kläder och accessoarer. Gratis att sälja.",
    region: "europe",
  },
  kleinanzeigen: {
    label: "Kleinanzeigen",
    createUrl: "https://www.kleinanzeigen.de/p-anzeige-aufgeben.html",
    note: "Tysklands ledande annonssajt (fd eBay Kleinanzeigen). Gratis.",
    region: "europe",
  },
  leboncoin: {
    label: "Leboncoin",
    createUrl: "https://www.leboncoin.fr/deposer-une-annonce",
    note: "Frankrikes dominerande annonsplats. Klistra in och ladda upp.",
    region: "europe",
  },
  wallapop: {
    label: "Wallapop",
    createUrl: "https://es.wallapop.com/upload-item",
    note: "Populär i Spanien och södra Europa. Klistra in och ladda upp.",
    region: "europe",
  },
  subito: {
    label: "Subito.it",
    createUrl: "https://www.subito.it/inserisci-annuncio/",
    note: "Italiens största begagnatannonssajt.",
    region: "europe",
  },
  marktplaats: {
    label: "Marktplaats",
    createUrl: "https://www.marktplaats.nl/p/plaatsadvertentie.html",
    note: "Hollands ledande begagnatmarknad.",
    region: "europe",
  },
  gumtree: {
    label: "Gumtree",
    createUrl: "https://www.gumtree.com/p/post-ad.html",
    note: "Populär i Storbritannien och Irland. Gratis lokala annonser.",
    region: "europe",
  },
  ebay: {
    label: "eBay",
    createUrl: "https://www.ebay.com/sell",
    note: "Globalt. Starkast i USA, UK, Australien och Tyskland. Auktion eller fast pris.",
    region: "europe",
  },
  shpock: {
    label: "Shpock",
    createUrl: "https://www.shpock.com/en-gb/create-a-listing",
    note: "Mobilfokuserad annonsapp, stor i UK och Österrike.",
    region: "europe",
  },
  willhaben: {
    label: "Willhaben",
    createUrl: "https://www.willhaben.at/iad/kaufen-und-verkaufen/anzeige-aufgeben/",
    note: "Österrikes dominerande annons- och marknadssajt.",
    region: "europe",
  },
  depop: {
    label: "Depop",
    createUrl: "https://www.depop.com/sell/",
    note: "Mode och vintage för yngre generationer. Störst i UK och USA.",
    region: "europe",
  },

  // ── Nordamerika ─────────────────────────────────────────────────────────
  craigslist: {
    label: "Craigslist",
    createUrl: "https://www.craigslist.org/about/sites",
    note: "Välj stad, sedan 'post to classifieds'. Dominerande i USA och Kanada.",
    region: "northAmerica",
  },
  offerup: {
    label: "OfferUp",
    createUrl: "https://offerup.com/post/",
    note: "Mobilfokuserad begagnatapp, populär i USA.",
    region: "northAmerica",
  },
  mercariUS: {
    label: "Mercari (USA)",
    createUrl: "https://www.mercari.com/sell/",
    note: "Japansk app med stark närvaro i USA. Enkel att sälja på.",
    region: "northAmerica",
  },
  poshmark: {
    label: "Poshmark",
    createUrl: "https://poshmark.com/create-listing",
    note: "Mode och accessoarer, populär i USA och Kanada.",
    region: "northAmerica",
  },

  // ── Asien & Stillahavsregionen ───────────────────────────────────────────
  carousell: {
    label: "Carousell",
    createUrl: "https://www.carousell.sg/sell/",
    note: "Populär i Singapore, Hongkong, Malaysia och Filippinerna.",
    region: "asiaPacific",
  },
  mercariJP: {
    label: "Mercari (Japan)",
    createUrl: "https://jp.mercari.com/sell/",
    note: "Japans ledande begagnat-app. Mycket stor volym.",
    region: "asiaPacific",
  },
  yahooJP: {
    label: "Yahoo! Auctions Japan",
    createUrl: "https://auctions.yahoo.co.jp/",
    note: "Japans största auktionsplattform. Logga in och välj 'Sälj'.",
    region: "asiaPacific",
  },
  trademe: {
    label: "Trade Me",
    createUrl: "https://www.trademe.co.nz/a/marketplace/auction/list",
    note: "Nya Zeelands dominerande marknadsplats för köp och sälj.",
    region: "asiaPacific",
  },

  // ── Latinamerika ─────────────────────────────────────────────────────────
  mercadolibre: {
    label: "MercadoLibre",
    createUrl: "https://vender.mercadolibre.com/",
    note: "Latinamerikas ledande e-handels- och begagnatplattform.",
    region: "latinAmerica",
  },

  // ── Globalt ──────────────────────────────────────────────────────────────
  olx: {
    label: "OLX",
    createUrl: "https://www.olx.com/",
    note: "Aktiv i Indien, Östeuropa, Afrika och Latinamerika. Välj land på sajten.",
    region: "global",
  },
};

const REGION_ORDER: Region[] = [
  "nordic",
  "europe",
  "northAmerica",
  "asiaPacific",
  "latinAmerica",
  "global",
];

export const MARKETPLACE_ORDER: Marketplace[] = [
  "blocket", "finn", "tori", "dba",
  "facebook", "vinted", "kleinanzeigen", "leboncoin", "wallapop", "subito",
  "marktplaats", "gumtree", "ebay", "shpock", "willhaben", "depop",
  "craigslist", "offerup", "mercariUS", "poshmark",
  "carousell", "mercariJP", "yahooJP", "trademe",
  "mercadolibre",
  "olx",
];

/** Marketplaces grouped by region in display order. */
export function marketplacesByRegion(): Array<{
  region: Region;
  label: string;
  marketplaces: Marketplace[];
}> {
  return REGION_ORDER.map((region) => ({
    region,
    label: REGIONS[region].label,
    marketplaces: MARKETPLACE_ORDER.filter(
      (key) => MARKETPLACES[key].region === region,
    ),
  }));
}

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
