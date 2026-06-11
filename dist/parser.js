import { promises as fs } from "node:fs";
function inferPredicate(description) {
    const lower = description.toLowerCase();
    // grep/ripgrep: exit 1 = no matches (exact). Using exit_code_not:0 would
    // pass on command-not-found (exit 127/9009), giving false positives.
    if (lower.includes("no match")) {
        return { type: "exit_code", value: 1 };
    }
    const exitMatch = lower.match(/exit\s*(?:code\s*)?(\d+)/);
    if (exitMatch) {
        return { type: "exit_code", value: parseInt(exitMatch[1], 10) };
    }
    if (lower.startsWith("manual") || lower === "manual") {
        return { type: "manual" };
    }
    // Default: command succeeds (exit 0)
    return { type: "exit_code", value: 0 };
}
function parseProofLine(line, proofIndex) {
    // - [ ] Proof: `command` → description
    const cmdMatch = line.match(/^-\s*\[([ x~>])\]\s*Proof:\s*`([^`]+)`\s*→\s*(.+)$/);
    if (cmdMatch) {
        const [, status, command, description] = cmdMatch;
        return {
            id: `proof-${proofIndex}`,
            command: command.trim(),
            predicate: inferPredicate(description.trim()),
            description: description.trim(),
            last_status: status === "x" ? "pass" : status === "~" ? "skipped" : "pending",
        };
    }
    // - [ ] Proof: Manual — description   OR   - [ ] Proof: Manual device smoke...
    const manualMatch = line.match(/^-\s*\[([ x~>])\]\s*Proof:\s*[Mm]anual[\s—-]+(.+)$/);
    if (manualMatch) {
        return {
            id: `proof-${proofIndex}`,
            command: "manual",
            predicate: { type: "manual" },
            description: manualMatch[2].trim(),
            last_status: manualMatch[1] === "x" ? "pass" : manualMatch[1] === "~" ? "skipped" : "pending",
        };
    }
    return null;
}
export async function parseMarkdown(filePath) {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    let title = "";
    let goal = "";
    let date = "";
    let cwd = ".";
    // Extract metadata
    for (const line of lines) {
        if (!title && line.startsWith("# ")) {
            title = line.replace(/^#\s+/, "").replace(/\s*—.*$/, "").trim();
        }
        const goalMatch = line.match(/^\*\*Goal:\*\*\s*(.+)/);
        if (goalMatch)
            goal = goalMatch[1].trim();
        const dateMatch = line.match(/^\*\*Date:\*\*\s*(.+)/);
        if (dateMatch)
            date = dateMatch[1].trim();
        const targetMatch = line.match(/^\*\*Target:\*\*\s*`?([^`]+)`?/);
        if (targetMatch)
            cwd = targetMatch[1].trim();
        // Also check the "Self-contained" note for cwd
        const cwdMatch = line.match(/All commands run from `([^`]+)`/);
        if (cwdMatch)
            cwd = cwdMatch[1].trim();
    }
    // Parse sections
    const sections = { requirements: "" };
    let currentSection = "";
    let sectionBuf = [];
    function flushSection() {
        if (!currentSection)
            return;
        const text = sectionBuf.join("\n").trim();
        switch (currentSection) {
            case "requirements":
                sections.requirements = text;
                break;
            case "research_notes":
                sections.research_notes = text;
                break;
            case "open_questions":
                sections.open_questions = text;
                break;
            case "open_risks":
                sections.open_risks = text;
                break;
            case "decisions":
                sections.decisions = text;
                break;
            case "current_state":
                sections.current_state = text;
                break;
        }
        currentSection = "";
        sectionBuf = [];
    }
    const sectionMap = {
        "requirements": "requirements",
        "research notes": "research_notes",
        "open questions": "open_questions",
        "open risks": "open_risks",
        "decisions": "decisions",
        "current state": "current_state",
    };
    for (const line of lines) {
        const h2Match = line.match(/^## (.+?)(?:\s*\(.*\))?$/);
        if (h2Match) {
            flushSection();
            const heading = h2Match[1].trim().toLowerCase();
            for (const [key, val] of Object.entries(sectionMap)) {
                if (heading.startsWith(key)) {
                    currentSection = val;
                    break;
                }
            }
            continue;
        }
        if (line.match(/^---$/) && currentSection) {
            flushSection();
            continue;
        }
        if (currentSection)
            sectionBuf.push(line);
    }
    flushSection();
    // Parse DoD steps
    const steps = [];
    let currentStep = null;
    let proofCounter = 0;
    let inDod = false;
    for (const line of lines) {
        if (line.match(/^## Definition of Done/)) {
            inDod = true;
            continue;
        }
        if (!inDod)
            continue;
        // New H2 after DoD ends the section
        if (line.match(/^## /) && !line.match(/^### /)) {
            if (currentStep)
                steps.push(currentStep);
            currentStep = null;
            break;
        }
        const stepMatch = line.match(/^### Step (\d+):\s*(.+?)(?:\s*\[.\])?$/);
        if (stepMatch) {
            if (currentStep)
                steps.push(currentStep);
            currentStep = {
                id: `step-${stepMatch[1]}`,
                title: stepMatch[2].trim(),
                proofs: [],
            };
            continue;
        }
        if (currentStep && line.match(/^-\s*\[/)) {
            const proof = parseProofLine(line.trim(), proofCounter++);
            if (proof) {
                proof.id = `proof-${currentStep.id.split("-")[1]}-${currentStep.proofs.length + 1}`;
                currentStep.proofs.push(proof);
            }
        }
    }
    if (currentStep)
        steps.push(currentStep);
    return { title, goal, date, cwd, sections, steps };
}
//# sourceMappingURL=parser.js.map