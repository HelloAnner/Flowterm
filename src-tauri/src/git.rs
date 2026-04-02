use std::{
    collections::{BTreeSet, HashMap, HashSet},
    fs,
    fs::File,
    path::{Component, Path, PathBuf},
    process::Command,
};

use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use walkdir::WalkDir;

use crate::models::{
    DiffLine, DiffLineKind, FilePreview, FilePreviewMode, LiveStatus, ProjectFileEntry,
};

pub struct ProjectScan {
    pub changed_file_count: usize,
    pub files: Vec<ProjectFileEntry>,
    pub untracked_file_count: usize,
}

struct WorkspaceFileDiscovery {
    actual_file_paths: HashSet<String>,
    entries: Vec<DiscoveredWorkspaceEntry>,
    git_repo_roots: BTreeSet<PathBuf>,
}

struct DiscoveredWorkspaceEntry {
    path: String,
    kind: &'static str,
}

pub fn scan_project(project_path: &Path, live_files: &HashSet<String>) -> Result<ProjectScan> {
    let discovery = discover_workspace_files(project_path)?;
    let statuses = collect_workspace_git_statuses(project_path, &discovery.git_repo_roots);
    let files = build_project_entries(
        discovery.entries,
        &discovery.actual_file_paths,
        &statuses,
        live_files,
    );
    let changed_file_count = files.iter().filter(|file| file.git_status != ' ').count();
    let untracked_file_count = files.iter().filter(|file| file.git_status == '?').count();

    Ok(ProjectScan {
        changed_file_count,
        files,
        untracked_file_count,
    })
}

pub fn build_file_preview_with_options(
    project_path: &Path,
    relative_path: &str,
    live_files: &HashSet<String>,
    start_line: Option<usize>,
    line_count: Option<usize>,
) -> Result<FilePreview> {
    let repo_root = resolve_git_repo_root(project_path, relative_path);
    let statuses = repo_root
        .as_deref()
        .map(|root| collect_git_statuses_for_repo(project_path, root).unwrap_or_default())
        .unwrap_or_default();
    let git_status = *statuses.get(relative_path).unwrap_or(&' ');
    let live_status = resolve_live_status(live_files, relative_path, git_status);
    let absolute_path = project_path.join(relative_path);
    let prefers_latest_markdown = is_markdown_path(relative_path) && git_status != 'D';

    if let Some(mime_type) = resolve_image_mime(relative_path) {
        if absolute_path.exists() {
            return build_image_preview(
                &absolute_path,
                relative_path,
                git_status,
                live_status,
                mime_type,
            );
        }
    }

    if prefers_latest_markdown {
        return build_text_preview(
            project_path,
            relative_path,
            git_status,
            live_status,
            None,
            None,
        );
    }

    match git_status {
        '?' | 'A' => build_untracked_preview(project_path, relative_path, git_status, live_status),
        'D' => build_git_preview(
            project_path,
            relative_path,
            repo_root.as_deref(),
            git_status,
            live_status,
        ),
        'M' => build_git_preview(
            project_path,
            relative_path,
            repo_root.as_deref(),
            git_status,
            live_status.clone(),
        )
        .or_else(|_| {
            build_text_preview(
                project_path,
                relative_path,
                git_status,
                live_status,
                start_line,
                line_count,
            )
        }),
        _ => build_text_preview(
            project_path,
            relative_path,
            git_status,
            live_status,
            start_line,
            line_count,
        ),
    }
}

pub fn write_text_preview(
    project_path: &Path,
    relative_path: &str,
    live_files: &HashSet<String>,
    content: &str,
) -> Result<FilePreview> {
    let absolute_path = resolve_workspace_file_path(project_path, relative_path)?;

    if let Some(parent) = absolute_path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "failed to prepare parent directory for {}",
                absolute_path.display()
            )
        })?;
    }

    fs::write(&absolute_path, content)
        .with_context(|| format!("failed to write preview file {}", absolute_path.display()))?;

    build_file_preview_with_options(project_path, relative_path, live_files, None, None)
}

#[cfg(test)]
fn collect_files(
    project_path: &Path,
    statuses: &HashMap<String, char>,
    live_files: &HashSet<String>,
) -> Result<Vec<ProjectFileEntry>> {
    let discovery = discover_workspace_files(project_path)?;
    Ok(build_project_entries(
        discovery.entries,
        &discovery.actual_file_paths,
        statuses,
        live_files,
    ))
}

pub fn create_project_entry(project_path: &Path, relative_path: &str, kind: &str) -> Result<String> {
    let absolute_path = resolve_workspace_file_path(project_path, relative_path)?;
    let normalized_path = normalize_workspace_path(relative_path)?;

    if absolute_path.exists() {
        anyhow::bail!("entry already exists: {normalized_path}");
    }

    match kind {
        "file" => {
            if let Some(parent) = absolute_path.parent() {
                fs::create_dir_all(parent).with_context(|| {
                    format!(
                        "failed to prepare parent directory for {}",
                        absolute_path.display()
                    )
                })?;
            }

            File::create(&absolute_path)
                .with_context(|| format!("failed to create file {}", absolute_path.display()))?;
        }
        "folder" => {
            fs::create_dir_all(&absolute_path).with_context(|| {
                format!("failed to create folder {}", absolute_path.display())
            })?;
        }
        _ => anyhow::bail!("invalid project entry kind: {kind}"),
    }

    Ok(normalized_path)
}

pub fn delete_project_entry(project_path: &Path, relative_path: &str) -> Result<()> {
    let absolute_path = resolve_workspace_file_path(project_path, relative_path)?;

    if !absolute_path.exists() {
        anyhow::bail!("entry does not exist: {relative_path}");
    }

    trash::delete(&absolute_path)
        .with_context(|| format!("failed to move to trash: {}", absolute_path.display()))?;

    Ok(())
}

fn build_untracked_preview(
    project_path: &Path,
    relative_path: &str,
    git_status: char,
    live_status: LiveStatus,
) -> Result<FilePreview> {
    let absolute_path = project_path.join(relative_path);

    if !absolute_path.exists() {
        return build_text_preview(
            project_path,
            relative_path,
            git_status,
            live_status,
            None,
            None,
        );
    }

    let content = fs::read_to_string(&absolute_path).unwrap_or_default();
    let mut lines = vec![DiffLine {
        content: "@@ -0,0 +1 @@".to_string(),
        kind: DiffLineKind::Hunk,
        new_line_number: None,
        old_line_number: None,
    }];

    for (index, line) in content.lines().enumerate() {
        lines.push(DiffLine {
            content: line.to_string(),
            kind: DiffLineKind::Added,
            new_line_number: Some(index + 1),
            old_line_number: None,
        });
    }

    Ok(FilePreview {
        git_status,
        image_data_url: None,
        start_line: 0,
        total_lines: lines.len(),
        lines,
        live_status,
        mode: FilePreviewMode::Diff,
        path: relative_path.to_string(),
    })
}

fn build_git_preview(
    project_path: &Path,
    workspace_path: &str,
    repo_root: Option<&Path>,
    status: char,
    live_status: LiveStatus,
) -> Result<FilePreview> {
    let Some(repo_root) = repo_root else {
        return build_text_preview(
            project_path,
            workspace_path,
            status,
            live_status,
            None,
            None,
        );
    };
    let repo_relative_path = relative_path(repo_root, &project_path.join(workspace_path))?;
    let output = Command::new("git")
        .arg("diff")
        .arg("--no-ext-diff")
        .arg("--no-color")
        .arg("--relative")
        .arg("--")
        .arg(&repo_relative_path)
        .current_dir(repo_root)
        .output()
        .with_context(|| format!("failed to run git diff for {workspace_path}"))?;

    if !output.status.success() || output.stdout.is_empty() {
        return build_text_preview(
            project_path,
            workspace_path,
            status,
            live_status,
            None,
            None,
        );
    }

    let diff_text = String::from_utf8_lossy(&output.stdout);
    let lines = parse_unified_diff(&diff_text);

    if lines.is_empty() {
        return build_text_preview(
            project_path,
            workspace_path,
            status,
            live_status,
            None,
            None,
        );
    }

    Ok(FilePreview {
        git_status: status,
        image_data_url: None,
        start_line: 0,
        total_lines: lines.len(),
        lines,
        live_status,
        mode: FilePreviewMode::Diff,
        path: workspace_path.to_string(),
    })
}

fn build_image_preview(
    absolute_path: &Path,
    relative_path: &str,
    git_status: char,
    live_status: LiveStatus,
    mime_type: &'static str,
) -> Result<FilePreview> {
    let bytes = fs::read(absolute_path)
        .with_context(|| format!("failed to read preview image {}", absolute_path.display()))?;
    let data_url = format!("data:{mime_type};base64,{}", STANDARD.encode(bytes));

    Ok(FilePreview {
        git_status,
        image_data_url: Some(data_url),
        lines: Vec::new(),
        live_status,
        mode: FilePreviewMode::Image,
        path: relative_path.to_string(),
        start_line: 0,
        total_lines: 1,
    })
}

fn build_text_preview(
    project_path: &Path,
    relative_path: &str,
    git_status: char,
    live_status: LiveStatus,
    start_line: Option<usize>,
    line_count: Option<usize>,
) -> Result<FilePreview> {
    let absolute_path = project_path.join(relative_path);
    let content = fs::read_to_string(&absolute_path)
        .with_context(|| format!("failed to read preview file {}", absolute_path.display()))?;
    let all_lines = content.lines().collect::<Vec<_>>();
    let total_lines = all_lines.len();
    let requested_start_line = start_line.unwrap_or(0).min(total_lines);
    let requested_line_count =
        line_count.unwrap_or(total_lines.saturating_sub(requested_start_line));
    let requested_end_line = requested_start_line
        .saturating_add(requested_line_count)
        .min(total_lines);
    let lines = all_lines[requested_start_line..requested_end_line]
        .iter()
        .enumerate()
        .map(|(index, line)| {
            let line_number = requested_start_line + index + 1;

            DiffLine {
                content: line.to_string(),
                kind: DiffLineKind::Context,
                old_line_number: Some(line_number),
                new_line_number: Some(line_number),
            }
        })
        .collect();

    Ok(FilePreview {
        git_status,
        image_data_url: None,
        lines,
        live_status,
        mode: FilePreviewMode::Text,
        path: relative_path.to_string(),
        start_line: requested_start_line,
        total_lines,
    })
}

fn collect_git_statuses_for_repo(
    project_path: &Path,
    repo_root: &Path,
) -> Result<HashMap<String, char>> {
    let output = Command::new("git")
        .arg("status")
        .arg("--porcelain=v1")
        .arg("--untracked-files=all")
        .current_dir(repo_root)
        .output()
        .context("failed to run git status")?;

    if !output.status.success() {
        return Ok(HashMap::new());
    }

    let status_output = String::from_utf8_lossy(&output.stdout);
    let repo_prefix = relative_path(project_path, repo_root).ok();
    let mut statuses = HashMap::new();

    for line in status_output.lines() {
        if let Some((path, status)) = parse_porcelain_line(line) {
            statuses.insert(join_workspace_path(repo_prefix.as_deref(), &path), status);
        }
    }

    Ok(statuses)
}

fn collect_workspace_git_statuses(
    project_path: &Path,
    repo_roots: &BTreeSet<PathBuf>,
) -> HashMap<String, char> {
    let mut statuses = HashMap::new();

    for repo_root in repo_roots {
        if let Ok(repo_statuses) = collect_git_statuses_for_repo(project_path, repo_root) {
            statuses.extend(repo_statuses);
        }
    }

    statuses
}

fn discover_workspace_files(project_path: &Path) -> Result<WorkspaceFileDiscovery> {
    let mut actual_file_paths = HashSet::new();
    let mut entries = Vec::new();
    let mut git_repo_roots = BTreeSet::new();
    let mut repo_root_cache = HashMap::new();

    if project_path.join(".git").exists() {
        git_repo_roots.insert(project_path.to_path_buf());
        repo_root_cache.insert(project_path.to_path_buf(), Some(project_path.to_path_buf()));
    }

    for entry in WalkDir::new(project_path)
        .into_iter()
        .filter_entry(|entry| should_visit(entry.path()))
    {
        let entry = entry?;

        if entry.file_type().is_dir() {
            if entry.path() != project_path {
                entries.push(DiscoveredWorkspaceEntry {
                    path: relative_path(project_path, entry.path())?,
                    kind: "folder",
                });
            }

            if entry.path() != project_path && entry.path().join(".git").exists() {
                let repo_root = entry.path().to_path_buf();
                repo_root_cache.insert(repo_root.clone(), Some(repo_root.clone()));
                git_repo_roots.insert(repo_root);
            }
            continue;
        }

        if !entry.file_type().is_file() {
            continue;
        }

        let relative = relative_path(project_path, entry.path())?;
        actual_file_paths.insert(relative.clone());
        entries.push(DiscoveredWorkspaceEntry {
            path: relative,
            kind: "file",
        });

        let parent = entry.path().parent().unwrap_or(project_path);
        if let Some(repo_root) =
            find_containing_git_repo_root(project_path, parent, &mut repo_root_cache)
        {
            git_repo_roots.insert(repo_root);
        }
    }

    Ok(WorkspaceFileDiscovery {
        actual_file_paths,
        entries,
        git_repo_roots,
    })
}

fn resolve_workspace_file_path(project_path: &Path, relative_path: &str) -> Result<PathBuf> {
    let relative = Path::new(relative_path);

    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::Prefix(_) | Component::RootDir
            )
        })
    {
        anyhow::bail!("invalid workspace path: {relative_path}");
    }

    Ok(project_path.join(relative))
}

fn build_project_entries(
    entries: Vec<DiscoveredWorkspaceEntry>,
    actual_file_paths: &HashSet<String>,
    statuses: &HashMap<String, char>,
    live_files: &HashSet<String>,
) -> Vec<ProjectFileEntry> {
    let mut files = Vec::new();

    for entry in entries {
        if entry.kind == "folder" {
            files.push(ProjectFileEntry {
                path: entry.path.clone(),
                kind: "folder".to_string(),
                git_status: ' ',
                live_status: resolve_live_status(live_files, &entry.path, ' '),
            });
            continue;
        }

        let git_status = *statuses.get(&entry.path).unwrap_or(&' ');
        let live_status = resolve_live_status(live_files, &entry.path, git_status);

        if !should_include_snapshot_file(&entry.path, git_status, &live_status) {
            continue;
        }

        files.push(ProjectFileEntry {
            path: entry.path,
            kind: "file".to_string(),
            git_status,
            live_status,
        });
    }

    for (path, status) in statuses {
        if *status == 'D'
            && !actual_file_paths.contains(path)
            && should_include_snapshot_file(
                path,
                *status,
                &resolve_live_status(live_files, path, 'D'),
            )
        {
            files.push(ProjectFileEntry {
                path: path.clone(),
                kind: "file".to_string(),
                git_status: 'D',
                live_status: resolve_live_status(live_files, path, 'D'),
            });
        }
    }

    files.sort_by(|left, right| left.path.cmp(&right.path));
    files
}

fn resolve_git_repo_root(project_path: &Path, relative_path: &str) -> Option<PathBuf> {
    let absolute_path = project_path.join(relative_path);
    let start_dir = absolute_path.parent().unwrap_or(project_path);
    let mut cache = HashMap::new();

    find_containing_git_repo_root(project_path, start_dir, &mut cache)
}

fn find_containing_git_repo_root(
    project_path: &Path,
    start_dir: &Path,
    cache: &mut HashMap<PathBuf, Option<PathBuf>>,
) -> Option<PathBuf> {
    let mut visited = Vec::new();
    let mut current = Some(start_dir);

    while let Some(directory) = current {
        if !directory.starts_with(project_path) {
            break;
        }

        if let Some(cached) = cache.get(directory) {
            let result = cached.clone();

            for visited_directory in visited {
                cache.insert(visited_directory, result.clone());
            }

            return result;
        }

        if directory.join(".git").exists() {
            let result = Some(directory.to_path_buf());
            cache.insert(directory.to_path_buf(), result.clone());

            for visited_directory in visited {
                cache.insert(visited_directory, result.clone());
            }

            return result;
        }

        visited.push(directory.to_path_buf());

        if directory == project_path {
            break;
        }

        current = directory.parent();
    }

    for visited_directory in visited {
        cache.insert(visited_directory, None);
    }

    None
}

fn join_workspace_path(repo_prefix: Option<&str>, repo_relative_path: &str) -> String {
    match repo_prefix {
        Some(prefix) if !prefix.is_empty() => format!("{prefix}/{repo_relative_path}"),
        _ => repo_relative_path.to_string(),
    }
}

fn parse_porcelain_line(line: &str) -> Option<(String, char)> {
    if line.len() < 4 {
        return None;
    }

    let status_section = &line[..2];
    let path_section = line[3..].trim();
    let normalized_path = path_section
        .split(" -> ")
        .last()
        .map(str::trim)
        .unwrap_or(path_section)
        .to_string();
    let first = status_section.chars().next().unwrap_or(' ');
    let second = status_section.chars().nth(1).unwrap_or(' ');
    let status = normalize_status(first, second);

    Some((normalized_path, status))
}

fn normalize_status(first: char, second: char) -> char {
    if first == '?' || second == '?' {
        return '?';
    }
    if first == 'D' || second == 'D' {
        return 'D';
    }
    if matches!(first, 'A' | 'R' | 'C') || matches!(second, 'A' | 'R' | 'C') {
        return 'A';
    }
    if first == 'M' || second == 'M' {
        return 'M';
    }
    ' '
}

fn parse_unified_diff(diff_text: &str) -> Vec<DiffLine> {
    let mut lines = Vec::new();
    let mut old_line = 0usize;
    let mut new_line = 0usize;

    for line in diff_text.lines() {
        if line.starts_with("@@") {
            let (old_start, new_start) = parse_hunk_header(line);
            old_line = old_start;
            new_line = new_start;
            lines.push(DiffLine {
                content: line.to_string(),
                kind: DiffLineKind::Hunk,
                old_line_number: None,
                new_line_number: None,
            });
            continue;
        }

        if line.starts_with("diff ")
            || line.starts_with("--- ")
            || line.starts_with("+++ ")
            || line.starts_with("index ")
        {
            continue;
        }

        if let Some(stripped) = line.strip_prefix('+') {
            lines.push(DiffLine {
                content: stripped.to_string(),
                kind: DiffLineKind::Added,
                old_line_number: None,
                new_line_number: Some(new_line),
            });
            new_line += 1;
            continue;
        }

        if let Some(stripped) = line.strip_prefix('-') {
            lines.push(DiffLine {
                content: stripped.to_string(),
                kind: DiffLineKind::Removed,
                old_line_number: Some(old_line),
                new_line_number: None,
            });
            old_line += 1;
            continue;
        }

        if let Some(stripped) = line.strip_prefix(' ') {
            lines.push(DiffLine {
                content: stripped.to_string(),
                kind: DiffLineKind::Context,
                old_line_number: Some(old_line),
                new_line_number: Some(new_line),
            });
            old_line += 1;
            new_line += 1;
        }
    }

    lines
}

fn parse_hunk_header(line: &str) -> (usize, usize) {
    let mut parts = line.split_whitespace();
    let old_part = parts.nth(1).unwrap_or("-0,0");
    let new_part = parts.next().unwrap_or("+0,0");

    (parse_hunk_number(old_part), parse_hunk_number(new_part))
}

fn parse_hunk_number(value: &str) -> usize {
    value[1..]
        .split(',')
        .next()
        .and_then(|part| part.parse::<usize>().ok())
        .unwrap_or(0)
}

fn relative_path(root: &Path, path: &Path) -> Result<String> {
    let relative = path
        .strip_prefix(root)
        .with_context(|| format!("failed to strip prefix for {}", path.display()))?;

    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn normalize_workspace_path(relative_path: &str) -> Result<String> {
    let relative = Path::new(relative_path);

    if relative.as_os_str().is_empty() {
        anyhow::bail!("invalid workspace path: {relative_path}");
    }

    Ok(relative.to_string_lossy().replace('\\', "/").trim_matches('/').to_string())
}

fn resolve_live_status(
    live_files: &HashSet<String>,
    relative_path: &str,
    git_status: char,
) -> LiveStatus {
    if !live_files.contains(relative_path) {
        return LiveStatus::Idle;
    }

    match git_status {
        'A' | '?' => LiveStatus::Added,
        'D' => LiveStatus::Deleted,
        _ => LiveStatus::Modified,
    }
}

fn resolve_image_mime(relative_path: &str) -> Option<&'static str> {
    let extension = relative_path.rsplit('.').next()?.to_ascii_lowercase();

    match extension.as_str() {
        "apng" => Some("image/apng"),
        "avif" => Some("image/avif"),
        "bmp" => Some("image/bmp"),
        "cur" => Some("image/x-icon"),
        "dds" => Some("image/vnd-ms.dds"),
        "gif" => Some("image/gif"),
        "heic" => Some("image/heic"),
        "heif" => Some("image/heif"),
        "ico" => Some("image/x-icon"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "jfif" => Some("image/jpeg"),
        "jxl" => Some("image/jxl"),
        "pbm" => Some("image/x-portable-bitmap"),
        "pgm" => Some("image/x-portable-graymap"),
        "png" => Some("image/png"),
        "pnm" => Some("image/x-portable-anymap"),
        "ppm" => Some("image/x-portable-pixmap"),
        "svg" | "svgz" => Some("image/svg+xml"),
        "tif" | "tiff" => Some("image/tiff"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

fn is_markdown_path(relative_path: &str) -> bool {
    relative_path.to_ascii_lowercase().ends_with(".md")
}

fn should_include_snapshot_file(
    relative_path: &str,
    git_status: char,
    live_status: &LiveStatus,
) -> bool {
    if resolve_image_mime(relative_path).is_none() {
        return true;
    }

    git_status != ' ' || *live_status != LiveStatus::Idle
}

fn should_visit(path: &Path) -> bool {
    let ignored = [".git", "node_modules", "dist", "target", ".next", ".turbo"];
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");

    !ignored.contains(&name)
}

// ---------------------------------------------------------------------------
// Git Operations — multi-repo scanning, pull, commit
// ---------------------------------------------------------------------------

use crate::models::{
    GitChangedFile, GitCommitResult, GitConflictFile, GitPullResult, GitRepoStatus, GitRepository,
    LlmConfig,
};

pub fn scan_git_repositories(project_path: &Path) -> Result<Vec<GitRepository>> {
    let repo_roots = discover_git_roots(project_path);
    build_git_repo_list(project_path, &repo_roots)
}

/// Lightweight repo discovery — only walks directories looking for `.git`,
/// skipping file enumeration entirely. Much faster than `discover_workspace_files`.
fn discover_git_roots(project_path: &Path) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if project_path.join(".git").exists() {
        roots.push(project_path.to_path_buf());
    }

    for entry in WalkDir::new(project_path)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| e.file_type().is_dir() && should_visit(e.path()))
    {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_dir() {
            continue;
        }
        if entry.path().join(".git").exists() {
            roots.push(entry.path().to_path_buf());
        }
    }

    roots
}

/// Build repository metadata from a set of known git roots.
/// Reused by both initial scan and incremental refresh.
fn build_git_repo_list(
    project_path: &Path,
    repo_roots: &[PathBuf],
) -> Result<Vec<GitRepository>> {
    let mut repos = Vec::new();

    for repo_root in repo_roots {
        let name = repo_root
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        let branch = read_current_branch(repo_root);
        let statuses = collect_git_statuses_for_repo(project_path, repo_root).unwrap_or_default();
        let diff_stats = collect_diff_stats(repo_root);
        let (ahead, behind) = read_ahead_behind(repo_root);

        let conflict_files = detect_conflicts(repo_root, project_path);
        let conflict_count = conflict_files.len();

        let changed_files: Vec<GitChangedFile> = statuses
            .iter()
            .filter(|(_, status)| **status != ' ')
            .map(|(path, status)| {
                let stats = diff_stats.get(path).cloned().unwrap_or((0, 0));
                GitChangedFile {
                    path: path.clone(),
                    status: *status,
                    insertions: stats.0,
                    deletions: stats.1,
                    location: path.clone(),
                }
            })
            .collect();

        let status = if conflict_count > 0 {
            GitRepoStatus::Conflict
        } else if changed_files.is_empty() {
            GitRepoStatus::Clean
        } else {
            GitRepoStatus::Changed
        };

        repos.push(GitRepository {
            name,
            path: repo_root.to_string_lossy().to_string(),
            branch,
            status,
            changed_files,
            conflict_files,
            conflict_count,
            ahead,
            behind,
        });
    }

    Ok(repos)
}

/// Incremental refresh: takes already-known repo paths and refreshes only their
/// git status. Avoids the directory walk entirely.
pub fn refresh_git_repositories(
    project_path: &Path,
    repo_paths: &[String],
) -> Result<Vec<GitRepository>> {
    let roots: Vec<PathBuf> = repo_paths.iter().map(PathBuf::from).collect();
    build_git_repo_list(project_path, &roots)
}

/// Fetch all known repos from their remotes (safe, read-only operation).
/// This updates the local remote-tracking refs so that ahead/behind counts
/// reflect the true state of the remote.
pub fn git_fetch_repos(repo_paths: &[String]) {
    for path in repo_paths {
        let repo_root = PathBuf::from(path);
        if !repo_root.join(".git").exists() && !repo_root.is_dir() {
            continue;
        }
        // --quiet to suppress output, --all to fetch all remotes
        let _ = Command::new("git")
            .args(["fetch", "--quiet", "--all"])
            .current_dir(&repo_root)
            .output();
    }
}

pub fn git_pull_all(project_path: &Path) -> Result<Vec<GitPullResult>> {
    let discovery = discover_workspace_files(project_path)?;
    let mut results = Vec::new();

    for repo_root in &discovery.git_repo_roots {
        let name = repo_root
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let output = Command::new("git")
            .args(["pull", "--no-rebase"])
            .current_dir(repo_root)
            .output();

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                let conflict_count = detect_conflicts(repo_root, project_path).len();

                results.push(GitPullResult {
                    repo_name: name,
                    success: out.status.success() && conflict_count == 0,
                    conflict_count,
                    message: if out.status.success() {
                        stdout
                    } else {
                        stderr
                    },
                });
            }
            Err(err) => {
                results.push(GitPullResult {
                    repo_name: name,
                    success: false,
                    conflict_count: 0,
                    message: err.to_string(),
                });
            }
        }
    }

    Ok(results)
}

pub fn git_auto_commit(
    _project_path: &Path,
    repo_path: &str,
    message: &str,
) -> Result<GitCommitResult> {
    let repo_root = PathBuf::from(repo_path);
    let name = repo_root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Stage all changes
    let add_output = Command::new("git")
        .args(["add", "-A"])
        .current_dir(&repo_root)
        .output()
        .context("failed to run git add")?;

    if !add_output.status.success() {
        return Ok(GitCommitResult {
            repo_name: name,
            success: false,
            commit_hash: String::new(),
            message: String::from_utf8_lossy(&add_output.stderr).to_string(),
        });
    }

    // Commit
    let commit_output = Command::new("git")
        .args(["commit", "-m", message])
        .current_dir(&repo_root)
        .output()
        .context("failed to run git commit")?;

    let stdout = String::from_utf8_lossy(&commit_output.stdout).to_string();
    let commit_hash = if commit_output.status.success() {
        read_head_hash(&repo_root)
    } else {
        String::new()
    };

    Ok(GitCommitResult {
        repo_name: name,
        success: commit_output.status.success(),
        commit_hash,
        message: if commit_output.status.success() {
            stdout
        } else {
            String::from_utf8_lossy(&commit_output.stderr).to_string()
        },
    })
}

pub fn git_resolve_conflicts(project_path: &Path, repo_path: &str) -> Result<Vec<String>> {
    let repo_root = PathBuf::from(repo_path);
    let conflicts = detect_conflicts(&repo_root, project_path);
    let mut resolved = Vec::new();

    for conflict in &conflicts {
        // Accept theirs by default for auto-resolve
        let _file_path = repo_root.join(&conflict.path);
        let output = Command::new("git")
            .args(["checkout", "--theirs", "--", &conflict.path])
            .current_dir(&repo_root)
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                // Stage the resolved file
                let _ = Command::new("git")
                    .args(["add", &conflict.path])
                    .current_dir(&repo_root)
                    .output();
                resolved.push(conflict.path.clone());
            }
        }
    }

    Ok(resolved)
}

pub fn git_ai_commit(repo_root: &Path, llm_config: &LlmConfig) -> Result<GitCommitResult> {
    let name = repo_root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Collect diff and name-status
    let diff = Command::new("git")
        .args(["diff", "--no-ext-diff", "--no-color"])
        .current_dir(repo_root)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();

    let staged_diff = Command::new("git")
        .args(["diff", "--cached", "--no-ext-diff", "--no-color"])
        .current_dir(repo_root)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();

    let combined_diff = if staged_diff.is_empty() {
        diff.clone()
    } else if diff.is_empty() {
        staged_diff.clone()
    } else {
        format!("{staged_diff}\n{diff}")
    };

    if combined_diff.trim().is_empty() {
        // Check for untracked files
        let status = Command::new("git")
            .args(["status", "--porcelain=v1"])
            .current_dir(repo_root)
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default();

        if status.trim().is_empty() {
            return Ok(GitCommitResult {
                repo_name: name,
                success: false,
                commit_hash: String::new(),
                message: "没有需要提交的改动".to_string(),
            });
        }
    }

    let name_status = Command::new("git")
        .args(["diff", "--name-status"])
        .current_dir(repo_root)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();

    // Shrink diff if too large (200KB limit)
    let max_diff_bytes = 200_000;
    let shrunk_diff = if combined_diff.len() > max_diff_bytes {
        combined_diff[..max_diff_bytes].to_string()
    } else {
        combined_diff
    };

    // Build prompt
    let user_prompt = format!(
        "Generate a commit message based on the following git diff:\n\n\
         === git diff (staged) begin ===\n\
         File summary:\n{name_status}\n\
         Patch details:\n{shrunk_diff}\n\
         === git diff end ===\n"
    );

    // Call LLM API
    let commit_message = call_llm_api(llm_config, &user_prompt)?;
    let sanitized = sanitize_commit_message(&commit_message);

    if sanitized.is_empty() {
        return Ok(GitCommitResult {
            repo_name: name,
            success: false,
            commit_hash: String::new(),
            message: "AI 返回了空的提交信息".to_string(),
        });
    }

    // Stage all changes
    let _ = Command::new("git")
        .args(["add", "-A"])
        .current_dir(repo_root)
        .output();

    // Commit
    let commit_output = Command::new("git")
        .args(["commit", "-m", &sanitized, "--no-verify"])
        .current_dir(repo_root)
        .output()
        .context("failed to run git commit")?;

    let commit_hash = if commit_output.status.success() {
        read_head_hash(repo_root)
    } else {
        String::new()
    };

    Ok(GitCommitResult {
        repo_name: name,
        success: commit_output.status.success(),
        commit_hash,
        message: if commit_output.status.success() {
            sanitized
        } else {
            String::from_utf8_lossy(&commit_output.stderr).to_string()
        },
    })
}

pub fn git_push(repo_root: &Path) -> Result<String> {
    let has_upstream = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
        .current_dir(repo_root)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let output = if has_upstream {
        Command::new("git")
            .args(["push"])
            .current_dir(repo_root)
            .output()
            .context("failed to run git push")?
    } else {
        let branch = read_current_branch(repo_root);
        Command::new("git")
            .args(["push", "-u", "origin", &branch])
            .current_dir(repo_root)
            .output()
            .context("failed to run git push")?
    };

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        anyhow::bail!("git push failed: {stderr}");
    }
}

pub fn git_stash_save(repo_root: &Path) -> Result<String> {
    let output = Command::new("git")
        .args(["stash", "push", "-m", "flowterm auto-stash"])
        .current_dir(repo_root)
        .output()
        .context("failed to run git stash")?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn git_stash_pop(repo_root: &Path) -> Result<String> {
    let output = Command::new("git")
        .args(["stash", "pop"])
        .current_dir(repo_root)
        .output()
        .context("failed to run git stash pop")?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        anyhow::bail!("git stash pop failed: {stderr}");
    }
}

fn call_llm_api(config: &LlmConfig, user_prompt: &str) -> Result<String> {
    let body = serde_json::json!({
        "model": config.model,
        "messages": [
            {"role": "system", "content": config.commit_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 400
    });

    let paths = ["/chat/completions", "/v1/chat/completions"];
    let mut last_error: Option<String> = None;

    for path in &paths {
        let url = format!("{}{}", config.base_url.trim_end_matches('/'), path);
        let response = ureq::post(&url)
            .set("Authorization", &format!("Bearer {}", config.api_key))
            .set("Content-Type", "application/json")
            .timeout(std::time::Duration::from_secs(60))
            .send_json(&body);

        match response {
            Ok(resp) => {
                let json: serde_json::Value = resp.into_json()?;
                let content = json["choices"][0]["message"]["content"]
                    .as_str()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if content.is_empty() {
                    last_error = Some("API returned empty content".to_string());
                    continue;
                }
                return Ok(content);
            }
            Err(e) => {
                last_error = Some(e.to_string());
                continue;
            }
        }
    }

    anyhow::bail!(
        "LLM API 调用失败: {}",
        last_error.unwrap_or_else(|| "unknown error".to_string())
    )
}

fn sanitize_commit_message(msg: &str) -> String {
    let mut s = msg.trim().to_string();

    // Strip code fences
    if s.starts_with("```") {
        let lines: Vec<&str> = s.lines().collect();
        let start = if lines.first().map_or(false, |l| l.starts_with("```")) { 1 } else { 0 };
        let end = if lines.last().map_or(false, |l| l.trim() == "```") {
            lines.len() - 1
        } else {
            lines.len()
        };
        s = lines[start..end].join("\n").trim().to_string();
    }

    // Strip emojis (common ranges)
    s = s
        .chars()
        .filter(|ch| {
            let cp = *ch as u32;
            !((0x1F300..=0x1FAFF).contains(&cp)
                || (0x2600..=0x27BF).contains(&cp)
                || (0xFE00..=0xFE0F).contains(&cp))
        })
        .collect();

    // Ensure proper formatting: first line + blank line + body
    if let Some((first, rest)) = s.split_once('\n') {
        let first = first.trim();
        let rest = rest.trim();
        if rest.is_empty() {
            s = first.to_string();
        } else {
            s = format!("{first}\n\n{rest}");
        }
    }

    s
}

fn read_current_branch(repo_root: &Path) -> String {
    Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(repo_root)
        .output()
        .ok()
        .and_then(|out| {
            if out.status.success() {
                Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "HEAD".to_string())
}

fn read_head_hash(repo_root: &Path) -> String {
    Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .current_dir(repo_root)
        .output()
        .ok()
        .and_then(|out| {
            if out.status.success() {
                Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_default()
}

fn read_ahead_behind(repo_root: &Path) -> (usize, usize) {
    let output = Command::new("git")
        .args(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])
        .current_dir(repo_root)
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            let parts: Vec<&str> = text.trim().split('\t').collect();
            if parts.len() == 2 {
                let ahead = parts[0].parse().unwrap_or(0);
                let behind = parts[1].parse().unwrap_or(0);
                (ahead, behind)
            } else {
                (0, 0)
            }
        }
        _ => (0, 0),
    }
}

fn collect_diff_stats(repo_root: &Path) -> HashMap<String, (usize, usize)> {
    let output = Command::new("git")
        .args(["diff", "--numstat"])
        .current_dir(repo_root)
        .output();

    let mut stats = HashMap::new();
    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 3 {
                    let insertions = parts[0].parse().unwrap_or(0);
                    let deletions = parts[1].parse().unwrap_or(0);
                    stats.insert(parts[2].to_string(), (insertions, deletions));
                }
            }
        }
    }
    stats
}

fn detect_conflicts(repo_root: &Path, _project_path: &Path) -> Vec<GitConflictFile> {
    let output = Command::new("git")
        .args(["diff", "--name-only", "--diff-filter=U"])
        .current_dir(repo_root)
        .output();

    let mut conflicts = Vec::new();
    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                let path = line.trim().to_string();
                if path.is_empty() {
                    continue;
                }
                let abs_path = repo_root.join(&path);
                let content = fs::read_to_string(&abs_path).unwrap_or_default();

                let (ours, theirs, base) = parse_conflict_markers(&content);
                conflicts.push(GitConflictFile {
                    path,
                    ours_content: ours,
                    theirs_content: theirs,
                    base_content: base,
                });
            }
        }
    }
    conflicts
}

fn parse_conflict_markers(content: &str) -> (String, String, String) {
    let mut ours = String::new();
    let mut theirs = String::new();
    let mut base = String::new();
    let mut section = "none";

    for line in content.lines() {
        if line.starts_with("<<<<<<<") {
            section = "ours";
            continue;
        }
        if line.starts_with("|||||||") {
            section = "base";
            continue;
        }
        if line.starts_with("=======") {
            section = "theirs";
            continue;
        }
        if line.starts_with(">>>>>>>") {
            section = "none";
            continue;
        }
        match section {
            "ours" => {
                ours.push_str(line);
                ours.push('\n');
            }
            "theirs" => {
                theirs.push_str(line);
                theirs.push('\n');
            }
            "base" => {
                base.push_str(line);
                base.push('\n');
            }
            _ => {}
        }
    }

    (ours, theirs, base)
}

#[cfg(test)]
mod tests {
    use std::{
        collections::{HashMap, HashSet},
        fs,
        process::Command,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{
        build_file_preview_with_options, collect_files, create_project_entry,
        parse_porcelain_line, parse_unified_diff, scan_project, write_text_preview,
    };
    use crate::models::DiffLineKind;

    fn create_temp_project_root() -> std::path::PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("flowterm-preview-{unique}"));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn init_git_repo(root: &std::path::Path) {
        let run = |args: &[&str]| {
            let status = Command::new("git")
                .args(args)
                .current_dir(root)
                .status()
                .unwrap();

            assert!(status.success(), "git {:?} failed", args);
        };

        run(&["init", "-q"]);
        run(&["config", "user.name", "Flowterm Test"]);
        run(&["config", "user.email", "flowterm@example.com"]);
    }

    #[test]
    fn parses_porcelain_status_lines() {
        assert_eq!(
            parse_porcelain_line(" M src/lib.rs"),
            Some(("src/lib.rs".to_string(), 'M'))
        );
        assert_eq!(
            parse_porcelain_line("?? README.md"),
            Some(("README.md".to_string(), '?'))
        );
        assert_eq!(
            parse_porcelain_line("R  old.rs -> new.rs"),
            Some(("new.rs".to_string(), 'A'))
        );
    }

    #[test]
    fn parses_unified_diff_with_line_numbers() {
        let diff = "\
diff --git a/src/lib.rs b/src/lib.rs
@@ -1,2 +1,3 @@
 line one
-line two
+line two changed
+line three";

        let lines = parse_unified_diff(diff);

        assert_eq!(lines[0].kind, DiffLineKind::Hunk);
        assert_eq!(lines[1].old_line_number, Some(1));
        assert_eq!(lines[1].new_line_number, Some(1));
        assert_eq!(lines[2].kind, DiffLineKind::Removed);
        assert_eq!(lines[2].old_line_number, Some(2));
        assert_eq!(lines[3].kind, DiffLineKind::Added);
        assert_eq!(lines[3].new_line_number, Some(2));
    }

    #[test]
    fn omits_clean_image_files_from_project_snapshot() {
        let root = create_temp_project_root();
        fs::create_dir_all(root.join("assets")).unwrap();
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("assets/hero.png"), [137, 80, 78, 71]).unwrap();
        fs::write(root.join("assets/changed.png"), [137, 80, 78, 71]).unwrap();
        fs::write(root.join("src/App.tsx"), "export default function App() {}").unwrap();

        let statuses = HashMap::from([("assets/changed.png".to_string(), 'M')]);
        let files = collect_files(&root, &statuses, &HashSet::new()).unwrap();
        let paths = files
            .iter()
            .map(|file| file.path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(paths, vec!["assets", "assets/changed.png", "src", "src/App.tsx"]);
    }

    #[test]
    fn builds_clean_text_preview_with_full_file_content() {
        let root = create_temp_project_root();
        let file_path = root.join("README.md");
        fs::write(&file_path, "line one\nline two\n").unwrap();

        let preview =
            build_file_preview_with_options(&root, "README.md", &HashSet::new(), None, None)
                .unwrap();

        assert_eq!(preview.path, "README.md");
        assert_eq!(preview.lines.len(), 2);
        assert_eq!(preview.lines[0].kind, DiffLineKind::Context);
        assert_eq!(preview.lines[0].old_line_number, Some(1));
        assert_eq!(preview.lines[0].new_line_number, Some(1));
        assert_eq!(preview.lines[0].content, "line one");
        assert_eq!(preview.lines[1].content, "line two");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn builds_image_preview_with_data_url() {
        let root = create_temp_project_root();
        let file_path = root.join("pixel.png");
        fs::write(
            &file_path,
            [
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
                0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
                0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78,
                0x9C, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
                0xB1, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
            ],
        )
        .unwrap();

        let preview =
            build_file_preview_with_options(&root, "pixel.png", &HashSet::new(), None, None)
                .unwrap();

        assert!(matches!(
            preview.mode,
            crate::models::FilePreviewMode::Image
        ));
        assert!(preview
            .image_data_url
            .as_deref()
            .unwrap_or_default()
            .starts_with("data:image/png;base64,"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn builds_text_preview_chunk_with_total_lines() {
        let root = create_temp_project_root();
        let file_path = root.join("story.txt");
        let content = (1..=40)
            .map(|index| format!("line {index}"))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(&file_path, content).unwrap();

        let preview =
            build_file_preview_with_options(&root, "story.txt", &HashSet::new(), Some(10), Some(5))
                .unwrap();

        assert_eq!(preview.start_line, 10);
        assert_eq!(preview.total_lines, 40);
        assert_eq!(preview.lines.len(), 5);
        assert_eq!(preview.lines[0].content, "line 11");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn renders_modified_markdown_as_latest_text_content() {
        let root = create_temp_project_root();
        init_git_repo(&root);

        let file_path = root.join("README.md");
        fs::write(&file_path, "# Before\n\nOld note\n").unwrap();
        Command::new("git")
            .args(["add", "README.md"])
            .current_dir(&root)
            .status()
            .unwrap();
        Command::new("git")
            .args(["commit", "-qm", "init"])
            .current_dir(&root)
            .status()
            .unwrap();

        fs::write(&file_path, "# After\n\nLatest note\n").unwrap();

        let preview =
            build_file_preview_with_options(&root, "README.md", &HashSet::new(), None, None)
                .unwrap();

        assert!(matches!(preview.mode, crate::models::FilePreviewMode::Text));
        assert_eq!(preview.lines.len(), 3);
        assert_eq!(preview.lines[0].content, "# After");
        assert_eq!(preview.lines[2].content, "Latest note");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn writes_text_preview_back_to_disk() {
        let root = create_temp_project_root();
        let file_path = root.join("README.md");
        fs::write(&file_path, "# Before\n").unwrap();

        let preview =
            write_text_preview(&root, "README.md", &HashSet::new(), "# After\n\n- saved\n")
                .unwrap();
        let saved = fs::read_to_string(&file_path).unwrap();

        assert_eq!(saved, "# After\n\n- saved\n");
        assert!(matches!(preview.mode, crate::models::FilePreviewMode::Text));
        assert_eq!(preview.lines[0].content, "# After");
        assert_eq!(preview.lines[2].content, "- saved");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn creates_nested_file_entries_inside_the_workspace() {
        let root = create_temp_project_root();

        let created =
            create_project_entry(&root, "src/generated/use-flowterm.ts", "file").unwrap();

        assert_eq!(created, "src/generated/use-flowterm.ts");
        assert!(root.join("src/generated/use-flowterm.ts").is_file());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_paths_that_escape_the_workspace_root() {
        let root = create_temp_project_root();

        let error = create_project_entry(&root, "../escape.txt", "file").unwrap_err();

        assert!(error.to_string().contains("invalid workspace path"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn scan_project_keeps_empty_folders_in_the_snapshot() {
        let root = create_temp_project_root();
        fs::create_dir_all(root.join("src/snippets")).unwrap();
        fs::write(root.join("src/App.tsx"), "export {};\n").unwrap();

        let scan = scan_project(&root, &HashSet::new()).unwrap();

        assert!(scan.files.iter().any(|entry| {
            entry.path == "src/snippets" && entry.kind == "folder"
        }));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn scans_git_statuses_from_nested_repositories() {
        let root = create_temp_project_root();
        let nested_repo = root.join("packages/widget");
        fs::create_dir_all(&nested_repo).unwrap();
        init_git_repo(&nested_repo);
        fs::create_dir_all(nested_repo.join("src")).unwrap();

        let file_path = nested_repo.join("src/lib.rs");
        fs::write(
            &file_path,
            "pub fn widget() -> &'static str {\n    \"before\"\n}\n",
        )
        .unwrap();
        Command::new("git")
            .args(["add", "."])
            .current_dir(&nested_repo)
            .status()
            .unwrap();
        Command::new("git")
            .args(["commit", "-qm", "init"])
            .current_dir(&nested_repo)
            .status()
            .unwrap();

        fs::write(
            &file_path,
            "pub fn widget() -> &'static str {\n    \"after\"\n}\n",
        )
        .unwrap();

        let scan = scan_project(&root, &HashSet::new()).unwrap();
        let changed = scan
            .files
            .iter()
            .find(|file| file.path == "packages/widget/src/lib.rs")
            .unwrap();

        assert_eq!(changed.git_status, 'M');
        assert_eq!(scan.changed_file_count, 1);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn builds_diff_preview_for_files_inside_nested_repositories() {
        let root = create_temp_project_root();
        let nested_repo = root.join("packages/widget");
        fs::create_dir_all(&nested_repo).unwrap();
        init_git_repo(&nested_repo);
        fs::create_dir_all(nested_repo.join("src")).unwrap();

        let file_path = nested_repo.join("src/lib.rs");
        fs::write(
            &file_path,
            "pub fn widget() -> &'static str {\n    \"before\"\n}\n",
        )
        .unwrap();
        Command::new("git")
            .args(["add", "."])
            .current_dir(&nested_repo)
            .status()
            .unwrap();
        Command::new("git")
            .args(["commit", "-qm", "init"])
            .current_dir(&nested_repo)
            .status()
            .unwrap();

        fs::write(
            &file_path,
            "pub fn widget() -> &'static str {\n    \"after\"\n}\n",
        )
        .unwrap();

        let preview = build_file_preview_with_options(
            &root,
            "packages/widget/src/lib.rs",
            &HashSet::new(),
            None,
            None,
        )
        .unwrap();

        assert!(matches!(preview.mode, crate::models::FilePreviewMode::Diff));
        assert!(preview.lines.iter().any(|line| {
            line.kind == DiffLineKind::Removed && line.content.contains("\"before\"")
        }));
        assert!(preview.lines.iter().any(|line| {
            line.kind == DiffLineKind::Added && line.content.contains("\"after\"")
        }));

        let _ = fs::remove_dir_all(root);
    }
}
