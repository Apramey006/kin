"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from "react";
import { X } from "lucide-react";

// Keep the actual position and velocity between targets. A new gesture can
// interrupt either direction without jumping to an animation's destination.
export function Sheet({
  open,
  onClose,
  title,
  children,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [present, setPresent] = useState(open);
  const content = useRef(children);
  const shownTitle = useRef(title);
  if (open) shownTitle.current = title;
  if (open) content.current = children;
  const latest = useRef({ open, onClose, busy });
  latest.current = { open, onClose, busy };
  const motion = useRef({
    y: 0,
    v: 0,
    target: 0,
    frame: 0,
    last: 0,
    height: 600,
    dragging: false,
    reduced: false,
    mobile: false,
    origin: 0,
    samples: [] as { y: number; t: number }[],
  });
  const paint = () => {
    const d = ref.current,
      m = motion.current;
    if (!d) return;
    const progress = Math.max(0, Math.min(1, 1 - m.y / m.height));
    d.style.transform = m.reduced
      ? "none"
      : m.mobile
        ? `translate3d(0,${m.y}px,0)`
        : `translate3d(0,${m.y * 0.04}px,0) scale(${0.97 + 0.03 * progress})`;
    d.style.opacity = "1";
    d.style.setProperty("--scrim", String(0.22 * progress));
  };
  const finish = () => {
    const d = ref.current;
    if (
      !latest.current.open &&
      motion.current.target === motion.current.height
    ) {
      d?.close();
      setPresent(false);
    }
  };
  const tick = (now: number) => {
    const m = motion.current;
    const dt = Math.min((now - (m.last || now)) / 1000, 0.032);
    m.last = now;
    const stiffness = 440;
    const damping = 2 * Math.sqrt(stiffness);
    m.v += (-stiffness * (m.y - m.target) - damping * m.v) * dt;
    m.y += m.v * dt;
    paint();
    if (Math.abs(m.y - m.target) < 0.4 && Math.abs(m.v) < 3) {
      m.y = m.target;
      m.v = 0;
      m.frame = 0;
      paint();
      finish();
    } else m.frame = requestAnimationFrame(tick);
  };
  const settle = (target: number) => {
    const m = motion.current;
    m.target = target;
    m.last = 0;
    cancelAnimationFrame(m.frame);
    if (m.reduced) {
      m.y = target;
      m.v = 0;
      paint();
      finish();
    } else m.frame = requestAnimationFrame(tick);
  };
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const m = motion.current;
    m.mobile = matchMedia("(max-width: 760px)").matches;
    m.reduced =
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("kin-reduce-motion");
    if (open) {
      setPresent(true);
      if (!d.open) {
        d.showModal();
        m.height = d.getBoundingClientRect().height + 48;
        m.y = m.height;
        m.v = 0;
        paint();
      }
      settle(0);
    } else if (d.open) {
      settle(m.height);
    } // Each target continues from the live position and velocity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!present) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [present]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const observer = new ResizeObserver(() => {
      if (!dialog.open) return;
      const m = motion.current;
      const closing = m.target === m.height;
      m.height = dialog.offsetHeight + 48;
      if (closing && !latest.current.open) settle(m.height);
    });
    observer.observe(dialog);
    return () => observer.disconnect();
    // The observer updates the existing spring rather than restarting the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => cancelAnimationFrame(motion.current.frame), []);
  const requestClose = () => {
    if (latest.current.busy) return;
    latest.current.onClose();
    settle(motion.current.height);
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    const m = motion.current;
    if (
      !m.mobile ||
      latest.current.busy ||
      e.button !== 0 ||
      (e.target as HTMLElement).closest("button")
    )
      return;
    cancelAnimationFrame(m.frame);
    m.dragging = true;
    m.origin = e.clientY - m.y;
    m.samples = [{ y: e.clientY, t: e.timeStamp }];
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const m = motion.current;
    if (!m.dragging) return;
    const value = e.clientY - m.origin;
    m.y =
      value >= 0 ? value : (value * 80 * 0.55) / (80 + 0.55 * Math.abs(value));
    m.samples.push({ y: e.clientY, t: e.timeStamp });
    m.samples = m.samples.filter((s) => e.timeStamp - s.t < 100);
    paint();
  };
  const release = (e: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const m = motion.current;
    if (!m.dragging) return;
    m.dragging = false;
    const first = m.samples[0];
    const last = m.samples.at(-1);
    m.v =
      first && last && last.t > first.t
        ? ((last.y - first.y) / (last.t - first.t)) * 1000
        : 0;
    if (last && e.timeStamp - last.t > 100) m.v = 0;
    const projected = m.y + ((m.v / 1000) * 0.998) / (1 - 0.998);
    if (
      !cancelled &&
      projected > m.height * 0.35 &&
      m.v >= -80 &&
      !latest.current.busy
    ) {
      requestClose();
    } else settle(0);
  };
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) requestClose();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || busy) return;
        const b = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < b.left ||
          e.clientX > b.right ||
          e.clientY < b.top ||
          e.clientY > b.bottom
        )
          requestClose();
      }}
    >
      <div
        className="sheet-head"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => release(e)}
        onPointerCancel={(e) => release(e, true)}
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <h2 id={id}>{shownTitle.current}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={requestClose}
          disabled={busy}
          aria-label="Close"
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="sheet-body">{(open || present) && content.current}</div>
    </dialog>
  );
}
