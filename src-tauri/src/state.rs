use std::{
    collections::{HashMap, HashSet},
    env, fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Instant,
};

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::models::{PersistedTerminalPane, ProjectRecord, ProjectWorkspaceState};

const DATABASE_FILE_NAME: &str = "flowterm.sqlite3";
const E2E_HANDSHAKE_PATH_ENV: &str = "FLOWTERM_E2E_HANDSHAKE_PATH";
const E2E_REPORT_PATH_ENV: &str = "FLOWTERM_E2E_REPORT_PATH";
const E2E_SCENARIO_ENV: &str = "FLOWTERM_E2E_SCENARIO";
const E2E_TOGGLE_ENV: &str = "FLOWTERM_E2E_PERFORMANCE";
const FLOWTERM_APP_DATA_DIR_ENV: &str = "FLOWTERM_APP_DATA_DIR";
const FLOWTERM_PROJECT_ROOT_ENV: &str = "FLOWTERM_PROJECT_ROOT";
const LEGACY_STATE_FILE_NAME: &str = "state.json";
const ACTIVE_PROJECT_KEY: &str = "active_project_id";

#[derive(Default, serde::Deserialize, serde::Serialize)]
struct LegacyPersistedState {
    active_project_id: Option<String>,
    projects: Vec<ProjectRecord>,
}

pub struct ProjectRegistry {
    active_project_id: Option<String>,
    db_path: PathBuf,
    live_files: HashMap<String, HashSet<String>>,
    projects: Vec<ProjectRecord>,
}

impl ProjectRegistry {
    pub fn load(app: &AppHandle) -> Result<Self> {
        let app_data_dir = resolve_app_data_dir(app)?;

        Self::load_from_dir(app_data_dir)
    }

    pub fn load_from_dir(app_data_dir: PathBuf) -> Result<Self> {
        fs::create_dir_all(&app_data_dir)?;

        let db_path = app_data_dir.join(DATABASE_FILE_NAME);
        initialize_database(&db_path)?;
        migrate_legacy_state(&app_data_dir, &db_path)?;

        Ok(Self {
            active_project_id: load_active_project_id(&db_path)?,
            db_path: db_path.clone(),
            live_files: HashMap::new(),
            projects: load_projects(&db_path)?,
        })
    }

    pub fn active_project(&self) -> Option<ProjectRecord> {
        self.active_project_id
            .as_ref()
            .and_then(|project_id| self.find_project(project_id))
    }

    pub fn active_project_id(&self) -> Option<String> {
        self.active_project_id.clone()
    }

    pub fn add_project(&mut self, path: String, name: Option<String>) -> Result<()> {
        let normalized_path = PathBuf::from(path)
            .canonicalize()
            .context("failed to resolve project path")?;

        if let Some(project) = self
            .projects
            .iter()
            .find(|project| PathBuf::from(&project.path) == normalized_path)
            .cloned()
        {
            self.active_project_id = Some(project.id);
            self.persist_active_project()?;
            return Ok(());
        }

        let project_name = name.unwrap_or_else(|| {
            normalized_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("project")
                .to_string()
        });

        let project = ProjectRecord {
            id: Uuid::new_v4().to_string(),
            name: project_name,
            path: normalized_path.to_string_lossy().to_string(),
        };
        let connection = self.connection()?;

        connection.execute(
            "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
            params![project.id, project.name, project.path],
        )?;

        self.active_project_id = Some(project.id.clone());
        self.projects.push(project);
        self.projects
            .sort_by(|left, right| left.name.cmp(&right.name));
        self.persist_active_project()
    }

    pub fn clear_live_files(&mut self, project_id: &str) {
        self.live_files.remove(project_id);
    }

    pub fn ensure_seeded_from_cwd(&mut self) -> Result<()> {
        if !self.projects.is_empty() {
            return Ok(());
        }

        let cwd = if let Ok(path) = env::var(FLOWTERM_PROJECT_ROOT_ENV) {
            PathBuf::from(path)
        } else {
            env::current_dir().context("failed to resolve current directory")?
        };

        if cwd.is_dir() {
            self.add_project(cwd.to_string_lossy().to_string(), None)?;
        }

        Ok(())
    }

    pub fn find_project(&self, project_id: &str) -> Option<ProjectRecord> {
        self.projects
            .iter()
            .find(|project| project.id == project_id)
            .cloned()
    }

    pub fn live_files_for(&self, project_id: &str) -> HashSet<String> {
        self.live_files.get(project_id).cloned().unwrap_or_default()
    }

    pub fn mark_live_file(&mut self, project_id: &str, relative_path: String) {
        self.live_files
            .entry(project_id.to_string())
            .or_default()
            .insert(relative_path);
    }

    pub fn projects(&self) -> Vec<ProjectRecord> {
        self.projects.clone()
    }

    pub fn remove_project(&mut self, project_id: &str) -> Result<()> {
        let connection = self.connection()?;
        connection.execute("DELETE FROM projects WHERE id = ?1", params![project_id])?;

        self.projects.retain(|project| project.id != project_id);
        self.live_files.remove(project_id);

        if self.active_project_id.as_deref() == Some(project_id) {
            self.active_project_id = self.projects.first().map(|project| project.id.clone());
        }

        self.persist_active_project()
    }

    #[cfg(test)]
    fn replace_terminal_panes(
        &mut self,
        project_id: &str,
        panes: &[PersistedTerminalPane],
    ) -> Result<()> {
        let mut connection = self.connection()?;
        let tx = connection.transaction()?;

        tx.execute(
            "DELETE FROM terminal_panes WHERE project_id = ?1",
            params![project_id],
        )?;

        for (index, pane) in panes.iter().enumerate() {
            tx.execute(
                "INSERT INTO terminal_panes (project_id, pane_id, sort_order, cwd) VALUES (?1, ?2, ?3, ?4)",
                params![project_id, pane.pane_id, index as i64, pane.cwd],
            )?;
        }

        tx.commit()?;

        Ok(())
    }

    pub fn save_workspace_state(
        &mut self,
        project_id: &str,
        workspace_state: ProjectWorkspaceState,
    ) -> Result<()> {
        let connection = self.connection()?;
        let tree_expanded_paths = serde_json::to_string(&workspace_state.tree_expanded_paths)?;
        let terminal_pane_sizes = serde_json::to_string(&workspace_state.terminal_pane_sizes)?;

        connection.execute(
            "INSERT INTO project_workspace_state (
                project_id,
                active_pane_id,
                is_split_view,
                rail_width,
                selected_file_path,
                tree_expanded_paths_json,
                terminal_pane_sizes_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(project_id) DO UPDATE SET
                active_pane_id = excluded.active_pane_id,
                is_split_view = excluded.is_split_view,
                rail_width = excluded.rail_width,
                selected_file_path = excluded.selected_file_path,
                tree_expanded_paths_json = excluded.tree_expanded_paths_json,
                terminal_pane_sizes_json = excluded.terminal_pane_sizes_json",
            params![
                project_id,
                workspace_state.active_pane_id,
                workspace_state.is_split_view,
                workspace_state.rail_width,
                workspace_state.selected_file_path,
                tree_expanded_paths,
                terminal_pane_sizes
            ],
        )?;

        Ok(())
    }

    pub fn saved_terminal_panes(&self, project_id: &str) -> Result<Vec<PersistedTerminalPane>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT pane_id, cwd FROM terminal_panes WHERE project_id = ?1 ORDER BY sort_order ASC",
        )?;
        let rows = statement.query_map(params![project_id], |row| {
            Ok(PersistedTerminalPane {
                cwd: row.get::<_, Option<String>>(1)?,
                pane_id: row.get(0)?,
            })
        })?;

        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn set_active_project(&mut self, project_id: &str) -> Result<()> {
        self.active_project_id = Some(project_id.to_string());
        self.persist_active_project()
    }

    pub fn update_terminal_pane(
        &mut self,
        project_id: &str,
        pane_id: &str,
        cwd: Option<String>,
    ) -> Result<()> {
        let connection = self.connection()?;
        let sort_order = connection
            .query_row(
                "SELECT sort_order FROM terminal_panes WHERE project_id = ?1 AND pane_id = ?2",
                params![project_id, pane_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .unwrap_or_else(|| next_terminal_sort_order(&connection, project_id).unwrap_or(0));

        connection.execute(
            "INSERT INTO terminal_panes (project_id, pane_id, sort_order, cwd) VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(project_id, pane_id) DO UPDATE SET
                sort_order = excluded.sort_order,
                cwd = excluded.cwd",
            params![project_id, pane_id, sort_order, cwd],
        )?;

        Ok(())
    }

    pub fn remove_terminal_pane(&mut self, project_id: &str, pane_id: &str) -> Result<()> {
        let connection = self.connection()?;
        connection.execute(
            "DELETE FROM terminal_panes WHERE project_id = ?1 AND pane_id = ?2",
            params![project_id, pane_id],
        )?;

        Ok(())
    }

    pub fn workspace_state_for(&self, project_id: &str) -> Result<ProjectWorkspaceState> {
        let connection = self.connection()?;
        let row = connection
            .query_row(
                "SELECT
                    active_pane_id,
                    is_split_view,
                    rail_width,
                    selected_file_path,
                    tree_expanded_paths_json,
                    terminal_pane_sizes_json
                FROM project_workspace_state
                WHERE project_id = ?1",
                params![project_id],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, bool>(1)?,
                        row.get::<_, f64>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                },
            )
            .optional()?;

        let Some((
            active_pane_id,
            is_split_view,
            rail_width,
            selected_file_path,
            tree_expanded_paths,
            terminal_pane_sizes,
        )) = row
        else {
            return Ok(ProjectWorkspaceState::default());
        };

        Ok(ProjectWorkspaceState {
            active_pane_id,
            is_split_view,
            rail_width,
            selected_file_path,
            terminal_pane_sizes: serde_json::from_str(&terminal_pane_sizes).unwrap_or_default(),
            tree_expanded_paths: serde_json::from_str(&tree_expanded_paths).unwrap_or_default(),
        })
    }

    fn connection(&self) -> Result<Connection> {
        open_connection(&self.db_path)
    }

    fn persist_active_project(&self) -> Result<()> {
        let connection = self.connection()?;

        connection.execute(
            "DELETE FROM app_state WHERE key = ?1",
            params![ACTIVE_PROJECT_KEY],
        )?;

        if let Some(project_id) = &self.active_project_id {
            connection.execute(
                "INSERT INTO app_state (key, value) VALUES (?1, ?2)",
                params![ACTIVE_PROJECT_KEY, project_id],
            )?;
        }

        Ok(())
    }
}

#[derive(Clone)]
pub struct FlowtermState {
    pub performance_probe: PerformanceProbe,
    pub registry: Arc<Mutex<ProjectRegistry>>,
    pub terminals: Arc<Mutex<crate::terminal::TerminalManager>>,
    pub watcher: Arc<Mutex<crate::watcher::ProjectWatcher>>,
}

impl FlowtermState {
    pub fn new(app: &AppHandle) -> Result<Self> {
        let performance_probe = PerformanceProbe::from_env();
        performance_probe.write_handshake()?;

        Ok(Self {
            performance_probe,
            registry: Arc::new(Mutex::new(ProjectRegistry::load(app)?)),
            terminals: Arc::new(Mutex::new(crate::terminal::TerminalManager::default())),
            watcher: Arc::new(Mutex::new(crate::watcher::ProjectWatcher::default())),
        })
    }
}

#[derive(Clone, Debug)]
pub struct PerformanceProbe {
    pub enabled: bool,
    pub handshake_path: Option<PathBuf>,
    pub project_root: Option<PathBuf>,
    pub report_path: Option<PathBuf>,
    pub scenario: Option<String>,
    started_at: Instant,
}

impl PerformanceProbe {
    fn from_env() -> Self {
        Self {
            enabled: env::var(E2E_TOGGLE_ENV)
                .map(|value| value == "1")
                .unwrap_or(false),
            handshake_path: env::var(E2E_HANDSHAKE_PATH_ENV).ok().map(PathBuf::from),
            project_root: env::var(FLOWTERM_PROJECT_ROOT_ENV).ok().map(PathBuf::from),
            report_path: env::var(E2E_REPORT_PATH_ENV).ok().map(PathBuf::from),
            scenario: env::var(E2E_SCENARIO_ENV).ok(),
            started_at: Instant::now(),
        }
    }

    pub fn process_uptime_ms(&self) -> u64 {
        self.started_at.elapsed().as_millis() as u64
    }

    pub fn write_handshake(&self) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }

        let Some(path) = self.handshake_path.as_ref() else {
            return Ok(());
        };

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let payload = serde_json::json!({
            "processId": std::process::id(),
            "scenario": self.scenario,
        });

        fs::write(path, serde_json::to_vec_pretty(&payload)?)?;
        Ok(())
    }

    pub fn write_report(&self, payload: &[u8]) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }

        let Some(path) = self.report_path.as_ref() else {
            return Ok(());
        };

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        fs::write(path, payload)?;
        Ok(())
    }
}

fn resolve_app_data_dir(app: &AppHandle) -> Result<PathBuf> {
    if let Ok(path) = env::var(FLOWTERM_APP_DATA_DIR_ENV) {
        return Ok(PathBuf::from(path));
    }

    app.path()
        .app_data_dir()
        .context("failed to resolve app data directory")
}

fn initialize_database(path: &PathBuf) -> Result<()> {
    let connection = open_connection(path)?;

    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS project_workspace_state (
            project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
            active_pane_id TEXT,
            is_split_view INTEGER NOT NULL DEFAULT 1,
            rail_width REAL NOT NULL DEFAULT 44,
            selected_file_path TEXT,
            tree_expanded_paths_json TEXT NOT NULL DEFAULT '{}',
            terminal_pane_sizes_json TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS terminal_panes (
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            pane_id TEXT NOT NULL,
            sort_order INTEGER NOT NULL,
            cwd TEXT,
            PRIMARY KEY(project_id, pane_id)
        );",
    )?;
    ensure_workspace_state_columns(&connection)?;

    Ok(())
}

fn ensure_workspace_state_columns(connection: &Connection) -> Result<()> {
    let mut statement = connection.prepare("PRAGMA table_info(project_workspace_state)")?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<HashSet<_>>>()?;

    if !columns.contains("active_pane_id") {
        connection.execute(
            "ALTER TABLE project_workspace_state ADD COLUMN active_pane_id TEXT",
            [],
        )?;
    }

    if !columns.contains("is_split_view") {
        connection.execute(
            "ALTER TABLE project_workspace_state ADD COLUMN is_split_view INTEGER NOT NULL DEFAULT 1",
            [],
        )?;
    }

    if !columns.contains("rail_width") {
        connection.execute(
            "ALTER TABLE project_workspace_state ADD COLUMN rail_width REAL NOT NULL DEFAULT 44",
            [],
        )?;
    }

    Ok(())
}

fn migrate_legacy_state(app_data_dir: &PathBuf, db_path: &PathBuf) -> Result<()> {
    let legacy_path = app_data_dir.join(LEGACY_STATE_FILE_NAME);

    if !legacy_path.exists() || !load_projects(db_path)?.is_empty() {
        return Ok(());
    }

    let content = fs::read_to_string(&legacy_path)?;
    let legacy: LegacyPersistedState = serde_json::from_str(&content).unwrap_or_default();
    let mut connection = open_connection(db_path)?;
    let tx = connection.transaction()?;

    for project in &legacy.projects {
        tx.execute(
            "INSERT OR IGNORE INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
            params![project.id, project.name, project.path],
        )?;
    }

    tx.execute(
        "DELETE FROM app_state WHERE key = ?1",
        params![ACTIVE_PROJECT_KEY],
    )?;

    if let Some(active_project_id) = legacy.active_project_id {
        tx.execute(
            "INSERT INTO app_state (key, value) VALUES (?1, ?2)",
            params![ACTIVE_PROJECT_KEY, active_project_id],
        )?;
    }

    tx.commit()?;

    Ok(())
}

fn load_active_project_id(path: &PathBuf) -> Result<Option<String>> {
    let connection = open_connection(path)?;

    connection
        .query_row(
            "SELECT value FROM app_state WHERE key = ?1",
            params![ACTIVE_PROJECT_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(Into::into)
}

fn load_projects(path: &PathBuf) -> Result<Vec<ProjectRecord>> {
    let connection = open_connection(path)?;
    let mut statement =
        connection.prepare("SELECT id, name, path FROM projects ORDER BY name ASC")?;
    let rows = statement.query_map([], |row| {
        Ok(ProjectRecord {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
        })
    })?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(Into::into)
}

fn next_terminal_sort_order(connection: &Connection, project_id: &str) -> Result<i64> {
    let next_sort_order = connection
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM terminal_panes WHERE project_id = ?1",
            params![project_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()?
        .unwrap_or(0);

    Ok(next_sort_order)
}

fn open_connection(path: &PathBuf) -> Result<Connection> {
    let connection = Connection::open(path)?;
    connection.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(connection)
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, fs};

    use anyhow::Result;

    use crate::models::{PersistedTerminalPane, ProjectWorkspaceState};

    use super::ProjectRegistry;

    #[test]
    fn persists_workspace_state_and_terminal_panes_in_sqlite() -> Result<()> {
        let app_data_dir = unique_test_dir("workspace-state");
        let project_dir = app_data_dir.join("Flowterm");
        fs::create_dir_all(project_dir.join("src/components"))?;

        let mut registry = ProjectRegistry::load_from_dir(app_data_dir.clone())?;
        registry.add_project(
            project_dir.to_string_lossy().to_string(),
            Some("Flowterm".into()),
        )?;
        let project_id = registry.active_project_id().unwrap();
        let main_cwd = project_dir.join("src").to_string_lossy().to_string();
        let split_cwd = project_dir
            .join("src/components")
            .to_string_lossy()
            .to_string();

        registry.save_workspace_state(
            &project_id,
            ProjectWorkspaceState {
                active_pane_id: Some("split".into()),
                is_split_view: false,
                rail_width: 96.0,
                selected_file_path: Some("src/App.tsx".into()),
                terminal_pane_sizes: vec![40.0, 60.0],
                tree_expanded_paths: HashMap::from([
                    ("src".to_string(), true),
                    ("src/components".to_string(), false),
                ]),
            },
        )?;
        registry.replace_terminal_panes(
            &project_id,
            &[
                PersistedTerminalPane {
                    cwd: Some(main_cwd.clone()),
                    pane_id: "main".into(),
                },
                PersistedTerminalPane {
                    cwd: Some(split_cwd.clone()),
                    pane_id: "split".into(),
                },
            ],
        )?;

        let reloaded = ProjectRegistry::load_from_dir(app_data_dir)?;

        assert_eq!(
            reloaded.workspace_state_for(&project_id)?,
            ProjectWorkspaceState {
                active_pane_id: Some("split".into()),
                is_split_view: false,
                rail_width: 96.0,
                selected_file_path: Some("src/App.tsx".into()),
                terminal_pane_sizes: vec![40.0, 60.0],
                tree_expanded_paths: HashMap::from([
                    ("src".to_string(), true),
                    ("src/components".to_string(), false),
                ]),
            }
        );
        assert_eq!(
            reloaded.saved_terminal_panes(&project_id)?,
            vec![
                PersistedTerminalPane {
                    cwd: Some(main_cwd),
                    pane_id: "main".into(),
                },
                PersistedTerminalPane {
                    cwd: Some(split_cwd),
                    pane_id: "split".into(),
                },
            ]
        );

        Ok(())
    }

    #[test]
    fn migrates_legacy_json_state_into_sqlite() -> Result<()> {
        let app_data_dir = unique_test_dir("json-migration");
        fs::create_dir_all(&app_data_dir)?;
        fs::write(
            app_data_dir.join("state.json"),
            r#"{
  "active_project_id": "project-legacy",
  "projects": [
    {
      "id": "project-legacy",
      "name": "Legacy",
      "path": "/tmp/legacy-project"
    }
  ]
}"#,
        )?;

        let registry = ProjectRegistry::load_from_dir(app_data_dir.clone())?;

        assert_eq!(registry.active_project_id(), Some("project-legacy".into()));
        assert_eq!(registry.projects().len(), 1);
        assert!(app_data_dir.join("flowterm.sqlite3").exists());

        Ok(())
    }

    fn unique_test_dir(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "flowterm-state-tests-{}-{}",
            name,
            uuid::Uuid::new_v4()
        ));
        let _ = fs::create_dir_all(&path);
        path
    }
}
