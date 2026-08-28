import { messages } from "@/lib/messages";

/**
 * GEÇİCİ placeholder (Faz 3 §3.6b / İterasyon 9). Nav bar'ın "Hareketler" linki
 * §3.5a'da eklendi ama S-MOVEMENTS ekranı İterasyon 9'da gelecek — bu ekran
 * yalnızca linkin 404 vermemesi için var (Faz 1/2 placeholder disiplini).
 */
export default function MovementsPlaceholderPage() {
  return (
    <section className="mx-auto max-w-lg rounded-xl border border-border p-8">
      <h1 className="text-xl font-semibold text-zinc-900">
        {messages.movements.placeholderTitle}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {messages.movements.placeholderBody}
      </p>
    </section>
  );
}
