"use client";
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal drawer focus management: while `open && modal`, focus the first
 * control inside `ref`; on close, return focus to whatever had it before
 * (the trigger). The caller makes the background inert and handles Escape.
 */
export function useDrawerFocus(open: boolean, modal: boolean, ref: RefObject<HTMLElement | null>) {
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open || !modal) return;
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      // Runs after the commit that closed the drawer, so the background is no longer inert.
      const t = trigger.current;
      trigger.current = null;
      if (t?.isConnected) t.focus();
    };
  }, [open, modal, ref]);
}
