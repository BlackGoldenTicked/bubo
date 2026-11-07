/**
 * @purpose Declare the route for the floating quick-capture window.
 * @role    Route module for the menu-bar capture surface.
 * @deps    TanStack Router and the quick-capture page.
 * @gotcha  The root layout short-circuits to this page: the window has no shell, no nav,
 *          and no voice sheet of its own. Regenerating routes scaffolds this file when it is
 *          missing, so keep the real implementation here rather than the generated stub.
 */

import { createFileRoute } from "@tanstack/react-router"
import { QuickCapturePage } from "../quick/QuickCapturePage"

export const Route = createFileRoute("/quick-capture")({
  component: QuickCapturePage,
})
