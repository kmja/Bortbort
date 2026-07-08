import "server-only";

import { z } from "zod";

import { geminiGenerateJson } from "./client";

const PICK_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    best: {
      type: "INTEGER",
      description: "Numret (1-baserat) på kategorin i listan som passar föremålet bäst.",
    },
    alternates: {
      type: "ARRAY",
      items: { type: "INTEGER" },
      description: "Upp till 3 andra rimliga nummer ur listan, näst bäst först.",
    },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
  },
  required: ["best", "alternates", "confidence"],
};

const PickSchema = z.object({
  best: z.number(),
  alternates: z.array(z.number()),
  confidence: z.enum(["low", "medium", "high"]),
});

export type CategoryPick = z.infer<typeof PickSchema>;

export interface CategoryPickItem {
  title: string;
  description?: string;
  condition?: string;
}

const SYSTEM_PROMPT = `Du matchar begagnade föremål till rätt kategori på Tradera (svensk auktionssajt).

Du får ett föremål och en NUMRERAD lista med kandidatkategorier (fullständiga sökvägar). Välj den kategori som bäst beskriver just detta föremål.

Regler:
- Välj ENDAST bland de givna numren. Hitta inte på egna.
- Välj den mest specifika, korrekta kategorin för föremålet självt – inte en löst besläktad.
- Var uppmärksam på fällor: t.ex. glasögon/solglasögon hör till accessoarer, INTE fordonsdelar, merchandise, hundkläder eller cykeltillbehör om det inte tydligt är en sådan produkt.
- Sätt confidence 'high' bara när en kandidat verkligen passar; annars 'medium'/'low'.`;

/**
 * Rerank: pick the best-fitting Tradera category for an item from a retrieved
 * shortlist of real category paths. Returns 1-based indexes into `candidatePaths`.
 */
export async function pickCategory(
  item: CategoryPickItem,
  candidatePaths: string[],
): Promise<CategoryPick> {
  const list = candidatePaths.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const prompt = [
    `Föremål: ${item.title}`,
    item.condition ? `Skick: ${item.condition}` : "",
    item.description ? `Beskrivning: ${item.description}` : "",
    "",
    "Kandidatkategorier:",
    list,
    "",
    "Vilket nummer passar föremålet bäst? Ge även upp till 3 alternativa nummer och din säkerhet.",
  ]
    .filter(Boolean)
    .join("\n");

  const json = await geminiGenerateJson({
    system: SYSTEM_PROMPT,
    userParts: [{ text: prompt }],
    responseSchema: PICK_RESPONSE_SCHEMA,
    maxOutputTokens: 256,
    temperature: 0.2,
  });
  return PickSchema.parse(json);
}
