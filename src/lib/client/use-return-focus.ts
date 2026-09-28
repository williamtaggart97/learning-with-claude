"use client";
import { useEffect, useRef } from "react";

/**
 * After an inline editor closes (cancel, Escape, save, add), put focus back on
 * the control that opened it ("Adjust", "Edit", "Add…"). Attach the returned
 * ref to that trigger; it must be rendered again once `open` is false.
 */
export function useReturnFocus<T extends HTMLElement = HTMLButtonElement>(open: boolean) {
  const ref = useRef<T>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) ref.current?.focus();
    wasOpen.current = open;
  }, [open]);
  return ref;
}
