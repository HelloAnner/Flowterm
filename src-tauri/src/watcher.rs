use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
    sync::{
        mpsc::{self, Receiver},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use anyhow::Result;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::{models::ProjectRefreshEvent, state::ProjectRegistry};

const PROJECT_REFRESH_EVENT: &str = "flowterm://project-refresh";
const PROJECT_REFRESH_DEBOUNCE: Duration = Duration::from_millis(75);

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
        let watcher_registry = Arc::clone(&registry);
        let (path_sender, path_receiver) = mpsc::channel::<String>();
        let emit_project_id = project_id_owned.clone();
        let emit_handle = app.clone();

        thread::spawn(move || {
            while let Ok(first_path) = path_receiver.recv() {
                let paths =
                    collect_debounced_paths(&path_receiver, first_path, PROJECT_REFRESH_DEBOUNCE);

                let _ = emit_handle.emit(
                    PROJECT_REFRESH_EVENT,
                    ProjectRefreshEvent {
                        project_id: emit_project_id.clone(),
                        paths,
                    },
                );
            }
        });

        let mut watcher = RecommendedWatcher::new(
            move |result: notify::Result<notify::Event>| {
                if let Ok(event) = result {
                    for changed_path in event.paths {
                        if let Some(relative_path) = to_relative_path(&project_root, &changed_path)
                        {
                            if let Ok(mut registry) = watcher_registry.lock() {
                                registry.mark_live_file(&project_id_owned, relative_path.clone());
                            }
                            let _ = path_sender.send(relative_path);
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

    if value.is_empty() || contains_ignored_component(&value) {
        return None;
    }

    Some(value)
}

fn collect_debounced_paths(
    receiver: &Receiver<String>,
    first_path: String,
    debounce_window: Duration,
) -> Vec<String> {
    let mut paths = BTreeSet::from([first_path]);

    while let Ok(path) = receiver.recv_timeout(debounce_window) {
        paths.insert(path);
    }

    paths.into_iter().collect()
}

fn contains_ignored_component(path: &str) -> bool {
    path.split('/').any(|component| {
        matches!(
            component,
            ".git" | "node_modules" | "dist" | "target" | ".next" | ".turbo" | ".vite"
        )
    })
}

#[cfg(test)]
mod tests {
    use std::{
        path::{Path, PathBuf},
        sync::mpsc,
        time::Duration,
    };

    use super::to_relative_path;

    #[test]
    fn filters_nested_build_and_dependency_paths() {
        let root = Path::new("/tmp/flowterm");

        assert_eq!(
            to_relative_path(root, &PathBuf::from("/tmp/flowterm/src/App.tsx")),
            Some("src/App.tsx".to_string())
        );
        assert_eq!(
            to_relative_path(
                root,
                &PathBuf::from("/tmp/flowterm/src-tauri/target/debug/app")
            ),
            None
        );
        assert_eq!(
            to_relative_path(root, &PathBuf::from("/tmp/flowterm/dist/assets/index.js")),
            None
        );
        assert_eq!(
            to_relative_path(
                root,
                &PathBuf::from("/tmp/flowterm/node_modules/react/index.js")
            ),
            None
        );
    }

    #[test]
    fn batches_paths_that_arrive_within_the_debounce_window() {
        let (sender, receiver) = mpsc::channel();
        sender.send("src/App.tsx".to_string()).unwrap();
        sender.send("README.md".to_string()).unwrap();
        sender.send("src/App.tsx".to_string()).unwrap();

        let first_path = receiver.recv().unwrap();
        let collected =
            super::collect_debounced_paths(&receiver, first_path, Duration::from_millis(10));

        assert_eq!(
            collected,
            vec!["README.md".to_string(), "src/App.tsx".to_string()]
        );
    }
}
