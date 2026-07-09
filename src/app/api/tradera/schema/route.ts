import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Diagnostic: reads the sample SOAP request + response off Tradera's ASMX op
 * pages so we can see the exact structure of a method (params + result shape)
 * before building against it.
 */
const OPS: Array<{ service: string; op: string }> = [
  { service: "PublicService", op: "GetAttributeDefinitions" },
  { service: "PublicService", op: "GetItemFieldValues" },
];

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function bodyOf(pre: string): string {
  return (pre.match(/<soap:Body>([\s\S]*?)<\/soap:Body>/i)?.[1] ?? pre).trim();
}

export async function GET() {
  const out: Record<string, { request?: string; response?: string } | string> = {};
  await Promise.all(
    OPS.map(async ({ service, op }) => {
      try {
        const res = await fetch(`https://api.tradera.com/v3/${service}.asmx?op=${op}`, {
          cache: "no-store",
        });
        const html = await res.text();
        const soapPres = [...html.matchAll(/<pre>([\s\S]*?)<\/pre>/g)]
          .map((m) => decode(m[1]))
          .filter((p) => /soap:Body/i.test(p) && /Envelope/i.test(p));
        const request = soapPres.find((p) => new RegExp(`<${op}[ >]`).test(p));
        const response = soapPres.find((p) => new RegExp(`<${op}Response`).test(p));
        out[op] = {
          request: request ? bodyOf(request).slice(0, 1200) : "not found",
          response: response ? bodyOf(response).slice(0, 2000) : "not found",
        };
      } catch (e) {
        out[op] = e instanceof Error ? e.message : String(e);
      }
    }),
  );
  return NextResponse.json({ ok: true, ...out });
}
