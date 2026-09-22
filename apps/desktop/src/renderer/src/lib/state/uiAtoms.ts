/**
 * @purpose Define renderer UI state atoms shared across pages.
 * @role    Client-side state module for view preferences and transient UI state.
 * @deps    Jotai atoms and local renderer state types.
 * @gotcha  Keep persisted finance data in the API/database layer, not UI atoms.
 */

import { atomWithStorage } from "jotai/utils"

/** When true, every money amount renders masked (for demos, screenshots, or onlookers). */
export const amountsHiddenAtom = atomWithStorage<boolean>("bubo.amountsHidden", false)
