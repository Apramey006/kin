export function clamp(n: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, n));
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

export function zeroVector(dims: number): number[] {
  return new Array(dims).fill(0);
}
