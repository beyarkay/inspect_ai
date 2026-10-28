import { FC, useCallback, useRef, useState } from "react";

const kCloseDelayMs = 250;

export interface OutlinePeek {
  open: boolean;
  enter: () => void;
  /** Keep a peek open while the pointer is over the floating panel. */
  hold: () => void;
  leave: () => void;
}

export const useOutlinePeek = (): OutlinePeek => {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const set = (next: boolean) => {
    openRef.current = next;
    setOpen(next);
  };
  const enter = useCallback(() => {
    window.clearTimeout(timer.current);
    set(true);
  }, []);
  const hold = useCallback(() => {
    if (openRef.current) window.clearTimeout(timer.current);
  }, []);
  const leave = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => set(false), kCloseDelayMs);
  }, []);
  return { open, enter, hold, leave };
};

const OutlineIcon: FC<{ docked: boolean }> = ({ docked }) => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <rect
      x="1.5"
      y="2.5"
      width="13"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    {docked && <rect x="2" y="3" width="4.5" height="10" fill="currentColor" />}
    <path
      d="M8.5 5.5h4M8.5 8h4M8.5 10.5h4"
      stroke="currentColor"
      strokeWidth="1.3"
    />
  </svg>
);

interface OutlineDockBarProps {
  docked: boolean;
  disabled: boolean;
  title?: string;
  onToggle: () => void;
  onPeek: () => void;
}

/** The outline's one control, at the same spot whether the outline is hidden,
 *  floating or docked: hover floats it over the transcript, click docks it,
 *  click again floats it. */
export const OutlineDockBar: FC<OutlineDockBarProps> = ({
  docked,
  disabled,
  title,
  onToggle,
  onPeek,
}) => (
  <div className="pro-outline-bar">
    <button
      type="button"
      className="pro-outline-button"
      aria-pressed={docked}
      aria-disabled={disabled}
      aria-label={docked ? "Float the outline" : "Dock the outline"}
      title={
        disabled
          ? "No outline for the current filter"
          : docked
            ? "Outline docked: click to float it"
            : "Hover to peek at the outline; click to dock it"
      }
      onMouseEnter={disabled ? undefined : onPeek}
      onClick={disabled ? undefined : onToggle}
    >
      <OutlineIcon docked={docked} />
    </button>
    <span className="pro-outline-label">{title ?? "outline"}</span>
  </div>
);
