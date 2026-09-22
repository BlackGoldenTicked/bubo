/**
 * @purpose Declare the TanStack Router route for the investments screen.
 * @role    Route module connecting URL paths to renderer feature components.
 * @deps    TanStack Router and the matching feature page component.
 * @gotcha  Keep route params and component expectations aligned with generated routeTree output.
 */

import { createFileRoute } from "@tanstack/react-router"
import { InvestmentsPage } from "../investments/InvestmentsPage"

export const Route = createFileRoute("/investments")({
  component: InvestmentsPage,
})
