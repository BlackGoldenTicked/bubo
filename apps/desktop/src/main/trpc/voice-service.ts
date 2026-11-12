/**
 * @purpose Declare the runtime-neutral voice entry contract exposed through the desktop tRPC router.
 * @role    Boundary type shared by the router and the sidecar implementation.
 * @deps    Shared voice contracts and the shared Result primitive.
 * @gotcha  Keep provider clients and filesystem access out of this file; the sidecar owns them.
 */

import type { Result } from "@bubo/shared"
import type {
  AppendVoiceTraceInput,
  ImportVoiceLlmModelsInput,
  ParseVoiceIntentInput,
  RemoveVoiceLlmModelInput,
  SaveVoiceSettingsInput,
  TranscribeVoiceInput,
  TranscribeVoiceResult,
  VoiceIntentParseResult,
  VoiceLlmPoolEntryView,
  VoiceSettingsSnapshot,
} from "@bubo/shared/contracts"

export interface VoiceService {
  getSettings(): VoiceSettingsSnapshot
  saveSettings(input: SaveVoiceSettingsInput): Result<VoiceSettingsSnapshot>
  transcribeEntry(input: TranscribeVoiceInput): Promise<Result<TranscribeVoiceResult>>
  parseIntent(input: ParseVoiceIntentInput): Promise<Result<VoiceIntentParseResult>>
  /** Append renderer-side trace lines to the voice diagnostics file. */
  appendTrace(input: AppendVoiceTraceInput): Result<null>
  listLlmModels(): VoiceLlmPoolEntryView[]
  importLlmModels(input: ImportVoiceLlmModelsInput): Result<VoiceLlmPoolEntryView[]>
  removeLlmModel(input: RemoveVoiceLlmModelInput): Result<VoiceLlmPoolEntryView[]>
}
