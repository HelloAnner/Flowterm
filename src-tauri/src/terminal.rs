use std::{
    collections::HashMap,
    env,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
};

use anyhow::{Context, Result};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::models::{TerminalAttachment, TerminalOutputEvent, TerminalState, TerminalStateEvent};

const MAX_HISTORY_CHARS: usize = 40_000;
const TERMINAL_OUTPUT_EVENT: &str = "flowterm://terminal-output";
const TERMINAL_STATE_EVENT: &str = "flowterm://terminal-state";

pub struct TerminalSession {
    child: Box<dyn portable_pty::Child + Send>,
    history: Arc<Mutex<String>>,
    master: Box<dyn MasterPty + Send>,
    pane_id: String,
    project_id: String,
    session_id: String,
    shell_label: String,
    state: Arc<Mutex<TerminalState>>,
    writer: Box<dyn Write + Send>,
}

#[derive(Default)]
pub struct TerminalManager {
    sessions: HashMap<String, TerminalSession>,
    session_ids_by_pane: HashMap<String, HashMap<String, String>>,
}

impl TerminalManager {
    pub fn attach_or_create(
        &mut self,
        app: AppHandle,
        project_id: &str,
        project_path: &Path,
        pane_id: Option<&str>,
    ) -> Result<TerminalAttachment> {
        let pane_id = pane_id.unwrap_or("main");
        let session_id = self
            .session_ids_by_pane
            .get(project_id)
            .and_then(|sessions| sessions.get(pane_id))
            .cloned();

        let session_id = match session_id {
            Some(session_id) => session_id,
            None => {
                let session_id = Uuid::new_v4().to_string();
                let session = create_session(
                    app,
                    project_id.to_string(),
                    pane_id.to_string(),
                    session_id.clone(),
                    project_path.to_path_buf(),
                )?;

                self.sessions.insert(session_id.clone(), session);
                self.session_ids_by_pane
                    .entry(project_id.to_string())
                    .or_default()
                    .insert(pane_id.to_string(), session_id.clone());
                session_id
            }
        };

        let session = self
            .sessions
            .get(&session_id)
            .context("terminal session not found after creation")?;

        Ok(TerminalAttachment {
            history: session.history.lock().unwrap().clone(),
            pane_id: session.pane_id.clone(),
            project_id: session.project_id.clone(),
            session_id: session.session_id.clone(),
            shell_label: session.shell_label.clone(),
            state: session.state.lock().unwrap().clone(),
        })
    }

    pub fn close(&mut self, session_id: &str) {
        let Some(session) = self.sessions.remove(session_id) else {
            return;
        };

        let mut should_remove_project = false;

        if let Some(project_sessions) = self.session_ids_by_pane.get_mut(&session.project_id) {
            project_sessions.remove(&session.pane_id);
            should_remove_project = project_sessions.is_empty();
        }

        if should_remove_project {
            self.session_ids_by_pane.remove(&session.project_id);
        }
    }

    pub fn remove_project(&mut self, project_id: &str) {
        let Some(session_ids) = self.session_ids_by_pane.remove(project_id) else {
            return;
        };

        for session_id in session_ids.into_values() {
            self.sessions.remove(&session_id);
        }
    }

    pub fn resize(&mut self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        if let Some(session) = self.sessions.get_mut(session_id) {
            session.master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })?;
        }

        Ok(())
    }

    pub fn state_for_project(&self, project_id: &str) -> TerminalState {
        let Some(session_ids) = self.session_ids_by_pane.get(project_id) else {
            return TerminalState::Idle;
        };

        let mut aggregate_state = TerminalState::Idle;

        for session_id in session_ids.values() {
            let Some(session_state) = self
                .sessions
                .get(session_id)
                .and_then(|session| session.state.lock().ok().map(|value| value.clone()))
            else {
                continue;
            };

            if session_state == TerminalState::Attention {
                return TerminalState::Attention;
            }

            if session_state == TerminalState::Running {
                aggregate_state = TerminalState::Running;
            }
        }

        aggregate_state
    }

    pub fn write(&mut self, session_id: &str, data: &str) -> Result<()> {
        if let Some(session) = self.sessions.get_mut(session_id) {
            session.writer.write_all(data.as_bytes())?;
            session.writer.flush()?;
        }

        Ok(())
    }
}

fn create_session(
    app: AppHandle,
    project_id: String,
    pane_id: String,
    session_id: String,
    project_path: PathBuf,
) -> Result<TerminalSession> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 40,
        cols: 120,
        pixel_width: 0,
        pixel_height: 0,
    })?;
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let shell_label = PathBuf::from(&shell)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("shell")
        .to_string();
    let mut command = CommandBuilder::new(shell);
    command.cwd(project_path);
    let child = pair.slave.spawn_command(command)?;
    let writer = pair.master.take_writer()?;
    let mut reader = pair.master.try_clone_reader()?;
    let history = Arc::new(Mutex::new(String::new()));
    let state = Arc::new(Mutex::new(TerminalState::Idle));
    let history_ref = Arc::clone(&history);
    let state_ref = Arc::clone(&state);
    let pane_id_ref = pane_id.clone();
    let project_id_ref = project_id.clone();
    let session_id_ref = session_id.clone();
    let app_ref = app.clone();

    thread::spawn(move || {
        let mut buffer = [0u8; 8192];

        loop {
            let read = match reader.read(&mut buffer) {
                Ok(value) => value,
                Err(_) => 0,
            };

            if read == 0 {
                let should_emit_idle = if let Ok(mut current_state) = state_ref.lock() {
                    if *current_state == TerminalState::Idle {
                        false
                    } else {
                        *current_state = TerminalState::Idle;
                        true
                    }
                } else {
                    false
                };

                if should_emit_idle {
                    let _ = app_ref.emit(
                        TERMINAL_STATE_EVENT,
                        TerminalStateEvent {
                            pane_id: pane_id_ref.clone(),
                            project_id: project_id_ref.clone(),
                            session_id: session_id_ref.clone(),
                            state: TerminalState::Idle,
                        },
                    );
                }
                break;
            }

            let chunk = String::from_utf8_lossy(&buffer[..read]).to_string();
            push_history(&history_ref, &chunk);
            let next_state = detect_state(&chunk);
            let should_emit_state = if let Ok(mut current_state) = state_ref.lock() {
                if *current_state == next_state {
                    false
                } else {
                    *current_state = next_state.clone();
                    true
                }
            } else {
                false
            };

            let _ = app_ref.emit(
                TERMINAL_OUTPUT_EVENT,
                TerminalOutputEvent {
                    pane_id: pane_id_ref.clone(),
                    project_id: project_id_ref.clone(),
                    session_id: session_id_ref.clone(),
                    chunk,
                },
            );
            if should_emit_state {
                let _ = app_ref.emit(
                    TERMINAL_STATE_EVENT,
                    TerminalStateEvent {
                        pane_id: pane_id_ref.clone(),
                        project_id: project_id_ref.clone(),
                        session_id: session_id_ref.clone(),
                        state: next_state,
                    },
                );
            }
        }
    });

    Ok(TerminalSession {
        child,
        history,
        master: pair.master,
        pane_id,
        project_id,
        session_id,
        shell_label,
        state,
        writer,
    })
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

fn detect_state(chunk: &str) -> TerminalState {
    if chunk.to_lowercase().contains("waiting for your input") {
        return TerminalState::Attention;
    }

    TerminalState::Running
}

fn push_history(history: &Arc<Mutex<String>>, chunk: &str) {
    if let Ok(mut content) = history.lock() {
        content.push_str(chunk);

        if content.len() > MAX_HISTORY_CHARS {
            let start = content.len().saturating_sub(MAX_HISTORY_CHARS);
            *content = content[start..].to_string();
        }
    }
}
