use flowterm_lib::agent_detector::{AgentDetector, AgentKind, AgentPhase};

#[test]
fn detects_claude_running_attention_and_completion() {
    let mut detector = AgentDetector::default();

    let running = detector.ingest("✻ Thinking…\r\x1b[2K");
    assert_eq!(running.agent, AgentKind::ClaudeCode);
    assert_eq!(running.phase, AgentPhase::Running);

    let attention = detector.ingest("Waiting for your input");
    assert_eq!(attention.agent, AgentKind::ClaudeCode);
    assert_eq!(attention.phase, AgentPhase::Attention);

    let completed = detector.observe_prompt();
    assert_eq!(completed.agent, AgentKind::ClaudeCode);
    assert_eq!(completed.phase, AgentPhase::Completed);
}

#[test]
fn ignores_prompt_until_agent_activity_happens() {
    let mut detector = AgentDetector::default();

    let status = detector.observe_prompt();
    assert_eq!(status.agent, AgentKind::Unknown);
    assert_eq!(status.phase, AgentPhase::Idle);
}

#[test]
fn detects_aider_from_plain_output() {
    let mut detector = AgentDetector::default();

    let status = detector.ingest("Aider v0.82.1\nModel: sonnet");
    assert_eq!(status.agent, AgentKind::Aider);
    assert_eq!(status.phase, AgentPhase::Running);
}
