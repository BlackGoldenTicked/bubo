/**
 * @purpose Render a HeroUI color picker field backed by hex strings.
 * @role    Renderer-local form control for budget, category, and tag color selection.
 * @deps    HeroUI color picker primitives and React Aria color parsing.
 * @gotcha  Form state stores plain hex strings even though HeroUI controls use Color objects.
 */

import {
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatchPicker,
  parseColor,
} from "@heroui/react"

export const DEFAULT_COLOR_SWATCHES = [
  "#e07b3a",
  "#4a8fc4",
  "#c46a9e",
  "#7c6ac4",
  "#d4a017",
  "#5bac8e",
  "#2e86ab",
]

interface ColorPickerFieldProps {
  value: string
  onChange: (value: string) => void
  swatches?: string[]
}

function safeColor(value: string) {
  try {
    return parseColor(value)
  } catch {
    return parseColor(DEFAULT_COLOR_SWATCHES[0])
  }
}

export function ColorPickerField({
  value,
  onChange,
  swatches = DEFAULT_COLOR_SWATCHES,
}: ColorPickerFieldProps) {
  const color = safeColor(value)

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        // Wrap instead of overflowing: a narrow modal column must push swatches onto a
        // second line rather than clip them or squeeze the trigger into vertical text.
        flexWrap: "wrap",
        columnGap: 10,
        rowGap: 8,
        minWidth: 0,
      }}
    >
      <ColorPicker value={color} onChange={(next) => onChange(next.toString("hex"))}>
        <ColorPicker.Trigger>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 30,
              padding: "0 10px",
              borderRadius: 7,
              border: "1px solid var(--hair-2)",
              background: "var(--surface-1)",
              color: "var(--ink-2)",
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                background: value,
                border: "1px solid rgba(0,0,0,.12)",
                flexShrink: 0,
              }}
            />
            自定义
          </span>
        </ColorPicker.Trigger>
        <ColorPicker.Popover>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 220 }}>
            <ColorArea colorSpace="hsb" xChannel="saturation" yChannel="brightness">
              <ColorArea.Thumb />
            </ColorArea>
            <ColorSlider colorSpace="hsb" channel="hue">
              <ColorSlider.Track>
                <ColorSlider.Thumb />
              </ColorSlider.Track>
            </ColorSlider>
            <ColorField>
              <ColorField.Group fullWidth variant="secondary">
                <ColorField.Input />
              </ColorField.Group>
            </ColorField>
          </div>
        </ColorPicker.Popover>
      </ColorPicker>
      <ColorSwatchPicker
        value={color}
        onChange={(next) => onChange(next.toString("hex"))}
        style={{ display: "flex", flexWrap: "wrap", gap: 8, minWidth: 0 }}
      >
        {swatches.map((swatch) => (
          <ColorSwatchPicker.Item key={swatch} color={safeColor(swatch)}>
            <ColorSwatchPicker.Swatch />
            <ColorSwatchPicker.Indicator />
          </ColorSwatchPicker.Item>
        ))}
      </ColorSwatchPicker>
    </div>
  )
}
