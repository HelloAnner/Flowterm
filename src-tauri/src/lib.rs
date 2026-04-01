pub mod agent_detector;
mod git;
mod models;
mod state;
mod terminal;
mod watcher;

use std::path::PathBuf;

use anyhow::{Context, Result};
use git::scan_project;
use models::{
    AppBootstrap, FilePreview, PerformanceProbeReport, PerformanceProbeState,
    PersistedTerminalPane, ProjectSnapshot, ProjectSummary, ProjectWorkspaceState,
    TerminalAttachment,
};
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
            let mut terminals = state.terminals.lock().unwrap();
            terminals.remove_project(&project_id);
        }

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
fn read_file_preview(
    state: State<FlowtermState>,
    project_id: String,
    path: String,
    start_line: Option<usize>,
    line_count: Option<usize>,
) -> Result<FilePreview, String> {
    with_error_handling(|| {
        let project = {
            let registry = state.registry.lock().unwrap();
            registry
                .find_project(&project_id)
                .context("project not found")?
        };
        let live_files = {
            let registry = state.registry.lock().unwrap();
            registry.live_files_for(&project_id)
        };

        git::build_file_preview_with_options(
            &PathBuf::from(project.path),
            &path,
            &live_files,
            start_line,
            line_count,
        )
    })
}

#[tauri::command]
fn write_project_file(
    state: State<FlowtermState>,
    project_id: String,
    path: String,
    content: String,
) -> Result<FilePreview, String> {
    with_error_handling(|| {
        let project = {
            let registry = state.registry.lock().unwrap();
            registry
                .find_project(&project_id)
                .context("project not found")?
        };
        let live_files = {
            let registry = state.registry.lock().unwrap();
            registry.live_files_for(&project_id)
        };

        git::write_text_preview(&PathBuf::from(project.path), &path, &live_files, &content)
    })
}

#[tauri::command]
fn create_project_entry(
    state: State<FlowtermState>,
    project_id: String,
    path: String,
    kind: String,
) -> Result<String, String> {
    with_error_handling(|| {
        let project = {
            let registry = state.registry.lock().unwrap();
            registry
                .find_project(&project_id)
                .context("project not found")?
        };

        git::create_project_entry(&PathBuf::from(project.path), &path, &kind)
    })
}

#[tauri::command]
fn attach_terminal(
    app: AppHandle,
    state: State<FlowtermState>,
    project_id: String,
    pane_id: Option<String>,
) -> Result<models::TerminalAttachment, String> {
    with_error_handling(|| {
        let (project, panes) = {
            let registry = state.registry.lock().unwrap();
            (
                registry
                    .find_project(&project_id)
                    .context("project not found")?,
                registry.saved_terminal_panes(&project_id)?,
            )
        };
        let pane_cwd = pane_id
            .as_deref()
            .and_then(|candidate| panes.iter().find(|pane| pane.pane_id == candidate))
            .and_then(|pane| pane.cwd.as_deref());

        let mut terminals = state.terminals.lock().unwrap();
        terminals.attach_or_create(
            app,
            state.registry.clone(),
            &project.id,
            &PathBuf::from(project.path),
            pane_id.as_deref(),
            pane_cwd,
        )
    })
}

#[tauri::command]
fn list_terminals(
    app: AppHandle,
    state: State<FlowtermState>,
    project_id: String,
) -> Result<Vec<TerminalAttachment>, String> {
    with_error_handling(|| {
        let (project, persisted_panes) = {
            let registry = state.registry.lock().unwrap();
            (
                registry
                    .find_project(&project_id)
                    .context("project not found")?,
                registry.saved_terminal_panes(&project_id)?,
            )
        };
        let panes = if persisted_panes.is_empty() {
            vec![PersistedTerminalPane {
                cwd: Some(project.path.clone()),
                pane_id: "main".to_string(),
            }]
        } else {
            persisted_panes
        };
        let mut terminals = state.terminals.lock().unwrap();
        let mut attachments = Vec::with_capacity(panes.len());

        for pane in panes {
            attachments.push(terminals.attach_or_create(
                app.clone(),
                state.registry.clone(),
                &project.id,
                &PathBuf::from(&project.path),
                Some(&pane.pane_id),
                pane.cwd.as_deref(),
            )?);
        }

        Ok(attachments)
    })
}

#[tauri::command]
fn read_project_workspace(
    state: State<FlowtermState>,
    project_id: String,
) -> Result<ProjectWorkspaceState, String> {
    with_error_handling(|| {
        let registry = state.registry.lock().unwrap();
        registry.workspace_state_for(&project_id)
    })
}

#[tauri::command]
fn save_project_workspace(
    state: State<FlowtermState>,
    project_id: String,
    workspace_state: ProjectWorkspaceState,
) -> Result<(), String> {
    with_error_handling(|| {
        let mut registry = state.registry.lock().unwrap();
        registry.save_workspace_state(&project_id, workspace_state)
    })
}

#[tauri::command]
fn write_terminal(
    state: State<FlowtermState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    with_error_handling(|| {
        let mut terminals = state.terminals.lock().unwrap();
        terminals.write(&session_id, &data)
    })
}

#[tauri::command]
fn resize_terminal(
    state: State<FlowtermState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    with_error_handling(|| {
        let mut terminals = state.terminals.lock().unwrap();
        terminals.resize(&session_id, cols, rows)
    })
}

#[tauri::command]
fn close_terminal(
    state: State<FlowtermState>,
    project_id: String,
    session_id: String,
) -> Result<(), String> {
    with_error_handling(|| {
        let mut terminals = state.terminals.lock().unwrap();
        terminals.close(state.registry.clone(), &project_id, &session_id);
        Ok(())
    })
}

#[tauri::command]
fn read_performance_probe_state(
    state: State<FlowtermState>,
) -> Result<PerformanceProbeState, String> {
    with_error_handling(|| {
        Ok(PerformanceProbeState {
            enabled: state.performance_probe.enabled,
            process_id: std::process::id(),
            project_root: state
                .performance_probe
                .project_root
                .as_ref()
                .map(|value| value.to_string_lossy().to_string()),
            process_uptime_ms: state.performance_probe.process_uptime_ms(),
            scenario: state.performance_probe.scenario.clone(),
        })
    })
}

#[tauri::command]
fn complete_performance_probe(
    app: AppHandle,
    state: State<FlowtermState>,
    report: PerformanceProbeReport,
    exit_code: i32,
) -> Result<(), String> {
    with_error_handling(|| {
        let payload = serde_json::to_vec_pretty(&report)?;
        state.performance_probe.write_report(&payload)?;
        app.exit(exit_code);
        Ok(())
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
            close_terminal,
            complete_performance_probe,
            create_project_entry,
            list_terminals,
            read_file_preview,
            read_performance_probe_state,
            read_project_workspace,
            refresh_project_snapshot,
            remove_project,
            resize_terminal,
            save_project_workspace,
            write_project_file,
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
    let terminals = if let Some(project) = active_project.as_ref() {
        restore_project_terminals(app, state, project)?
    } else {
        Vec::new()
    };
    let workspace_state = if let Some(project) = active_project.as_ref() {
        let registry = state.registry.lock().unwrap();
        Some(registry.workspace_state_for(&project.id)?)
    } else {
        None
    };
    let projects =
        collect_project_summaries(state, snapshot.as_ref().map(|snapshot| &snapshot.project))?;
    let active_project_id = {
        let registry = state.registry.lock().unwrap();
        registry.active_project_id()
    };

    Ok(AppBootstrap {
        active_project_id,
        projects,
        snapshot,
        terminals,
        workspace_state,
    })
}

fn build_snapshot(
    state: &State<FlowtermState>,
    project: &models::ProjectRecord,
) -> Result<ProjectSnapshot> {
    let live_files = {
        let registry = state.registry.lock().unwrap();
        registry.live_files_for(&project.id)
    };
    let scan = scan_project(&PathBuf::from(&project.path), &live_files)?;
    let terminal_state = {
        let terminals = state.terminals.lock().unwrap();
        terminals.state_for_project(&project.id)
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
        project: summary,
    })
}

fn collect_project_summaries(
    state: &State<FlowtermState>,
    active_summary: Option<&ProjectSummary>,
) -> Result<Vec<ProjectSummary>> {
    let projects = {
        let registry = state.registry.lock().unwrap();
        registry.projects()
    };
    let mut summaries = Vec::new();
    let active_summary_by_id = active_summary.map(|summary| (summary.id.as_str(), summary));

    for project in projects {
        if let Some((active_project_id, summary)) = active_summary_by_id {
            if project.id == active_project_id {
                summaries.push(summary.clone());
                continue;
            }
        }

        let live_files = {
            let registry = state.registry.lock().unwrap();
            registry.live_files_for(&project.id)
        };
        let scan = scan_project(&PathBuf::from(&project.path), &live_files)?;
        let terminal_state = {
            let terminals = state.terminals.lock().unwrap();
            terminals.state_for_project(&project.id)
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

fn restore_project_terminals(
    app: &AppHandle,
    state: &State<FlowtermState>,
    project: &models::ProjectRecord,
) -> Result<Vec<TerminalAttachment>> {
    let persisted_panes = {
        let registry = state.registry.lock().unwrap();
        registry.saved_terminal_panes(&project.id)?
    };
    let panes = if persisted_panes.is_empty() {
        vec![PersistedTerminalPane {
            cwd: Some(project.path.clone()),
            pane_id: "main".to_string(),
        }]
    } else {
        persisted_panes
    };
    let mut terminals = state.terminals.lock().unwrap();
    let mut attachments = Vec::with_capacity(panes.len());

    for pane in panes {
        attachments.push(terminals.attach_or_create(
            app.clone(),
            state.registry.clone(),
            &project.id,
            &PathBuf::from(&project.path),
            Some(&pane.pane_id),
            pane.cwd.as_deref(),
        )?);
    }

    Ok(attachments)
}

fn with_error_handling<T>(operation: impl FnOnce() -> Result<T>) -> Result<T, String> {
    operation().map_err(|error| error.to_string())
}
