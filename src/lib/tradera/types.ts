/**
 * Types for the Tradera integration.
 *
 * These are intentionally narrow and cover only what the spike needs. Field names
 * marked `VERIFY` should be checked against the live WSDL before relying on them:
 *   https://api.tradera.com/v3/restrictedservice.asmx?WSDL
 *   https://api.tradera.com/v3/publicservice.asmx?WSDL
 */

/** Per-user authorization obtained via the token-login flow. */
export interface TraderaUserAuth {
  userId: number;
  token: string;
  /** ISO timestamp when the token hard-expires, if known. */
  expiresAt?: string;
}

/** Result of PublicService.FetchToken. */
export interface FetchTokenResult {
  token: string;
  /** Hard expiration time as returned by Tradera (ISO 8601). */
  hardExpirationTime?: string;
}

/**
 * Minimal shape for creating an auction item via RestrictedService.AddItem.
 *
 * VERIFY all field names and which are required against the AddItem docs:
 *   https://api.tradera.com/v3/documentation/static.aspx?page=AddItem
 */
export interface AddItemRequest {
  title: string;
  description: string;
  /** Tradera category id. Use PublicService.GetCategories to discover valid ids. */
  categoryId: number;
  /** Item type id (PublicService.GetItemTypes). 1 = Auktion (auction). Required. */
  itemType?: number;
  /** Auction length in days (Tradera supports a fixed set, e.g. 3/7/10/14). */
  durationDays: number;
  /** Number of automatic restarts if the item does not sell. */
  restarts: number;
  /** Starting price in SEK. */
  startPrice: number;
  /** Reserve price in SEK (0 = none). */
  reservePrice?: number;
  /** Buy-It-Now price in SEK (0 = none). */
  buyItNowPrice?: number;
  /** Who may bid: 1 = Sweden, 3 = International, 4 = EU. Required (0 is invalid). */
  acceptedBidderId?: number;
  /** Payment option ids (PublicService.GetPaymentOptions). */
  paymentOptionIds?: number[];
  /** Shipping options: { shippingOptionId, cost }. At least one is required. */
  shippingOptions?: Array<{ shippingOptionId: number; cost: number }>;
  /** Free-text shipping terms shown to buyers. */
  shippingCondition?: string;
  /** Free-text payment terms shown to buyers. */
  paymentCondition?: string;
  /** Item condition / attributes. VERIFY accepted values. */
  itemAttributes?: number[];
  /**
   * If false, the item is staged and you must call AddItemImage then AddItemCommit.
   * For a simple text-only test listing leave this true.
   */
  autoCommit?: boolean;
  /** Two-letter language for the listing, e.g. "sv". */
  vat?: number;
}

/** Result returned by AddItem (async accept). */
export interface AddItemResult {
  /** Request id / item id assigned by Tradera. Shape VERIFY. */
  requestId?: string | number;
  itemId?: string | number;
  /** The raw, parsed response node for debugging during the spike. */
  raw: unknown;
}
