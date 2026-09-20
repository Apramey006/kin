"use client";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type MouseEvent,
  type RefObject,
} from "react";

/** An interruptible spring. The photograph follows the pointer before settling. */
export function useMemoryUnfold(root: RefObject<HTMLElement>) {
  const [expanded, setExpanded] = useState(false);
  const [reduced, setReduced] = useState(false);
  const model = useRef({
    p: 0,
    v: 0,
    target: 0,
    frame: 0,
    last: 0,
    dragging: false,
    startY: 0,
    origin: 0,
    dragged: false,
    reduced: false,
    samples: [] as { p: number; t: number }[],
  });
  const paint = () =>
    root.current?.style.setProperty("--unfold", String(model.current.p));
  const tick = (time: number) => {
    const m = model.current;
    const dt = Math.min(0.024, (time - (m.last || time)) / 1000);
    m.last = time;
    m.v += (-230 * (m.p - m.target) - 2 * Math.sqrt(230) * m.v) * dt;
    m.p += m.v * dt;
    paint();
    if (Math.abs(m.p - m.target) < 0.001 && Math.abs(m.v) < 0.01) {
      m.p = m.target;
      m.v = 0;
      m.frame = 0;
      paint();
    } else m.frame = requestAnimationFrame(tick);
  };
  const settle = (target: number) => {
    const m = model.current;
    m.target = target;
    m.last = 0;
    setExpanded(target === 1);
    cancelAnimationFrame(m.frame);
    if (m.reduced) {
      m.p = target;
      m.v = 0;
      paint();
    } else m.frame = requestAnimationFrame(tick);
  };
  useEffect(() => {
    const state = model.current;
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      const m = model.current;
      m.reduced =
        query.matches ||
        document.documentElement.classList.contains("kin-reduce-motion");
      setReduced(m.reduced);
      if (m.reduced) {
        cancelAnimationFrame(m.frame);
        m.p = m.target;
        m.v = 0;
        paint();
      }
    };
    update();
    query.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      query.removeEventListener("change", update);
      observer.disconnect();
      cancelAnimationFrame(state.frame);
    };
    // The model and element refs retain their identity throughout the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const down = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const m = model.current;
    cancelAnimationFrame(m.frame);
    m.dragging = true;
    m.dragged = false;
    m.startY = event.clientY;
    m.origin = m.p;
    m.samples = [{ p: m.p, t: event.timeStamp }];
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const m = model.current;
    if (!m.dragging || m.reduced) return;
    const distance = m.startY - event.clientY;
    if (Math.abs(distance) > 8) m.dragged = true;
    const raw = m.origin + distance / 150;
    const excess = raw < 0 ? raw : raw > 1 ? raw - 1 : 0;
    m.p =
      Math.max(0, Math.min(1, raw)) + (excess * 0.12) / (1 + Math.abs(excess));
    m.samples.push({ p: m.p, t: event.timeStamp });
    m.samples = m.samples.filter((s) => event.timeStamp - s.t < 100);
    paint();
  };
  const release = (
    event: PointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) => {
    const m = model.current;
    if (!m.dragging) return;
    m.dragging = false;
    const first = m.samples[0],
      last = m.samples.at(-1);
    m.v =
      first && last && last.t > first.t && event.timeStamp - last.t < 100
        ? (last.p - first.p) / ((last.t - first.t) / 1000)
        : 0;
    if (m.dragged || cancelled)
      settle(cancelled ? m.target : m.p + m.v * 0.18 > 0.5 ? 1 : 0);
  };
  return {
    expanded,
    reduced,
    unfold: () => settle(1),
    fold: () => settle(0),
    handle: {
      onPointerDown: down,
      onPointerMove: move,
      onPointerUp: (e: PointerEvent<HTMLButtonElement>) => release(e),
      onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => release(e, true),
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        if (event.detail === 0 || !model.current.dragged)
          settle(model.current.target === 1 ? 0 : 1);
      },
    },
  };
}
