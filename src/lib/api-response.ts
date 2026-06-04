import "server-only";

import { NextResponse } from "next/server";

import { TraderaConfigError } from "@/lib/tradera/config";
import { TraderaApiError } from "@/lib/tradera/soap";

/**
 * Maps thrown errors to structured JSON responses for the API routes.
 * During the spike we deliberately surface the SOAP fault and HTTP status so the
 * cause of any failure is visible in the UI and can be iterated on quickly.
 */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof TraderaConfigError) {
    return NextResponse.json(
      { ok: false, kind: "config", error: err.message },
      { status: 400 },
    );
  }

  if (err instanceof TraderaApiError) {
    return NextResponse.json(
      {
        ok: false,
        kind: "tradera",
        error: err.message,
        httpStatus: err.httpStatus ?? null,
        soapFault: err.soapFault ?? null,
      },
      { status: 502 },
    );
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json(
    { ok: false, kind: "unknown", error: message },
    { status: 500 },
  );
}
