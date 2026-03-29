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

use crate::models::{TerminalAttachment, TerminalOutputEvent, TerminalState, TerminalStateEvent};

const MAX_HISTORY_CHARS: usize = 40_000;
const TERMINAL_OUTPUT_EVENT: &str = "flowterm://terminal-output";
const TERMINAL_STATE_EVENT: &str = "flowterm://terminal-state";

pub struct TerminalSession {
    child: Box<dyn portable_pty::Child + Send>,
    history: Arc<Mutex<String>>,
    master: Box<dyn MasterPty + Send>,
    project_id: String,
    shell_label: String,
    state: Arc<Mutex<TerminalState>>,
    writer: Box<dyn Write + Send>,
}

#[derive(Default)]
pub struct TerminalManager {
    sessions: HashMap<String, TerminalSession>,
}

impl TerminalManager {
    pub fn attach_or_create(
        &mut self,
        app: AppHandle,
        project_id: &str,
        project_path: &Path,
    ) -> Result<TerminalAttachment> {
        if !self.sessions.contains_key(project_id) {
            let session = create_session(app, project_id.to_string(), project_path.to_path_buf())?;
            self.sessions.insert(project_id.to_string(), session);
        }

        let session = self
            .sessions
            .get(project_id)
            .context("terminal session not found after creation")?;

        Ok(TerminalAttachment {
            history: session.history.lock().unwrap().clone(),
            project_id: session.project_id.clone(),
            shell_label: session.shell_label.clone(),
            state: session.state.lock().unwrap().clone(),
        })
    }

    pub fn resize(&mut self, project_id: &str, cols: u16, rows: u16) -> Result<()> {
        if let Some(session) = self.sessions.get_mut(project_id) {
            session.master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })?;
        }

        Ok(())
    }

    pub fn state_for(&self, project_id: &str) -> TerminalState {
        self.sessions
            .get(project_id)
            .and_then(|session| session.state.lock().ok().map(|value| value.clone()))
            .unwrap_or(TerminalState::Idle)
    }

    pub fn write(&mut self, project_id: &str, data: &str) -> Result<()> {
        if let Some(session) = self.sessions.get_mut(project_id) {
            session.writer.write_all(data.as_bytes())?;
            session.writer.flush()?;
        }

        Ok(())
    }
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

fn create_session(app: AppHandle, project_id: String, project_path: PathBuf) -> Result<TerminalSession> {
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
    let project_id_ref = project_id.clone();
    let app_ref = app.clone();

    thread::spawn(move || {
        let mut buffer = [0u8; 8192];

        loop {
            let read = match reader.read(&mut buffer) {
                Ok(value) => value,
                Err(_) => 0,
            };

            if read == 0 {
                let _ = app_ref.emit(
                    TERMINAL_STATE_EVENT,
                    TerminalStateEvent {
                        project_id: project_id_ref.clone(),
                        state: TerminalState::Idle,
                    },
                );
                break;
            }

            let chunk = String::from_utf8_lossy(&buffer[..read]).to_string();
            push_history(&history_ref, &chunk);
            let next_state = detect_state(&chunk);

            if let Ok(mut current_state) = state_ref.lock() {
                *current_state = next_state.clone();
            }

            let _ = app_ref.emit(
                TERMINAL_OUTPUT_EVENT,
                TerminalOutputEvent {
                    project_id: project_id_ref.clone(),
                    chunk,
                },
            );
            let _ = app_ref.emit(
                TERMINAL_STATE_EVENT,
                TerminalStateEvent {
                    project_id: project_id_ref.clone(),
                    state: next_state,
                },
            );
        }
    });

    Ok(TerminalSession {
        child,
        history,
        master: pair.master,
        project_id,
        shell_label,
        state,
        writer,
    })
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
