use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    println!("[Tauri 2] Initialized main window for VISTAAR Super Admin ({:?})", window.title());
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running VISTAAR Super Admin desktop application");
}

