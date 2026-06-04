import { LoppisSpike } from "@/components/loppis-spike";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-8 flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Loppis Helper</h1>
        <p className="text-muted-foreground text-balance">
          Fotografera en pryl, få ett prissatt säljutkast och posta till Tradera
          via API – eller via förifylld överlämning till Blocket och Facebook
          Marketplace.
        </p>
        <p className="text-muted-foreground text-sm">
          Det här är den första milstolpen: ställningen för projektet plus
          Tradera-autentiseringsspiken. Se{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">README.md</code>{" "}
          för vad som är verifierat och vad som kräver riktiga nycklar.
        </p>
      </header>

      <LoppisSpike />
    </main>
  );
}
