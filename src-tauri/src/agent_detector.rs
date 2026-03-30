use regex::Regex;
use std::sync::OnceLock;

#[derive(Clone, Debug, Default, Eq, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentKind {
    Aider,
    ClaudeCode,
    #[default]
    Unknown,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentPhase {
    Attention,
    Completed,
    #[default]
    Idle,
    Running,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusSnapshot {
    pub agent: AgentKind,
    pub phase: AgentPhase,
}

#[derive(Default)]
pub struct AgentDetector {
    current: AgentStatusSnapshot,
    has_seen_agent_activity: bool,
}

impl AgentDetector {
    pub fn ingest(&mut self, chunk: &str) -> AgentStatusSnapshot {
        let lowered = chunk.to_lowercase();

        if attention_pattern().is_match(&lowered) {
            self.has_seen_agent_activity = true;
            self.current.agent = resolve_agent_kind(&self.current.agent, &lowered);
            self.current.phase = AgentPhase::Attention;
            return self.current.clone();
        }

        if running_pattern().is_match(chunk)
            || aider_pattern().is_match(&lowered)
            || (!matches!(self.current.agent, AgentKind::Unknown) && ansi_pattern().is_match(chunk))
        {
            self.has_seen_agent_activity = true;
            self.current.agent = resolve_agent_kind(&self.current.agent, &lowered);
            self.current.phase = AgentPhase::Running;
        }

        self.current.clone()
    }

    pub fn observe_prompt(&mut self) -> AgentStatusSnapshot {
        if self.has_seen_agent_activity {
            self.current.phase = AgentPhase::Completed;
        }

        self.current.clone()
    }

    pub fn current(&self) -> AgentStatusSnapshot {
        self.current.clone()
    }
}

fn resolve_agent_kind(current: &AgentKind, lowered_chunk: &str) -> AgentKind {
    if aider_pattern().is_match(lowered_chunk) {
        return AgentKind::Aider;
    }

    if claude_pattern().is_match(lowered_chunk)
        || lowered_chunk.contains('✻')
        || attention_pattern().is_match(lowered_chunk)
    {
        return AgentKind::ClaudeCode;
    }

    current.clone()
}

fn aider_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"(?i)\baider\b").expect("valid aider regex"))
}

fn attention_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(
            r"(?i)(waiting for your input|press enter to continue|apply this change\?|allow once|proceed\?)",
        )
        .expect("valid attention regex")
    })
}

fn claude_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"(?i)\bclaude(?:\s+code)?\b").expect("valid claude regex"))
}

fn running_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(
            r"(?is)(\bclaude(?:\s+code)?\b|✻\s*(thinking|working|analyzing|updating|reading)|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏])",
        )
        .expect("valid running regex")
    })
}

fn ansi_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"\x1b\[[0-9;?]*[A-Za-z]").expect("valid ansi regex"))
}
