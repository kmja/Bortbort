import "server-only";

/** Thrown when the Gemini API key is not configured. */
export class GeminiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiConfigError";
  }
}

/**
 * Model used for identification, batch detection, and valuation. Defaults to the
 * cheap vision-capable Gemini Flash Lite; set GEMINI_MODEL to a larger model
 * (e.g. gemini-3.1-flash / -pro) for higher-quality output at higher cost.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

interface GenerateOptions {
  system: string;
  userParts: GeminiPart[];
  /** OpenAPI-subset schema (uppercase Type enum). Enforced via responseSchema. */
  responseSchema: unknown;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * Calls Gemini generateContent in JSON mode and returns the parsed object.
 *
 * We hit the REST API directly (no SDK dependency). The API key is read from
 * GEMINI_API_KEY on the server only — never exposed to the client. Callers
 * validate the returned shape with their Zod schema.
 */
export async function geminiGenerateJson(opts: GenerateOptions): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiConfigError(
      "GEMINI_API_KEY is not set. Add it to your environment (.env.local) to enable item identification, batching and valuation.",
    );
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: opts.userParts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: opts.responseSchema,
          maxOutputTokens: opts.maxOutputTokens ?? 4096,
          temperature: opts.temperature ?? 0.7,
        },
      }),
      cache: "no-store",
      signal: opts.signal,
    });
  } catch (err) {
    throw new Error(`Nätverksfel vid anrop till Gemini: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini svarade ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
  };

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) {
    const reason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason;
    throw new Error(`Gemini gav inget svar${reason ? ` (${reason})` : ""}.`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini returnerade ogiltig JSON.");
  }
}

// ── Response schemas (OpenAPI subset: uppercase Type, no $ref) ────────────────

const CONFIDENCE = { type: "STRING", enum: ["low", "medium", "high"] };

export const LISTING_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    category: {
      type: "STRING",
      description: "Marknadsplatskategori på svenska, t.ex. 'Hem & Hushåll > Möbler'.",
    },
    title: { type: "STRING", description: "Kort sökbar annonstitel på svenska (~50–60 tecken)." },
    description: { type: "STRING", description: "Säljklar beskrivning på svenska." },
    conditionNotes: { type: "STRING", description: "Kort skickbedömning utifrån fotot." },
    suggestedKeywords: { type: "ARRAY", items: { type: "STRING" } },
    priceGuessSEK: {
      type: "OBJECT",
      properties: { low: { type: "NUMBER" }, high: { type: "NUMBER" } },
      required: ["low", "high"],
    },
    priceConfidence: CONFIDENCE,
    identificationConfidence: CONFIDENCE,
  },
  required: [
    "category",
    "title",
    "description",
    "conditionNotes",
    "suggestedKeywords",
    "priceGuessSEK",
    "priceConfidence",
    "identificationConfidence",
  ],
};

export const MULTI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: { items: { type: "ARRAY", items: LISTING_RESPONSE_SCHEMA } },
  required: ["items"],
};

export const VALUATION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    openingPriceSEK: { type: "NUMBER", description: "Rekommenderat utropspris/startpris i SEK." },
    buyoutPriceSEK: { type: "NUMBER", description: "Rekommenderat Köp nu-pris i SEK." },
    confidence: CONFIDENCE,
    reasoning: { type: "STRING", description: "1–3 meningar på svenska om hur priset härleddes." },
  },
  required: ["openingPriceSEK", "buyoutPriceSEK", "confidence", "reasoning"],
};
