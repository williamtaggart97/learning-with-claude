"use client";
// Suggested next topics (P6, Tier 2). Clicking one starts a new chat with the
// topic's prompt as the first message.
import { useStartChatWith } from "@/components/chat/chat-sessions-provider";
import { ArrowRightIcon, SparkIcon } from "@/components/icons";
import { useShell } from "@/components/shell/shell-context";
import type { SuggestedTopic } from "@/lib/types";
import { ProfileSection } from "./section";

export function SuggestedTopics({ topics }: { topics: SuggestedTopic[] }) {
  const startChatWith = useStartChatWith();
  const { closeProfilePanel, profileModal } = useShell();
  if (!topics.length) return null;

  return (
    <ProfileSection title="Suggested next topics" description="Picked from your shaky concepts, your queue, and what usually comes next.">
      <ul className="space-y-2">
        {topics.map((t) => (
          <li key={t.title}>
            <button
              type="button"
              onClick={() => {
                if (profileModal) closeProfilePanel();
                startChatWith(t.prompt);
              }}
              className="group flex w-full items-start gap-2.5 rounded-xl border border-learn-200 bg-gradient-to-br from-learn-50 to-surface px-3.5 py-2.5 text-left transition-colors hover:border-learn-400 focus-visible:outline-2 focus-visible:outline-learn-500"
            >
              <SparkIcon className="mt-0.5 size-4 shrink-0 text-learn-600" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-learn-900">{t.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{t.reason}</span>
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-learn-700">
                  Start a chat
                  <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </ProfileSection>
  );
}
