/**
 * @purpose Start the React renderer in the Tauri shell.
 * @role    Browser-side entry point for bubo Desktop UI.
 * @deps    React DOM, App, renderer styles, the desktop runtime bridge, and the locale provider.
 * @gotcha  Install the bridge before providers issue any native or data requests. The zh-CN
 *          locale is what makes every react-aria surface Chinese — month headings, weekday
 *          order (Monday first), and the DateField segment hints. Removing it silently turns
 *          all calendars back into en-US.
 */

import { I18nProvider } from "@heroui/react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./index.css"
import { installDesktopRuntimeBridge } from "./lib/desktop-runtime"
import { TRPCProvider } from "./providers/trpc-provider"

installDesktopRuntimeBridge()

createRoot(document.getElementById("root")!).render(
  <I18nProvider locale="zh-CN">
    <TRPCProvider>
      <App />
    </TRPCProvider>
  </I18nProvider>,
)
