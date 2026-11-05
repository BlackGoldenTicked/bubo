/**
 * @purpose Capture microphone audio in the renderer and hand it to the sidecar as base64 WAV.
 * @role    Browser-side recording utility for voice cashflow entry.
 * @deps    MediaDevices, Web Audio API, and btoa.
 * @gotcha  ASR uploads a single blob, so deltas are concatenated into 16 kHz mono PCM WAV:
 *          predictable size, no MediaRecorder codec differences between WKWebView and Chromium.
 */

export interface VoiceRecording {
  audioBase64: string
  mimeType: string
  durationMs: number
}

export const VOICE_SAMPLE_RATE = 16_000
export const MAX_RECORDING_MS = 60_000
const PROCESSOR_BUFFER_SIZE = 4096

function isSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof window !== "undefined" &&
    "AudioContext" in window
  )
}

/** Linear-interpolation resampler: browsers may refuse a 16 kHz AudioContext. */
function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const length = Math.floor(input.length / ratio)
  const output = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio
    const left = Math.floor(position)
    const right = Math.min(left + 1, input.length - 1)
    const weight = position - left
    output[index] = input[left] * (1 - weight) + input[right] * weight
  }
  return output
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index))
    }
  }

  writeText(0, "RIFF")
  view.setUint32(4, 36 + samples.length * 2, true)
  writeText(8, "WAVE")
  writeText(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, "data")
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += 2
  }
  return new Uint8Array(buffer)
}

function toBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ""
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export class VoiceRecorder {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private processorNode: ScriptProcessorNode | null = null
  private chunks: Float32Array[] = []
  private startedAt = 0

  static isSupported(): boolean {
    return isSupported()
  }

  get isRecording(): boolean {
    return this.stream != null
  }

  get elapsedMs(): number {
    return this.startedAt === 0 ? 0 : Date.now() - this.startedAt
  }

  async start(): Promise<void> {
    if (this.isRecording) return
    if (!isSupported()) throw new Error("当前环境不支持麦克风录音")

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
    const context = new AudioContext()
    await context.resume()

    const sourceNode = context.createMediaStreamSource(stream)
    const processorNode = context.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1)
    this.chunks = []

    processorNode.onaudioprocess = (event) => {
      this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)))
    }
    sourceNode.connect(processorNode)
    processorNode.connect(context.destination)

    this.stream = stream
    this.context = context
    this.sourceNode = sourceNode
    this.processorNode = processorNode
    this.startedAt = Date.now()
  }

  private release(): void {
    this.processorNode?.disconnect()
    this.sourceNode?.disconnect()
    this.stream?.getTracks().forEach((track) => track.stop())
    void this.context?.close().catch(() => {})
    this.processorNode = null
    this.sourceNode = null
    this.stream = null
    this.context = null
    this.startedAt = 0
  }

  cancel(): void {
    this.chunks = []
    this.release()
  }

  stop(): VoiceRecording {
    const durationMs = this.elapsedMs
    const sampleRate = this.context?.sampleRate ?? VOICE_SAMPLE_RATE
    const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const merged = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of this.chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    this.chunks = []
    this.release()

    if (totalLength === 0) throw new Error("没有录到声音，请重试")
    const samples = resample(merged, sampleRate, VOICE_SAMPLE_RATE)
    return {
      audioBase64: toBase64(encodeWav(samples, VOICE_SAMPLE_RATE)),
      mimeType: "audio/wav",
      durationMs,
    }
  }
}
