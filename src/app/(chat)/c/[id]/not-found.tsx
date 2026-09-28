import Link from "next/link";

export default function ConversationNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="font-serif text-2xl font-medium text-ink">This conversation isn’t here</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        It may belong to another persona, or it was cleared when the persona was reset.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-accent-strong px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Start a new chat
      </Link>
    </div>
  );
}
