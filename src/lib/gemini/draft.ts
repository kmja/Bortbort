import "server-only";

import { z } from "zod";

import {
  geminiGenerateJson,
  LISTING_RESPONSE_SCHEMA,
  MULTI_RESPONSE_SCHEMA,
  type GeminiPart,
} from "./client";

/** Supported inbound image formats (matches the Gemini vision API). */
export const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

/** Structured listing draft, used to validate Gemini's JSON output. */
export const ListingDraftSchema = z.object({
  category: z.string(),
  title: z.string(),
  descriptions: z.object({
    selling: z.string(),
    factual: z.string(),
    short: z.string(),
  }),
  conditionNotes: z.string(),
  suggestedKeywords: z.array(z.string()),
  priceGuessSEK: z.object({ low: z.number(), high: z.number() }),
  priceConfidence: z.enum(["low", "medium", "high"]),
  identificationConfidence: z.enum(["low", "medium", "high"]),
});

export type ListingDraft = z.infer<typeof ListingDraftSchema>;

/** Multiple distinct items detected in a single photo. */
export const MultiListingDraftSchema = z.object({
  items: z.array(ListingDraftSchema),
});

export type MultiListingDraft = z.infer<typeof MultiListingDraftSchema>;

export interface IdentifyInput {
  /** Base64-encoded image data (no data: URL prefix). */
  imageBase64: string;
  mediaType: SupportedImageType;
  /** Optional free-text hint from the seller (brand, model, condition…). */
  hint?: string;
}

const SYSTEM_PROMPT = `Du är expert på att sälja begagnade prylar på svenska andrahandsmarknader (Tradera, Blocket, Facebook Marketplace).

Givet ett foto av en pryl:
1. Identifiera vad det är – kategori, och om möjligt märke och modell.
2. Bedöm skicket utifrån synliga ledtrådar (slitage, skador, kompletthet).
3. Skriv annonstext på naturlig svenska.

PERSPEKTIV (viktigt): Skriv ALLTID som SÄLJAREN som säljer sin egen pryl – i första person. Skriv ALDRIG som en observatör som beskriver ett foto. Undvik fraser som "koppen verkar vara i gott skick", "på bilden syns", "det ser ut som". Skriv istället t.ex. "Säljer en fin kaffekopp i gott skick".

Ge tre olika beskrivningar i "descriptions":
- selling: säljande och personlig – lockar köpare, men ärlig.
- factual: saklig och objektiv – bara fakta (märke, modell, mått, material, skick). Inga säljfraser.
- short: kort och koncis, 1–2 meningar.

Riktlinjer:
- Var ärlig om osäkerhet. Hitta inte på märken, modeller eller skick du inte kan se.
- Prisgissningen är en GROV uppskattning UTAN marknadsdata. Sätt priceConfidence till 'low' om du saknar säkra jämförelsepunkter – riktiga priser hämtas senare från sålda Tradera-annonser.
- Allt innehåll (titel, beskrivningar, kategori, sökord) ska vara på svenska.`;

const MULTI_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

VIKTIGT: Bilden kan innehålla FLERA olika prylar (t.ex. ett bord fullt av loppisfynd). Identifiera VARJE distinkt säljbart föremål för sig och returnera ett separat utkast per föremål i "items". Slå inte ihop olika prylar till en annons. Om det tydligt bara finns ett föremål, returnera ett enda utkast. Hoppa över ointressanta bakgrundsföremål.`;

function imageParts(input: IdentifyInput, instruction: string): GeminiPart[] {
  return [
    { inlineData: { mimeType: input.mediaType, data: input.imageBase64 } },
    {
      text: input.hint
        ? `Säljarens ledtråd: ${input.hint}\n\n${instruction}`
        : instruction,
    },
  ];
}

/** Identifies the item in the photo and returns a structured Swedish listing draft. */
export async function identifyAndDraft(input: IdentifyInput): Promise<ListingDraft> {
  const json = await geminiGenerateJson({
    system: SYSTEM_PROMPT,
    userParts: imageParts(input, "Identifiera föremålet på bilden och skapa ett säljutkast."),
    responseSchema: LISTING_RESPONSE_SCHEMA,
    maxOutputTokens: 2048,
  });
  return ListingDraftSchema.parse(json);
}

/** Identifies EVERY distinct sellable item in one photo and returns a draft for each. */
export async function identifyMultiple(input: IdentifyInput): Promise<MultiListingDraft> {
  const json = await geminiGenerateJson({
    system: MULTI_SYSTEM_PROMPT,
    userParts: imageParts(
      input,
      "Identifiera varje separat pryl i bilden och skapa ett utkast per pryl.",
    ),
    responseSchema: MULTI_RESPONSE_SCHEMA,
    maxOutputTokens: 8192,
  });
  return MultiListingDraftSchema.parse(json);
}
