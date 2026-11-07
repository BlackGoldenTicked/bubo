/**
 * @purpose Declare the TanStack Router route for the __root screen.
 * @role    Route module connecting URL paths to renderer feature components.
 * @deps    TanStack Router and the matching feature page component.
 * @gotcha  Keep route params and component expectations aligned with generated routeTree output.
 */

import { useEffect, useRef } from "react"
import { Toaster } from "@bubo/ui"
import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { NuqsAdapter } from "nuqs/adapters/tanstack-router"
import { TitleBar } from "../components/layout/TitleBar"
import { TopNavigation } from "../components/layout/TopNavigation"
import { DemoLedgerBanner } from "../components/layout/DemoLedgerBanner"
import { AppUpdateTracker } from "../components/layout/AppUpdateTracker"
import { GlobalConfirmModal } from "../components/ui/ConfirmModal"
import { VoiceCaptureSheet } from "../voice/VoiceCaptureSheet"
import { QuickCapturePage } from "../quick/QuickCapturePage"
import { deliverVoiceIntent } from "../lib/voice/intentHandoff"
import type { VoiceIntent } from "@bubo/shared/contracts"
import { buboPerfLog, roundMs } from "../lib/debug/perf"
import { useThemeEffect } from "../lib/theme"

export const Route = createRootRoute({
  component: RootRouteComponent,
})

/** The menu-bar window renders the bare capture surface: no shell, nav, or voice sheet. */
function RootRouteComponent() {
  const isQuickCapture =
    typeof window !== "undefined" && window.location.hash.startsWith("#/quick-capture")
  if (isQuickCapture) return <QuickCapturePage />
  return <RootLayout />
}

function RootLayout() {
  useThemeEffect()

  // A quick-capture window hands asset/investment intents to the live page here.
  useEffect(() => {
    let dispose: (() => void) | null = null
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event")
        dispose = await listen<VoiceIntent>("bubo://voice-intent", (event) => {
          if (event.payload) deliverVoiceIntent(event.payload)
        })
      } catch {
        // Outside Tauri there is nothing to listen to.
      }
    })()
    return () => dispose?.()
  }, [])
  const href = useRouterState({ select: (state) => state.location.href })
  const previousHref = useRef<string | null>(null)
  const previousCommitAt = useRef(performance.now())
  const contentRef = useRef<HTMLDivElement | null>(null)

  // Replay the page entrance on every navigation. Toggling the class (instead of
  // remounting) keeps the subtree, its queries, and its scroll containers intact.
  useEffect(() => {
    const node = contentRef.current
    if (!node) return
    node.classList.remove("bubo-route-enter")
    void node.offsetWidth
    node.classList.add("bubo-route-enter")
  }, [href])

  useEffect(() => {
    const now = performance.now()
    buboPerfLog("route", "commit", {
      href,
      previousHref: previousHref.current,
      msSincePreviousCommit: roundMs(now - previousCommitAt.current),
    })
    previousHref.current = href
    previousCommitAt.current = now
  }, [href])

  return (
    <TitleBar>
      <TopNavigation />
      <DemoLedgerBanner />
      <div ref={contentRef} className="min-h-0 flex-1 overflow-hidden">
        <NuqsAdapter>
          <Outlet />
        </NuqsAdapter>
      </div>
      <Toaster />
      <AppUpdateTracker />
      <GlobalConfirmModal />
      <VoiceCaptureSheet />
    </TitleBar>
  )
}
