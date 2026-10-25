"use client";

import {
  BarChart3,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  CornerDownLeft,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  Search,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { getEnrolledCourses, getMyCourses, type Course, type User } from "@/lib/api";
import { clearToken } from "@/lib/auth";
import { setPreference, setTheme, usePreference, useTheme } from "@/lib/preferences";
import { cn, IconButton } from "@/components/ui/Button";
import { ErrorState, PageSkeleton } from "@/components/ui/States";

type AppShellProps = {
  user: User | null;
  token: string | null;
  children: ReactNode;
  /** Bump to refetch the sidebar course list after creating or joining a course. */
  coursesVersion?: number;
  /** Let the page fill the viewport and manage its own scrolling (chat). */
  fullHeight?: boolean;
  /** Shown in the top bar; defaults to a name derived from the route. */
  title?: string;
};

const SIDEBAR_KEY = "siger.sidebar";

/** Title for the top bar when the page doesn't pass one. */
function routeTitle(pathname: string, isProfessor: boolean): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname.endsWith("/chat")) return "Teaching assistant";
  if (pathname.includes("/analytics/students/")) return "Student progress";
  if (pathname.endsWith("/analytics")) return isProfessor ? "Class analytics" : "My progress";
  if (pathname.includes("/submissions/")) return "Review submission";
  if (pathname.endsWith("/assignments/new")) return "New assignment";
  if (pathname.endsWith("/edit")) return "Edit assignment";
  if (pathname.includes("/assignments/")) return "Assignment";
  if (pathname.startsWith("/courses/")) return "Course";
  return "Siger";
}

export function AppShell({ user, token, children, coursesVersion = 0, fullHeight, title }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [courses, setCourses] = useState<Course[]>([]);
  const collapsed = usePreference(SIDEBAR_KEY) === "collapsed";
  // The drawer belongs to the route it was opened on, so navigating closes it.
  const [drawerRoute, setDrawerRoute] = useState<string | null>(null);
  const drawerOpen = drawerRoute === pathname;
  const setDrawerOpen = (open: boolean) => setDrawerRoute(open ? pathname : null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!token || !user || user.role === "admin") {
      return;
    }
    const load = user.role === "student" ? getEnrolledCourses : getMyCourses;
    load(token)
      .then(setCourses)
      .catch(() => setCourses([]));
  }, [token, user, coursesVersion]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleCollapsed() {
    setPreference(SIDEBAR_KEY, collapsed ? "expanded" : "collapsed");
  }

  function logout() {
    clearToken();
    router.replace("/login");
  }

  const isProfessor = user?.role === "professor";
  const pageTitle = title ?? routeTitle(pathname, isProfessor);

  const sidebar = (mobile: boolean) => (
    <Sidebar
      user={user}
      courses={courses}
      pathname={pathname}
      collapsed={!mobile && collapsed}
      onToggle={mobile ? () => setDrawerOpen(false) : toggleCollapsed}
      mobile={mobile}
    />
  );

  return (
    <div className="flex h-screen bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-lg"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          "hidden shrink-0 border-r border-line bg-surface transition-[width] duration-200 ease-out md:flex",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        {sidebar(false)}
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="relative flex h-full w-72 max-w-[85vw] animate-slide-in border-r border-line bg-surface shadow-lg">
            {sidebar(true)}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur-md sm:px-4 lg:px-6">
          <IconButton icon={Menu} label="Open navigation" className="md:hidden" onClick={() => setDrawerOpen(true)} />
          <p className="min-w-0 truncate font-display text-[15px] font-semibold text-fg">{pageTitle}</p>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg sm:flex lg:w-72"
            >
              <Search size={15} aria-hidden />
              <span className="flex-1 text-left">Search courses…</span>
              <kbd className="rounded border border-line bg-surface px-1.5 font-sans text-[11px] text-muted">
                Ctrl K
              </kbd>
            </button>
            <IconButton icon={Search} label="Search" className="sm:hidden" onClick={() => setSearchOpen(true)} />
            <ThemeToggle />
            {user ? <UserMenu user={user} onLogout={logout} /> : null}
          </div>
        </header>

        <main id="main" className={fullHeight ? "min-h-0 flex-1" : "min-h-0 flex-1 overflow-y-auto"}>
          {children}
        </main>
      </div>

      {searchOpen ? (
        <CommandPalette
          courses={courses}
          isProfessor={isProfessor}
          onClose={() => setSearchOpen(false)}
          onNavigate={(href) => {
            setSearchOpen(false);
            router.push(href);
          }}
        />
      ) : null}
    </div>
  );
}

function Sidebar({
  user,
  courses,
  pathname,
  collapsed,
  onToggle,
  mobile,
}: {
  user: User | null;
  courses: Course[];
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
  mobile: boolean;
}) {
  const isProfessor = user?.role === "professor";
  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className={cn("flex h-14 shrink-0 items-center gap-2.5 border-b border-line", collapsed ? "justify-center px-2" : "px-4")}>
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 rounded-lg" aria-label="Siger home">
          <Logo />
          {!collapsed ? (
            <span className="font-display text-[15px] font-bold tracking-tight text-fg">Siger</span>
          ) : null}
        </Link>
        {!collapsed && user && user.role !== "admin" ? (
          <span
            className={cn(
              "rounded-md border px-1.5 py-px text-[11px] font-semibold",
              isProfessor
                ? "border-accent-line bg-accent-soft text-accent-text"
                : "border-info-line bg-info-soft text-info",
            )}
          >
            {isProfessor ? "Faculty" : "Student"}
          </span>
        ) : null}
        {mobile ? (
          <IconButton icon={X} label="Close navigation" size="sm" className="ml-auto" onClick={onToggle} />
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3 text-sm" aria-label="Main">
        <NavItem
          href="/dashboard"
          icon={LayoutDashboard}
          label="Dashboard"
          active={pathname === "/dashboard"}
          collapsed={collapsed}
        />

        {courses.length > 0 ? (
          <div className="mt-5">
            {!collapsed ? (
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wide text-subtle uppercase">
                {isProfessor ? "Teaching" : "My courses"}
              </p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-line" />
            )}
            <ul className="space-y-0.5">
              {courses.map((course) => {
                const base = `/courses/${course.id}`;
                const inCourse = pathname.startsWith(base);
                return (
                  <li key={course.id}>
                    <Link
                      href={base}
                      title={collapsed ? `${course.code} · ${course.title}` : undefined}
                      aria-current={pathname === base ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg py-1.5 transition-colors duration-150",
                        collapsed ? "justify-center px-0" : "px-2.5",
                        inCourse ? "text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                        pathname === base && "bg-surface-2",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1 text-[10px] font-bold tracking-tight",
                          inCourse ? "bg-accent text-accent-fg" : "bg-surface-3 text-muted",
                        )}
                      >
                        {course.code.slice(0, 3)}
                      </span>
                      {!collapsed ? (
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{course.code}</span>
                          <span className="text-subtle"> · {course.title}</span>
                        </span>
                      ) : null}
                    </Link>
                    {inCourse && !collapsed ? (
                      <ul className="mt-0.5 mb-1.5 ml-[21px] space-y-0.5 border-l border-line pl-2.5">
                        <SubItem href={base} label="Overview" icon={BookOpen} active={pathname === base || pathname.startsWith(`${base}/assignments`)} />
                        {!isProfessor ? (
                          <SubItem href={`${base}/chat`} label="Assistant" icon={MessageSquareText} active={pathname === `${base}/chat`} />
                        ) : null}
                        <SubItem
                          href={`${base}/analytics`}
                          label={isProfessor ? "Analytics" : "Progress"}
                          icon={BarChart3}
                          active={pathname.startsWith(`${base}/analytics`)}
                        />
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </nav>

      {!mobile ? (
        <div className={cn("border-t border-line p-2.5", collapsed && "flex justify-center")}>
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex h-8 items-center gap-2 rounded-lg text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg",
              collapsed ? "w-8 justify-center" : "w-full px-2.5",
            )}
          >
            {collapsed ? <ChevronsRight size={16} aria-hidden /> : <ChevronsLeft size={16} aria-hidden />}
            {!collapsed ? "Collapse" : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-2.5 rounded-lg font-medium transition-colors duration-150",
        collapsed ? "justify-center" : "px-2.5",
        active ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon size={17} aria-hidden />
      {!collapsed ? label : <span className="sr-only">{label}</span>}
    </Link>
  );
}

function SubItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] transition-colors duration-150",
          active ? "bg-accent-soft font-medium text-accent-text" : "text-muted hover:bg-surface-2 hover:text-fg",
        )}
      >
        <Icon size={14} aria-hidden />
        {label}
      </Link>
    </li>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg shadow-sm"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="currentColor">
        <rect x="1.5" y="9" width="3" height="5.5" rx="1" />
        <rect x="6.5" y="5.5" width="3" height="9" rx="1" />
        <rect x="11.5" y="1.5" width="3" height="13" rx="1" />
      </svg>
    </span>
  );
}

function ThemeToggle() {
  const theme = useTheme();

  function toggle() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  return (
    <IconButton
      icon={theme === "dark" ? Sun : Moon}
      label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
    />
  );
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function UserMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const role = user.role === "professor" ? "Faculty" : user.role === "student" ? "Student" : "Admin";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 items-center gap-2 rounded-lg pr-1 pl-1 transition-colors hover:bg-surface-2"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fg text-[11px] font-semibold text-bg">
          {initialsOf(user.full_name)}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium text-fg lg:block">{user.full_name}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 animate-pop-in rounded-xl border border-line bg-surface p-1.5 shadow-lg"
        >
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-medium text-fg">{user.full_name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <span className="mt-2 inline-block rounded-md border border-line bg-surface-2 px-1.5 py-px text-[11px] font-medium text-muted">
              {role}
            </span>
          </div>
          <div className="my-1 h-px bg-line" />
          <Link
            role="menuitem"
            href="/dashboard"
            className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-fg transition-colors hover:bg-surface-2"
          >
            <LayoutDashboard size={15} className="text-muted" aria-hidden />
            Dashboard
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={onLogout}
            className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm text-danger transition-colors hover:bg-danger-soft"
          >
            <LogOut size={15} aria-hidden />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}

type Destination = { href: string; label: string; hint: string; icon: LucideIcon };

/** Quick-jump to a course page, its assistant or its analytics. Filters client-side. */
function CommandPalette({
  courses,
  isProfessor,
  onClose,
  onNavigate,
}: {
  courses: Course[];
  isProfessor: boolean;
  onClose: () => void;
  onNavigate: (href: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const destinations = useMemo<Destination[]>(() => {
    const all: Destination[] = [{ href: "/dashboard", label: "Dashboard", hint: "Home", icon: LayoutDashboard }];
    for (const course of courses) {
      const base = `/courses/${course.id}`;
      all.push({ href: base, label: `${course.code} · ${course.title}`, hint: "Course", icon: BookOpen });
      if (!isProfessor) {
        all.push({ href: `${base}/chat`, label: `${course.code} assistant`, hint: "Ask the course AI", icon: MessageSquareText });
      }
      all.push({
        href: `${base}/analytics`,
        label: `${course.code} ${isProfessor ? "analytics" : "progress"}`,
        hint: isProfessor ? "Class analytics" : "My progress",
        icon: BarChart3,
      });
    }
    const q = query.trim().toLowerCase();
    return q ? all.filter((d) => `${d.label} ${d.hint}`.toLowerCase().includes(q)) : all;
  }, [courses, isProfessor, query]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((i) => Math.min(i + 1, destinations.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && destinations[index]) {
      onNavigate(destinations[index].href);
    } else if (event.key === "Escape") {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-lg animate-pop-in overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="text-subtle" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a course, assistant or analytics…"
            aria-label="Search"
            aria-controls="palette-results"
            aria-activedescendant={destinations[index] ? `palette-${index}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
          />
          <kbd className="rounded border border-line bg-surface-2 px-1.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <ul id="palette-results" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {destinations.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted">No matches for “{query}”.</li>
          ) : (
            destinations.map((destination, i) => {
              const Icon = destination.icon;
              return (
                <li
                  key={destination.href}
                  id={`palette-${i}`}
                  role="option"
                  aria-selected={i === index}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => onNavigate(destination.href)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm",
                    i === index ? "bg-surface-2 text-fg" : "text-muted",
                  )}
                >
                  <Icon size={16} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-fg">{destination.label}</span>
                  <span className="text-xs text-subtle">{destination.hint}</span>
                  {i === index ? <CornerDownLeft size={13} className="text-subtle" aria-hidden /> : null}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

/** Loading / error placeholder shown inside the shell. */
export function PageMessage({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  if (tone === "error") {
    return <ErrorState>{children}</ErrorState>;
  }
  return <PageSkeleton label={typeof children === "string" ? children.replace(/…$/, "") : "Loading"} />;
}
