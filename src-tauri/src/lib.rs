mod git;
mod models;
mod state;
mod terminal;
mod watcher;

use std::path::PathBuf;

use anyhow::{Context, Result};
use git::scan_project;
use models::{AppBootstrap, ProjectSnapshot, ProjectSummary};
use state::FlowtermState;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
fn bootstrap_app(app: AppHandle, state: State<FlowtermState>) -> Result<AppBootstrap, String> {
    with_error_handling(|| {
        {
            let mut registry = state.registry.lock().unwrap();
            registry.ensure_seeded_from_cwd()?;
        }

        build_bootstrap(&app, &state)
    })
}

#[tauri::command]
fn add_project(
    app: AppHandle,
    state: State<FlowtermState>,
    path: String,
    name: Option<String>,
) -> Result<AppBootstrap, String> {
    with_error_handling(|| {
        {
            let mut registry = state.registry.lock().unwrap();
            registry.add_project(path, name)?;
        }

        build_bootstrap(&app, &state)
    })
}

#[tauri::command]
fn remove_project(
    app: AppHandle,
    state: State<FlowtermState>,
    project_id: String,
) -> Result<AppBootstrap, String> {
    with_error_handling(|| {
        {
            let mut registry = state.registry.lock().unwrap();
            registry.remove_project(&project_id)?;
        }

        build_bootstrap(&app, &state)
    })
}

#[tauri::command]
fn activate_project(
    app: AppHandle,
    state: State<FlowtermState>,
    project_id: String,
) -> Result<ProjectSnapshot, String> {
    with_error_handling(|| {
        let project = {
            let mut registry = state.registry.lock().unwrap();
            registry.set_active_project(&project_id)?;
            registry
                .find_project(&project_id)
                .context("project not found")?
        };

        ensure_active_watch(&app, &state, &project.id, &project.path)?;
        build_snapshot(&state, &project)
    })
}

#[tauri::command]
fn refresh_project_snapshot(
    state: State<FlowtermState>,
    project_id: String,
) -> Result<ProjectSnapshot, String> {
    with_error_handling(|| {
        let project = {
            let registry = state.registry.lock().unwrap();
            registry
                .find_project(&project_id)
                .context("project not found")?
        };

        build_snapshot(&state, &project)
    })
}

#[tauri::command]
fn attach_terminal(
    app: AppHandle,
    state: State<FlowtermState>,
    project_id: String,
) -> Result<models::TerminalAttachment, String> {
    with_error_handling(|| {
        let project = {
            let registry = state.registry.lock().unwrap();
            registry
                .find_project(&project_id)
                .context("project not found")?
        };

        let mut terminals = state.terminals.lock().unwrap();
        terminals.attach_or_create(app, &project.id, &PathBuf::from(project.path))
    })
}

#[tauri::command]
fn write_terminal(
    state: State<FlowtermState>,
    project_id: String,
    data: String,
) -> Result<(), String> {
    with_error_handling(|| {
        let mut terminals = state.terminals.lock().unwrap();
        terminals.write(&project_id, &data)
    })
}

#[tauri::command]
fn resize_terminal(
    state: State<FlowtermState>,
    project_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    with_error_handling(|| {
        let mut terminals = state.terminals.lock().unwrap();
        terminals.resize(&project_id, cols, rows)
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(FlowtermState::new(&app.handle())?);
            app.handle()
                .plugin(tauri_plugin_dialog::init())
                .context("failed to initialize dialog plugin")?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            activate_project,
            add_project,
            attach_terminal,
            bootstrap_app,
            refresh_project_snapshot,
            remove_project,
            resize_terminal,
            write_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn build_bootstrap(app: &AppHandle, state: &State<FlowtermState>) -> Result<AppBootstrap> {
    let active_project = {
        let registry = state.registry.lock().unwrap();
        registry.active_project()
    };

    if let Some(project) = active_project.as_ref() {
        ensure_active_watch(app, state, &project.id, &project.path)?;
    }

    let snapshot = active_project
        .as_ref()
        .map(|project| build_snapshot(state, project))
        .transpose()?;
    let terminal = active_project
        .as_ref()
        .map(|project| {
            let mut terminals = state.terminals.lock().unwrap();
            terminals.attach_or_create(app.clone(), &project.id, &PathBuf::from(&project.path))
        })
        .transpose()?;
    let projects = collect_project_summaries(state)?;
    let active_project_id = {
        let registry = state.registry.lock().unwrap();
        registry.active_project_id()
    };

    Ok(AppBootstrap {
        active_project_id,
        projects,
        snapshot,
        terminal,
    })
}

fn build_snapshot(state: &State<FlowtermState>, project: &models::ProjectRecord) -> Result<ProjectSnapshot> {
    let live_files = {
        let registry = state.registry.lock().unwrap();
        registry.live_files_for(&project.id)
    };
    let scan = scan_project(&PathBuf::from(&project.path), &live_files)?;
    let terminal_state = {
        let terminals = state.terminals.lock().unwrap();
        terminals.state_for(&project.id)
    };
    let summary = ProjectSummary {
        changed_file_count: scan.changed_file_count,
        has_live_activity: !live_files.is_empty(),
        id: project.id.clone(),
        name: project.name.clone(),
        path: project.path.clone(),
        terminal_state,
        untracked_file_count: scan.untracked_file_count,
    };

    Ok(ProjectSnapshot {
        backend: "xterm".to_string(),
        files: scan.files,
        git_diffs: scan.diffs.clone(),
        live_diffs: scan.diffs,
        project: summary,
    })
}

fn collect_project_summaries(state: &State<FlowtermState>) -> Result<Vec<ProjectSummary>> {
    let projects = {
        let registry = state.registry.lock().unwrap();
        registry.projects()
    };
    let mut summaries = Vec::new();

    for project in projects {
        let live_files = {
            let registry = state.registry.lock().unwrap();
            registry.live_files_for(&project.id)
        };
        let scan = scan_project(&PathBuf::from(&project.path), &live_files)?;
        let terminal_state = {
            let terminals = state.terminals.lock().unwrap();
            terminals.state_for(&project.id)
        };

        summaries.push(ProjectSummary {
            changed_file_count: scan.changed_file_count,
            has_live_activity: !live_files.is_empty(),
            id: project.id,
            name: project.name,
            path: project.path,
            terminal_state,
            untracked_file_count: scan.untracked_file_count,
        });
    }

    Ok(summaries)
}

fn ensure_active_watch(
    app: &AppHandle,
    state: &State<FlowtermState>,
    project_id: &str,
    project_path: &str,
) -> Result<()> {
    {
        let mut registry = state.registry.lock().unwrap();
        registry.clear_live_files(project_id);
    }
    let mut watcher = state.watcher.lock().unwrap();
    watcher.watch_project(
        app.clone(),
        state.registry.clone(),
        project_id,
        &PathBuf::from(project_path),
    )
}

fn with_error_handling<T>(operation: impl FnOnce() -> Result<T>) -> Result<T, String> {
    operation().map_err(|error| error.to_string())
}
