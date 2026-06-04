"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { HandoffPanel } from "@/components/handoff-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ListingFields } from "@/lib/handoff";

const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

interface TraderaStatus {
  appConfigured: boolean;
  appPoolSize?: number;
  sandbox: boolean;
  userConnected: boolean;
  userId: number | null;
}

interface EditableDraft {
  category: string;
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

interface IdentifyDraft {
  category?: string;
  title?: string;
  description?: string;
  conditionNotes?: string;
  suggestedKeywords?: string[];
  priceGuessSEK?: { low: number; high: number };
  priceConfidence?: string;
  identificationConfidence?: string;
}

type Busy = "identify" | "price" | "ping" | "listing" | "publish" | null;

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

function toListingFields(d: EditableDraft): ListingFields {
  const priceDigits = d.price.replace(/[^\d]/g, "");
  return {
    title: d.title,
    description: d.description,
    category: d.category,
    condition: d.conditionNotes,
    keywords: d.keywords
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    priceSEK: priceDigits ? Number(priceDigits) : null,
  };
}

export function LoppisApp() {
  const [status, setStatus] = useState<TraderaStatus | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [hint, setHint] = useState("");
  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(
    null,
  );
  const [draft, setDraft] = useState<EditableDraft | null>(null);
  const [aiMeta, setAiMeta] = useState<AiMeta | null>(null);
  const [diag, setDiag] = useState<{ title: string; data: unknown } | null>(
    null,
  );
  const [traderaCategoryId, setTraderaCategoryId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshStatus = useCallback(async () => {
    const data = await fetchTraderaStatus();
    if (data) setStatus(data);
  }, []);

  useEffect(() => {
    let active = true;
    fetchTraderaStatus().then((data) => {
      if (active && data) setStatus(data);
    });
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("tradera") === "connected"
    ) {
      toast.success("Tradera-kontot är anslutet.");
    }
    return () => {
      active = false;
    };
  }, []);

  function setField(key: keyof EditableDraft, value: string) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function onPickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Bildformatet stöds inte (JPEG, PNG, WebP eller GIF).");
      return;
    }

    setBusy("identify");
    try {
      const dataUrl = await readAsDataUrl(file);
      setImage({ dataUrl, name: file.name });
      const imageBase64 = dataUrl.split(",")[1] ?? "";
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mediaType: file.type,
          hint: hint.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; draft?: IdentifyDraft; error?: string };
      if (data.ok && data.draft) {
        const d = data.draft;
        const guess = d.priceGuessSEK;
        setDraft({
          category: d.category ?? "",
          title: d.title ?? "",
          description: d.description ?? "",
          conditionNotes: d.conditionNotes ?? "",
          keywords: (d.suggestedKeywords ?? []).join(", "),
          price: guess ? String(Math.round((guess.low + guess.high) / 2)) : "",
          priceMeta: guess
            ? `AI-gissning ${guess.low}–${guess.high} kr (konfidens: ${d.priceConfidence ?? "?"})`
            : "",
        });
        setAiMeta({
          identificationConfidence: d.identificationConfidence ?? "?",
          priceConfidence: d.priceConfidence ?? "?",
        });
        toast.success("Säljutkast skapat.");
      } else {
        toast.error(data.error ?? "Kunde inte skapa utkast.");
      }
    } catch {
      toast.error("Något gick fel vid identifieringen.");
    } finally {
      setBusy(null);
    }
  }

  async function getPrice() {
    if (!draft) return;
    const query = draft.title.trim() || draft.keywords.trim();
    if (!query) {
      toast.error("Fyll i en titel först så vi kan söka jämförbara annonser.");
      return;
    }
    setBusy("price");
    try {
      const params = new URLSearchParams({ q: query });
      const res = await fetch(`/api/tradera/price?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setDiag({ title: `GET /api/tradera/price?${params.toString()}`, data });
      if (data.ok && data.suggested) {
        setDraft((prev) =>
          prev
            ? {
                ...prev,
                price: String(data.median ?? data.suggested.low),
                priceMeta: `Tradera-comps: ${data.suggested.low}–${data.suggested.high} kr (${data.count} annonser, ${data.confidence}, utropspriser)`,
              }
            : prev,
        );
        toast.success(
          `Prisförslag: ${data.suggested.low}–${data.suggested.high} kr (${data.confidence}).`,
        );
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

  async function testConnection() {
    setBusy("ping");
    try {
      const res = await fetch("/api/tradera/ping", { cache: "no-store" });
      const data = await res.json();
      setDiag({ title: "GET /api/tradera/ping", data });
      if (data.ok) toast.success(`Tradera svarade. Servertid: ${data.officialTime || "OK"}`);
      else toast.error(data.error ?? "Anslutningen misslyckades.");
    } catch {
      toast.error("Nätverksfel vid anrop till Tradera.");
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
      if (data.ok) toast.success("Testannons skickad till Tradera.");
      else toast.error(data.error ?? "Kunde inte posta testannonsen.");
    } catch {
      toast.error("Nätverksfel vid posting av testannons.");
    } finally {
      setBusy(null);
      void refreshStatus();
    }
  }

  async function publishToTradera() {
    if (!draft) return;
    if (!traderaCategoryId.trim()) {
      toast.error("Ange en Tradera kategori-id.");
      return;
    }
    const priceDigits = draft.price.replace(/[^\d]/g, "");
    if (!priceDigits) {
      toast.error("Ange ett pris innan du publicerar.");
      return;
    }
    setBusy("publish");
    try {
      const description = [
        draft.description,
        draft.conditionNotes ? `Skick: ${draft.conditionNotes}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
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
      if (data.ok) toast.success("Annons skickad till Tradera.");
      else toast.error(data.error ?? "Kunde inte publicera på Tradera.");
    } catch {
      toast.error("Nätverksfel vid Tradera-publicering.");
    } finally {
      setBusy(null);
      void refreshStatus();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <StatusBar status={status} />

      <Card>
        <CardHeader>
          <CardTitle>Steg 1 · Fota & identifiera</CardTitle>
          <CardDescription>
            Ladda upp ett foto. Vision-modellen föreslår kategori, titel,
            beskrivning, skick och ett grovt pris – på svenska.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="hint">Ledtråd (valfritt)</Label>
            <Textarea
              id="hint"
              placeholder="T.ex. 'IKEA Poäng-fåtölj, björk, lite slitage på dynan'"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={SUPPORTED_IMAGE_TYPES.join(",")}
            className="hidden"
            onChange={onPickImage}
          />
          <div className="flex items-center gap-3">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy !== null}
            >
              {busy === "identify" ? "Analyserar bild…" : "Välj foto & skapa utkast"}
            </Button>
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.dataUrl}
                alt="Uppladdat foto"
                className="h-12 w-12 rounded-md object-cover"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle>Steg 2 · Granska utkast</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              Justera fritt innan du delar.
              {aiMeta && (
                <>
                  <Badge variant="outline">
                    ID-säkerhet: {aiMeta.identificationConfidence}
                  </Badge>
                  <Badge variant="outline">
                    Pris-säkerhet: {aiMeta.priceConfidence}
                  </Badge>
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Titel</Label>
              <Input
                id="title"
                value={draft.title}
                onChange={(e) => setField("title", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="price">Pris (SEK)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="price"
                  inputMode="numeric"
                  value={draft.price}
                  onChange={(e) => setField("price", e.target.value)}
                  className="max-w-40"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={getPrice}
                  disabled={busy !== null}
                >
                  {busy === "price" ? "Hämtar…" : "Hämta prisförslag (Tradera)"}
                </Button>
              </div>
              {draft.priceMeta && (
                <p className="text-muted-foreground text-xs">{draft.priceMeta}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="category">Kategori</Label>
              <Input
                id="category"
                value={draft.category}
                onChange={(e) => setField("category", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="condition">Skick</Label>
              <Input
                id="condition"
                value={draft.conditionNotes}
                onChange={(e) => setField("conditionNotes", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Beskrivning</Label>
              <Textarea
                id="description"
                className="min-h-32"
                value={draft.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="keywords">Sökord (kommaseparerade)</Label>
              <Input
                id="keywords"
                value={draft.keywords}
                onChange={(e) => setField("keywords", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle>Steg 3 · Publicera på Tradera (API)</CardTitle>
            <CardDescription>
              Postar det aktuella utkastet via Traderas API (auto-publicering).
              Kräver ett anslutet konto och en giltig Tradera kategori-id.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tradera-category">Tradera kategori-id</Label>
              <Input
                id="tradera-category"
                inputMode="numeric"
                placeholder="t.ex. 1612"
                value={traderaCategoryId}
                onChange={(e) => setTraderaCategoryId(e.target.value)}
                className="max-w-40"
              />
            </div>
            <Button
              onClick={publishToTradera}
              disabled={busy !== null || status?.userConnected === false}
            >
              {busy === "publish" ? "Publicerar…" : "Publicera på Tradera"}
            </Button>
            {status?.userConnected === false && (
              <p className="text-muted-foreground text-xs">
                Anslut ett Tradera-konto i Diagnostik först.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {draft && <HandoffPanel fields={toListingFields(draft)} image={image} />}

      <Diagnostics
        status={status}
        busy={busy}
        diag={diag}
        onPing={testConnection}
        onTestListing={postTestListing}
      />
    </div>
  );
}

function StatusBar({ status }: { status: TraderaStatus | null }) {
  if (!status) {
    return <div className="text-muted-foreground text-sm">Hämtar status…</div>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Tradera:</span>
      <Badge variant={status.appConfigured ? "default" : "destructive"}>
        App-nyckel {status.appConfigured ? "konfigurerad" : "saknas"}
      </Badge>
      {status.appConfigured && (status.appPoolSize ?? 0) > 1 && (
        <Badge variant="secondary">{status.appPoolSize} nycklar (pool)</Badge>
      )}
      <Badge variant={status.sandbox ? "secondary" : "destructive"}>
        {status.sandbox ? "Sandbox" : "PRODUKTION"}
      </Badge>
      <Badge variant={status.userConnected ? "default" : "outline"}>
        {status.userConnected
          ? `Konto #${status.userId}`
          : "Inget konto anslutet"}
      </Badge>
    </div>
  );
}

function Diagnostics({
  status,
  busy,
  diag,
  onPing,
  onTestListing,
}: {
  status: TraderaStatus | null;
  busy: Busy;
  diag: { title: string; data: unknown } | null;
  onPing: () => void;
  onTestListing: () => void;
}) {
  return (
    <details className="bg-card rounded-xl border">
      <summary className="cursor-pointer px-6 py-4 text-sm font-medium">
        Diagnostik & Tradera-spik
      </summary>
      <div className="flex flex-col gap-3 px-6 pb-6">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onPing} disabled={busy !== null}>
            {busy === "ping" ? "Testar…" : "Testa anslutning"}
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="/api/tradera/token/start">Anslut Tradera-konto</a>
          </Button>
          <Button
            size="sm"
            onClick={onTestListing}
            disabled={busy !== null || status?.userConnected === false}
          >
            {busy === "listing" ? "Postar…" : "Lägg upp testannons (hårdkodad)"}
          </Button>
        </div>
        {diag && (
          <pre className="bg-muted max-h-80 overflow-auto rounded-md p-4 text-xs">
            {`${diag.title}\n\n${JSON.stringify(diag.data, null, 2)}`}
          </pre>
        )}
      </div>
    </details>
  );
}
