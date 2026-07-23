# Structural Gates — Behavioral Proof Templates per Language

Behavioral structural proofs use real tools with dod-guard predicates. No static
analysis heuristics — the tool does the analysis, dod-guard checks the output.

## TypeScript / JavaScript

### Function Complexity

```json
{
  "command": "npx biome lint --rule complexity/noExcessiveCognitiveComplexity src/",
  "predicate": {"type": "exit_code", "value": 0},
  "description": "no functions exceed cognitive complexity threshold (config in biome.json)",
  "category": "behavioral"
}
```

### Large Files

```json
{
  "command": "node -e \"const fs=require('fs');const path=require('path');function walk(dir,cb){fs.readdirSync(dir,{withFileTypes:true}).forEach(d=>{const p=path.join(dir,d.name);d.isDirectory()?walk(p,cb):cb(p)})};const bad=[];walk('src',f=>{if(f.endsWith('.ts')||f.endsWith('.tsx')){const n=fs.readFileSync(f,'utf8').split('\\n').length;if(n>300)bad.push(f+': '+n)}});console.log(bad.join('\\n'))\"",
  "predicate": {"type": "output_not_contains", "value": "src/"},
  "description": "no source files exceed 300 lines",
  "category": "behavioral"
}
```

### Dead Code

```json
{
  "command": "npx ts-prune | wc -l",
  "predicate": {"type": "output_matches", "value": "^0$"},
  "description": "zero unused exports in the codebase",
  "category": "behavioral"
}
```

**Note:** `ts-prune` may produce false positives for exports consumed by tests.
Use `npx ts-prune 2>/dev/null` to ignore stderr noise. If ts-prune isn't available,
fall back to `npx tsc --noEmit` as a weaker proxy.

### Duplicate Logic

```json
{
  "command": "npx jscpd src/ --min-lines 10 --min-tokens 50 --reporters console 2>&1",
  "predicate": {"type": "output_not_contains", "value": "Clone found"},
  "description": "no code clones > 10 lines with > 50 tokens",
  "category": "behavioral"
}
```

**Fallback** (jscpd unavailable):
```json
{
  "command": "node -e \"console.log('jscpd not installed — structural gate skipped')\"",
  "predicate": {"type": "exit_code", "value": 0},
  "description": "duplicate detection skipped (jscpd not available)",
  "category": "other",
  "advisory": true
}
```

### Error Swallowing

```json
{
  "command": "node -e \"const fs=require('fs');const path=require('path');function walk(dir,cb){fs.readdirSync(dir,{withFileTypes:true}).forEach(d=>{const p=path.join(dir,d.name);d.isDirectory()?walk(p,cb):cb(p)})};const bad=[];walk('src',f=>{if(f.endsWith('.ts')||f.endsWith('.tsx')){const lines=fs.readFileSync(f,'utf8').split('\\n');for(let i=0;i<lines.length;i++){const l=lines[i];if(/catch\\s*\\(/.test(l)){const rest=lines.slice(i,i+5).join(' ');if(!/(console|logger|throw|reject|process\\.exit)/i.test(rest)){bad.push(f+':'+(i+1))}}}}}});if(bad.length)console.log(bad.join('\\n'))\"",
  "predicate": {"type": "output_not_contains", "value": "src/"},
  "description": "every catch block logs or re-throws",
  "category": "behavioral"
}
```

## Python

### Function Complexity

```json
{
  "command": "python -m mccabe src/ --min 10 2>&1",
  "predicate": {"type": "output_not_contains", "value": "mccabe"},
  "description": "no functions exceed McCabe complexity 10",
  "category": "behavioral"
}
```

### Large Files

```json
{
  "command": "python -c \"import os;bad=[os.path.join(r,f) for r,_,fs in os.walk('src') for f in fs if f.endswith('.py') and sum(1 for _ in open(os.path.join(r,f)))>300];print('\\n'.join(bad))\"",
  "predicate": {"type": "output_not_contains", "value": ".py"},
  "description": "no source files exceed 300 lines",
  "category": "behavioral"
}
```

### Dead Code

```json
{
  "command": "python -m vulture src/ --min-confidence 80",
  "predicate": {"type": "output_not_contains", "value": "unused"},
  "description": "zero dead code with 80%+ confidence",
  "category": "behavioral"
}
```

## Rust

### Function Complexity

```json
{
  "command": "cargo clippy -- -W clippy::cognitive_complexity 2>&1",
  "predicate": {"type": "exit_code", "value": 0},
  "description": "no cognitive complexity warnings from clippy",
  "category": "behavioral"
}
```

### Large Files

```json
{
  "command": "find src/ -name '*.rs' -exec wc -l {} + | awk '$1 > 300 {print $2, $1}'",
  "predicate": {"type": "output_not_contains", "value": "src/"},
  "description": "no source files exceed 300 lines",
  "category": "behavioral"
}
```

### Dead Code

```json
{
  "command": "cargo clippy -- -W dead_code 2>&1",
  "predicate": {"type": "exit_code", "value": 0},
  "description": "zero dead code warnings from clippy",
  "category": "behavioral"
}
```

### Error Swallowing

```json
{
  "command": "rg 'catch\\s*\\(' src/ -l | xargs rg -L '(console|logger|throw|reject|process\\.exit)' 2>/dev/null",
  "predicate": {"type": "output_not_matches", "value": "src/"},
  "description": "every catch block logs or re-throws",
  "category": "behavioral"
}
```

See `standards/language-commands.md` for greenfield vs brownfield command variants.

## Convergence Audit Configuration

```json
{
  "max_iterations": 3,
  "stability_threshold": 2,
  "description": "Run all structural gates. If count == 0 for {stability_threshold} consecutive runs → GO. Max {max_iterations} iterations."
}
```

After GO: converge commit, proceed to final dod_check.

## Anti-Pattern Schema (for postmortem capture)

Stored in `.dod-guard/anti-patterns.json`:

```json
{
  "version": 1,
  "patterns": [
    {
      "id": "ap-001",
      "name": "Unchecked null access on external API response",
      "source_finding": {
        "phase": 3,
        "lens": "Saboteur",
        "finding": "Null pointer on network timeout",
        "file": "src/api/client.ts",
        "line": 42,
        "date": "2026-07-23"
      },
      "rule": "Always null-check external API responses before destructuring.",
      "trigger": "API client, HTTP response, external service call",
      "severity": "critical"
    }
  ]
}
```

Anti-patterns auto-feed into Phase 1 spec reviews — each new spec is checked
against accumulated anti-patterns for matches.
