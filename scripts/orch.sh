#!/usr/bin/env bash
#
# Orchestrator Hybrid - Phase 1 Prototype
# A minimal implementation combining Ralph's loop with GitHub Issue integration
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="${PROJECT_ROOT}/orch.yml"
SCRATCHPAD=".agent/scratchpad.md"
PROMPT_FILE=".agent/PROMPT.md"
MAX_ITERATIONS=100
COMPLETION_PROMISE="LOOP_COMPLETE"
BACKEND="claude"
AUTO_MODE=false
VERBOSE=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================================
# Logging
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_debug() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${CYAN}[DEBUG]${NC} $*"
    fi
}

# ============================================================================
# Utility Functions
# ============================================================================

check_dependencies() {
    local missing=()
    
    if ! command -v gh &> /dev/null; then
        missing+=("gh (GitHub CLI)")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing+=("jq")
    fi
    
    case "$BACKEND" in
        claude)
            if ! command -v claude &> /dev/null; then
                missing+=("claude (Claude Code CLI)")
            fi
            ;;
        opencode)
            if ! command -v opencode &> /dev/null; then
                missing+=("opencode")
            fi
            ;;
    esac
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing dependencies: ${missing[*]}"
        exit 1
    fi
    
    log_success "All dependencies found"
}

ensure_directories() {
    mkdir -p "$(dirname "$SCRATCHPAD")"
    mkdir -p "$(dirname "$PROMPT_FILE")"
}

# ============================================================================
# GitHub Issue Functions
# ============================================================================

fetch_issue() {
    local issue_number="$1"
    
    log_info "Fetching issue #${issue_number}..." >&2
    
    local issue_data
    issue_data=$(gh issue view "$issue_number" --json title,body,labels,assignees,state 2>/dev/null) || {
        log_error "Failed to fetch issue #${issue_number}"
        exit 1
    }
    
    echo "$issue_data"
}

generate_prompt_from_issue() {
    local issue_data="$1"
    local output_file="$2"
    
    local title body labels
    title=$(echo "$issue_data" | jq -r '.title')
    body=$(echo "$issue_data" | jq -r '.body // "No description provided"')
    labels=$(echo "$issue_data" | jq -r '.labels[].name' 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
    
    cat > "$output_file" << EOF
# Task: ${title}

## Labels
${labels:-"(none)"}

## Description

${body}

## Instructions

1. Analyze the task requirements
2. Plan the implementation approach
3. Implement the solution step by step
4. Verify with tests
5. When complete, output: ${COMPLETION_PROMISE}

## Scratchpad

Use ${SCRATCHPAD} to track progress and share context between iterations.

---

**Important**: Output "${COMPLETION_PROMISE}" when the task is fully complete.
EOF

    log_success "Generated prompt: ${output_file}"
}

update_issue_label() {
    local issue_number="$1"
    local label="$2"
    
    log_info "Adding label '${label}' to issue #${issue_number}..."
    gh issue edit "$issue_number" --add-label "$label" 2>/dev/null || {
        log_warn "Failed to add label (may not exist)"
    }
}

# ============================================================================
# Scratchpad Functions
# ============================================================================

init_scratchpad() {
    if [[ ! -f "$SCRATCHPAD" ]]; then
        cat > "$SCRATCHPAD" << EOF
# Scratchpad

## Current Status
- [ ] Task not started

## Progress Log

## Decisions Made

## Notes

EOF
        log_success "Initialized scratchpad: ${SCRATCHPAD}"
    fi
}

read_scratchpad() {
    if [[ -f "$SCRATCHPAD" ]]; then
        cat "$SCRATCHPAD"
    else
        echo "(empty)"
    fi
}

# ============================================================================
# Backend Execution
# ============================================================================

execute_backend() {
    local prompt_file="$1"
    local iteration="$2"
    
    log_info "Iteration ${iteration}: Executing ${BACKEND}..."
    
    local output
    local exit_code=0
    
    case "$BACKEND" in
        claude)
            # Claude Code CLI
            output=$(claude -p "$(cat "$prompt_file")" --allowedTools "Edit,Write,Bash,Read,Glob,Grep" 2>&1) || exit_code=$?
            ;;
        opencode)
            # OpenCode CLI
            output=$(opencode -p "$(cat "$prompt_file")" 2>&1) || exit_code=$?
            ;;
        *)
            log_error "Unknown backend: ${BACKEND}"
            exit 1
            ;;
    esac
    
    echo "$output"
    return $exit_code
}

check_completion() {
    local output="$1"
    
    if echo "$output" | grep -q "$COMPLETION_PROMISE"; then
        return 0  # Complete
    fi
    return 1  # Not complete
}

check_loop_detection() {
    local output="$1"
    local history_file=".agent/output_history.txt"
    
    # Simple similarity check: if output is very similar to recent outputs
    if [[ -f "$history_file" ]]; then
        local last_output
        last_output=$(tail -n 1000 "$history_file" 2>/dev/null || echo "")
        
        # Very basic check: if output is identical to last
        if [[ "$output" == "$last_output" ]]; then
            log_warn "Loop detected: output identical to previous iteration"
            return 0
        fi
    fi
    
    # Append to history
    echo "$output" >> "$history_file"
    return 1
}

# ============================================================================
# Approval Gates
# ============================================================================

request_approval() {
    local gate_name="$1"
    local message="$2"
    
    if [[ "$AUTO_MODE" == "true" ]]; then
        log_info "[AUTO] Approval gate '${gate_name}' auto-approved"
        return 0
    fi
    
    echo ""
    echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  APPROVAL GATE: ${gate_name}${NC}"
    echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "$message"
    echo ""
    echo "Options:"
    echo "  1. Continue (approve)"
    echo "  2. Abort"
    echo "  3. View scratchpad"
    echo ""
    
    while true; do
        read -rp "Select (1-3): " choice
        case "$choice" in
            1)
                log_success "Approved"
                return 0
                ;;
            2)
                log_warn "Aborted by user"
                exit 0
                ;;
            3)
                echo ""
                echo "=== Scratchpad Contents ==="
                read_scratchpad
                echo "==========================="
                echo ""
                ;;
            *)
                echo "Invalid choice"
                ;;
        esac
    done
}

# ============================================================================
# Main Loop
# ============================================================================

run_loop() {
    local issue_number="$1"
    local iteration=0
    local consecutive_failures=0
    local max_consecutive_failures=5
    
    log_info "Starting orchestration loop for issue #${issue_number}"
    log_info "Max iterations: ${MAX_ITERATIONS}"
    log_info "Backend: ${BACKEND}"
    log_info "Completion promise: ${COMPLETION_PROMISE}"
    echo ""
    
    # Fetch issue and generate prompt
    local issue_data
    issue_data=$(fetch_issue "$issue_number")
    generate_prompt_from_issue "$issue_data" "$PROMPT_FILE"
    
    # Initialize scratchpad
    init_scratchpad
    
    # Update issue label
    update_issue_label "$issue_number" "env:active"
    
    # Pre-loop approval gate
    request_approval "Pre-Loop" "About to start the orchestration loop. Review the generated prompt."
    
    # Main loop
    while [[ $iteration -lt $MAX_ITERATIONS ]]; do
        ((iteration++))
        
        echo ""
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${CYAN}  ITERATION ${iteration}/${MAX_ITERATIONS}${NC}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        
        # Execute backend
        local output
        local exit_code=0
        output=$(execute_backend "$PROMPT_FILE" "$iteration") || exit_code=$?
        
        # Log output (truncated)
        log_debug "Output (truncated): ${output:0:500}..."
        
        # Check for errors
        if [[ $exit_code -ne 0 ]]; then
            ((consecutive_failures++))
            log_error "Backend exited with code ${exit_code}"
            
            if [[ $consecutive_failures -ge $max_consecutive_failures ]]; then
                log_error "Too many consecutive failures (${consecutive_failures}). Stopping."
                update_issue_label "$issue_number" "env:blocked"
                exit 1
            fi
            continue
        fi
        
        # Reset failure counter on success
        consecutive_failures=0
        
        # Check for completion
        if check_completion "$output"; then
            echo ""
            log_success "Task completed! (${COMPLETION_PROMISE} detected)"
            update_issue_label "$issue_number" "env:pr-created"
            
            # Post-completion approval gate
            request_approval "Post-Completion" "Task appears complete. Review before creating PR."
            
            echo ""
            log_success "Orchestration complete after ${iteration} iterations"
            return 0
        fi
        
        # Check for loop detection
        if check_loop_detection "$output"; then
            log_warn "Possible infinite loop detected. Requesting human intervention."
            request_approval "Loop Detection" "Output is similar to previous iterations. Continue?"
        fi
        
        # Brief pause between iterations
        sleep 1
    done
    
    log_error "Max iterations (${MAX_ITERATIONS}) reached without completion"
    update_issue_label "$issue_number" "env:blocked"
    exit 1
}

# ============================================================================
# CLI
# ============================================================================

show_help() {
    cat << EOF
Orchestrator Hybrid - Phase 1 Prototype

Usage:
  orch.sh run --issue <number> [options]
  orch.sh status --issue <number>
  orch.sh cancel --issue <number>

Commands:
  run       Start orchestration loop
  status    Show current status
  cancel    Cancel running orchestration

Options:
  --issue, -i <number>      GitHub issue number (required for run)
  --backend, -b <name>      Backend: claude, opencode (default: claude)
  --max-iterations, -m <n>  Maximum iterations (default: 100)
  --auto, -a                Auto-approve all gates
  --verbose, -v             Verbose output
  --help, -h                Show this help

Examples:
  # Run with issue number
  orch.sh run --issue 123

  # Run with auto-approve
  orch.sh run --issue 123 --auto

  # Run with OpenCode backend
  orch.sh run --issue 123 --backend opencode

EOF
}

main() {
    local command=""
    local issue_number=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            run|status|cancel)
                command="$1"
                shift
                ;;
            --issue|-i)
                issue_number="$2"
                shift 2
                ;;
            --backend|-b)
                BACKEND="$2"
                shift 2
                ;;
            --max-iterations|-m)
                MAX_ITERATIONS="$2"
                shift 2
                ;;
            --auto|-a)
                AUTO_MODE=true
                shift
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Validate
    if [[ -z "$command" ]]; then
        show_help
        exit 1
    fi
    
    # Check dependencies
    check_dependencies
    
    # Ensure directories
    ensure_directories
    
    # Execute command
    case "$command" in
        run)
            if [[ -z "$issue_number" ]]; then
                log_error "Issue number required. Use --issue <number>"
                exit 1
            fi
            run_loop "$issue_number"
            ;;
        status)
            if [[ -z "$issue_number" ]]; then
                log_error "Issue number required. Use --issue <number>"
                exit 1
            fi
            log_info "Status for issue #${issue_number}:"
            gh issue view "$issue_number" --json title,body,labels,state | jq '.'
            echo ""
            log_info "Scratchpad:"
            read_scratchpad
            ;;
        cancel)
            log_warn "Cancel not implemented in Phase 1"
            ;;
        *)
            log_error "Unknown command: $command"
            exit 1
            ;;
    esac
}

# Run
main "$@"
