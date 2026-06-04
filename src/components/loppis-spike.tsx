"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

interface TraderaStatus {
  appConfigured: boolean;
  sandbox: boolean;
  userConnected: boolean;
  userId: number | null;
}

interface ResultPanel {
  title: string;
  data: unknown;
}

type Busy = "ping" | "listing" | "identify" | "price" | null;

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
    return null; // status is best-effort
  }
}

export function LoppisSpike() {
  const [status, setStatus] = useState<TraderaStatus | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [result, setResult] = useState<ResultPanel | null>(null);
  const [hint, setHint] = useState("");
  const [priceQuery, setPriceQuery] = useState("");
  const [priceCategory, setPriceCategory] = useState("");
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

  async function testConnection() {
    setBusy("ping");
    try {
      const res = await fetch("/api/tradera/ping", { cache: "no-store" });
      const data = await res.json();
      setResult({ title: "GET /api/tradera/ping", data });
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
      setResult({ title: "POST /api/tradera/test-listing", data });
      if (data.ok) toast.success("Testannons skickad till Tradera.");
      else toast.error(data.error ?? "Kunde inte posta testannonsen.");
    } catch {
      toast.error("Nätverksfel vid posting av testannons.");
    } finally {
      setBusy(null);
      void refreshStatus();
    }
  }

  async function onPickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Bildformatet stöds inte (använd JPEG, PNG, WebP eller GIF).");
      return;
    }

    setBusy("identify");
    try {
      const dataUrl = await readAsDataUrl(file);
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
      const data = await res.json();
      setResult({ title: "POST /api/identify", data });
      if (data.ok) toast.success("Säljutkast skapat.");
      else toast.error(data.error ?? "Kunde inte skapa utkast.");
    } catch {
      toast.error("Något gick fel vid identifieringen.");
    } finally {
      setBusy(null);
    }
  }

  async function getPrice() {
    if (!priceQuery.trim()) {
      toast.error("Ange en sökterm.");
      return;
    }
    setBusy("price");
    try {
      const params = new URLSearchParams({ q: priceQuery.trim() });
      if (priceCategory.trim()) params.set("categoryId", priceCategory.trim());
      const res = await fetch(`/api/tradera/price?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setResult({ title: `GET /api/tradera/price?${params.toString()}`, data });
      if (data.ok) {
        if (data.suggested) {
          toast.success(
            `Förslag: ${data.suggested.low}–${data.suggested.high} kr (${data.confidence}, ${data.count} comps)`,
          );
        } else {
          toast.message("Inga jämförbara annonser hittades.");
        }
      } else {
        toast.error(data.error ?? "Prisförslaget misslyckades.");
      }
    } catch {
      toast.error("Nätverksfel vid prisförslag.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <StatusBar status={status} />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1 · Tradera-anslutning (spik)</CardTitle>
            <CardDescription>
              Verifiera app-nyckeln mot Traderas publika API (GetOfficialTime).
              Detta kräver bara TRADERA_APP_ID och TRADERA_APP_KEY.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={testConnection} disabled={busy !== null}>
              {busy === "ping" ? "Testar…" : "Testa anslutning"}
            </Button>
            <Button asChild variant="outline">
              <a href="/api/tradera/token/start">Anslut Tradera-konto</a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2 · Testannons via API</CardTitle>
            <CardDescription>
              Postar en enda, hårdkodad och tydligt märkt testannons via
              RestrictedService.AddItem. Kräver anslutet konto och en giltig
              sandbox-kategori (TRADERA_TEST_CATEGORY_ID).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              onClick={postTestListing}
              disabled={busy !== null || status?.userConnected === false}
              variant="default"
            >
              {busy === "listing" ? "Postar…" : "Lägg upp testannons"}
            </Button>
            {status?.userConnected === false && (
              <p className="text-muted-foreground text-xs">
                Anslut ett Tradera-konto först (eller sätt TRADERA_USER_ID /
                TRADERA_USER_TOKEN).
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>3 · Identifiera & skapa utkast (Anthropic)</CardTitle>
          <CardDescription>
            Ladda upp ett foto. Vision-modellen föreslår kategori, titel,
            beskrivning, skick och en grov prisgissning – på svenska.
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
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy !== null}
          >
            {busy === "identify" ? "Analyserar bild…" : "Välj foto & skapa utkast"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4 · Prisförslag (Tradera-comps)</CardTitle>
          <CardDescription>
            Hämtar jämförbara annonser via SearchService och föreslår ett
            prisintervall (p25–p75). Kräver bara app-nyckeln. OBS: aktiva
            utropspriser, inte sålda – konfidensen hålls därför medvetet låg/medel.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="price-query">Sökterm</Label>
            <Input
              id="price-query"
              placeholder="T.ex. 'IKEA Poäng fåtölj'"
              value={priceQuery}
              onChange={(e) => setPriceQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="price-category">Kategori-id (valfritt)</Label>
            <Input
              id="price-category"
              inputMode="numeric"
              placeholder="t.ex. 1612"
              value={priceCategory}
              onChange={(e) => setPriceCategory(e.target.value)}
            />
          </div>
          <Button onClick={getPrice} disabled={busy !== null}>
            {busy === "price" ? "Hämtar comps…" : "Hämta prisförslag"}
          </Button>
        </CardContent>
      </Card>

      <ResultView result={result} />
    </div>
  );
}

function StatusBar({ status }: { status: TraderaStatus | null }) {
  if (!status) {
    return (
      <div className="text-muted-foreground text-sm">Hämtar status…</div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Status:</span>
      <Badge variant={status.appConfigured ? "default" : "destructive"}>
        App-nyckel {status.appConfigured ? "konfigurerad" : "saknas"}
      </Badge>
      <Badge variant={status.sandbox ? "secondary" : "destructive"}>
        {status.sandbox ? "Sandbox" : "PRODUKTION"}
      </Badge>
      <Badge variant={status.userConnected ? "default" : "outline"}>
        {status.userConnected
          ? `Konto anslutet (#${status.userId})`
          : "Inget konto anslutet"}
      </Badge>
    </div>
  );
}

function ResultView({ result }: { result: ResultPanel | null }) {
  if (!result) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Svar</CardTitle>
        <CardDescription>{result.title}</CardDescription>
      </CardHeader>
      <CardContent>
        <Separator className="mb-4" />
        <pre className="bg-muted max-h-96 overflow-auto rounded-md p-4 text-xs">
          {JSON.stringify(result.data, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}
