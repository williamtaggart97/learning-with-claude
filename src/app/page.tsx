// Placeholder shell — the real chat UI arrives in phases 3/4.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="font-serif text-4xl font-medium tracking-tight text-ink sm:text-5xl">
        Learning mode
      </h1>
      <p className="mt-4 max-w-md text-ink-muted">
        Claude still answers — and every exchange builds your understanding.
      </p>
      <div className="mt-8 flex gap-3 text-sm">
        <span className="rounded-full bg-accent-soft px-3 py-1 text-accent-ink">Chat</span>
        <span className="rounded-full border border-learn-200 bg-learn-50 px-3 py-1 text-learn-700">
          Learn It Later
        </span>
      </div>
    </main>
  );
}
