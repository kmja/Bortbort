import { LoppisApp } from "@/components/loppis-app";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-8 flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Loppis Helper</h1>
        <p className="text-muted-foreground text-balance">
          Fota en pryl → få ett prissatt säljutkast → publicera på Tradera via
          API eller dela förifyllt till Blocket och Facebook Marketplace.
        </p>
        <p className="text-muted-foreground text-sm">
          Tradera-anropen kräver riktiga API-nycklar (se{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">README.md</code>
          ). Identifiering kräver en{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">
            ANTHROPIC_API_KEY
          </code>
          .
        </p>
      </header>

      <LoppisApp />
    </main>
  );
}
