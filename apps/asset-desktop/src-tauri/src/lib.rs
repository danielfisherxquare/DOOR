use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            if let Some(webview) = app.get_webview_window("main") {
                webview.clear_all_browsing_data()?;
                webview.reload()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ArcSpro Assets");
}
