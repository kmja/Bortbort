import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/** Thrown when the Anthropic API key is not configured. */
export class AnthropicConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnthropicConfigError";
  }
}

/** Model used for identification + drafting. Override with ANTHROPIC_MODEL. */
export const DRAFT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

let cached: Anthropic | null = null;

/**
 * Returns a singleton Anthropic client. The SDK reads ANTHROPIC_API_KEY (or
 * ANTHROPIC_AUTH_TOKEN) and an optional ANTHROPIC_BASE_URL from the environment.
 * We pre-check the credential so a missing key surfaces as a clear 400 rather
 * than a constructor throw.
 */
export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new AnthropicConfigError(
      "ANTHROPIC_API_KEY is not set. Add it to your environment (.env.local) to enable item identification and drafting.",
    );
  }
  if (!cached) cached = new Anthropic();
  return cached;
}
