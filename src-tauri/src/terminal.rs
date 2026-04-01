use std::{
    collections::HashMap,
    env, fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
};

use anyhow::{Context, Result};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::{
    agent_detector::AgentDetector,
    models::{
        AgentPhase, AgentStatusEvent, AgentStatusSnapshot, TerminalAttachment, TerminalOutputEvent,
        TerminalState, TerminalStateEvent,
    },
    state::{FlowtermState, ProjectRegistry},
};

const CWD_MARKER_PREFIX: &str = "\u{1b}]133;CurrentDir=";
const PROMPT_MARKER_PREFIX: &str = "\u{1b}]133;PromptReady=";
const MAX_HISTORY_CHARS: usize = 40_000;
const AGENT_STATUS_EVENT: &str = "flowterm://agent-status";
const TERMINAL_OUTPUT_EVENT: &str = "flowterm://terminal-output";
const TERMINAL_STATE_EVENT: &str = "flowterm://terminal-state";

pub struct TerminalSession {
    agent_status: Arc<Mutex<AgentStatusSnapshot>>,
    child: Box<dyn portable_pty::Child + Send>,
    current_cwd: Arc<Mutex<String>>,
    history: Arc<Mutex<String>>,
    hook_path: Option<PathBuf>,
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
        registry: Arc<Mutex<ProjectRegistry>>,
        project_id: &str,
        project_path: &Path,
        pane_id: Option<&str>,
        cwd: Option<&str>,
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
                let initial_cwd = resolve_session_cwd(project_path, cwd);
                let session = create_session(
                    app,
                    registry.clone(),
                    project_id.to_string(),
                    pane_id.to_string(),
                    session_id.clone(),
                    initial_cwd.clone(),
                )?;

                if let Ok(mut project_registry) = registry.lock() {
                    let _ = project_registry.update_terminal_pane(
                        project_id,
                        pane_id,
                        Some(initial_cwd.to_string_lossy().to_string()),
                    );
                }

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
            agent_status: session.agent_status.lock().unwrap().clone(),
            cwd: Some(session.current_cwd.lock().unwrap().clone()),
            history: session.history.lock().unwrap().clone(),
            pane_id: session.pane_id.clone(),
            project_id: session.project_id.clone(),
            session_id: session.session_id.clone(),
            shell_label: session.shell_label.clone(),
            state: session.state.lock().unwrap().clone(),
        })
    }

    pub fn close(
        &mut self,
        registry: Arc<Mutex<ProjectRegistry>>,
        project_id: &str,
        session_id: &str,
    ) {
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

        if let Ok(mut project_registry) = registry.lock() {
            let _ = project_registry.remove_terminal_pane(project_id, &session.pane_id);
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
    registry: Arc<Mutex<ProjectRegistry>>,
    project_id: String,
    pane_id: String,
    session_id: String,
    session_cwd: PathBuf,
) -> Result<TerminalSession> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 40,
        cols: 120,
        pixel_width: 0,
        pixel_height: 0,
    })?;
    let shell = "/bin/zsh".to_string();
    let shell_label = PathBuf::from(&shell)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("shell")
        .to_string();
    let (command, hook_path) =
        build_shell_command(&shell, &shell_label, &session_cwd, &session_id)?;
    let child = pair.slave.spawn_command(command)?;
    let writer = pair.master.take_writer()?;
    let mut reader = pair.master.try_clone_reader()?;
    let agent_detector = Arc::new(Mutex::new(AgentDetector::default()));
    let agent_status = Arc::new(Mutex::new(AgentStatusSnapshot::default()));
    let history = Arc::new(Mutex::new(String::new()));
    let current_cwd = Arc::new(Mutex::new(session_cwd.to_string_lossy().to_string()));
    let state = Arc::new(Mutex::new(TerminalState::Idle));
    let agent_detector_ref = Arc::clone(&agent_detector);
    let agent_status_ref = Arc::clone(&agent_status);
    let current_cwd_ref = Arc::clone(&current_cwd);
    let history_ref = Arc::clone(&history);
    let state_ref = Arc::clone(&state);
    let pane_id_ref = pane_id.clone();
    let project_id_ref = project_id.clone();
    let session_id_ref = session_id.clone();
    let app_ref = app.clone();

    thread::spawn(move || {
        let mut buffer = [0u8; 32768];

        loop {
            let read = match reader.read(&mut buffer) {
                Ok(value) => value,
                Err(_) => 0,
            };

            if read == 0 {
                let should_emit_exit = if let Ok(mut current_state) = state_ref.lock() {
                    if *current_state == TerminalState::Exited {
                        false
                    } else {
                        *current_state = TerminalState::Exited;
                        true
                    }
                } else {
                    false
                };

                if should_emit_exit {
                    let _ = app_ref.emit(
                        TERMINAL_STATE_EVENT,
                        TerminalStateEvent {
                            pane_id: pane_id_ref.clone(),
                            project_id: project_id_ref.clone(),
                            session_id: session_id_ref.clone(),
                            state: TerminalState::Exited,
                        },
                    );
                }

                let flowterm_state = app_ref.state::<FlowtermState>();
                if let Ok(mut terminals) = flowterm_state.terminals.lock() {
                    terminals.close(
                        flowterm_state.registry.clone(),
                        &project_id_ref,
                        &session_id_ref,
                    );
                }
                break;
            }

            let raw_chunk = match std::str::from_utf8(&buffer[..read]) {
                Ok(s) => s.to_owned(),
                Err(_) => String::from_utf8_lossy(&buffer[..read]).into_owned(),
            };
            let (chunk, markers) = strip_terminal_markers(&raw_chunk);

            if let Some(cwd) = markers.cwd {
                if let Ok(mut current_cwd) = current_cwd_ref.lock() {
                    *current_cwd = cwd.clone();
                }
                if let Ok(mut project_registry) = registry.lock() {
                    let _ = project_registry.update_terminal_pane(
                        &project_id_ref,
                        &pane_id_ref,
                        Some(cwd),
                    );
                }
            }

            let next_agent_status = if let Ok(mut detector) = agent_detector_ref.lock() {
                let mut next = detector.current();

                if markers.prompt_ready {
                    next = detector.observe_prompt();
                }

                if !chunk.is_empty() {
                    next = detector.ingest(&chunk);
                }

                next
            } else {
                AgentStatusSnapshot::default()
            };
            let should_emit_agent_status =
                if let Ok(mut current_agent_status) = agent_status_ref.lock() {
                    if *current_agent_status == next_agent_status {
                        false
                    } else {
                        *current_agent_status = next_agent_status.clone();
                        true
                    }
                } else {
                    false
                };
            let next_state = terminal_state_for_agent_status(&next_agent_status);
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

            if chunk.is_empty() && !should_emit_agent_status && !should_emit_state {
                continue;
            }

            if !chunk.is_empty() {
                push_history(&history_ref, &chunk);
                let _ = app_ref.emit(
                    TERMINAL_OUTPUT_EVENT,
                    TerminalOutputEvent {
                        pane_id: pane_id_ref.clone(),
                        project_id: project_id_ref.clone(),
                        session_id: session_id_ref.clone(),
                        chunk,
                    },
                );
            }

            if should_emit_agent_status {
                let _ = app_ref.emit(
                    AGENT_STATUS_EVENT,
                    AgentStatusEvent {
                        agent: next_agent_status.agent,
                        pane_id: pane_id_ref.clone(),
                        phase: next_agent_status.phase,
                        project_id: project_id_ref.clone(),
                        session_id: session_id_ref.clone(),
                    },
                );
            }

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
        agent_status,
        child,
        current_cwd,
        history,
        hook_path,
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

        if let Some(hook_path) = &self.hook_path {
            if hook_path.is_dir() {
                let _ = fs::remove_dir_all(hook_path);
            } else {
                let _ = fs::remove_file(hook_path);
            }
        }
    }
}

fn build_shell_command(
    shell: &str,
    shell_label: &str,
    session_cwd: &Path,
    session_id: &str,
) -> Result<(CommandBuilder, Option<PathBuf>)> {
    match shell_label {
        "zsh" => build_zsh_command(shell, session_cwd, session_id),
        "bash" => build_bash_command(shell, session_cwd, session_id),
        _ => {
            let mut command = CommandBuilder::new(shell);
            command.cwd(session_cwd);
            Ok((command, None))
        }
    }
}

fn build_zsh_command(
    shell: &str,
    session_cwd: &Path,
    session_id: &str,
) -> Result<(CommandBuilder, Option<PathBuf>)> {
    let hook_dir = env::temp_dir()
        .join("flowterm-shell-hooks")
        .join(session_id);
    fs::create_dir_all(&hook_dir)?;
    let original_zdotdir = env::var("ZDOTDIR")
        .ok()
        .or_else(|| env::var("HOME").ok())
        .unwrap_or_default();
    let hook_file = hook_dir.join(".zshrc");

    fs::write(
        &hook_file,
        "if [ -n \"$FLOWTERM_ORIGINAL_ZDOTDIR\" ] && [ -r \"$FLOWTERM_ORIGINAL_ZDOTDIR/.zshrc\" ]; then\n  source \"$FLOWTERM_ORIGINAL_ZDOTDIR/.zshrc\"\nelif [ -r \"$HOME/.zshrc\" ]; then\n  source \"$HOME/.zshrc\"\nfi\nfunction __flowterm_emit_cwd() {\n  printf '\\033]133;CurrentDir=%s\\a' \"$PWD\"\n}\nfunction __flowterm_emit_prompt_ready() {\n  printf '\\033]133;PromptReady=1\\a'\n}\nautoload -Uz add-zsh-hook 2>/dev/null\nadd-zsh-hook precmd __flowterm_emit_prompt_ready\nadd-zsh-hook precmd __flowterm_emit_cwd\n__flowterm_emit_prompt_ready\n__flowterm_emit_cwd\n",
    )?;

    let mut command = CommandBuilder::new(shell);
    command.arg("-i");
    command.cwd(session_cwd);
    command.env("FLOWTERM_ORIGINAL_ZDOTDIR", original_zdotdir);
    command.env("ZDOTDIR", &hook_dir);

    Ok((command, Some(hook_dir)))
}

fn build_bash_command(
    shell: &str,
    session_cwd: &Path,
    session_id: &str,
) -> Result<(CommandBuilder, Option<PathBuf>)> {
    let hook_dir = env::temp_dir()
        .join("flowterm-shell-hooks")
        .join(session_id);
    fs::create_dir_all(&hook_dir)?;
    let hook_file = hook_dir.join("flowterm.bashrc");
    let original_bashrc = env::var("HOME")
        .ok()
        .map(|home| PathBuf::from(home).join(".bashrc"))
        .filter(|path| path.exists())
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default();

    fs::write(
        &hook_file,
        "if [ -n \"$FLOWTERM_ORIGINAL_BASHRC\" ] && [ -r \"$FLOWTERM_ORIGINAL_BASHRC\" ]; then\n  source \"$FLOWTERM_ORIGINAL_BASHRC\"\nelif [ -r \"$HOME/.bashrc\" ]; then\n  source \"$HOME/.bashrc\"\nfi\n__flowterm_emit_cwd() {\n  printf '\\033]133;CurrentDir=%s\\a' \"$PWD\"\n}\n__flowterm_emit_prompt_ready() {\n  printf '\\033]133;PromptReady=1\\a'\n}\nPROMPT_COMMAND=\"__flowterm_emit_prompt_ready;__flowterm_emit_cwd${PROMPT_COMMAND:+;$PROMPT_COMMAND}\"\n__flowterm_emit_prompt_ready\n__flowterm_emit_cwd\n",
    )?;

    let mut command = CommandBuilder::new(shell);
    command.arg("--rcfile");
    command.arg(hook_file.as_os_str());
    command.arg("-i");
    command.cwd(session_cwd);
    command.env("FLOWTERM_ORIGINAL_BASHRC", original_bashrc);

    Ok((command, Some(hook_dir)))
}

fn terminal_state_for_agent_status(status: &AgentStatusSnapshot) -> TerminalState {
    if status.phase == AgentPhase::Attention {
        return TerminalState::Attention;
    }

    if status.phase == AgentPhase::Running {
        return TerminalState::Running;
    }

    TerminalState::Idle
}

fn find_marker_terminator(input: &str) -> Option<(usize, usize)> {
    let bel = input.find('\u{7}').map(|index| (index, index + 1));
    let st = input.find("\u{1b}\\").map(|index| (index, index + 2));

    match (bel, st) {
        (Some(left), Some(right)) => Some(if left.0 < right.0 { left } else { right }),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    }
}

fn push_history(history: &Arc<Mutex<String>>, chunk: &str) {
    if let Ok(mut content) = history.lock() {
        content.push_str(chunk);

        if content.len() > MAX_HISTORY_CHARS {
            let start = content.len().saturating_sub(MAX_HISTORY_CHARS);
            content.drain(..start);
        }
    }
}

fn resolve_session_cwd(project_path: &Path, cwd: Option<&str>) -> PathBuf {
    let Some(raw_cwd) = cwd.map(PathBuf::from) else {
        return project_path.to_path_buf();
    };

    if raw_cwd.is_dir() {
        return raw_cwd;
    }

    project_path.to_path_buf()
}

#[derive(Default)]
struct TerminalMarkers {
    cwd: Option<String>,
    prompt_ready: bool,
}

fn strip_terminal_markers(chunk: &str) -> (String, TerminalMarkers) {
    let mut cleaned = String::new();
    let mut remaining = chunk;
    let mut markers = TerminalMarkers::default();

    loop {
        let next_cwd = remaining.find(CWD_MARKER_PREFIX);
        let next_prompt = remaining.find(PROMPT_MARKER_PREFIX);
        let Some((start, marker_kind)) = next_marker(next_cwd, next_prompt) else {
            cleaned.push_str(remaining);
            break;
        };

        let marker_start = start
            + match marker_kind {
                MarkerKind::Cwd => CWD_MARKER_PREFIX.len(),
                MarkerKind::Prompt => PROMPT_MARKER_PREFIX.len(),
            };
        cleaned.push_str(&remaining[..start]);
        let after_prefix = &remaining[marker_start..];
        let Some((terminator_start, terminator_end)) = find_marker_terminator(after_prefix) else {
            cleaned.push_str(&remaining[start..]);
            break;
        };

        match marker_kind {
            MarkerKind::Cwd => {
                markers.cwd = Some(after_prefix[..terminator_start].to_string());
            }
            MarkerKind::Prompt => {
                markers.prompt_ready = true;
            }
        }
        remaining = &after_prefix[terminator_end..];
    }

    (cleaned, markers)
}

enum MarkerKind {
    Cwd,
    Prompt,
}

fn next_marker(next_cwd: Option<usize>, next_prompt: Option<usize>) -> Option<(usize, MarkerKind)> {
    match (next_cwd, next_prompt) {
        (Some(cwd), Some(prompt)) => {
            if cwd <= prompt {
                Some((cwd, MarkerKind::Cwd))
            } else {
                Some((prompt, MarkerKind::Prompt))
            }
        }
        (Some(cwd), None) => Some((cwd, MarkerKind::Cwd)),
        (None, Some(prompt)) => Some((prompt, MarkerKind::Prompt)),
        (None, None) => None,
    }
}
