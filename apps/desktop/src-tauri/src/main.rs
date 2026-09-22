/**
 * @purpose Launch the bubo Tauri desktop library on native platforms.
 * @role    Minimal binary entry point required by Cargo and the Tauri CLI.
 * @deps    bubo_lib.
 * @gotcha  Keep application setup in lib.rs so future mobile entry points can reuse it.
 */

fn main() {
    bubo_lib::run();
}
