/**
 * @purpose Render the persistent top navigation for every desktop route.
 * @role    Root-shell route tabs plus the global amount-visibility preference.
 * @deps    TanStack Router, Jotai UI state, and renderer performance logging.
 * @gotcha  Keep this navigation in the root shell so feature pages never add their own copy.
 *          The separate TitleBar row clears native traffic lights; keep horizontal padding aligned
 *          with overview content. Keep containers draggable and only interactive controls no-drag.
 *          Shape differences between the two visual styles live in `.bubo-nav*` rules in
 *          primitives.css, never in per-item Tailwind conditionals here.
 */

import { Link, useRouterState } from "@tanstack/react-router"
import { useAtom, useSetAtom } from "jotai"
import { AppIcon, type AppIconName } from "@bubo/ui"
import { buboPerfLog } from "@/lib/debug/perf"
import { amountsHiddenAtom, voiceCaptureOpenAtom } from "@/lib/state/uiAtoms"
import { useVoiceIntentQueue } from "@/lib/voice/useVoiceIntent"

interface NavItem {
  label: string
  href: "/" | "/assets" | "/investments" | "/imports" | "/subscriptions" | "/loans" | "/budget"
  matches: readonly string[]
  icon: AppIconName
}

const PRIMARY_NAV = [
  { label: "看板", href: "/", matches: ["/", "/analysis"], icon: "dashboard" },
  { label: "资产", href: "/assets", matches: ["/assets"], icon: "assets" },
  { label: "投资", href: "/investments", matches: ["/investments"], icon: "investments" },
  { label: "流水", href: "/imports", matches: ["/imports"], icon: "cashflow" },
  { label: "订阅", href: "/subscriptions", matches: ["/subscriptions"], icon: "subscriptions" },
  { label: "贷款", href: "/loans", matches: ["/loans"], icon: "loans" },
  { label: "预算", href: "/budget", matches: ["/budget"], icon: "budget" },
] as const satisfies readonly NavItem[]

function pathMatches(pathname: string, matches: readonly string[]): boolean {
  return matches.some((match) => (match === "/" ? pathname === "/" : pathname.startsWith(match)))
}

export function TopNavigation() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [hidden, setHidden] = useAtom(amountsHiddenAtom)
  const setVoiceOpen = useSetAtom(voiceCaptureOpenAtom)
  const pendingIntents = useVoiceIntentQueue().length
  const settingsActive = pathname.startsWith("/settings")

  return (
    <header
      data-tauri-drag-region
      className="drag-region relative z-30 flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--hair)] bg-[var(--surface)] px-7"
    >
      <nav data-tauri-drag-region aria-label="主导航" className="drag-region bubo-nav">
        {PRIMARY_NAV.map((item) => {
          const active = pathMatches(pathname, item.matches)
          return (
            <Link
              key={item.href}
              to={item.href}
              aria-current={active ? "page" : undefined}
              onClick={() =>
                buboPerfLog("nav", "click", {
                  from: pathname,
                  to: item.href,
                  label: item.label,
                  active,
                })
              }
              className="no-drag-region bubo-nav__item"
            >
              <AppIcon name={item.icon} size={13} />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div data-tauri-drag-region className="drag-region flex h-full items-center gap-1">
        <button
          type="button"
          title="语音录入（⇧⌘V）"
          aria-keyshortcuts="Meta+Shift+V"
          onClick={() => setVoiceOpen(true)}
          className="no-drag-region bubo-nav__action"
        >
          <AppIcon name="voice" size={13} />
          语音
          {pendingIntents > 0 && (
            <span
              aria-label={`${pendingIntents} 笔待确认`}
              className="ml-0.5 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9.5px] font-semibold leading-none text-[var(--accent-foreground)]"
            >
              {pendingIntents}
            </span>
          )}
        </button>
        <button
          type="button"
          aria-pressed={hidden}
          onClick={() => setHidden((value) => !value)}
          className="no-drag-region bubo-nav__action"
        >
          <AppIcon name={hidden ? "eyeOff" : "eye"} size={13} />
          {hidden ? "显示金额" : "隐藏金额"}
        </button>
        <Link
          to="/settings"
          aria-current={settingsActive ? "page" : undefined}
          className="no-drag-region bubo-nav__item"
        >
          <AppIcon name="settings" size={13} />
          设置
        </Link>
      </div>
    </header>
  )
}
