use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub use crate::agent_detector::{AgentKind, AgentPhase, AgentStatusSnapshot};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBootstrap {
    pub active_project_id: Option<String>,
    pub projects: Vec<ProjectSummary>,
    pub snapshot: Option<ProjectSnapshot>,
    pub terminals: Vec<TerminalAttachment>,
    pub workspace_state: Option<ProjectWorkspaceState>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub path: String,
    pub changed_file_count: usize,
    pub untracked_file_count: usize,
    pub has_live_activity: bool,
    pub terminal_state: TerminalState,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub project: ProjectSummary,
    pub files: Vec<ProjectFileEntry>,
    pub backend: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileEntry {
    pub path: String,
    pub kind: String,
    pub git_status: char,
    pub live_status: LiveStatus,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreview {
    pub path: String,
    pub mode: FilePreviewMode,
    pub git_status: char,
    pub live_status: LiveStatus,
    pub image_data_url: Option<String>,
    pub start_line: usize,
    pub total_lines: usize,
    pub lines: Vec<DiffLine>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FilePreviewMode {
    Diff,
    Image,
    Text,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub content: String,
    pub old_line_number: Option<usize>,
    pub new_line_number: Option<usize>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalAttachment {
    pub agent_status: AgentStatusSnapshot,
    pub cwd: Option<String>,
    pub history: String,
    pub pane_id: String,
    pub project_id: String,
    pub session_id: String,
    pub shell_label: String,
    pub state: TerminalState,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedTerminalPane {
    pub cwd: Option<String>,
    pub pane_id: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWorkspaceState {
    pub selected_file_path: Option<String>,
    pub terminal_pane_sizes: Vec<f64>,
    pub tree_expanded_paths: HashMap<String, bool>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TerminalState {
    Attention,
    Exited,
    #[default]
    Idle,
    Running,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LiveStatus {
    Added,
    Deleted,
    Idle,
    Modified,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiffLineKind {
    Added,
    Context,
    Hunk,
    Removed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRefreshEvent {
    pub project_id: String,
    pub paths: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputEvent {
    pub pane_id: String,
    pub project_id: String,
    pub session_id: String,
    pub chunk: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStateEvent {
    pub pane_id: String,
    pub project_id: String,
    pub session_id: String,
    pub state: TerminalState,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusEvent {
    pub agent: AgentKind,
    pub pane_id: String,
    pub phase: AgentPhase,
    pub project_id: String,
    pub session_id: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceProbeState {
    pub enabled: bool,
    pub process_id: u32,
    pub project_root: Option<String>,
    pub process_uptime_ms: u64,
    pub scenario: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceProbeReport {
    pub metadata: HashMap<String, String>,
    pub metrics: HashMap<String, f64>,
    pub scenario: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub path: String,
}
