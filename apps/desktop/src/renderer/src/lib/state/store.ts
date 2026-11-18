/**
 * @purpose Hold the one jotai store the whole renderer reads and writes.
 * @role    Shared store instance for React (`JotaiProvider`) and imperative code.
 * @deps    jotai's createStore only.
 * @gotcha  `<JotaiProvider>` without a `store` prop creates its own store, so any imperative
 *          write from outside React (save glow, voice queue control) must target this instance —
 *          jotai's `getDefaultStore()` is a different store and its updates are invisible to the UI.
 */

import { createStore } from "jotai"

export const appStore = createStore()
