use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    fs,
    path::Path,
    process::Command,
};

use anyhow::{Context, Result};
use walkdir::WalkDir;

use crate::models::{
    DiffChangeType, DiffLine, DiffLineKind, FileDiff, LiveStatus, ProjectFileEntry,
};

pub struct ProjectScan {
    pub changed_file_count: usize,
    pub diffs: Vec<FileDiff>,
    pub files: Vec<ProjectFileEntry>,
    pub untracked_file_count: usize,
}

pub fn scan_project(project_path: &Path, live_files: &HashSet<String>) -> Result<ProjectScan> {
    let statuses = collect_git_statuses(project_path).unwrap_or_default();
    let files = collect_files(project_path, &statuses, live_files)?;
    let diffs = build_diffs(project_path, &statuses)?;
    let changed_file_count = files.iter().filter(|file| file.git_status != ' ').count();
    let untracked_file_count = files.iter().filter(|file| file.git_status == '?').count();

    Ok(ProjectScan {
        changed_file_count,
        diffs,
        files,
        untracked_file_count,
    })
}

fn collect_files(
    project_path: &Path,
    statuses: &HashMap<String, char>,
    live_files: &HashSet<String>,
) -> Result<Vec<ProjectFileEntry>> {
    let mut actual_paths = BTreeSet::new();
    let mut files = Vec::new();

    for entry in WalkDir::new(project_path)
        .into_iter()
        .filter_entry(|entry| should_visit(entry.path()))
    {
        let entry = entry?;

        if !entry.file_type().is_file() {
            continue;
        }

        let relative = relative_path(project_path, entry.path())?;
        actual_paths.insert(relative.clone());
        let git_status = *statuses.get(&relative).unwrap_or(&' ');
        let live_status = resolve_live_status(live_files, &relative, git_status);

        files.push(ProjectFileEntry {
            path: relative,
            kind: "file".to_string(),
            git_status,
            live_status,
        });
    }

    for (path, status) in statuses {
        if *status == 'D' && !actual_paths.contains(path) {
            files.push(ProjectFileEntry {
                path: path.clone(),
                kind: "file".to_string(),
                git_status: 'D',
                live_status: resolve_live_status(live_files, path, 'D'),
            });
        }
    }

    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

fn build_diffs(project_path: &Path, statuses: &HashMap<String, char>) -> Result<Vec<FileDiff>> {
    let mut ordered_statuses = BTreeMap::new();

    for (path, status) in statuses {
        if *status != ' ' {
            ordered_statuses.insert(path.clone(), *status);
        }
    }

    let mut diffs = Vec::new();

    for (path, status) in ordered_statuses {
        let diff = match status {
            '?' => build_untracked_diff(project_path, &path)?,
            'A' => build_untracked_diff(project_path, &path)?,
            _ => build_git_diff(project_path, &path, status)?,
        };

        if let Some(file_diff) = diff {
            diffs.push(file_diff);
        }
    }

    Ok(diffs)
}

fn build_untracked_diff(project_path: &Path, relative_path: &str) -> Result<Option<FileDiff>> {
    let absolute_path = project_path.join(relative_path);

    if !absolute_path.exists() {
        return Ok(None);
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

    Ok(Some(FileDiff {
        change_type: DiffChangeType::Untracked,
        lines,
        path: relative_path.to_string(),
    }))
}

fn build_git_diff(
    project_path: &Path,
    relative_path: &str,
    status: char,
) -> Result<Option<FileDiff>> {
    let output = Command::new("git")
        .arg("diff")
        .arg("--no-ext-diff")
        .arg("--no-color")
        .arg("--relative")
        .arg("--")
        .arg(relative_path)
        .current_dir(project_path)
        .output()
        .with_context(|| format!("failed to run git diff for {relative_path}"))?;

    if !output.status.success() || output.stdout.is_empty() {
        return Ok(None);
    }

    let diff_text = String::from_utf8_lossy(&output.stdout);
    let lines = parse_unified_diff(&diff_text);

    if lines.is_empty() {
        return Ok(None);
    }

    Ok(Some(FileDiff {
        change_type: match status {
            'D' => DiffChangeType::Deleted,
            _ => DiffChangeType::Modified,
        },
        lines,
        path: relative_path.to_string(),
    }))
}

fn collect_git_statuses(project_path: &Path) -> Result<HashMap<String, char>> {
    let output = Command::new("git")
        .arg("status")
        .arg("--porcelain=v1")
        .arg("--untracked-files=all")
        .current_dir(project_path)
        .output()
        .context("failed to run git status")?;

    if !output.status.success() {
        return Ok(HashMap::new());
    }

    let status_output = String::from_utf8_lossy(&output.stdout);
    let mut statuses = HashMap::new();

    for line in status_output.lines() {
        if let Some((path, status)) = parse_porcelain_line(line) {
            statuses.insert(path, status);
        }
    }

    Ok(statuses)
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

fn resolve_live_status(live_files: &HashSet<String>, relative_path: &str, git_status: char) -> LiveStatus {
    if !live_files.contains(relative_path) {
        return LiveStatus::Idle;
    }

    match git_status {
        'A' | '?' => LiveStatus::Added,
        'D' => LiveStatus::Deleted,
        _ => LiveStatus::Modified,
    }
}

fn should_visit(path: &Path) -> bool {
    let ignored = [
        ".git",
        "node_modules",
        "dist",
        "target",
        ".next",
        ".turbo",
    ];
    let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");

    !ignored.contains(&name)
}

#[cfg(test)]
mod tests {
    use super::{parse_porcelain_line, parse_unified_diff};
    use crate::models::DiffLineKind;

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
}
