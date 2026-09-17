"use client";

import * as React from "react";

export interface KeyboardInset {
  /** Distance (px) from the layout viewport's bottom up to the visible area's bottom. */
  bottom: number;
  /** Height (px) of the visible area above the keyboard. */
  height: number;
}

// Breathing room above a focused field when it is scrolled into view.
const FIELD_TOP_PADDING = 8;

/**
 * Tracks the part of the layout viewport hidden by the on-screen keyboard via
 * the Visual Viewport API. Includes `offsetTop`, which iOS Safari changes when
 * it pans the page to reveal a focused input. Returns `null` while disabled,
 * when no keyboard is open, or while the page is pinch-zoomed.
 */
export function useKeyboardInset(enabled: boolean): KeyboardInset | null {
  const [inset, setInset] = React.useState<KeyboardInset | null>(null);

  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) {
      setInset(null);
      return;
    }

    const update = () => {
      const height = Math.round(vv.height);
      // No keyboard (visible area is the full layout viewport) or zoomed in.
      if (vv.scale > 1.01 || window.innerHeight - height <= 1) {
        setInset(null);
        return;
      }
      // 0 when the browser has already panned the full keyboard height.
      const bottom = Math.max(0, Math.round(window.innerHeight - vv.offsetTop - height));
      setInset((prev) =>
        prev?.bottom === bottom && prev.height === height ? prev : { bottom, height }
      );
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);

  return inset;
}

/**
 * While the keyboard is up, scrolls `containerRef` so the focused text field's
 * group (`[data-field]`, e.g. label + tag pills + input) sits at the top of the
 * container, leaving the most room below for suggestions. Re-runs on focus
 * changes, keyboard changes, and content resizes (e.g. pills wrapping).
 */
export function useKeepFocusedFieldInView(
  containerRef: React.RefObject<HTMLElement | null>,
  keyboard: KeyboardInset | null
): void {
  React.useEffect(() => {
    const container = containerRef.current;
    if (!keyboard || !container) return;

    let frame = 0;
    const align = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (!(field instanceof HTMLElement)) return;
        if (!field.matches("input, textarea") || !container.contains(field)) return;

        const box = container.getBoundingClientRect();
        const group = field.closest<HTMLElement>("[data-field]") ?? field;
        let delta = group.getBoundingClientRect().top - box.top - FIELD_TOP_PADDING;
        // A tall group (many pills) must not push the field itself out of view.
        const fieldBottom = field.getBoundingClientRect().bottom - delta;
        if (fieldBottom > box.bottom) delta += fieldBottom - box.bottom + FIELD_TOP_PADDING;
        container.scrollTop += delta;
      });
    };

    align();
    container.addEventListener("focusin", align);
    const observer = new ResizeObserver(align);
    Array.from(container.children).forEach((child) => observer.observe(child));
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("focusin", align);
      observer.disconnect();
    };
  }, [containerRef, keyboard]);
}
