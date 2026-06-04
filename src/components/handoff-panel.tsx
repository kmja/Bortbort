"use client";

import { Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  formatDescription,
  formatFullListing,
  type ListingFields,
  MARKETPLACE_ORDER,
  MARKETPLACES,
} from "@/lib/handoff";

interface HandoffPanelProps {
  fields: ListingFields;
  image: { dataUrl: string; name: string } | null;
}

async function copy(label: string, text: string) {
  if (!text.trim()) {
    toast.error(`Inget att kopiera (${label}).`);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} kopierad.`);
  } catch {
    toast.error("Kunde inte kopiera till urklipp.");
  }
}

export function HandoffPanel({ fields, image }: HandoffPanelProps) {
  const fullText = formatFullListing(fields);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Steg 4 · Dela till Blocket &amp; Facebook</CardTitle>
        <CardDescription>
          Blocket och Facebook saknar öppet annons-API – kopiera texten, öppna
          deras formulär och ladda upp bilderna manuellt.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <pre className="bg-muted max-h-56 overflow-auto rounded-md p-4 text-xs whitespace-pre-wrap">
          {fullText || "Inget utkast ännu."}
        </pre>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => copy("Titel", fields.title)}
          >
            <Copy /> Titel
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => copy("Beskrivning", formatDescription(fields))}
          >
            <Copy /> Beskrivning
          </Button>
          <Button size="sm" onClick={() => copy("Annonstext", fullText)}>
            <Copy /> Kopiera allt
          </Button>
          {image && (
            <Button asChild size="sm" variant="outline">
              <a href={image.dataUrl} download={image.name}>
                <Download /> Ladda ner foto
              </a>
            </Button>
          )}
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          {MARKETPLACE_ORDER.map((key) => {
            const m = MARKETPLACES[key];
            return (
              <div
                key={key}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className="text-muted-foreground text-xs">{m.note}</span>
                </div>
                <Button asChild size="sm" variant="secondary">
                  <a href={m.createUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> Öppna {m.label}
                  </a>
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
