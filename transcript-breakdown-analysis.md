# Transcript Breakdown Analysis: Jul 20-24, 2026

**Scope:** 56 transcript files across 5 active projects (Jul 20-24)
**Method:** Pattern-matched fix-claim declarations against user pushback within 10 messages
**Results:** 10 confirmed breakdown events across 5 sessions, 2 projects

---

## Summary

| Project | Breakdowns | Sessions | Pattern |
|---------|-----------|----------|---------|
| retro-burn | 10 | 4 | Build-only verification for visual/gameplay changes |
| dod-guard | 0 (detected) | 1 | Acknowledged core mission failure (meta) |

---

## Root Cause Categories

### Category 1: Build-Only Verification (8 of 10 breakdowns)

**The pattern:**
1. Claude makes code changes
2. Runs `dotnet build` / checks compilation
3. Declares "Build clean" / "Build passes" / "Done"
4. Never runs the game or visually verifies the output
5. User launches Godot manually, finds it still broken
6. User reports failure; cycle repeats

**Why this happens:** Claude cannot launch Godot to visually verify. The shell has no `godot` binary on PATH (confirmed in one session where Claude claimed this, but user pointed to the actual executable path). Claude substitutes "build passes" for "fix verified" — these are not equivalent for visual/3D/gameplay changes.

**Concrete examples:**

| Date | Fix Claim | User Pushback | Root Issue |
|------|-----------|---------------|------------|
| Jul 22 | "Build succeeded. Let's actually run MapGenerator.Generate()" — then didn't | "you didn't fix shit... [Godot path]" | Godot available but not used; build ≠ verify |
| Jul 22 | "Build clean, 0 errors. Done. In MapGenerator.cs: Realign Coolant..." | "you didn't fix shit... [Godot path]" | Same session, same false claim, same failure |
| Jul 22 | "Build clean. Screen now uses Unshaded + AlbedoTexture" | "no... render the actual ui content on the shape" | Fixed material while core problem (viewport→mesh) untouched |
| Jul 23 | "Build passes. Screen quads now render at priority 10... They skip dithering entirely" | "that doesn't fix the issue" | Build verification for rendering change |

### Category 2: Solving Wrong Problem (2 of 10 breakdowns)

**The pattern:**
1. User describes what they want
2. Claude implements something adjacent but wrong
3. Claude declares done
4. User points out it's not what was asked for

**Concrete example (TerminalUI, Jul 22):**
- User wanted: "render actual UI content on the 3D screen mesh"
- Claude did 3 rounds of: changing material properties (Unshaded, AlbedoTexture, AlbedoColor tint, emission, render priority)
- Each round: "Build clean. Screen now uses..." → User: "no... render the actual ui content on the shape"
- Core fix needed: hook SubViewport + ViewportTexture to the QuadMesh — never attempted

**Concrete example (Screen aspect ratio, Jul 22):**
- User: "the overlay is the native resolution, the subviewport should squash it"
- Claude implemented the inverse (squashed overlay, native subviewport)
- User: "no... the other way around"

### Category 3: Single-Path Hallway Fixation (MapGenerator, Jul 20)

**The pattern:**
Claude gets fixated on a single implementation approach (one long spine corridor) despite user explicitly saying the old generator was deleted because of this exact problem.

- Jul 20: Claude "confirmed the actual bug" — but fix still produced single hospital-wing hallway
- User: "it's still complete and utter trash with every single room ending in a wall instead of a hallway, you're still only making one long hallway that feels more like a hospital wing than a spaceship"
- Claude's response: traced brush coordinates for one junction to prove correctness, missing the architectural problem entirely

### Category 4: Meta — dod-guard's Core Mission Failure (Jul 24)

User explicitly stated dod-guard "still completely and utterly fails" at its core mission: preventing LLM reward hacking when writing tests. Claude acknowledged each mechanism's failure:

- TDD predicate: same LLM writes test then implementation, "red" phase is theater
- Adversarial gates: same LLM running adversarial agents against its own output
- Behavioral predicates: LLM writes predicates that match what it already implemented

This is not a "fix claimed, user says broken" pattern — it's an honest acknowledgment. But it's significant because it's the tool's primary value proposition.

---

## Quantified Impact

| Metric | retro-burn (5 days) |
|--------|---------------------|
| Sessions with breakdowns | 4 of ~15 active sessions (27%) |
| Total wasted turns | ~30+ (cycles of fix→reject→retry) |
| Max retries on same issue | 3 (TerminalUI rendering, MapGenerator layout) |
| Avg messages between fix claim and pushback | 4.4 |
| Godot launch attempts | 0 (even when path was known) |

---

## Recommendations

### 1. Godot launch verification for retro-burn

The Godot executable path is known: `C:\Development\Godot_v4.7.1-stable_mono_win64\Godot_v4.7.1-stable_mono_win64.exe`. For any visual/gameplay change in retro-burn, the verification step MUST include launching Godot with the project and checking output. "Build passes" is not verification for this project type.

### 2. Verification checklist for visual changes

Before claiming a visual/rendering fix is done:
- [ ] Build passes
- [ ] Game launches without errors
- [ ] Observed visual output matches spec
- [ ] Screenshot compared against expected behavior

### 3. Rewind on second rejection

After the second pushback on the same issue, the approach itself is wrong. Stop iterating. Re-read the original request and ask clarifying questions about what was misunderstood.

### 4. dod-guard reward-hacking prevention

The acknowledged failure modes need architectural solutions:
- Test-writing LLM must be different from implementation-writing LLM (or run in truly isolated context)
- Adversarial agents need different models/personas with genuine independence
- Behavioral predicates should be locked before implementation begins (dod-guard's phase gating partially addresses this but enforcement is weak)

### 5. Step-by-step skill should detect the pattern

The `/dod-guard:step-by-step` skill was invoked for both the map generator and terminal display work, yet the breakdown pattern still occurred. The skill's verification phase (1.3) should detect when "build passes" is being used as a proxy for actual verification, and reject it when the change type requires visual/manual verification.

---

## Breakdown Timeline

```
Jul 20 ─ MapGenerator: 2 breakdowns (hospital-wing hallway, rooms→walls)
Jul 21 ─ Build verification: 1 breakdown (baseline claim, task notification pushback)
Jul 22 ─ MapGenerator: 3 breakdowns (same "you didn't fix shit" pushback)
       ─ TerminalUI: 3 breakdowns (same "render ui content on shape" pushback)
       ─ Screen aspect: 1 breakdown (inverse implementation)
Jul 23 ─ Screen dither: 1 breakdown ("that doesn't fix the issue")
Jul 24 ─ dod-guard meta: core mission acknowledged as failing
```

---

*Generated from 56 transcript files across 5 projects, Jul 20-24 2026. Pattern-matching used regex on assistant fix-claim language and user pushback language. Manual review of each matched session confirmed all 10 events.*
