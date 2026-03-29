use std::{
    collections::{HashMap, HashSet},
    env,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use anyhow::{Context, Result};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::models::ProjectRecord;

#[derive(Default, serde::Deserialize, serde::Serialize)]
struct PersistedState {
    active_project_id: Option<String>,
    projects: Vec<ProjectRecord>,
}

pub struct ProjectRegistry {
    active_project_id: Option<String>,
    live_files: HashMap<String, HashSet<String>>,
    path: PathBuf,
    projects: Vec<ProjectRecord>,
}

impl ProjectRegistry {
    pub fn load(app: &AppHandle) -> Result<Self> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .context("failed to resolve app data directory")?;
        fs::create_dir_all(&app_data_dir)?;
        let path = app_data_dir.join("state.json");

        if !path.exists() {
            return Ok(Self {
                active_project_id: None,
                live_files: HashMap::new(),
                path,
                projects: Vec::new(),
            });
        }

        let content = fs::read_to_string(&path)?;
        let persisted: PersistedState = serde_json::from_str(&content).unwrap_or_default();

        Ok(Self {
            active_project_id: persisted.active_project_id,
            live_files: HashMap::new(),
            path,
            projects: persisted.projects,
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
            return self.save();
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

        self.active_project_id = Some(project.id.clone());
        self.projects.push(project);
        self.projects.sort_by(|left, right| left.name.cmp(&right.name));
        self.save()
    }

    pub fn clear_live_files(&mut self, project_id: &str) {
        self.live_files.remove(project_id);
    }

    pub fn ensure_seeded_from_cwd(&mut self) -> Result<()> {
        if !self.projects.is_empty() {
            return Ok(());
        }

        let cwd = env::current_dir().context("failed to resolve current directory")?;

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
        self.projects.retain(|project| project.id != project_id);
        self.live_files.remove(project_id);

        if self.active_project_id.as_deref() == Some(project_id) {
            self.active_project_id = self.projects.first().map(|project| project.id.clone());
        }

        self.save()
    }

    pub fn set_active_project(&mut self, project_id: &str) -> Result<()> {
        self.active_project_id = Some(project_id.to_string());
        self.save()
    }

    fn save(&self) -> Result<()> {
        let persisted = PersistedState {
            active_project_id: self.active_project_id.clone(),
            projects: self.projects.clone(),
        };
        let content = serde_json::to_string_pretty(&persisted)?;

        fs::write(&self.path, content).with_context(|| {
            format!("failed to persist project registry to {}", self.path.display())
        })?;

        Ok(())
    }
}

#[derive(Clone)]
pub struct FlowtermState {
    pub registry: Arc<Mutex<ProjectRegistry>>,
    pub terminals: Arc<Mutex<crate::terminal::TerminalManager>>,
    pub watcher: Arc<Mutex<crate::watcher::ProjectWatcher>>,
}

impl FlowtermState {
    pub fn new(app: &AppHandle) -> Result<Self> {
        Ok(Self {
            registry: Arc::new(Mutex::new(ProjectRegistry::load(app)?)),
            terminals: Arc::new(Mutex::new(crate::terminal::TerminalManager::default())),
            watcher: Arc::new(Mutex::new(crate::watcher::ProjectWatcher::default())),
        })
    }
}
