use std::{
    collections::{BTreeSet, HashMap, HashSet},
    fs,
    path::Path,
    process::Command,
};

use anyhow::{Context, Result};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use walkdir::WalkDir;

use crate::models::{
    DiffLine, DiffLineKind, FilePreview, FilePreviewMode, LiveStatus, ProjectFileEntry,
};

pub struct ProjectScan {
    pub changed_file_count: usize,
    pub files: Vec<ProjectFileEntry>,
    pub untracked_file_count: usize,
}

pub fn scan_project(project_path: &Path, live_files: &HashSet<String>) -> Result<ProjectScan> {
    let statuses = collect_git_statuses(project_path).unwrap_or_default();
    let files = collect_files(project_path, &statuses, live_files)?;
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
    let statuses = collect_git_statuses(project_path).unwrap_or_default();
    let git_status = *statuses.get(relative_path).unwrap_or(&' ');
    let live_status = resolve_live_status(live_files, relative_path, git_status);
    let absolute_path = project_path.join(relative_path);

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

    match git_status {
        '?' | 'A' => build_untracked_preview(project_path, relative_path, git_status, live_status),
        'D' => build_git_preview(project_path, relative_path, git_status, live_status),
        'M' => build_git_preview(project_path, relative_path, git_status, live_status.clone())
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
    relative_path: &str,
    status: char,
    live_status: LiveStatus,
) -> Result<FilePreview> {
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
        return build_text_preview(
            project_path,
            relative_path,
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
            relative_path,
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
        path: relative_path.to_string(),
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
    let requested_line_count = line_count.unwrap_or(total_lines.saturating_sub(requested_start_line));
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
    use std::{collections::HashSet, fs, time::{SystemTime, UNIX_EPOCH}};

    use super::{
        build_file_preview_with_options,
        parse_porcelain_line,
        parse_unified_diff,
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
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
                0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
                0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
                0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB1, 0x00, 0x00, 0x00,
                0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
            ],
        )
        .unwrap();

        let preview =
            build_file_preview_with_options(&root, "pixel.png", &HashSet::new(), None, None)
                .unwrap();

        assert!(matches!(preview.mode, crate::models::FilePreviewMode::Image));
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

        let preview = build_file_preview_with_options(
            &root,
            "story.txt",
            &HashSet::new(),
            Some(10),
            Some(5),
        )
        .unwrap();

        assert_eq!(preview.start_line, 10);
        assert_eq!(preview.total_lines, 40);
        assert_eq!(preview.lines.len(), 5);
        assert_eq!(preview.lines[0].content, "line 11");

        let _ = fs::remove_dir_all(root);
    }
}
