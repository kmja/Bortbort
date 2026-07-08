import "server-only";

import { XMLParser } from "fast-xml-parser";

import {
  getAppCredentials,
  isSandbox,
  pickAppCredentials,
  serviceUrl,
  TRADERA_NS,
  type TraderaAppCredentials,
  type TraderaService,
} from "./config";
import type { TraderaUserAuth } from "./types";

/** Error representing an HTTP-level or SOAP-fault failure from Tradera. */
export class TraderaApiError extends Error {
  readonly httpStatus?: number;
  readonly soapFault?: unknown;
  /** Raw response body, truncated, kept for spike-time debugging. */
  readonly raw?: string;

  constructor(
    message: string,
    details: { httpStatus?: number; soapFault?: unknown; raw?: string } = {},
  ) {
    super(message);
    this.name = "TraderaApiError";
    this.httpStatus = details.httpStatus;
    this.soapFault = details.soapFault;
    this.raw = details.raw?.slice(0, 4000);
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: true,
  trimValues: true,
});

// Some Tradera responses (notably GetCategories) carry their data in XML
// attributes (<Category Id="1" Name="…" />). This variant keeps them, prefixed
// with "@_". Opt in per call via CallOptions.parseAttributes so the default
// attribute-free parsing used everywhere else is unchanged.
const parserWithAttrs = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: true,
  trimValues: true,
});

interface BuildEnvelopeOptions {
  operation: string;
  /** Inner XML placed inside the operation element (already escaped). */
  bodyInnerXml?: string;
  app: TraderaAppCredentials;
  userAuth?: TraderaUserAuth;
  sandbox: boolean;
}

/**
 * Builds a SOAP 1.1 envelope for a Tradera ASMX operation.
 *
 * Header layout (all in the `http://api.tradera.com` namespace):
 *   - AuthenticationHeader: AppId + AppKey (always required)
 *   - ConfigurationHeader:  Sandbox + MaxResultAge
 *   - AuthorizationHeader:  UserId + Token (only for RestrictedService calls)
 */
export function buildEnvelope({
  operation,
  bodyInnerXml,
  app,
  userAuth,
  sandbox,
}: BuildEnvelopeOptions): string {
  const authenticationHeader =
    `<AuthenticationHeader xmlns="${TRADERA_NS}">` +
    `<AppId>${app.appId}</AppId>` +
    `<AppKey>${escapeXml(app.appKey)}</AppKey>` +
    `</AuthenticationHeader>`;

  // Tradera's ConfigurationHeader types Sandbox as an integer (0/1), NOT a bool.
  // Sending "true"/"false" makes the .NET deserializer throw
  // "input string 'false' was not in a correct format" and rejects the whole request.
  const configurationHeader =
    `<ConfigurationHeader xmlns="${TRADERA_NS}">` +
    `<Sandbox>${sandbox ? 1 : 0}</Sandbox>` +
    `</ConfigurationHeader>`;

  const authorizationHeader = userAuth
    ? `<AuthorizationHeader xmlns="${TRADERA_NS}">` +
      `<UserId>${userAuth.userId}</UserId>` +
      `<Token>${escapeXml(userAuth.token)}</Token>` +
      `</AuthorizationHeader>`
    : "";

  const operationBody =
    bodyInnerXml && bodyInnerXml.length > 0
      ? `<${operation} xmlns="${TRADERA_NS}">${bodyInnerXml}</${operation}>`
      : `<${operation} xmlns="${TRADERA_NS}" />`;

  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
    ' xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
    `<soap:Header>${authenticationHeader}${configurationHeader}${authorizationHeader}</soap:Header>` +
    `<soap:Body>${operationBody}</soap:Body>` +
    "</soap:Envelope>"
  );
}

export interface CallOptions {
  service: TraderaService;
  operation: string;
  /** Inner XML for the operation element. Build with {@link xmlElement}. */
  bodyInnerXml?: string;
  /** Per-user authorization, required for RestrictedService operations. */
  userAuth?: TraderaUserAuth;
  /** Override the SOAPAction header. Defaults to `${TRADERA_NS}/${operation}`. */
  soapAction?: string;
  /**
   * Rotate across the app-credential pool for this call. Use only for public
   * read calls — RestrictedService calls must use the primary app the user token
   * belongs to, so leave this false there.
   */
  rotateApp?: boolean;
  /** Keep XML attributes (prefixed "@_") when parsing. Needed for GetCategories. */
  parseAttributes?: boolean;
  /** Abort/timeout signal. */
  signal?: AbortSignal;
}

/** Builds a single XML element with an escaped text value. Omits empty/undefined values. */
export function xmlElement(name: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "";
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

/**
 * Calls a Tradera ASMX operation and returns the parsed `${operation}Response` node.
 * Throws {@link TraderaApiError} on a SOAP fault or HTTP error, and lets
 * TraderaConfigError propagate when credentials are missing.
 */
export async function callTradera<T = unknown>(opts: CallOptions): Promise<T> {
  const app = opts.rotateApp ? pickAppCredentials() : getAppCredentials();
  const envelope = buildEnvelope({
    operation: opts.operation,
    bodyInnerXml: opts.bodyInnerXml,
    app,
    userAuth: opts.userAuth,
    sandbox: isSandbox(),
  });

  const action = opts.soapAction ?? `${TRADERA_NS}/${opts.operation}`;

  let res: Response;
  try {
    res = await fetch(serviceUrl(opts.service), {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${action}"`,
      },
      body: envelope,
      cache: "no-store",
      signal: opts.signal,
    });
  } catch (err) {
    throw new TraderaApiError(
      `Network error calling Tradera ${opts.operation}: ${(err as Error).message}`,
    );
  }

  const text = await res.text();
  return parseSoapResponse(text, res.status, opts.operation, opts.parseAttributes) as T;
}

/**
 * Parses a Tradera ASMX SOAP response: returns the `${operation}Response` node,
 * or throws {@link TraderaApiError} on a SOAP fault or non-2xx status. Pure and
 * testable — kept separate from the network call.
 */
export function parseSoapResponse(
  text: string,
  httpStatus: number,
  operation: string,
  keepAttributes = false,
): unknown {
  const root = asRecord((keepAttributes ? parserWithAttrs : parser).parse(text));
  const envelopeNode = asRecord(root?.Envelope);
  const body = asRecord(envelopeNode?.Body);

  // SOAP fault handling (faults can come back with HTTP 500).
  const fault = body?.Fault;
  if (fault !== undefined) {
    const f = asRecord(fault);
    const reason = asRecord(f?.Reason);
    const message =
      (typeof f?.faultstring === "string" && f.faultstring) ||
      (typeof reason?.Text === "string" && reason.Text) ||
      `Tradera SOAP fault on ${operation}`;
    throw new TraderaApiError(message, {
      soapFault: fault,
      httpStatus,
      raw: text,
    });
  }

  if (httpStatus < 200 || httpStatus >= 300) {
    throw new TraderaApiError(
      `Tradera ${operation} failed with HTTP ${httpStatus}`,
      { httpStatus, raw: text },
    );
  }

  if (!body) {
    throw new TraderaApiError(
      `Could not parse Tradera response for ${operation}`,
      { httpStatus, raw: text },
    );
  }

  return body[`${operation}Response`] ?? body;
}
