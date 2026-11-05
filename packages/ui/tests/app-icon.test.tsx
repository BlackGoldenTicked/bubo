/**
 * @purpose Guard the semantic icon surface: decorative by default, labelled on request.
 * @role    Unit tests for the @bubo/ui AppIcon wrapper over QingIcon glyphs.
 * @deps    React server rendering, Vitest, and the AppIcon component.
 * @gotcha  Glyph names are semantic; renaming one is a UI-wide change, so keep the map curated.
 */

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { AppIcon } from "../src/components/ui/app-icon"

describe("AppIcon", () => {
  it("renders a decorative svg that inherits colour and size", () => {
    const html = renderToStaticMarkup(<AppIcon name="voice" size={15} />)

    expect(html.startsWith("<svg")).toBe(true)
    expect(html).toContain("currentColor")
    expect(html).toContain('aria-hidden="true"')
    expect(html).toMatch(/width="15"/)
  })

  it("exposes an accessible name instead of hiding the glyph", () => {
    const html = renderToStaticMarkup(<AppIcon name="settings" label="设置" />)

    expect(html).toContain('aria-label="设置"')
    expect(html).not.toContain('aria-hidden="true"')
  })
})
