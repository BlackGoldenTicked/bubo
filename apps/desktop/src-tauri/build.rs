/**
 * @purpose Generate Tauri build metadata for the bubo desktop binary.
 * @role    Cargo build script for the parallel Tauri shell.
 * @deps    tauri-build.
 * @gotcha  The shared Info.plist is embedded as __TEXT,__info_plist for bundled/debug builds.
 *          TCC trusts only code-signed Info.plists, so speech recognition stays disabled in
 *          unbundled `tauri dev` runs (speech.rs checks the runtime environment) and falls back
 *          to Bailian there instead of aborting.
 */

fn main() {
    #[cfg(target_os = "macos")]
    {
        let manifest_dir =
            std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set by cargo");
        let info_plist = std::path::Path::new(&manifest_dir).join("Info.plist");
        println!("cargo:rerun-if-changed=Info.plist");
        println!("cargo:rustc-link-arg-bins=-sectcreate");
        println!("cargo:rustc-link-arg-bins=__TEXT");
        println!("cargo:rustc-link-arg-bins=__info_plist");
        println!("cargo:rustc-link-arg-bins={}", info_plist.display());
    }

    tauri_build::build()
}
