"use client";
// Accessible modal on the native <dialog> element: showModal() gives a real
// focus trap (the rest of the page becomes inert) and Escape → onClose.
// Portalled to <body> so an inert ancestor (drawers, the main column) can
// never swallow it. Focus goes to [data-autofocus] (else the first control)
// and returns to the previously focused element on close. If the browser
// closes the dialog itself (e.g. Chrome’s CloseWatcher on a repeated Escape or
// the Android back gesture, which skips a preventable `cancel`), the native
// `close` event syncs React state via onClose.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const subscribeNoop = () => () => {};

export function ModalDialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  className = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // Portal target exists only on the client.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [open, mounted]);

  if (!mounted || !open) return null;
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`lm-dialog ${className}`}
      onCancel={(e) => {
        // Escape: let React state drive closing (and focus return).
        e.preventDefault();
        onCloseRef.current();
      }}
      onClose={(e) => {
        // `close` is dispatched async; ignore a stale one from our own
        // close() if the dialog has since been reopened.
        if (!e.currentTarget.open) onCloseRef.current();
      }}
      onClick={(e) => {
        // Click on the backdrop (the dialog box itself, outside its content).
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      {children}
    </dialog>,
    document.body,
  );
}
