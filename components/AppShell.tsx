"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  Images,
  Headphones,
  Mic,
  ScanFace,
  Network,
  Settings,
  LockKeyhole,
  Users,
} from "lucide-react";
import { Brand } from "./Brand";
import { initials, type FamilyData } from "@/lib/family-data";
const tabs = [
  { href: "/family", label: "Memories", icon: Images },
  { href: "/stories", label: "Stories", icon: Headphones },
  { href: "/wearer", label: "Recognize", icon: ScanFace },
  { href: "/stage", label: "Connections", icon: Network },
];
export function Preferences() {
  useEffect(() => {
    for (const key of ["kin-large-text", "kin-reduce-motion"]) {
      try {
        document.documentElement.classList.toggle(
          key,
          localStorage.getItem(key) === "true",
        );
      } catch {}
    }
  }, []);
  return null;
}
export function AppShell({
  data,
  children,
  className = "",
}: {
  data?: FamilyData | null;
  children: ReactNode;
  className?: string;
}) {
  const path = usePathname();
  const me = data?.relatives.find((r) => r.id === data.relativeId);
  const lovedOne = data?.role === "loved_one";
  const home = lovedOne ? "/wearer" : "/family";
  const navigation = lovedOne ? [
    { href: "/wearer", label: "Recognize", icon: ScanFace },
    { href: "/stories", label: "Stories", icon: Headphones },
    { href: "/remember", label: "Record", icon: Mic },
  ] : tabs;
  const links = navigation.map((t) => (
    <Link
      key={t.href}
      href={t.href}
      className="nav-link"
      aria-current={path === t.href ? "page" : undefined}
    >
      <t.icon aria-hidden="true" />
      <span>{t.label}</span>
    </Link>
  ));
  return (
    <div className="app-shell">
      <Preferences />
      <aside className="app-sidebar">
        <Brand href={home} />
        <div className="sidebar-family">
          <span className="sidebar-caption">Shared library</span>
          <p>{data ? `${data.wearer.name}’s family` : "Your family"}</p>
        </div>
        <nav aria-label="Main navigation" className="desktop-nav">
          {links}
        </nav>
        {!lovedOne && <div className="sidebar-people">
          <span className="sidebar-caption">Family</span>
          {data?.relatives.map((r) => (
            <div key={r.id} className="sidebar-person">
              <span className="avatar">{initials(r.name)}</span>
              <span>
                {r.name}
                <small>
                  {r.id === data.relativeId ? "You" : r.is_self ? "Your loved one" : r.relation_to_wearer}
                </small>
              </span>
            </div>
          ))}
          {data?.isOwner && (
            <Link
              className="nav-link invite-nav"
              href="/settings#invite-heading"
            >
              <Users aria-hidden="true" />
              Invite family
            </Link>
          )}
        </div>}
        <Link
          href="/settings"
          className="sidebar-account"
          aria-label={lovedOne ? "Your settings" : undefined}
          aria-current={path === "/settings" ? "page" : undefined}
        >
          <Settings aria-hidden="true" />
          <span>Settings</span>
          <span className="avatar">{initials(me?.name ?? (lovedOne ? data.wearer.name : "Kin"))}</span>
        </Link>
      </aside>
      <header className="mobile-header">
        <Brand href={home} />
        <span>{data ? `${data.wearer.name}’s family` : "Your family"}</span>
        <Link
          href="/settings"
          className="icon-button"
          aria-label={lovedOne ? "Your settings" : "Your account and settings"}
        >
          <span className="avatar">{initials(me?.name ?? (lovedOne ? data.wearer.name : "Kin"))}</span>
        </Link>
      </header>
      <main id="main-content" tabIndex={-1} className={`app-main ${className}`}>
        {children}
      </main>
      <nav className="mobile-nav" aria-label="Main navigation">
        {links}
      </nav>
    </div>
  );
}
export function LoadingView() {
  return (
    <div className="page-loading" role="status">
      <span className="sr-only">Loading your family</span>
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
export function PrivacyNote() {
  return (
    <p className="footer-note">
      <LockKeyhole aria-hidden="true" />
      Only people in your family can see these memories.
    </p>
  );
}
