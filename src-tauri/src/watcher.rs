use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use anyhow::Result;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::{models::ProjectRefreshEvent, state::ProjectRegistry};

const PROJECT_REFRESH_EVENT: &str = "flowterm://project-refresh";

#[derive(Default)]
pub struct ProjectWatcher {
    active_project_id: Option<String>,
    watcher: Option<RecommendedWatcher>,
}

impl ProjectWatcher {
    pub fn watch_project(
        &mut self,
        app: AppHandle,
        registry: Arc<Mutex<ProjectRegistry>>,
        project_id: &str,
        project_path: &Path,
    ) -> Result<()> {
        if self.active_project_id.as_deref() == Some(project_id) {
            return Ok(());
        }

        self.watcher = None;
        self.active_project_id = Some(project_id.to_string());
        let project_root = project_path.to_path_buf();
        let project_id_owned = project_id.to_string();
        let app_handle = app.clone();
        let watcher_registry = Arc::clone(&registry);
        let mut watcher = RecommendedWatcher::new(
            move |result: notify::Result<notify::Event>| {
                if let Ok(event) = result {
                    for changed_path in event.paths {
                        if let Some(relative_path) = to_relative_path(&project_root, &changed_path)
                        {
                            if let Ok(mut registry) = watcher_registry.lock() {
                                registry.mark_live_file(&project_id_owned, relative_path);
                            }
                            let _ = app_handle.emit(
                                PROJECT_REFRESH_EVENT,
                                ProjectRefreshEvent {
                                    project_id: project_id_owned.clone(),
                                },
                            );
                        }
                    }
                }
            },
            Config::default(),
        )?;

        watcher.watch(project_path, RecursiveMode::Recursive)?;
        self.watcher = Some(watcher);
        Ok(())
    }
}

fn to_relative_path(root: &Path, path: &PathBuf) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let value = relative.to_string_lossy().replace('\\', "/");

    if value.is_empty() || value.starts_with(".git/") || value.contains("node_modules/") {
        return None;
    }

    Some(value)
}
