import "server-only";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { DRAFT_MODEL, getAnthropicClient } from "./client";

/** Supported inbound image formats (matches the Anthropic vision API). */
export const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

/**
 * Structured listing draft the model returns. Kept free of JSON-schema features
 * that structured outputs don't support (no min/max, no string length limits).
 */
export const ListingDraftSchema = z.object({
  category: z
    .string()
    .describe("Lämplig marknadsplatskategori på svenska, t.ex. 'Hem & Hushåll > Möbler'."),
  title: z
    .string()
    .describe("Kort, sökbar annonstitel på svenska (sikta på ~50–60 tecken)."),
  description: z
    .string()
    .describe(
      "Säljklar beskrivning på svenska: vad det är, märke/modell om känt, skick, mått/detaljer.",
    ),
  conditionNotes: z
    .string()
    .describe("Kort skickbedömning utifrån synliga ledtrådar på fotot."),
  suggestedKeywords: z
    .array(z.string())
    .describe("Sökord köpare kan tänkas använda."),
  priceGuessSEK: z
    .object({
      low: z.number().describe("Lågt spann i SEK."),
      high: z.number().describe("Högt spann i SEK."),
    })
    .describe(
      "GROV prisgissning utan marknadsdata. Riktiga priser hämtas senare från sålda Tradera-annonser.",
    ),
  priceConfidence: z
    .enum(["low", "medium", "high"])
    .describe("Hur säker prisgissningen är. Utan jämförbara sålda annonser: 'low'."),
  identificationConfidence: z
    .enum(["low", "medium", "high"])
    .describe("Hur säker identifieringen av föremålet är."),
});

export type ListingDraft = z.infer<typeof ListingDraftSchema>;

/** Multiple distinct items detected in a single photo. */
export const MultiListingDraftSchema = z.object({
  items: z
    .array(ListingDraftSchema)
    .describe("Ett utkast per distinkt säljbart föremål i bilden."),
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
3. Skriv ett säljklart annonsutkast på naturlig, säljande men ärlig svenska.

Riktlinjer:
- Var ärlig om osäkerhet. Hitta inte på märken, modeller eller skick du inte kan se.
- Prisgissningen är en GROV uppskattning UTAN marknadsdata. Sätt priceConfidence till 'low' om du saknar säkra jämförelsepunkter – riktiga priser hämtas senare från sålda Tradera-annonser.
- Allt säljartext-innehåll (titel, beskrivning, kategori, sökord) ska vara på svenska.`;

/**
 * Identifies the item in the photo and returns a structured Swedish listing draft.
 *
 * Uses structured outputs (zod) with a cache breakpoint on the stable system
 * prompt. Thinking and the `effort` parameter are intentionally omitted so the
 * same request is valid on the cheapest model (Haiku 4.5, which rejects
 * `effort`) as well as Sonnet/Opus — the JSON schema does the heavy lifting.
 */
export async function identifyAndDraft(input: IdentifyInput): Promise<ListingDraft> {
  const client = getAnthropicClient();

  const message = await client.messages.parse({
    model: DRAFT_MODEL,
    max_tokens: 2000,
    output_config: {
      format: zodOutputFormat(ListingDraftSchema),
    },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.mediaType,
              data: input.imageBase64,
            },
          },
          {
            type: "text",
            text: input.hint
              ? `Säljarens ledtråd: ${input.hint}\n\nIdentifiera föremålet och skapa ett säljutkast.`
              : "Identifiera föremålet på bilden och skapa ett säljutkast.",
          },
        ],
      },
    ],
  });

  if (!message.parsed_output) {
    throw new Error("Modellen kunde inte skapa ett strukturerat utkast.");
  }
  return message.parsed_output;
}

const MULTI_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

VIKTIGT: Bilden kan innehålla FLERA olika prylar (t.ex. ett bord fullt av loppisfynd). Identifiera VARJE distinkt säljbart föremål för sig och returnera ett separat utkast per föremål i "items". Slå inte ihop olika prylar till en annons. Om det tydligt bara finns ett föremål, returnera ett enda utkast. Hoppa över ointressanta bakgrundsföremål.`;

/**
 * Identifies EVERY distinct sellable item in one photo and returns a draft for
 * each. Used by the "photograph a whole pile" batch flow.
 */
export async function identifyMultiple(input: IdentifyInput): Promise<MultiListingDraft> {
  const client = getAnthropicClient();

  const message = await client.messages.parse({
    model: DRAFT_MODEL,
    max_tokens: 4000,
    output_config: { format: zodOutputFormat(MultiListingDraftSchema) },
    system: [
      { type: "text", text: MULTI_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.mediaType,
              data: input.imageBase64,
            },
          },
          {
            type: "text",
            text: input.hint
              ? `Säljarens ledtråd: ${input.hint}\n\nIdentifiera varje separat pryl i bilden och skapa ett utkast per pryl.`
              : "Identifiera varje separat pryl i bilden och skapa ett utkast per pryl.",
          },
        ],
      },
    ],
  });

  if (!message.parsed_output) {
    throw new Error("Modellen kunde inte identifiera föremålen.");
  }
  return message.parsed_output;
}
