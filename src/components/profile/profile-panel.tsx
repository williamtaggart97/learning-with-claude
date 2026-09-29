"use client";
// Right-hand panel region (collapsed by default). The frame — open/close,
// inline on lg+, overlay drawer below — is done; Phase 4 fills
// <ProfilePanelContent /> with the full learner profile and the Learn It
// Later queue.
import { useRef, useState } from "react";
import { CloseIcon, LearnIcon } from "@/components/icons";
import { useShell } from "@/components/shell/shell-context";
import { useDrawerFocus } from "@/lib/client/use-drawer-focus";
import { ProfilePanelContent } from "./profile-panel-content";

const DEFAULT_WIDTH = "clamp(24rem,45vw,56rem)";
const MIN_WIDTH = 320;
const KEY_STEP = 24;

export function ProfilePanel() {
  const { profilePanelOpen, closeProfilePanel, navModal, profileModal } = useShell();
  const ref = useRef<HTMLElement>(null);
  // Width in px once the user has dragged; null keeps the responsive default (lg+ only).
  const [width, setWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const clampWidth = (w: number) => Math.round(Math.min(Math.max(w, MIN_WIDTH), window.innerWidth * 0.75));
  const currentWidth = () => ref.current?.getBoundingClientRect().width ?? MIN_WIDTH;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setWidth(clampWidth(window.innerWidth - e.clientX));
  };
  const endDrag = () => setDragging(false);
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0;
    if (dir) {
      e.preventDefault();
      setWidth(clampWidth(currentWidth() + dir * KEY_STEP));
    } else if (e.key === "Home" || e.key === "Escape") {
      setWidth(null);
    }
  };
  // Below lg the panel is a modal drawer: focus moves in, and back to the toggle on close.
  useDrawerFocus(profilePanelOpen, profileModal, ref);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={closeProfilePanel}
        className={`fixed inset-0 z-30 bg-ink/25 transition-opacity lg:hidden ${
          profilePanelOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        ref={ref}
        id="profile-panel"
        aria-label="Learning profile"
        inert={!profilePanelOpen || navModal}
        style={{ "--profile-w": width === null ? DEFAULT_WIDTH : `${width}px` } as React.CSSProperties}
        className={`fixed inset-y-0 right-0 z-40 flex w-[min(24rem,100vw)] shrink-0 flex-col border-l border-learn-200 bg-surface duration-200 ease-out lg:relative lg:z-auto lg:w-(--profile-w) ${
          dragging ? "transition-none" : "transition-[transform,margin]"
        } ${
          profilePanelOpen
            ? "translate-x-0 shadow-xl lg:mr-0 lg:shadow-none"
            : "translate-x-full lg:-mr-(--profile-w)"
        }`}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize learning profile"
          aria-valuemin={MIN_WIDTH}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          onDoubleClick={() => setWidth(null)}
          className={`group absolute inset-y-0 -left-1.5 z-10 hidden w-3 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none lg:flex`}
        >
          <span
            className={`h-full w-0.5 transition-colors group-hover:bg-learn-400 group-focus-visible:bg-learn-500 ${
              dragging ? "bg-learn-500" : "bg-transparent"
            }`}
          />
        </div>
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-learn-100 px-4">
          <h2 className="inline-flex items-center gap-2 font-serif text-lg font-medium text-learn-900">
            <LearnIcon className="size-4 text-learn-600" />
            Your learning profile
          </h2>
          <button
            type="button"
            onClick={closeProfilePanel}
            className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-learn-500"
            aria-label="Close learning profile"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <ProfilePanelContent />
        </div>
      </aside>
    </>
  );
}
