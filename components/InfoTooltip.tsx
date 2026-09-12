"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colors, mono } from "./theme";

const POPUP_WIDTH = 230;

/**
 * Small "ⓘ" button that pops a plain-language explanation on click (not
 * hover — has to work on mobile too). Renders the popup through a portal
 * into document.body, positioned via the button's actual screen
 * coordinates — several cards/sections on this site use `overflow: hidden`
 * for background effects (e.g. the hero), which would otherwise silently
 * clip an absolutely-positioned popup nested inside them.
 */
export function InfoTooltip({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleDismiss() {
      setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleDismiss, true);
    window.addEventListener("resize", handleDismiss);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("resize", handleDismiss);
    };
  }, [open]);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      let left = align === "right" ? rect.right - POPUP_WIDTH : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - POPUP_WIDTH - 8));
      setCoords({ top: rect.bottom + 6, left });
    }
    setOpen((v) => !v);
  }

  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label="What does this mean?"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 13,
          height: 13,
          borderRadius: "50%",
          border: `1px solid ${colors.textFaint}`,
          background: "transparent",
          color: colors.textFaint,
          fontFamily: mono,
          fontSize: 9,
          cursor: "pointer",
          marginLeft: 4,
          padding: 0,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        i
      </button>
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popupRef}
            role="tooltip"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              zIndex: 1000,
              width: POPUP_WIDTH,
              padding: "10px 12px",
              borderRadius: 10,
              background: colors.panel,
              border: `1px solid ${colors.lineStrong}`,
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              fontSize: 11.5,
              lineHeight: 1.5,
              fontWeight: 400,
              letterSpacing: "normal",
              color: colors.textDim,
            }}
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
}
