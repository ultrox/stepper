import { useState, useRef, useEffect, useCallback, useId } from "react";

// Step definitions. Each step has a 1-based id for ordering and a label.
const STEPS = [
  { id: 1,  label: "Home" },
  { id: 2,  label: "Karten" },
  { id: 3,  label: "Kartenhalter" },
  { id: 4,  label: "Partner" },
  { id: 5,  label: "Bank" },
  { id: 6,  label: "Wirtschaftlicher Eigentumer" },
  { id: 7,  label: "Finanzen" },
  { id: 8,  label: "Zahlung" },
  { id: 9,  label: "PEP" },
  { id: 10, label: "Summary" },
];

// Minimum total gap we want between labels before switching to compact.
// 9 gaps (between 10 steps) x 20px each = 180px.
const GAP_BUDGET = (STEPS.length - 1) * 20;

// Once compact, we need this much EXTRA room before going back to regular.
// Prevents rapid toggling when the width sits right at the threshold.
const HYSTERESIS = 48;

// All CSS in one string, injected via <style>. Keeps the component self-contained.
const css = `
  .stepper-root * { box-sizing: border-box; }
  .stepper-root { font-family: 'Segoe UI', system-ui, sans-serif; }

  /* Regular mode layout.
     Steps share the container equally via flex:1.
     Each step is a column: circle on top, label below. */
  .stepper {
    display: flex;
    align-items: flex-start;
    width: 100%;
  }
  .stepper .step {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    gap: 6px;
  }

  /* Connecting lines between steps.
     Each step draws two half-lines using ::before (left) and ::after (right).
     They're anchored at 50% + circle radius so they always touch the circle,
     no matter how wide the label makes the step.
     First step has no left line, last step has no right line. */
  .stepper .step:not(:last-child)::after {
    content: '';
    position: absolute;
    top: 14px;
    left: calc(50% + 14px);
    right: 0;
    height: 1px;
    background: #e2e8f0;
    transition: background 0.3s;
  }
  .stepper .step:not(:first-child)::before {
    content: '';
    position: absolute;
    top: 14px;
    left: 0;
    right: calc(50% + 14px);
    height: 1px;
    background: #e2e8f0;
    transition: background 0.3s;
  }

  /* Done steps: both half-lines green.
     Active step: only left half green (connecting back to completed side). */
  .stepper .step.done::before,
  .stepper .step.done::after    { background: #22c55e; }
  .stepper .step.active::before { background: #22c55e; }

  /* Regular circle: 28x28 with centered number or checkmark */
  .stepper .step .circle {
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
  .stepper .step .reg-label {
    font-size: 11px;
    font-weight: 400;
    color: #9ca3af;
    white-space: nowrap;
    text-align: center;
  }

  /* State colors for regular mode */
  .stepper .step.done .circle      { background: #22c55e; color: #fff; }
  .stepper .step.done .reg-label   { color: #22c55e; }
  .stepper .step.active .circle    { background: #6366f1; color: #fff; box-shadow: 0 0 0 3px #e0e7ff; }
  .stepper .step.active .reg-label { color: #6366f1; font-weight: 700; }

  /* Compact mode.
     When the container is too narrow, steps shrink to 18px mini-circles.
     Line anchors shift to match the smaller radius (9px vs 14px). */
  .stepper .step.compact { gap: 5px; }

  .stepper.is-compact .step:not(:last-child)::after {
    top: 9px;
    left: calc(50% + 9px);
  }
  .stepper.is-compact .step:not(:first-child)::before {
    top: 9px;
    right: calc(50% + 9px);
  }

  /* Mini circle used in compact mode */
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

  /* Non-active compact steps scale up on hover to hint they're hoverable */
  .step.compact:not(.active):hover  .mini-circle { transform: scale(1.3); }

  /* Popover tooltip using the native Popover API (popover="manual").
     Renders in the browser's top layer so there are no z-index issues.
     Starts invisible (opacity:0, shifted down 3px). The :popover-open
     pseudo-class triggers the transition to full visibility.
     Position is calculated in JS using getBoundingClientRect(). */
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
    opacity: 0;
    transform: translateY(3px);
    transition: opacity 0.15s, transform 0.15s;
  }
  [popover].step-tip:popover-open {
    opacity: 1;
    transform: translateY(0);
  }

  /* Arrow pointing down from the popover.
     --arrow-left is set via JS so the arrow always points at the circle
     center, even when the popover body gets clamped to the viewport edge. */
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

  /* Active step label in compact mode.
     Absolute-positioned below the mini-circle so it doesn't affect
     the row height or push other steps around. */
  .stepper .compact-active-label {
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

  /* Ghost mode: disables flex:1 so each step takes its natural width.
     We read the ghost's scrollWidth to know how much space regular
     layout actually needs. */
  .ghost-mode .step { flex: none !important; }
`;

// Compact step with its own popover tooltip.
//
// Each instance creates a native popover element (popover="manual")
// that shows on hover. The positioning logic:
//   1. Show the popover (still invisible at opacity:0)
//   2. Measure both the circle and popover dimensions
//   3. Center the popover above the circle
//   4. Clamp to viewport edges with 8px margin
//   5. Adjust --arrow-left so the arrow still points at the circle
//
// suppressRef is a shared mutable flag (not state) that gates tooltip
// display. It's set to true for 200ms during mode switches and step
// changes to prevent tooltips from flashing while the DOM is shifting.

function CompactStep({ step, isDone, isActive, suppressRef }) {
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);

  // useId gives a stable unique id per component instance.
  // We strip colons because they're not valid in CSS id selectors.
  const uid = useId().replace(/:/g, "");
  const popoverId = `tip-${uid}-${step.id}`;

  const show = useCallback(() => {
    // Don't show during mode/step transitions
    if (suppressRef.current) return;
    // Active step shows its label inline, not as a tooltip
    if (isActive) return;

    const pop = popoverRef.current;
    const trigger = triggerRef.current;
    if (!pop || !trigger) return;

    const rect = trigger.getBoundingClientRect();

    // Show while still at opacity:0 so we can measure its size
    try { pop.showPopover(); } catch { return; }

    const popW = pop.offsetWidth;
    const popH = pop.offsetHeight;
    const GAP  = 13; // 5px arrow + 8px space

    // Center horizontally on the circle
    const circleCx = rect.left + rect.width / 2;

    let left = circleCx - popW / 2;
    let top  = rect.top - popH - GAP;

    // Clamp to viewport with 8px margin
    left = Math.max(8, Math.min(left, window.innerWidth  - popW - 8));
    top  = Math.max(8, Math.min(top,  window.innerHeight - popH - 8));

    // Move the CSS arrow to still point at the circle after clamping
    const arrowLeft = Math.round(circleCx - left);
    pop.style.setProperty("--arrow-left", `${arrowLeft}px`);
    pop.style.left = `${left}px`;
    pop.style.top  = `${top}px`;
  }, [isActive, suppressRef]);

  const hide = useCallback(() => {
    try { popoverRef.current?.hidePopover(); } catch {}
  }, []);

  // If this step becomes active while its popover is open, close it
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
        {isDone ? "\u2713" : step.id}
      </div>

      {/* Active step gets a persistent label below the circle */}
      {isActive && <span className="compact-active-label">{step.label}</span>}

      {/* Non-active steps get a hover popover */}
      {!isActive && (
        <div ref={popoverRef} id={popoverId} popover="manual" className="step-tip">
          {step.label}
        </div>
      )}
    </div>
  );
}

// Regular full-size step with a 28px circle and visible label.
// Used when the container is wide enough for all labels.

function RegularStep({ step, isDone, isActive }) {
  const cls = ["step", isDone && "done", isActive && "active"]
    .filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <div className="circle">{isDone ? "\u2713" : step.id}</div>
      <span className="reg-label">{step.label}</span>
    </div>
  );
}

// Main stepper. Renders CompactStep or RegularStep per step
// depending on the compact flag. isDone/isActive are derived
// from comparing each step's id to the current step number.

function Stepper({ current, compact, suppressRef }) {
  return (
    <div className={["stepper", compact && "is-compact"].filter(Boolean).join(" ")}>
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

// Invisible off-screen copy of the stepper, always in regular mode.
// Purpose: width measurement. The .ghost-mode class disables flex:1
// so each step takes its natural (label-driven) width. detect() reads
// this element's scrollWidth to know the minimum space regular layout
// needs, which drives the compact/regular switch.

function Ghost({ current }) {
  return (
    <div id="ghost" className="stepper ghost-mode" style={{
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

// Small pill badge showing "compact" or "regular" for demo feedback.

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

// App - ties everything together.
//
// Key concepts:
//
// suppressRef: a mutable ref (not state) shared with CompactStep.
// When true, CompactStep won't show tooltips. We set it to true for
// 200ms on every step change and compact toggle to prevent tooltip
// flashes during DOM transitions. It's a ref instead of state because
// we don't want toggling it to cause re-renders.
//
// detect(): compares the wrapper's clientWidth against the ghost's
// scrollWidth + GAP_BUDGET. If the container is too narrow, switch to
// compact. If wide enough (with HYSTERESIS buffer), switch back.
// Called by a ResizeObserver and also on step change (because the
// active label width varies per step, changing the ghost measurement).

export default function App() {
  const [current, setCurrent] = useState(1);
  const [compact, setCompact] = useState(false);

  const wrapperRef    = useRef(null);
  const suppressRef   = useRef(false);
  const suppressTimer = useRef(null);

  // Blank all tooltips for 200ms
  const suppress = useCallback(() => {
    suppressRef.current = true;
    clearTimeout(suppressTimer.current);
    suppressTimer.current = setTimeout(() => {
      suppressRef.current = false;
    }, 200);
  }, []);

  // Compare container width vs what regular layout needs
  const detect = useCallback(() => {
    const ghost = document.getElementById("ghost");
    if (!ghost || !wrapperRef.current) return;
    const available = wrapperRef.current.clientWidth;
    const needed    = ghost.scrollWidth + GAP_BUDGET;
    setCompact(prev => {
      if (!prev && available < needed)               return true;  // too narrow, go compact
      if ( prev && available >= needed + HYSTERESIS) return false; // wide enough, go regular
      return prev;
    });
  }, []);

  // Suppress tooltips when mode changes (steps remount, popovers would flash)
  useEffect(() => { suppress(); }, [compact, suppress]);

  // Suppress tooltips when step changes (active step shifts, stale popovers)
  useEffect(() => { suppress(); }, [current, suppress]);

  // Watch container width with ResizeObserver
  useEffect(() => {
    const ro = new ResizeObserver(detect);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    detect(); // initial check
    return () => ro.disconnect();
  }, [detect]);

  // Re-check on step change because the active label width varies per step
  useEffect(() => { detect(); }, [current, detect]);

  // Navigate forward/backward, clamped to valid range
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

      {/* Hidden ghost for width measurement */}
      <Ghost current={current} />

      {/* Wrapper - its width drives compact detection */}
      <div ref={wrapperRef} style={{ width: "100%", maxWidth: 780 }}>
        <div style={{
          fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em",
          color: "#94a3b8", fontWeight: 600, marginBottom: 24,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          Stepper
          <Badge compact={compact} />
        </div>

        <Stepper current={current} compact={compact} suppressRef={suppressRef} />
      </div>

      {/* Navigation controls */}
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
        Resize the window to trigger compact mode
      </p>
    </div>
  );
}
