/**
 * @purpose Reproduce the reference "waves" look — an organic iridescent front, not a gradient sheet.
 * @role    Shader-driven layer used by the save celebration inside a dialog.
 * @deps    WebGL1 only; no libraries, no textures, no external assets.
 * @gotcha  The front is a noise-warped radius with a chromatic rim, which is why it reads as flowing
 *          light — palette stops alone cannot. If WebGL is unavailable the caller keeps the CSS
 *          `bubo-save-glow*` fallback, so this component reports `onUnavailable` instead of throwing.
 *          The canvas is sized from its parent and capped at DPR 2 to stay cheap on 1x panels.
 *          Keep the two shader sources separate: the vertex pass only maps a fullscreen triangle
 *          pair, every visual decision lives in the fragment pass.
 */

import { useEffect, useRef } from "react"

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

/**
 * One pass: a domain-warped wavefront around `uOrigin`, an iridescent palette indexed by
 * angle/radius/progress, a bright rim split into R/G/B offsets (chromatic aberration), a second
 * softer front trailing behind it, and a film of colour that fades as the front leaves.
 * Distances are in units of surface height, so the same constants work for any panel size.
 */
const FRAGMENT = `
precision highp float;

varying vec2 vUv;
uniform vec2 uRes;
uniform vec2 uOrigin;
uniform float uProgress;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return v;
}

vec3 palette(float t) {
  vec3 c0 = vec3(1.00, 0.35, 0.72);
  vec3 c1 = vec3(0.66, 0.35, 1.00);
  vec3 c2 = vec3(0.26, 0.74, 1.00);
  vec3 c3 = vec3(0.36, 1.00, 0.82);
  vec3 c4 = vec3(1.00, 0.83, 0.42);
  vec3 c5 = vec3(1.00, 0.50, 0.38);
  float x = fract(t) * 5.0;
  float i = floor(x);
  float f = x - i;
  vec3 a = c0;
  vec3 b = c1;
  if (i >= 1.0) { a = c1; b = c2; }
  if (i >= 2.0) { a = c2; b = c3; }
  if (i >= 3.0) { a = c3; b = c4; }
  if (i >= 4.0) { a = c4; b = c5; }
  return mix(a, b, f);
}

void main() {
  vec2 p = (vUv - uOrigin) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  float r = length(p);
  float ang = atan(p.y, p.x);

  float prog = clamp(uProgress, 0.0, 1.0);
  float ease = 1.0 - pow(1.0 - prog, 2.2);
  float front = mix(-0.06, 1.15, ease);

  // Organic boundary: noise bends the radius so the front never reads as a circle.
  float warp = (fbm(p * 3.6 + vec2(prog * 2.6, prog * 1.5)) - 0.5) * 0.3;
  float rr = r + warp;

  float bandA = rr - front;
  float bandB = rr - front * 0.74;

  float rimA = exp(-pow(bandA / 0.055, 2.0));
  float rimA_R = exp(-pow((bandA - 0.028) / 0.045, 2.0));
  float rimA_B = exp(-pow((bandA + 0.028) / 0.045, 2.0));
  float rimB = exp(-pow(bandB / 0.11, 2.0));

  // Colour trailing behind the front, thinning out as the wave leaves.
  float trail = smoothstep(-0.01, -0.34, bandA) * (1.0 - smoothstep(-0.95, -0.42, bandA));
  float sheen = smoothstep(0.0, -0.55, bandA) * 0.14;

  float hue = ang * 0.17 + rr * 0.62 + prog * 1.15;
  vec3 base = palette(hue);
  vec3 rimCol = vec3(palette(hue + 0.05).r, palette(hue).g, palette(hue - 0.05).b);

  vec3 col = rimCol * (rimA_R * 1.25 + rimA * 0.9 + rimA_B * 1.25);
  col += base * trail * 1.05;
  col += palette(hue * 0.7 + 0.3) * rimB * 0.32;
  col += palette(hue * 0.55) * sheen;

  float alpha = clamp(
    rimA_R * 0.85 + rimA * 0.8 + rimA_B * 0.85 + trail * 0.92 + rimB * 0.3 + sheen,
    0.0,
    1.0
  );
  alpha *= 1.0 - smoothstep(0.86, 1.0, prog);

  gl_FragColor = vec4(col, alpha);
}
`

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
}

let cachedSupport: boolean | null = null

/** Probe once per session: a save should not pay for another throwaway WebGL context. */
export function supportsShaderGlow(): boolean {
  if (cachedSupport != null) return cachedSupport
  if (typeof document === "undefined") return false
  try {
    const probe = document.createElement("canvas")
    cachedSupport = probe.getContext("webgl") != null
  } catch {
    cachedSupport = false
  }
  return cachedSupport
}

interface Props {
  /** Total run time; the caller unmounts at the same mark. */
  durationMs: number
  /** Where the wave leaves from, in 0..1 canvas space (origin at bottom-left). */
  origin?: { x: number; y: number }
  /** Called when the context, shader, or program cannot be created, so the caller can fall back. */
  onUnavailable?: () => void
}

export function GlowWaveCanvas({ durationMs, origin, onUnavailable }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const originX = origin?.x ?? 0.5
  const originY = origin?.y ?? 0.86

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    })
    if (!gl) {
      onUnavailable?.()
      return
    }

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
    const program = gl.createProgram()
    if (!vertex || !fragment || !program) {
      onUnavailable?.()
      return
    }
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      onUnavailable?.()
      return
    }
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )
    const aPos = gl.getAttribLocation(program, "aPos")
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(program, "uRes")
    const uOrigin = gl.getUniformLocation(program, "uOrigin")
    const uProgress = gl.getUniformLocation(program, "uProgress")
    gl.uniform2f(uOrigin, originX, originY)
    gl.uniform1f(uProgress, 0)
    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    let frame = 0
    let start = 0
    let lastWidth = 0
    let lastHeight = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    function size() {
      const rect = canvas!.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width * dpr))
      const height = Math.max(1, Math.round(rect.height * dpr))
      if (lastWidth === width && lastHeight === height) return
      lastWidth = width
      lastHeight = height
      canvas!.width = width
      canvas!.height = height
      gl!.viewport(0, 0, width, height)
      gl!.uniform2f(uRes, rect.width, rect.height)
    }

    function draw(time: number) {
      if (start === 0) start = time
      const progress = Math.min(1, (time - start) / durationMs)
      size()
      gl!.clearColor(0, 0, 0, 0)
      gl!.clear(gl!.COLOR_BUFFER_BIT)
      gl!.uniform1f(uProgress, progress)
      gl!.drawArrays(gl!.TRIANGLES, 0, 6)
      if (progress < 1) frame = requestAnimationFrame(draw)
    }

    size()
    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
    }
  }, [durationMs, originX, originY, onUnavailable])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        borderRadius: "inherit",
        pointerEvents: "none",
      }}
    />
  )
}
