import Link from "next/link";
export function KinMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 27C9 23 4 18 4 12a6 6 0 0 1 12-1 6 6 0 0 1 12 1c0 6-5 11-12 15Z"
        fill="currentColor"
      />
      <path
        d="M16 11v13M8 15l8 9 8-9"
        stroke="white"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity=".75"
      />
    </svg>
  );
}
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-xl font-semibold text-primary"
      aria-label="Kin home"
    >
      <span className="h-7 w-7">
        <KinMark />
      </span>
      <span>kin</span>
    </Link>
  );
}
