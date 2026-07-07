"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { CategoryPicker } from "@/components/category-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VERSION_LABEL } from "@/lib/version";

// ── Types ────────────────────────────────────────────────────────────────────

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type AppState = "camera" | "analyzing" | "draft";
type Busy = "price" | "ping" | "listing" | "publish" | null;

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
  price: string;
  priceMeta: string;
}

interface AiMeta {
  identificationConfidence: string;
  priceConfidence: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
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
  image: { dataUrl: string; name: string } | null;
}

function saveSession(s: PersistedSession) {
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Quota exceeded (usually the photo). Keep the text draft; drop the image.
    try {
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...s, image: null }));
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

// ── Component ────────────────────────────────────────────────────────────────

export function LoppisApp() {
  const [appState, setAppState] = useState<AppState>("camera");
  const [noCam, setNoCam] = useState(false);
  const [status, setStatus] = useState<TraderaStatus | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [draft, setDraft] = useState<EditableDraft | null>(null);
  const [aiMeta, setAiMeta] = useState<AiMeta | null>(null);
  const [traderaCategoryId, setTraderaCategoryId] = useState("");
  const [categorySuggestion, setCategorySuggestion] = useState("");
  const [diag, setDiag] = useState<{ title: string; data: unknown } | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  // Gates the camera until we've checked for a restorable draft, so returning
  // from the connect flow doesn't briefly flash the viewfinder.
  const [restoring, setRestoring] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        setImage(saved.image);
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
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function analyzeImage(dataUrl: string, mediaType: string, name: string) {
    setImage({ dataUrl, name });
    setAppState("analyzing");
    const imageBase64 = dataUrl.split(",")[1] ?? "";
    try {
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64, mediaType }),
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
          priceMeta: guess ? `AI-förslag ${guess.low}–${guess.high} kr` : "",
        });
        setCategorySuggestion(d.category ?? "");
        setAiMeta({
          identificationConfidence: d.identificationConfidence ?? "?",
          priceConfidence: d.priceConfidence ?? "?",
        });
        setAppState("draft");
        toast.success("Utkast klart!");
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
    await analyzeImage(dataUrl, "image/jpeg", "foto.jpg");
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Bildformatet stöds inte (JPEG, PNG, WebP eller GIF).");
      return;
    }
    const dataUrl = await readAsDataUrl(file);
    await analyzeImage(dataUrl, file.type, file.name);
  }

  function reset() {
    clearSession();
    setDraft(null);
    setAiMeta(null);
    setImage(null);
    setTraderaCategoryId("");
    setCategorySuggestion("");
    setDiag(null);
    setAppState("camera");
  }

  function setField(key: keyof EditableDraft, value: string) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  /** Stash the current draft, then leave for the Tradera token-login flow. */
  function connectTradera() {
    if (draft) {
      saveSession({ draft, aiMeta, traderaCategoryId, categorySuggestion, image });
    }
    window.location.href = "/api/tradera/token/start";
  }

  // ── Price fetch ───────────────────────────────────────────────────────────

  async function getPrice() {
    if (!draft) return;
    const query = draft.title.trim() || draft.keywords.trim();
    if (!query) { toast.error("Fyll i en titel för att hämta prisförslag."); return; }
    setBusy("price");
    try {
      const params = new URLSearchParams({ q: query });
      const res = await fetch(`/api/tradera/price?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok && data.suggested) {
        setDraft((prev) => prev ? {
          ...prev,
          price: String(data.median ?? data.suggested.low),
          priceMeta: `Tradera-comps: ${data.suggested.low}–${data.suggested.high} kr (${data.count} st, utropspriser)`,
        } : prev);
        toast.success(`Prisförslag: ${data.suggested.low}–${data.suggested.high} kr`);
      } else if (data.ok) {
        toast.message("Inga jämförbara annonser hittades.");
      } else {
        toast.error(data.error ?? "Prisförslaget misslyckades.");
      }
    } catch {
      toast.error("Nätverksfel vid prisförslag.");
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
          durationDays: 7,
        }),
      });
      const data = await res.json();
      setDiag({ title: "POST /api/tradera/list", data });
      if (data.ok) {
        toast.success("Annons publicerad på Tradera!");
        reset();
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
        ) : appState === "analyzing" && image ? (
          // Captured photo shown while analyzing
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.dataUrl} alt="" className="h-full w-full object-cover opacity-40" />
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
            <p className="text-lg font-medium text-white">Analyserar…</p>
          </div>
        )}

        {/* Bottom controls (camera state only) */}
        {appState === "camera" && (
          <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-4 pb-10 pb-safe-bottom">
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

  // ── Draft screen ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-background">
      {fileInput}

      {/* Photo header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 p-4 backdrop-blur">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.dataUrl}
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
          onClick={reset}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          aria-label="Ta nytt foto"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Nytt foto
        </button>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-4 p-4 pb-36">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">Titel</Label>
          <Input
            id="title"
            value={draft?.title ?? ""}
            onChange={(e) => setField("title", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price">Pris (kr)</Label>
          <div className="flex gap-2">
            <Input
              id="price"
              inputMode="numeric"
              value={draft?.price ?? ""}
              onChange={(e) => setField("price", e.target.value)}
              className="flex-1"
              placeholder="0"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={getPrice}
              disabled={busy !== null}
              title="Hämta prisförslag från Tradera"
            >
              <RefreshCw className={busy === "price" ? "animate-spin" : ""} />
            </Button>
          </div>
          {draft?.priceMeta && (
            <p className="text-muted-foreground text-xs">{draft.priceMeta}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Kategori (Tradera)</Label>
          <CategoryPicker
            value={traderaCategoryId}
            onChange={setTraderaCategoryId}
            suggestion={categorySuggestion}
          />
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
