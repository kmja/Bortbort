import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Diagnostic: reads the sample SOAP request off Tradera's ASMX op pages so we
 * can see the exact element structure of write methods before building them.
 */
const OPS: Array<{ service: string; op: string }> = [
  { service: "RestrictedService", op: "EndItem" },
  { service: "RestrictedService", op: "SetPricesOnNonShopItems" },
];

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export async function GET() {
  const out: Record<string, string> = {};
  await Promise.all(
    OPS.map(async ({ service, op }) => {
      try {
        const res = await fetch(`https://api.tradera.com/v3/${service}.asmx?op=${op}`, {
          cache: "no-store",
        });
        const html = await res.text();
        const pres = [...html.matchAll(/<pre>([\s\S]*?)<\/pre>/g)].map((m) => decode(m[1]));
        const soapReq = pres.find((p) => /soap:Body/i.test(p) && /Envelope/i.test(p));
        // Return just the <soap:Body>…</soap:Body> inner, truncated.
        const body = soapReq?.match(/<soap:Body>([\s\S]*?)<\/soap:Body>/i)?.[1] ?? soapReq ?? "not found";
        out[op] = body.trim().slice(0, 1400);
      } catch (e) {
        out[op] = e instanceof Error ? e.message : String(e);
      }
    }),
  );
  return NextResponse.json({ ok: true, ...out });
}
