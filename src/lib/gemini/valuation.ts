import "server-only";

import { z } from "zod";

import type { PriceStats } from "@/lib/tradera/pricing";
import { geminiGenerateJson, VALUATION_RESPONSE_SCHEMA } from "./client";

/** A well-reasoned valuation: an opening (start) price and a buyout (Köp nu). */
export const ValuationSchema = z.object({
  openingPriceSEK: z.number(),
  buyoutPriceSEK: z.number(),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning: z.string(),
});

export type Valuation = z.infer<typeof ValuationSchema>;

export interface ValuationInput {
  title: string;
  keywords?: string;
  condition?: string;
  description?: string;
  /** Realized (sold) comparables — the ground truth when present. */
  sold: PriceStats;
  /** Active (asking) comparables — a weaker, upward-biased signal. */
  active: PriceStats;
}

const SYSTEM_PROMPT = `Du är en expert på prissättning av begagnade föremål på Tradera (svensk auktionssajt).

Du får statistik över jämförbara föremål och ska rekommendera två priser:
- openingPriceSEK: utropspris/startpris. På auktion sätts det ofta lägre än förväntat slutpris för att locka bud och skapa budgivning.
- buyoutPriceSEK: "Köp nu"-pris. Sätts nära eller strax över toppen av vad liknande föremål faktiskt SÅLTS för.

Datakällor och hur du viktar dem:
1. Slutpriser (sold) = vad föremål FAKTISKT sålts för. Detta är sanningen – vikta tyngst.
2. Utropspriser (active) = vad säljare BEGÄR just nu. Ligger typiskt 15–35 % över faktiska slutpriser. Använd bara som stöd och räkna ner.

Riktlinjer:
- Har du gott om slutpriser: sätt confidence 'medium'/'high' och basera priserna på dem (t.ex. utrop nära median, Köp nu nära p75).
- Har du bara utropspriser: räkna ner ~20–30 %, sätt confidence 'low' och var tydlig i reasoning.
- Har du ingen jämförelsedata alls: gör en grov uppskattning från föremålet självt, confidence 'low'.
- buyoutPriceSEK ska alltid vara ≥ openingPriceSEK. Runda till rimliga belopp (t.ex. närmaste 10-tal).
- reasoning ska vara kort och på svenska.`;

function statsLine(label: string, s: PriceStats): string {
  if (s.count === 0) return `${label}: inga träffar.`;
  return `${label}: ${s.count} st, median ${s.median} kr, p25 ${s.p25} kr, p75 ${s.p75} kr. Exempel (kr): ${s.sample.join(", ")}.`;
}

function buildPrompt(input: ValuationInput): string {
  return [
    `Föremål: ${input.title}`,
    input.condition ? `Skick: ${input.condition}` : "",
    input.keywords ? `Sökord: ${input.keywords}` : "",
    input.description ? `Beskrivning: ${input.description}` : "",
    "",
    statsLine("Slutpriser (sålda, verkliga)", input.sold),
    statsLine("Utropspriser (aktiva annonser)", input.active),
    "",
    "Rekommendera utropspris och Köp nu-pris enligt riktlinjerna.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Produces an opening + buyout recommendation from comparable-price statistics. */
export async function valuateItem(input: ValuationInput): Promise<Valuation> {
  const json = await geminiGenerateJson({
    system: SYSTEM_PROMPT,
    userParts: [{ text: buildPrompt(input) }],
    responseSchema: VALUATION_RESPONSE_SCHEMA,
    maxOutputTokens: 1024,
    temperature: 0.4,
  });

  const v = ValuationSchema.parse(json);
  // Guard the invariant the model is told to keep.
  if (v.buyoutPriceSEK < v.openingPriceSEK) {
    v.buyoutPriceSEK = v.openingPriceSEK;
  }
  return v;
}
