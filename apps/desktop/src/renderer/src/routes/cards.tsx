/**
 * @purpose Declare the TanStack Router route for the card wallet screen.
 * @role    Route module connecting URL paths to renderer feature components.
 * @deps    TanStack Router and the cards feature page component.
 * @gotcha  Keep route params and component expectations aligned with generated routeTree output.
 */

import { createFileRoute } from "@tanstack/react-router"
import { CardsPage } from "../cards/CardsPage"

export const Route = createFileRoute("/cards")({
  component: CardsPage,
})
