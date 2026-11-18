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
import { saveGlowDurationMs } from "@/lib/saveGlow"

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

/**
 * One pass, vertical mode: a soft horizontal front sweeps bottom-to-top, its boundary bent by
 * noise so it never reads as a straight line. The rim carries an iridescent palette indexed by x
 * (so the colour flows sideways along the wave), split into R/G/B offsets for a chromatic edge, a
 * wide halo sits behind it, and a colour film stays in the region the wave already passed.
 * `uProgress` drives both the position and the hue drift over the full run.
 */
const FRAGMENT = `
precision highp float;

varying vec2 vUv;
uniform vec2 uRes;
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
  vec2 uv = vUv;
  float p = clamp(uProgress, 0.0, 1.0);
  // Slow at both ends: 3 seconds of travel should not snap at the start.
  float ease = p * p * (3.0 - 2.0 * p);
  float front = mix(-0.12, 1.2, ease);

  // Vertical mode: the boundary is a near-horizontal line, bent by noise + a slow sine.
  float n1 = fbm(vec2(uv.x * 3.2, p * 1.9));
  float n2 = fbm(vec2(uv.x * 7.4 + 11.0, p * 3.2));
  float undul =
    (n1 - 0.5) * 0.14 +
    (n2 - 0.5) * 0.045 +
    sin(uv.x * 6.2831 * 0.85 + p * 4.2) * 0.022;

  float yy = uv.y + undul;
  float d = yy - front;          // > 0 above the front (untouched), < 0 already swept
  float ad = abs(d);             // distance from the crest, either side
  float d2 = yy - front * 0.72;  // softer band trailing behind

  // Wide crest with a chromatic edge; halo and spread are the light bleeding outward.
  float rimC = exp(-pow(d / 0.045, 2.0));
  float rimR = exp(-pow((d - 0.020) / 0.030, 2.0));
  float rimB = exp(-pow((d + 0.020) / 0.030, 2.0));
  float halo = exp(-pow(d / 0.260, 2.0));
  float spread = exp(-pow(ad / 0.520, 2.0));
  float band2 = exp(-pow(d2 / 0.340, 2.0));

  float trail = smoothstep(0.0, -0.85, d);
  float filmFade = 1.0 - smoothstep(0.58, 1.0, p);

  // Hue runs along x for the sideways flow, and shifts with |d| so the colours fan out
  // from the crest in every direction instead of staying inside the band.
  float hue = uv.x * 0.7 + yy * 0.15 + p * 0.5 + ad * 1.9 + band2 * 0.2;
  vec3 base = palette(hue);
  vec3 rimCol = vec3(palette(hue + 0.04).r, palette(hue).g, palette(hue - 0.04).b);

  vec3 col = rimCol * (rimC * 1.1 + rimR * 0.8 + rimB * 0.8);
  col += base * halo * 0.55;
  col += palette(hue + 0.22) * spread * 0.3;
  col += palette(hue + 0.18) * band2 * 0.26;
  col += base * trail * 0.42 * filmFade;

  float alpha = clamp(
    rimC * 0.95 + rimR * 0.7 + rimB * 0.7 +
      halo * 0.5 + spread * 0.26 + band2 * 0.22 + trail * 0.42 * filmFade,
    0.0,
    1.0
  );
  // Long fade at the end: the tail must leave nothing behind.
  alpha *= 1.0 - smoothstep(0.72, 1.0, p);

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
  /** Called with the measured run time so the caller can keep the surface open long enough. */
  onStart?: (durationMs: number) => void
  /** Called when the context, shader, or program cannot be created, so the caller can fall back. */
  onUnavailable?: () => void
}

export function GlowWaveCanvas({ onStart, onUnavailable }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const onStartRef = useRef(onStart)
  onStartRef.current = onStart

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
    const uProgress = gl.getUniformLocation(program, "uProgress")
    gl.uniform1f(uProgress, 0)
    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    let frame = 0
    let start = 0
    let lastWidth = 0
    let lastHeight = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    const durationMs = saveGlowDurationMs({ width: rect.width, height: rect.height })
    onStartRef.current?.(durationMs)

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
  }, [onUnavailable])

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
