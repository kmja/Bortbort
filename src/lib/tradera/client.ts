import "server-only";

import {
  getAppCredentials,
  getPublicKey,
  TRADERA_TOKEN_LOGIN_URL,
} from "./config";
import { callTradera, xmlElement } from "./soap";
import type {
  AddItemRequest,
  AddItemResult,
  FetchTokenResult,
  TraderaUserAuth,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * PublicService.GetOfficialTime — the canonical "first call".
 *
 * Requires only app-level credentials (no user token), so it's the cleanest way
 * to prove that TRADERA_APP_ID / TRADERA_APP_KEY are accepted by the API.
 */
export async function getOfficialTime(signal?: AbortSignal): Promise<string> {
  const res = await callTradera<Record<string, unknown>>({
    service: "public",
    operation: "GetOfficialTime",
    rotateApp: true,
    signal,
  });
  const value = res?.GetOfficialTimeResult;
  return value === undefined || value === null ? "" : String(value);
}

/**
 * Builds the URL the user is redirected to in order to authorize this app.
 * The base path (/token-login) and params (appId/pkey/skey) are confirmed from
 * the Tradera developer portal's generated "Authorization URL". The Accept/Reject
 * Return URLs are configured in the portal (not passed here); after the user
 * approves, Tradera redirects to the Accept Return URL.
 */
export function getTokenLoginUrl(secretKey: string): string {
  const { appId } = getAppCredentials();
  const params = new URLSearchParams({
    appId: String(appId),
    pkey: getPublicKey(),
    skey: secretKey,
  });
  return `${TRADERA_TOKEN_LOGIN_URL}?${params.toString()}`;
}

/**
 * PublicService.FetchToken — exchanges (userId, secretKey) for a user token after
 * the user has authorized the app via {@link getTokenLoginUrl}.
 *
 * VERIFY parameter names and result shape against the live WSDL.
 */
export async function fetchToken(
  userId: number,
  secretKey: string,
  signal?: AbortSignal,
): Promise<FetchTokenResult> {
  const res = await callTradera<Record<string, unknown>>({
    service: "public",
    operation: "FetchToken",
    bodyInnerXml: xmlElement("userId", userId) + xmlElement("secretKey", secretKey),
    signal,
  });

  const result = asRecord(res?.FetchTokenResult) ?? asRecord(res);
  const token =
    (typeof result?.AuthToken === "string" && result.AuthToken) ||
    (typeof result?.Token === "string" && result.Token) ||
    "";
  const hardExpirationTime =
    typeof result?.HardExpirationTime === "string"
      ? result.HardExpirationTime
      : undefined;

  if (!token) {
    throw new Error(
      "FetchToken returned no token. Verify the user authorized the app and that the FetchToken result shape matches the live WSDL.",
    );
  }
  return { token, hardExpirationTime };
}

function arrayElement(wrapper: string, item: string, values: number[]): string {
  if (values.length === 0) return "";
  return `<${wrapper}>${values.map((v) => `<${item}>${v}</${item}>`).join("")}</${wrapper}>`;
}

/**
 * RestrictedService.AddItem — creates a new auction item on the user's behalf.
 * This is an async accept: Tradera validates, then queues the item for creation.
 *
 * VERIFY every field name, the request wrapper element name, and which fields are
 * required against the AddItem docs and the WSDL before trusting this in production:
 *   https://api.tradera.com/v3/documentation/static.aspx?page=AddItem
 */
export async function addItem(
  req: AddItemRequest,
  userAuth: TraderaUserAuth,
  signal?: AbortSignal,
): Promise<AddItemResult> {
  const shippingXml =
    req.shippingOptions && req.shippingOptions.length > 0
      ? `<ShippingOptions>${req.shippingOptions
          .map(
            (s) =>
              `<ItemShipping><ShippingOptionId>${s.shippingOptionId}</ShippingOptionId><Cost>${s.cost}</Cost></ItemShipping>`,
          )
          .join("")}</ShippingOptions>`
      : "";

  const itemXml =
    xmlElement("Title", req.title) +
    xmlElement("Description", req.description) +
    xmlElement("CategoryId", req.categoryId) +
    xmlElement("Duration", req.durationDays) +
    xmlElement("Restarts", req.restarts) +
    xmlElement("StartPrice", req.startPrice) +
    xmlElement("ReservePrice", req.reservePrice ?? 0) +
    xmlElement("BuyItNowPrice", req.buyItNowPrice ?? 0) +
    xmlElement("AutoCommit", (req.autoCommit ?? true) ? "true" : "false") +
    xmlElement("VAT", req.vat) +
    arrayElement("PaymentOptionIds", "int", req.paymentOptionIds ?? []) +
    arrayElement("ItemAttributes", "int", req.itemAttributes ?? []) +
    shippingXml;

  // VERIFY: the AddItem parameter is named `itemRequest` in many references.
  const res = await callTradera<Record<string, unknown>>({
    service: "restricted",
    operation: "AddItem",
    bodyInnerXml: `<itemRequest>${itemXml}</itemRequest>`,
    userAuth,
    signal,
  });

  const result = asRecord(res?.AddItemResult) ?? asRecord(res);
  const requestId =
    (typeof result?.RequestId === "string" && result.RequestId) ||
    (typeof result?.RequestId === "number" && result.RequestId) ||
    undefined;
  const itemId =
    (typeof result?.ItemId === "string" && result.ItemId) ||
    (typeof result?.ItemId === "number" && result.ItemId) ||
    undefined;

  return { requestId, itemId, raw: res };
}

/**
 * A single, deliberately cheap, clearly-labelled test listing for the auth spike.
 * Keep it sandbox-only. Set TRADERA_TEST_CATEGORY_ID to a valid sandbox category id.
 */
export function buildTestListingRequest(): AddItemRequest {
  return {
    title: "TESTANNONS – ignorera (Loppis Helper API-spike)",
    description:
      "Detta är en automatiskt skapad testannons för att verifiera Tradera-API:t " +
      "under utveckling av Loppis Helper. Den ska inte köpas och kommer att tas bort.",
    categoryId: Number(process.env.TRADERA_TEST_CATEGORY_ID ?? 0),
    durationDays: 7,
    restarts: 0,
    startPrice: 10,
    reservePrice: 0,
    buyItNowPrice: 0,
    autoCommit: true,
  };
}
