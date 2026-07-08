import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Diagnostic: reads the operation list off Tradera's ASMX service pages so we can
 * see which real methods exist for editing / ending / imaging a listing before
 * building against them. Runs server-side (Vercel can reach api.tradera.com).
 */
const SERVICES = ["ListingService", "RestrictedService", "PublicService"];

export async function GET() {
  const out: Record<string, string[] | string> = {};
  await Promise.all(
    SERVICES.map(async (s) => {
      try {
        const res = await fetch(`https://api.tradera.com/v3/${s}.asmx`, { cache: "no-store" });
        if (!res.ok) {
          out[s] = `HTTP ${res.status}`;
          return;
        }
        const html = await res.text();
        const ops = [...new Set([...html.matchAll(/[?&]op=([A-Za-z0-9_]+)/g)].map((m) => m[1]))].sort();
        out[s] = ops.length > 0 ? ops : "no operations found";
      } catch (e) {
        out[s] = e instanceof Error ? e.message : String(e);
      }
    }),
  );
  return NextResponse.json({ ok: true, ...out });
}
