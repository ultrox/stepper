import { useState, useRef, useEffect, useCallback, useId } from "react";

const STEPS = [
  { id: 1,  label: "Home" },
  { id: 2,  label: "Karten" },
  { id: 3,  label: "Kartenhalter" },
  { id: 4,  label: "Partner" },
  { id: 5,  label: "Bank" },
  { id: 6,  label: "Wirtschaftlicher Eigentümer" },
  { id: 7,  label: "Finanzen" },
  { id: 8,  label: "Zahlung" },
  { id: 9,  label: "PEP" },
  { id: 10, label: "Summary" },
];

const GAP_BUDGET = (STEPS.length - 1) * 20;
const HYSTERESIS = 48;

const css = `
  .stepper-root * { box-sizing: border-box; }
  .stepper-root { font-family: 'Segoe UI', system-ui, sans-serif; }

  /* ── VARIANT B — STACKED ── */
  .stepper-b {
    display: flex;
    align-items: flex-start;
    width: 100%;
  }
  .stepper-b .step {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    gap: 6px;
  }

  /* half-lines anchored to circle edge */
  .stepper-b .step:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 14px;
    left: calc(50% + 14px);
    right: 0;
    height: 1px;
    background: #e2e8f0;
    transition: background 0.3s;
  }
  .stepper-b .step:not(:first-child)::before {
    content: '';
    position: absolute;
    top: 14px;
    left: 0;
    right: calc(50% + 14px);
    height: 1px;
    background: #e2e8f0;
    transition: background 0.3s;
  }
  .stepper-b .step.done::before,
  .stepper-b .step.done::after    { background: #22c55e; }
  .stepper-b .step.active::before { background: #22c55e; }

  .stepper-b .step .circle {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    background: #e5e7eb;
    color: #9ca3af;
    flex-shrink: 0;
    position: relative;
    z-index: 1;
    transition: background 0.25s, color 0.25s, box-shadow 0.25s;
  }
  .stepper-b .step .reg-label {
    font-size: 11px;
    font-weight: 400;
    color: #9ca3af;
    white-space: nowrap;
    text-align: center;
  }
  .stepper-b .step.done .circle      { background: #22c55e; color: #fff; }
  .stepper-b .step.done .reg-label   { color: #22c55e; }
  .stepper-b .step.active .circle    { background: #6366f1; color: #fff; box-shadow: 0 0 0 3px #e0e7ff; }
  .stepper-b .step.active .reg-label { color: #6366f1; font-weight: 700; }

  /* ── COMPACT ── */
  .stepper-b .step.compact { gap: 5px; }

  .stepper-b.is-compact .step:not(:last-child)::after {
    top: 9px;
    left: calc(50% + 9px);
  }
  .stepper-b.is-compact .step:not(:first-child)::before {
    top: 9px;
    right: calc(50% + 9px);
  }

  .mini-circle {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 700;
    background: #e5e7eb;
    color: #9ca3af;
    position: relative;
    z-index: 1;
    transition: background 0.25s, color 0.25s, box-shadow 0.2s, transform 0.18s;
    cursor: default;
    user-select: none;
  }
  .step.compact.done   .mini-circle { background: #dcfce7; color: #16a34a; }
  .step.compact.active .mini-circle { background: #6366f1; color: #fff; box-shadow: 0 0 0 3px #e0e7ff; }
  .step.compact:not(.active):hover  .mini-circle { transform: scale(1.3); }

  /* ── Native popover tooltip ──
     Lives in the top layer — no z-index battles.
     Positioned via JS from getBoundingClientRect().           */
  [popover].step-tip {
    position: fixed;
    margin: 0;
    padding: 4px 9px 4px 9px;
    background: #1e293b;
    color: #f8fafc;
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    border: none;
    border-radius: 5px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    overflow: visible;
    /* Animate in/out via the open state */
    opacity: 0;
    transform: translateY(3px);
    transition: opacity 0.15s, transform 0.15s;
  }
  [popover].step-tip:popover-open {
    opacity: 1;
    transform: translateY(0);
  }
  /* Arrow — left is set via --arrow-left so it always points at the
     circle center even when the popover is clamped to the viewport edge. */
  [popover].step-tip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: var(--arrow-left, 50%);
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: #1e293b;
    transition: left 0.1s;
  }

  /* Active label in compact: absolute so it never affects row height */
  .stepper-b .compact-active-label {
    position: absolute;
    top: calc(100% + 5px);
    left: 50%;
    transform: translateX(-50%);
    font-size: 11px;
    font-weight: 700;
    color: #6366f1;
    white-space: nowrap;
    pointer-events: none;
  }

  /* Ghost: disable flex:1 so scrollWidth = sum of natural step widths */
  .ghost-mode .step { flex: none !important; }
`;

// ── CompactStep — manages its own native popover ─────────────────────

function CompactStep({ step, isDone, isActive, suppressRef }) {
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);
  const uid = useId().replace(/:/g, "");
  const popoverId = `tip-${uid}-${step.id}`;

  const show = useCallback(() => {
    // Don't show during mode/step transitions
    if (suppressRef.current) return;
    if (isActive) return;

    const pop = popoverRef.current;
    const trigger = triggerRef.current;
    if (!pop || !trigger) return;

    // Position above the trigger, horizontally centered
    const rect = trigger.getBoundingClientRect();
    // Show first (hidden via opacity:0) so we can read its dimensions
    try { pop.showPopover(); } catch { return; }

    const popW = pop.offsetWidth;
    const popH = pop.offsetHeight;
    const GAP  = 13; // 5px arrow + 8px breathing room

    const circleCx = rect.left + rect.width / 2;

    let left = circleCx - popW / 2;
    let top  = rect.top - popH - GAP;

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth  - popW - 8));
    top  = Math.max(8, Math.min(top,  window.innerHeight - popH - 8));

    // Arrow always points at circle center regardless of clamping
    const arrowLeft = Math.round(circleCx - left);
    pop.style.setProperty("--arrow-left", `${arrowLeft}px`);
    pop.style.left = `${left}px`;
    pop.style.top  = `${top}px`;
  }, [isActive, suppressRef]);

  const hide = useCallback(() => {
    try { popoverRef.current?.hidePopover(); } catch {}
  }, []);

  useEffect(() => { if (isActive) hide(); }, [isActive, hide]);

  const cls = ["step", isDone && "done", isActive && "active", "compact"]
    .filter(Boolean).join(" ");

  return (
    <div className={cls}>
      <div
        ref={triggerRef}
        className="mini-circle"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {isDone ? "✓" : step.id}
      </div>

      {isActive && <span className="compact-active-label">{step.label}</span>}

      {!isActive && (
        <div ref={popoverRef} id={popoverId} popover="manual" className="step-tip">
          {step.label}
        </div>
      )}
    </div>
  );
}

// ── Regular step ─────────────────────────────────────────────────────

function RegularStep({ step, isDone, isActive }) {
  const cls = ["step", isDone && "done", isActive && "active"]
    .filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <div className="circle">{isDone ? "✓" : step.id}</div>
      <span className="reg-label">{step.label}</span>
    </div>
  );
}

// ── Stepper ──────────────────────────────────────────────────────────

function StepperB({ current, compact, suppressRef }) {
  return (
    <div className={["stepper-b", compact && "is-compact"].filter(Boolean).join(" ")}>
      {STEPS.map((step) => {
        const isDone   = step.id < current;
        const isActive = step.id === current;
        return compact
          ? <CompactStep
              key={step.id}
              step={step}
              isDone={isDone}
              isActive={isActive}
              suppressRef={suppressRef}
            />
          : <RegularStep
              key={step.id}
              step={step}
              isDone={isDone}
              isActive={isActive}
            />;
      })}
    </div>
  );
}

// ── Ghost ─────────────────────────────────────────────────────────────

function GhostB({ current }) {
  return (
    <div id="ghost-b" className="stepper-b ghost-mode" style={{
      position: "fixed", top: -9999, left: -9999,
      visibility: "hidden", pointerEvents: "none",
      width: "max-content",
    }}>
      {STEPS.map((step) => (
        <RegularStep
          key={step.id}
          step={step}
          isDone={step.id < current}
          isActive={step.id === current}
        />
      ))}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────

function Badge({ compact }) {
  return (
    <span style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 4,
      fontWeight: 700, letterSpacing: "0.05em",
      background: compact ? "#eff6ff" : "#f0fdf4",
      color:      compact ? "#3b82f6" : "#16a34a",
      transition: "background 0.2s, color 0.2s",
    }}>
      {compact ? "compact" : "regular"}
    </span>
  );
}

// ── App ───────────────────────────────────────────────────────────────

export default function App() {
  const [current, setCurrent] = useState(1);
  const [compact, setCompact] = useState(false);

  const wrapperRef   = useRef(null);
  // suppressRef is a mutable flag — deliberately NOT state so it never
  // triggers re-renders. CompactStep reads it synchronously in mouseenter.
  const suppressRef  = useRef(false);
  const suppressTimer = useRef(null);

  // Call this whenever we want to blank all tooltips for 200ms
  const suppress = useCallback(() => {
    suppressRef.current = true;
    clearTimeout(suppressTimer.current);
    suppressTimer.current = setTimeout(() => {
      suppressRef.current = false;
    }, 200);
  }, []);

  const detect = useCallback(() => {
    const ghost = document.getElementById("ghost-b");
    if (!ghost || !wrapperRef.current) return;
    const available = wrapperRef.current.clientWidth;
    const needed    = ghost.scrollWidth + GAP_BUDGET;
    setCompact(prev => {
      if (!prev && available < needed)               return true;
      if ( prev && available >= needed + HYSTERESIS) return false;
      return prev;
    });
  }, []);

  // Suppress on compact toggle
  useEffect(() => { suppress(); }, [compact, suppress]);

  // Suppress on step change — the active step shifts, popovers may be open
  useEffect(() => { suppress(); }, [current, suppress]);

  useEffect(() => {
    const ro = new ResizeObserver(detect);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    detect();
    return () => ro.disconnect();
  }, [detect]);

  useEffect(() => { detect(); }, [current, detect]);

  const go = (dir) =>
    setCurrent(c => Math.min(STEPS.length, Math.max(1, c + dir)));

  return (
    <div className="stepper-root" style={{
      background: "#f8fafc", minHeight: "100vh",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 48, padding: "64px 32px",
    }}>
      <style>{css}</style>

      <GhostB current={current} />

      <div ref={wrapperRef} style={{ width: "100%", maxWidth: 780 }}>
        <div style={{
          fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em",
          color: "#94a3b8", fontWeight: 600, marginBottom: 24,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          Stepper
          <Badge compact={compact} />
        </div>

        <StepperB current={current} compact={compact} suppressRef={suppressRef} />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={() => go(-1)} style={{
          padding: "8px 20px", borderRadius: 8, fontSize: 14,
          cursor: "pointer", fontFamily: "inherit",
          border: "1px solid #e2e8f0", background: "#fff", color: "#374151",
        }}>← Back</button>

        <span style={{
          fontSize: 13, color: "#6366f1", fontWeight: 600,
          minWidth: 210, textAlign: "center",
        }}>
          {current} / {STEPS.length} — {STEPS[current - 1].label}
        </span>

        <button onClick={() => go(1)} style={{
          padding: "8px 20px", borderRadius: 8, fontSize: 14,
          cursor: "pointer", fontFamily: "inherit",
          border: "none", background: "#6366f1", color: "#fff",
          boxShadow: "0 2px 8px #6366f140",
        }}>Next →</button>
      </div>

      <p style={{
        fontSize: 12, color: "#94a3b8",
        border: "1px dashed #e2e8f0", borderRadius: 8, padding: "10px 20px",
      }}>
        ↔ Resize the window to trigger compact mode
      </p>
    </div>
  );
}
