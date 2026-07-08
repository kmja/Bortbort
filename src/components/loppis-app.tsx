"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, ExternalLink, Plus, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { CategoryPicker } from "@/components/category-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APP_COMMIT, VERSION_LABEL } from "@/lib/version";

// ── Types ────────────────────────────────────────────────────────────────────

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type AppState = "camera" | "analyzing" | "draft" | "batch" | "listings";
type Busy = "value" | "ping" | "listing" | "publish" | null;

interface SellerItem {
  id: number;
  title?: string;
  price?: number;
  endDate?: string;
  bids?: number;
  thumbnail?: string;
  url: string;
}

interface TraderaStatus {
  appConfigured: boolean;
  appPoolSize?: number;
  sandbox: boolean;
  userConnected: boolean;
  userId: number | null;
}

interface EditableDraft {
  title: string;
  description: string;
  conditionNotes: string;
  keywords: string;
  /** Opening / start price. */
  price: string;
  /** Buy-it-now (Köp nu) price. Empty = auction only. */
  buyout: string;
  priceMeta: string;
}

interface AiMeta {
  identificationConfidence: string;
  priceConfidence: string;
}

interface Valuation {
  confidence: string;
  reasoning: string;
  basis: string;
  soldCount: number;
  activeCount: number;
}

/** One detected item in the multi-item (batch) flow. */
interface BatchItem {
  title: string;
  description: string;
  conditionNotes: string;
  keywords: string;
  category: string;
  price: string;
  buyout: string;
  valued: boolean;
}

interface AiItem {
  category?: string;
  title?: string;
  description?: string;
  conditionNotes?: string;
  suggestedKeywords?: string[];
  priceGuessSEK?: { low: number; high: number };
}

function aiToBatchItem(d: AiItem): BatchItem {
  const guess = d.priceGuessSEK;
  return {
    title: d.title ?? "",
    description: d.description ?? "",
    conditionNotes: d.conditionNotes ?? "",
    keywords: (d.suggestedKeywords ?? []).join(", "),
    category: d.category ?? "",
    price: guess ? String(Math.round((guess.low + guess.high) / 2)) : "",
    buyout: "",
    valued: false,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface Photo {
  dataUrl: string;
  name: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Re-encode an image to a capped-size JPEG. Keeps uploads under Vercel's ~4.5MB
 * body limit, shrinks the AI request, and fits more photos in sessionStorage.
 * Falls back to the original on any failure.
 */
function downscaleDataUrl(dataUrl: string, maxDim = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function fetchTraderaStatus(): Promise<TraderaStatus | null> {
  try {
    const res = await fetch("/api/tradera/status", { cache: "no-store" });
    return (await res.json()) as TraderaStatus;
  } catch {
    return null;
  }
}

// ── Draft persistence ─────────────────────────────────────────────────────────
// The Tradera connect flow navigates away to tradera.com and back, which remounts
// the app and would otherwise drop the in-progress draft. We stash it in
// sessionStorage before leaving and restore it on return.

const DRAFT_STORAGE_KEY = "bortbort_draft_v1";

interface PersistedSession {
  draft: EditableDraft;
  aiMeta: AiMeta | null;
  traderaCategoryId: string;
  categorySuggestion: string;
  images: Photo[];
}

function saveSession(s: PersistedSession) {
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Quota exceeded (usually the photos). Keep the text draft; drop the images.
    try {
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...s, images: [] }));
    } catch {
      /* give up silently — the draft is a convenience, not critical state */
    }
  }
}

function loadSession(): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PersistedSession;
    return s && s.draft ? s : null;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function confidenceLabel(c: string): string {
  if (c === "high") return "hög säkerhet";
  if (c === "medium") return "medel säkerhet";
  return "låg säkerhet";
}

/** Format a Tradera end-date to a short Swedish date, tolerating odd input. */
function formatListingDate(s?: string): string {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("sv-SE");
}

// ── Component ────────────────────────────────────────────────────────────────

export function LoppisApp() {
  const [appState, setAppState] = useState<AppState>("camera");
  const [noCam, setNoCam] = useState(false);
  const [status, setStatus] = useState<TraderaStatus | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [images, setImages] = useState<Photo[]>([]);
  const [draft, setDraft] = useState<EditableDraft | null>(null);
  const [aiMeta, setAiMeta] = useState<AiMeta | null>(null);
  const [traderaCategoryId, setTraderaCategoryId] = useState("");
  const [categorySuggestion, setCategorySuggestion] = useState("");
  const [categoryAlternates, setCategoryAlternates] = useState<{ id: number; path: string }[]>([]);
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [shippingCost, setShippingCost] = useState("63");
  const [captureMode, setCaptureMode] = useState<"single" | "multi">("single");
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchPhoto, setBatchPhoto] = useState<Photo | null>(null);
  const [batchOpenIndex, setBatchOpenIndex] = useState<number | null>(null);
  const [diag, setDiag] = useState<{ title: string; data: unknown } | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [listings, setListings] = useState<{ active: SellerItem[]; ended: SellerItem[] } | null>(null);
  const [listingsBusy, setListingsBusy] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);
  // Gates the camera until we've checked for a restorable draft, so returning
  // from the connect flow doesn't briefly flash the viewfinder.
  const [restoring, setRestoring] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addPhotoInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start / stop camera with appState
  useEffect(() => {
    if (restoring || appState !== "camera" || noCam) return;
    let stream: MediaStream | null = null;

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" } } })
      .then((s) => {
        stream = s;
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setNoCam(true));

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [restoring, appState, noCam]);

  // Detect a newer deployment and offer to reload — so a long-lived tab never
  // silently keeps running stale JS. Compares our baked commit to the live one.
  useEffect(() => {
    if (!APP_COMMIT) return; // dev / unbuilt — nothing to compare against
    let prompted = false;
    async function check() {
      if (prompted || document.hidden) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const data = (await res.json()) as { commit?: string };
        if (data.commit && data.commit !== APP_COMMIT) {
          prompted = true;
          toast("Ny version tillgänglig", {
            description: "Ladda om för att uppdatera appen.",
            duration: Infinity,
            action: { label: "Ladda om", onClick: () => window.location.reload() },
          });
        }
      } catch {
        /* offline / transient — try again next tick */
      }
    }
    const id = setInterval(check, 60_000);
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", onVisible);
    check();
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Status + draft restore + token-login redirect result on mount
  useEffect(() => {
    let active = true;
    fetchTraderaStatus().then((s) => { if (active && s) setStatus(s); });

    const q = new URLSearchParams(window.location.search);
    const tradera = q.get("tradera");
    // Strip the query params so a refresh doesn't re-surface the message.
    if (tradera) window.history.replaceState({}, "", window.location.pathname);

    // Deferred so we don't call setState synchronously in the effect body.
    Promise.resolve().then(() => {
      if (!active) return;

      // Restore a draft stashed before the Tradera connect round-trip.
      const saved = loadSession();
      if (saved) {
        setDraft(saved.draft);
        setAiMeta(saved.aiMeta);
        setTraderaCategoryId(saved.traderaCategoryId);
        setCategorySuggestion(saved.categorySuggestion);
        setImages(saved.images ?? []);
        setAppState("draft");
      }

      if (tradera === "connected") {
        toast.success("Tradera-kontot är anslutet.");
      } else if (tradera === "denied") {
        setConnectError("Du nekade åtkomst i Tradera. Ingen anslutning gjordes.");
      } else if (tradera === "error") {
        // A persistent banner — a toast vanishes before it can be read on mobile.
        setConnectError(q.get("reason") ?? "Anslutningen till Tradera misslyckades.");
      }

      setRestoring(false);
    });

    return () => { active = false; };
  }, []);

  // ── Camera capture ────────────────────────────────────────────────────────

  function captureFrame(): string | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return null;
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  /** Analyze the primary photo and start a draft. `dataUrl` is a downscaled JPEG. */
  async function analyzeImage(dataUrl: string, name: string) {
    setImages([{ dataUrl, name }]);
    setAppState("analyzing");
    const imageBase64 = dataUrl.split(",")[1] ?? "";
    try {
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64, mediaType: "image/jpeg" }),
      });
      const data = await res.json() as {
        ok: boolean;
        draft?: {
          category?: string;
          title?: string;
          description?: string;
          conditionNotes?: string;
          suggestedKeywords?: string[];
          priceGuessSEK?: { low: number; high: number };
          priceConfidence?: string;
          identificationConfidence?: string;
        };
        error?: string;
      };
      if (data.ok && data.draft) {
        const d = data.draft;
        const guess = d.priceGuessSEK;
        setDraft({
          title: d.title ?? "",
          description: d.description ?? "",
          conditionNotes: d.conditionNotes ?? "",
          keywords: (d.suggestedKeywords ?? []).join(", "),
          price: guess ? String(Math.round((guess.low + guess.high) / 2)) : "",
          buyout: "",
          priceMeta: guess ? `AI-förslag ${guess.low}–${guess.high} kr` : "",
        });
        setCategorySuggestion(d.category ?? "");
        setCategoryAlternates([]);
        setValuation(null);
        setAiMeta({
          identificationConfidence: d.identificationConfidence ?? "?",
          priceConfidence: d.priceConfidence ?? "?",
        });
        setAppState("draft");
        toast.success("Utkast klart!");
        suggestCategory({
          title: d.title ?? "",
          description: d.description ?? "",
          keywords: (d.suggestedKeywords ?? []).join(", "),
          condition: d.conditionNotes ?? "",
          aiCategory: d.category ?? "",
        });
      } else {
        toast.error(data.error ?? "Kunde inte analysera bilden.");
        setAppState("camera");
      }
    } catch {
      toast.error("Nätverksfel vid analys.");
      setAppState("camera");
    }
  }

  /** Detect every distinct item in one photo (the "whole pile" flow). */
  async function analyzeBatch(dataUrl: string, name: string) {
    setBatchPhoto({ dataUrl, name });
    setImages([]);
    setAppState("analyzing");
    const imageBase64 = dataUrl.split(",")[1] ?? "";
    try {
      const res = await fetch("/api/identify-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64, mediaType: "image/jpeg" }),
      });
      const data = await res.json() as { ok: boolean; items?: AiItem[]; error?: string };
      if (data.ok && data.items && data.items.length > 0) {
        setBatchItems(data.items.map(aiToBatchItem));
        setAppState("batch");
        toast.success(`${data.items.length} ${data.items.length === 1 ? "sak" : "saker"} hittades.`);
      } else if (data.ok) {
        toast.message("Inga föremål hittades.");
        setAppState("camera");
      } else {
        toast.error(data.error ?? "Kunde inte analysera bilden.");
        setAppState("camera");
      }
    } catch {
      toast.error("Nätverksfel vid analys.");
      setAppState("camera");
    }
  }

  async function onCaptureClick() {
    const dataUrl = captureFrame();
    if (!dataUrl) { toast.error("Kunde inte ta bild."); return; }
    if (captureMode === "multi") await analyzeBatch(dataUrl, "foto.jpg");
    else await analyzeImage(dataUrl, "foto.jpg");
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Bildformatet stöds inte (JPEG, PNG, WebP eller GIF).");
      return;
    }
    const dataUrl = await downscaleDataUrl(await readAsDataUrl(file));
    if (captureMode === "multi") await analyzeBatch(dataUrl, file.name);
    else await analyzeImage(dataUrl, file.name);
  }

  /** Open one batch item into the normal draft flow (edit / value / photos / publish). */
  function openBatchItem(i: number) {
    const it = batchItems[i];
    setDraft({
      title: it.title,
      description: it.description,
      conditionNotes: it.conditionNotes,
      keywords: it.keywords,
      price: it.price,
      buyout: it.buyout,
      priceMeta: "",
    });
    setCategorySuggestion(it.category);
    setCategoryAlternates([]);
    setImages(batchPhoto ? [batchPhoto] : []);
    setValuation(null);
    setAiMeta(null);
    setTraderaCategoryId("");
    setBatchOpenIndex(i);
    setAppState("draft");
    suggestCategory({
      title: it.title,
      description: it.description,
      keywords: it.keywords,
      condition: it.conditionNotes,
      aiCategory: it.category,
    });
  }

  /** Return from an opened batch item to the list, saving edits back into it. */
  function backToBatch() {
    if (batchOpenIndex !== null && draft) {
      const d = draft;
      setBatchItems((prev) =>
        prev.map((it, i) =>
          i === batchOpenIndex
            ? { ...it, title: d.title, description: d.description, conditionNotes: d.conditionNotes, keywords: d.keywords, price: d.price, buyout: d.buyout }
            : it,
        ),
      );
    }
    setBatchOpenIndex(null);
    setDraft(null);
    setImages([]);
    setValuation(null);
    setAiMeta(null);
    setTraderaCategoryId("");
    setCategorySuggestion("");
    setCategoryAlternates([]);
    setAppState("batch");
  }

  /** Run the proper (sold + AI) valuation for every batch item, sequentially. */
  async function valuateAll() {
    if (batchItems.length === 0) return;
    setBusy("value");
    try {
      for (let i = 0; i < batchItems.length; i++) {
        const it = batchItems[i];
        const query = it.title.trim() || it.keywords.trim();
        if (!query) continue;
        try {
          const res = await fetch("/api/tradera/value", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: it.title,
              keywords: it.keywords,
              condition: it.conditionNotes,
              description: it.description,
            }),
          });
          const data = await res.json();
          if (data.ok) {
            setBatchItems((prev) =>
              prev.map((x, idx) =>
                idx === i
                  ? { ...x, price: String(data.openingPriceSEK), buyout: String(data.buyoutPriceSEK), valued: true }
                  : x,
              ),
            );
          }
        } catch {
          /* skip this item, keep going */
        }
      }
      toast.success("Värdering klar.");
    } finally {
      setBusy(null);
    }
  }

  /** Append more photos to the current listing (no re-analysis). */
  async function addPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((f) =>
      SUPPORTED_IMAGE_TYPES.includes(f.type),
    );
    e.target.value = "";
    if (files.length === 0) return;
    const added: Photo[] = [];
    for (const f of files) {
      added.push({ dataUrl: await downscaleDataUrl(await readAsDataUrl(f)), name: f.name });
    }
    setImages((prev) => [...prev, ...added].slice(0, 12));
  }

  function removePhoto(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function reset() {
    clearSession();
    setDraft(null);
    setAiMeta(null);
    setImages([]);
    setTraderaCategoryId("");
    setCategorySuggestion("");
    setCategoryAlternates([]);
    setValuation(null);
    setBatchItems([]);
    setBatchPhoto(null);
    setBatchOpenIndex(null);
    setDiag(null);
    setAppState("camera");
  }

  /** After a successful publish: drop the item from the batch and return to the
   *  list if more remain, otherwise start fresh. */
  function afterPublish() {
    if (batchOpenIndex === null) {
      reset();
      return;
    }
    const remaining = batchItems.filter((_, i) => i !== batchOpenIndex);
    setBatchOpenIndex(null);
    setBatchItems(remaining);
    setDraft(null);
    setAiMeta(null);
    setImages([]);
    setTraderaCategoryId("");
    setCategorySuggestion("");
    setCategoryAlternates([]);
    setValuation(null);
    if (remaining.length > 0) {
      setAppState("batch");
    } else {
      setBatchPhoto(null);
      setAppState("camera");
    }
  }

  function setField(key: keyof EditableDraft, value: string) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  /** Smart category: retrieve real candidates + let Gemini pick. Fire-and-forget. */
  async function suggestCategory(fields: {
    title: string;
    description: string;
    keywords: string;
    condition: string;
    aiCategory: string;
  }) {
    try {
      const res = await fetch("/api/tradera/suggest-category", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (data.ok && data.primaryId) {
        setTraderaCategoryId(String(data.primaryId));
        setCategoryAlternates(Array.isArray(data.alternates) ? data.alternates : []);
      }
    } catch {
      /* keep the client-side breadcrumb fallback */
    }
  }

  /** Stash the current draft, then leave for the Tradera token-login flow. */
  function connectTradera() {
    if (draft) {
      saveSession({ draft, aiMeta, traderaCategoryId, categorySuggestion, images });
    }
    window.location.href = "/api/tradera/token/start";
  }

  // ── Valuation ─────────────────────────────────────────────────────────────

  async function valuate() {
    if (!draft) return;
    const query = draft.title.trim() || draft.keywords.trim();
    if (!query) { toast.error("Fyll i en titel för att värdera."); return; }
    setBusy("value");
    try {
      const res = await fetch("/api/tradera/value", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          keywords: draft.keywords,
          condition: draft.conditionNotes,
          description: draft.description,
          categoryId: traderaCategoryId ? Number(traderaCategoryId) : undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setDraft((prev) => prev ? {
          ...prev,
          price: String(data.openingPriceSEK),
          buyout: String(data.buyoutPriceSEK),
          priceMeta: "",
        } : prev);
        setValuation({
          confidence: data.confidence,
          reasoning: data.reasoning,
          basis: data.basis,
          soldCount: data.sold?.count ?? 0,
          activeCount: data.active?.count ?? 0,
        });
        toast.success("Värdering klar.");
      } else {
        toast.error(data.error ?? "Värderingen misslyckades.");
      }
    } catch {
      toast.error("Nätverksfel vid värdering.");
    } finally {
      setBusy(null);
    }
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  async function publishToTradera() {
    if (!draft) return;
    if (!traderaCategoryId.trim()) { toast.error("Välj en Tradera-kategori."); return; }
    const priceDigits = draft.price.replace(/[^\d]/g, "");
    if (!priceDigits) { toast.error("Ange ett pris."); return; }
    const buyoutDigits = (draft.buyout ?? "").replace(/[^\d]/g, "");
    setBusy("publish");
    try {
      const description = [draft.description, draft.conditionNotes ? `Skick: ${draft.conditionNotes}` : ""]
        .filter(Boolean).join("\n\n");
      const res = await fetch("/api/tradera/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          description,
          categoryId: Number(traderaCategoryId),
          startPrice: Number(priceDigits),
          buyItNowPrice: buyoutDigits ? Number(buyoutDigits) : undefined,
          shippingCost: Number((shippingCost || "0").replace(/[^\d]/g, "")) || 0,
          durationDays: 7,
          images: images.map((p) => p.dataUrl),
        }),
      });
      const data = await res.json();
      setDiag({ title: "POST /api/tradera/list", data });
      if (data.ok) {
        const attached = data.images?.attached;
        toast.success(
          typeof attached === "number"
            ? `Annons publicerad på Tradera! (${attached} bild${attached === 1 ? "" : "er"})`
            : "Annons publicerad på Tradera!",
        );
        afterPublish();
      } else {
        toast.error(data.error ?? "Kunde inte publicera på Tradera.");
      }
    } catch {
      toast.error("Nätverksfel vid Tradera-publicering.");
    } finally {
      setBusy(null);
    }
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  async function testConnection() {
    setBusy("ping");
    try {
      const res = await fetch("/api/tradera/ping", { cache: "no-store" });
      const data = await res.json();
      setDiag({ title: "GET /api/tradera/ping", data });
      if (data.ok) toast.success(`Tradera svarade: ${data.officialTime ?? "OK"}`);
      else toast.error(data.error ?? "Anslutningen misslyckades.");
    } catch {
      toast.error("Nätverksfel.");
    } finally {
      setBusy(null);
    }
  }

  async function postTestListing() {
    setBusy("listing");
    try {
      const res = await fetch("/api/tradera/test-listing", { method: "POST" });
      const data = await res.json();
      setDiag({ title: "POST /api/tradera/test-listing", data });
      if (data.ok) toast.success("Testannons skickad.");
      else toast.error(data.error ?? "Kunde inte posta testannonsen.");
    } catch {
      toast.error("Nätverksfel.");
    } finally {
      setBusy(null);
    }
  }

  async function testCategories() {
    setBusy("ping");
    try {
      const res = await fetch("/api/tradera/categories?debug=1", { cache: "no-store" });
      const data = await res.json();
      setDiag({ title: "GET /api/tradera/categories?debug=1", data });
      if (data.ok) toast.success(`Kategorier tolkade: ${data.parsedCount ?? 0}`);
      else toast.error(data.error ?? "Kunde inte hämta kategorier.");
    } catch {
      toast.error("Nätverksfel.");
    } finally {
      setBusy(null);
    }
  }

  async function testOptions() {
    setBusy("ping");
    try {
      const res = await fetch("/api/tradera/options?debug=1", { cache: "no-store" });
      const data = await res.json();
      setDiag({ title: "GET /api/tradera/options?debug=1", data });
      if (data.ok) toast.success(`Frakt: ${data.shippingCount ?? 0}, Betalning: ${data.paymentCount ?? 0}`);
      else toast.error(data.error ?? "Kunde inte hämta alternativ.");
    } catch {
      toast.error("Nätverksfel.");
    } finally {
      setBusy(null);
    }
  }

  async function fetchListings() {
    setListingsBusy(true);
    setListingsError(null);
    try {
      const res = await fetch("/api/tradera/listings", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) setListings({ active: data.active ?? [], ended: data.ended ?? [] });
      else setListingsError(data.error ?? "Kunde inte hämta annonser.");
    } catch {
      setListingsError("Nätverksfel.");
    } finally {
      setListingsBusy(false);
    }
  }

  function openListings() {
    setAppState("listings");
    fetchListings();
  }

  // ── Hidden shared file input ──────────────────────────────────────────────

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={SUPPORTED_IMAGE_TYPES.join(",")}
      className="hidden"
      onChange={onFileChange}
    />
  );

  // ── Camera / Analyzing screen ─────────────────────────────────────────────

  if (appState === "camera" || appState === "analyzing") {
    return (
      <div className="relative h-dvh w-full overflow-hidden bg-black">
        {fileInput}
        <canvas ref={canvasRef} className="hidden" />

        {/* Live camera feed or fallback */}
        {appState === "camera" && !noCam ? (
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            autoPlay
            muted
            playsInline
          />
        ) : appState === "analyzing" && (images[0] ?? batchPhoto) ? (
          // Captured photo shown while analyzing
          // eslint-disable-next-line @next/next/no-img-element
          <img src={(images[0] ?? batchPhoto)!.dataUrl} alt="" className="h-full w-full object-cover opacity-40" />
        ) : null}

        {/* Top status strip */}
        <div className="absolute left-0 right-0 top-0 flex items-center gap-2 p-4 pt-safe-top">
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium text-white/80 backdrop-blur-sm">
            Bortbort
          </span>
          {status && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur-sm ${status.userConnected ? "bg-green-500/80 text-white" : "bg-black/50 text-white/60"}`}>
              {status.userConnected ? `Tradera #${status.userId}` : "Inget konto"}
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] text-white/50">
            {VERSION_LABEL}
          </span>
        </div>

        {/* Persistent connection-error banner (survives so it can be read on mobile) */}
        {connectError && (
          <div className="absolute inset-x-3 top-14 z-30 rounded-lg bg-red-600/95 p-3 text-white shadow-lg backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Tradera-anslutning misslyckades</p>
                <p className="mt-1 text-xs break-words text-white/90">{connectError}</p>
              </div>
              <button
                onClick={() => setConnectError(null)}
                aria-label="Stäng"
                className="shrink-0 text-lg leading-none text-white/80 active:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Analyzing overlay */}
        {appState === "analyzing" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
            <p className="text-lg font-medium text-white">
              {captureMode === "multi" ? "Letar efter prylar…" : "Analyserar…"}
            </p>
          </div>
        )}

        {/* Bottom controls (camera state only) */}
        {appState === "camera" && (
          <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-4 pb-10 pb-safe-bottom">
            {status?.userConnected && (
              <button
                onClick={openListings}
                className="rounded-full bg-black/50 px-3 py-1.5 text-sm font-medium text-white/80 backdrop-blur-sm active:text-white"
              >
                Mina annonser
              </button>
            )}
            {/* Mode toggle: one item vs a whole pile */}
            <div className="flex rounded-full bg-black/50 p-1 text-xs backdrop-blur-sm">
              <button
                onClick={() => setCaptureMode("single")}
                className={`rounded-full px-3 py-1 font-medium ${captureMode === "single" ? "bg-white text-black" : "text-white/70"}`}
              >
                1 sak
              </button>
              <button
                onClick={() => setCaptureMode("multi")}
                className={`rounded-full px-3 py-1 font-medium ${captureMode === "multi" ? "bg-white text-black" : "text-white/70"}`}
              >
                Flera saker
              </button>
            </div>
            {noCam ? (
              <div className="flex flex-col items-center gap-3">
                <Camera className="h-12 w-12 text-white/40" />
                <p className="text-sm text-white/60">Kamera ej tillgänglig</p>
                <Button onClick={() => fileInputRef.current?.click()} variant="secondary">
                  Välj foto från galleri
                </Button>
              </div>
            ) : (
              <>
                {/* Shutter button */}
                <button
                  onClick={onCaptureClick}
                  className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/10 transition-colors active:bg-white/30"
                  aria-label="Ta foto"
                >
                  <div className="h-14 w-14 rounded-full bg-white" />
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm text-white/60 active:text-white"
                >
                  Välj från galleri
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Listings screen (my active + past Tradera items) ──────────────────────

  if (appState === "listings") {
    const renderItems = (items: SellerItem[]) =>
      items.map((it) => (
        <a
          key={it.id}
          href={it.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-muted flex items-center gap-3 rounded-lg border p-3"
        >
          {it.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
          ) : (
            <div className="bg-muted h-12 w-12 shrink-0 rounded" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{it.title ?? `Annons #${it.id}`}</p>
            <p className="text-muted-foreground text-xs">
              {[
                it.price != null ? `${it.price} kr` : null,
                it.bids != null ? `${it.bids} bud` : null,
                it.endDate ? formatListingDate(it.endDate) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <ExternalLink className="text-muted-foreground h-4 w-4 shrink-0" />
        </a>
      ));

    const isEmpty =
      listings && listings.active.length === 0 && listings.ended.length === 0;

    return (
      <div className="min-h-dvh bg-background">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 p-4 backdrop-blur">
          <button
            onClick={() => setAppState("camera")}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
          >
            <ChevronLeft className="h-4 w-4" />
            Tillbaka
          </button>
          <p className="flex-1 text-sm font-semibold">Mina annonser</p>
          <button
            onClick={fetchListings}
            disabled={listingsBusy}
            aria-label="Uppdatera"
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${listingsBusy ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="flex flex-col gap-6 p-4">
          {listingsBusy && !listings && (
            <p className="text-muted-foreground text-center text-sm">Hämtar annonser…</p>
          )}
          {listingsError && (
            <p className="text-center text-sm text-red-600">{listingsError}</p>
          )}
          {isEmpty && (
            <p className="text-muted-foreground text-center text-sm">
              Inga annonser hittades ännu.
            </p>
          )}
          {listings && listings.active.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">Aktiva ({listings.active.length})</p>
              {renderItems(listings.active)}
            </div>
          )}
          {listings && listings.ended.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">Avslutade ({listings.ended.length})</p>
              {renderItems(listings.ended)}
            </div>
          )}
          <p className="text-muted-foreground text-center font-mono text-[10px]">{VERSION_LABEL}</p>
        </div>
      </div>
    );
  }

  // ── Batch screen (multiple items from one photo) ──────────────────────────

  if (appState === "batch") {
    return (
      <div className="min-h-dvh bg-background">
        {fileInput}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 p-4 backdrop-blur">
          {batchPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={batchPhoto.dataUrl}
              alt="Taget foto"
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {batchItems.length} {batchItems.length === 1 ? "sak" : "saker"}
            </p>
            <p className="text-muted-foreground text-xs">Öppna en för att värdera & sälja</p>
          </div>
          <button
            onClick={reset}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Nytt foto
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4 pb-10">
          <Button
            variant="secondary"
            onClick={valuateAll}
            disabled={busy !== null}
            className="w-full"
          >
            <Sparkles className={busy === "value" ? "animate-pulse" : ""} />
            {busy === "value" ? "Värderar alla…" : "Värdera alla (Tradera)"}
          </Button>

          {batchItems.map((it, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{it.title || "Namnlös pryl"}</p>
                <p className="text-muted-foreground text-xs">
                  {it.price ? `${it.price} kr` : "–"}
                  {it.buyout ? ` · Köp nu ${it.buyout} kr` : ""}
                  {it.valued ? " · värderad" : ""}
                </p>
              </div>
              <Button size="sm" onClick={() => openBatchItem(i)}>
                Skapa annons
              </Button>
            </div>
          ))}

          <p className="text-muted-foreground text-center font-mono text-[10px]">{VERSION_LABEL}</p>
        </div>
      </div>
    );
  }

  // ── Draft screen ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-background">
      {fileInput}
      <input
        ref={addPhotoInputRef}
        type="file"
        accept={SUPPORTED_IMAGE_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={addPhotos}
      />

      {/* Photo header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 p-4 backdrop-blur">
        {images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={images[0].dataUrl}
            alt="Taget foto"
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Granska utkast</p>
          {aiMeta && (
            <p className="text-muted-foreground text-xs">
              ID: {aiMeta.identificationConfidence} · Pris: {aiMeta.priceConfidence}
            </p>
          )}
        </div>
        <button
          onClick={batchOpenIndex !== null ? backToBatch : reset}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          aria-label={batchOpenIndex !== null ? "Tillbaka till listan" : "Ta nytt foto"}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {batchOpenIndex !== null ? "Tillbaka" : "Nytt foto"}
        </button>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-4 p-4 pb-36">
        {/* Photos: primary is the analyzed one; add more to show off the item */}
        <div className="flex flex-col gap-1.5">
          <Label>Foton ({images.length})</Label>
          <div className="flex flex-wrap gap-2">
            {images.map((p, i) => (
              <div key={`${p.name}-${i}`} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.dataUrl}
                  alt={`Foto ${i + 1}`}
                  className="h-20 w-20 rounded-lg border object-cover"
                />
                {i === 0 && (
                  <span className="bg-background/90 absolute left-1 top-1 rounded px-1 text-[10px] font-medium">
                    Huvudbild
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  aria-label="Ta bort foto"
                  className="bg-background/90 absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border text-xs leading-none"
                >
                  ✕
                </button>
              </div>
            ))}
            {images.length < 12 && (
              <button
                type="button"
                onClick={() => addPhotoInputRef.current?.click()}
                className="text-muted-foreground hover:bg-muted flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs"
              >
                <Plus className="h-5 w-5" />
                Lägg till
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">Titel</Label>
          <Input
            id="title"
            value={draft?.title ?? ""}
            onChange={(e) => setField("title", e.target.value)}
          />
        </div>

        {/* Valuation: opening price + buyout, with a researched suggestion */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Pris</Label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={valuate}
              disabled={busy !== null}
            >
              <Sparkles className={busy === "value" ? "animate-pulse" : ""} />
              {busy === "value" ? "Värderar…" : "Värdera"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Utropspris (kr)</span>
              <Input
                inputMode="numeric"
                value={draft?.price ?? ""}
                onChange={(e) => setField("price", e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Köp nu (kr)</span>
              <Input
                inputMode="numeric"
                value={draft?.buyout ?? ""}
                onChange={(e) => setField("buyout", e.target.value)}
                placeholder="Valfritt"
              />
            </div>
          </div>
          {draft?.priceMeta && (
            <p className="text-muted-foreground text-xs">{draft.priceMeta}</p>
          )}
          {valuation && (
            <div className="bg-muted/40 rounded-lg border p-3">
              <p className="text-sm font-medium">
                Värdering · {confidenceLabel(valuation.confidence)}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">{valuation.reasoning}</p>
              <p className="text-muted-foreground mt-1.5 text-xs">
                Underlag:{" "}
                {valuation.soldCount > 0 ? `${valuation.soldCount} sålda` : "inga sålda"}
                {" · "}
                {valuation.activeCount} aktiva
                {valuation.basis === "ai-only" && " · AI-uppskattning"}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Kategori (Tradera)</Label>
          <CategoryPicker
            value={traderaCategoryId}
            onChange={setTraderaCategoryId}
            suggestion={categorySuggestion}
            alternates={categoryAlternates}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shipping">Frakt (kr)</Label>
          <Input
            id="shipping"
            inputMode="numeric"
            value={shippingCost}
            onChange={(e) => setShippingCost(e.target.value)}
            className="max-w-40"
            placeholder="0"
          />
          <p className="text-muted-foreground text-xs">
            Fraktkostnad köparen betalar. 0 = fri frakt / hämtas.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="condition">Skick</Label>
          <Input
            id="condition"
            value={draft?.conditionNotes ?? ""}
            onChange={(e) => setField("conditionNotes", e.target.value)}
            placeholder="T.ex. Gott begagnat skick, inga defekter"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Beskrivning</Label>
          <Textarea
            id="description"
            value={draft?.description ?? ""}
            onChange={(e) => setField("description", e.target.value)}
            rows={6}
          />
        </div>

        {/* Diagnostics (collapsed) */}
        <details className="bg-card mt-2 rounded-xl border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Diagnostik & Tradera-spik
          </summary>
          <div className="flex flex-col gap-3 px-4 pb-4">
            {status && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant={status.appConfigured ? "default" : "destructive"}>
                  {status.appConfigured ? `App OK (${status.appPoolSize ?? 1} nyckel${(status.appPoolSize ?? 1) > 1 ? "lar" : ""})` : "App-nyckel saknas"}
                </Badge>
                <Badge variant={status.sandbox ? "secondary" : "destructive"}>
                  {status.sandbox ? "Sandbox" : "PRODUKTION"}
                </Badge>
                <Badge variant={status.userConnected ? "default" : "outline"}>
                  {status.userConnected ? `Konto #${status.userId}` : "Inget konto"}
                </Badge>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={testConnection} disabled={busy !== null}>
                {busy === "ping" ? "Testar…" : "Testa anslutning"}
              </Button>
              <Button size="sm" variant="outline" onClick={testCategories} disabled={busy !== null}>
                Testa kategorier
              </Button>
              <Button size="sm" variant="outline" onClick={testOptions} disabled={busy !== null}>
                Testa frakt/betalning
              </Button>
              <Button size="sm" variant="outline" onClick={connectTradera}>
                Anslut Tradera-konto
              </Button>
              <Button size="sm" onClick={postTestListing} disabled={busy !== null || !status?.userConnected}>
                {busy === "listing" ? "Postar…" : "Lägg upp testannons"}
              </Button>
            </div>
            {diag && (
              <pre className="bg-muted max-h-60 overflow-auto rounded-md p-3 text-xs">
                {`${diag.title}\n\n${JSON.stringify(diag.data, null, 2)}`}
              </pre>
            )}
          </div>
        </details>

        <p className="text-muted-foreground text-center font-mono text-[10px]">
          {VERSION_LABEL}
        </p>
      </div>

      {/* Fixed publish bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 p-4 backdrop-blur">
        {!status?.userConnected && (
          <button
            type="button"
            onClick={connectTradera}
            className="text-muted-foreground mb-2 block w-full text-center text-xs underline"
          >
            Anslut Tradera-konto för att publicera →
          </button>
        )}
        <Button
          onClick={publishToTradera}
          disabled={busy !== null || !status?.userConnected}
          className="h-12 w-full text-base"
        >
          {busy === "publish" ? "Publicerar…" : "Publicera på Tradera"}
        </Button>
      </div>
    </div>
  );
}
