# Natural output style: checker parity and clearer rules - Requirements Spec

<claude_instructions>
**For the implementer:** Work through each task below.
1. Mark a task `[>]` when you begin working on it.
2. Call `dod_check` to verify proofs - do NOT mark proofs manually.
3. A task group is complete when ALL its concrete proofs pass via `dod_check`.
4. Use `dod_refine` to turn a draft leaf into a concrete proof or subdivide into child tasks.
5. If a proof cannot be met, use `dod_amend` to modify it with a reason.
6. Continue until `dod_check` returns PASS - then stop and report done.

**Behavioral predicates only.** Each proof is a concrete behavioral claim.
Read failure diagnoses carefully - they tell you WHAT went wrong and what to fix.
Proofs run on the HOST OS - write OS-correct commands (no bash on Windows).

**CWD:** `C:\Users\siriu\mcp-servers\dod-guard`

**Anti-cheat:** Proofs stored canonically in MCP storage.
`dod_check` executes commands from the canonical copy, not this markdown file.
</claude_instructions>

**Goal:** Every text produced under the Natural style is easy to read and understand, and a reply that obeys the style also passes ste-lint

**Date:** 2026-08-10
**Target:** `C:\Users\siriu\mcp-servers\dod-guard`
**DoD ID:** `2c0ed8cb-0381-460c-8f03-fae59869acf1`
**Last check:** INCOMPLETE (2026-08-10T21:28:46.552Z)

---

## Decisions (locked with user)

<decisions>
Three rounds of adversarial spec review ran. All three returned REVISE. The user reviewed the accepted findings and directed creation anyway.

Accepted from review: the weak-opener pattern correction (the first draft stated is/are plus a/some/many, which would have made the style describe the checker wrongly); the secrets exception on the specificity rule (R6); and requiring each trap word to sit on the same line as its replacement (R1).

Rejected by the user, after the additions were explained: banning numbers from the readability section; pinning the version to exactly 1.1.0; forbidding edits to the other five marketplace entries; and having the style declare that both files are held to strict deliberately.

Rejected on judgement: every finding asking for machinery to keep natural.md in sync with vocabulary.mjs and classify.mjs. That is work the user did not ask for. It is recorded under open risks instead, and covered by the manual parity leaf.

R8 came out of a failure inside this interview. Requirements invented during review were reported back to the user by short label alone, naming things the user had never seen.
</decisions>

## Current state

<current_state>
Measured before any edit, on this host.

Prose lint at the strict tier: natural.md exits 0 with 5 hard-word warnings. README.md exits 1 with one long-sentence error at line 6 (23 words against a 20-word cap) plus 2 warnings. Total strict errors across both files: 1. That is under 10, so the baseline calls for a zero-tolerance proof rather than a delta proof.

Biome ignores the whole plugins/ directory, so no code linter touches these files. node scripts/ci/validate-plugins.mjs exits 0 and reports 6 plugins, 15 skills, 24 agents, 1 output style, 60 JSON files and 124 shipped docs.

marketplace.json holds three U+2014 em dashes, at lines 18, 24 and 30.

plugin.json version is 1.0.0.
</current_state>

## Requirements

<requirements>
R1. State the word rule as a principle plus the traps. Name ten words a model reaches for, each on the same line as what to write instead: leverage, utilize, facilitate, delve into, comprehensive, streamline, robust, seamless, holistic, unlock. This replaces the current list of eight marketing adjectives. Do not enumerate the other banned words.

R2. Add the weak-opener rule, stating the checker's real pattern: do not open with `there is`, `there are`, `there was` or `there were` followed by `a`, `an`, `no`, `some`, `many` or `several`. Name the subject instead.

R3. State the strict tier by filename, listing all ten keywords from classify.mjs: runbook, procedure, playbook, install, security, troubleshoot, incident, migration, upgrade, error. Every other file takes the 25-word cap.

R4. State the readability ceiling. A block scores on word rarity and word length together, so long rare words fail even inside short sentences.

R5. Give a concrete example when a claim is abstract.

R6. Name the specific file, flag, number or error string, not its category. Carry an exception: strip any password, token, credential or local username out of a real string before quoting it.

R7. Define any term the reader may not hold at first use, not only abbreviations.

R8. Add a rule: do not assume the reader has seen anything between their message and the final reply. Tool output, search results and work by other agents are invisible to them. Never refer to such a thing by a short label alone. Explain what it is, or leave it out.

R9. Rewrite the parts of README.md that describe the style so they match, and make the whole file pass the strict bar.

R10. Refresh the natural-output-style description in plugin.json and in the root marketplace.json, and raise the plugin version above 1.0.0. All three descriptions must agree with what natural.md actually says.

R11. Remove every banned character from marketplace.json, including the three em dashes at lines 18, 24 and 30 in the obsidian-rag, evomcp and gitevo descriptions.

EXCLUDED: no fiction or creative-writing exception; no change to how the style ranks itself against a terse voice; no edit to ~/.claude/enforcement.md; no size budget on natural.md; no full list of the 32 banned words or the 14 filler openers; no change to ste-lint or standalone-checks.mjs; nothing touching chapter-02-the-standing-item.md or prose-exempt.json; no second output style.
</requirements>

## Research Notes

<research_notes>
Parity gaps found by reading the checker source against the shipped style.

The style names 8 marketing adjectives. vocabulary.mjs BANNED_WORDS holds 32. The style names 1 of the 14 filler openers in OPENERS. The style has no counterpart at all for the weak-opener rule, whose pattern is \bthere\s+(?:is|are|was|were)\s+(?:a|an|no|some|many|several)\b.

The style also names `remediate` and `additionally` as words to avoid. Neither is in BANNED_WORDS, so the checker never flags them.

The style says the 20-word cap applies to steps and procedures. classify.mjs decides by filename alone, using the ten keywords in R3. Neither natural.md nor README.md holds one of those keywords, so the checker would judge both at the looser 25-word bar by default. The proofs run both at --tier=strict anyway, because that is the bar the user picked. natural.md already meets it today, so it is known reachable.

ste-lint exit codes, measured: 0 when a file carries no error-severity finding, 1 when it carries at least one. Warning findings never change the exit code.

Every proof command in this tree was run on the host before the document was created, and its output recorded.
</research_notes>

---

## Definition of Done

<definition_of_done>

### Natural style rules [x]

  - [x] Proof: `node -e "const fs=require('fs');const L=fs.readFileSync('plugins/natural-output-style/output-styles/natural.md','utf8').toLowerCase().split(/\r?\n/);const w=['leverage','utilize','facilitate','delve into','comprehensive','streamline','robust','seamless','holistic','unlock'];const bad=w.filter(x=>!L.some(l=>l.includes(x)&&/\bnot\b|\bsay\b|\bdrop\b|\bwrite\b/.test(l)));console.log(bad.length?'UNPAIRED '+bad.join(','):'ALL_PAIRED')"` -> All ten trap words appear, each on a line that also names what to write instead <!--p:{"type":"output_contains","value":"ALL_PAIRED"}-->
  - [x] Proof: `node -e "const t=require('fs').readFileSync('plugins/natural-output-style/output-styles/natural.md','utf8').toLowerCase();const need=['there was','there were','several','name the subject'];const m=need.filter(x=>!t.includes(x));console.log(m.length?'MISSING '+m.join('|'):'STATED')"` -> The rule covers was and were and several, not only is and are <!--p:{"type":"output_contains","value":"STATED"}-->
  - [x] Proof: `node -e "const t=require('fs').readFileSync('plugins/natural-output-style/output-styles/natural.md','utf8').toLowerCase();const k=['runbook','procedure','playbook','install','security','troubleshoot','incident','migration','upgrade','error'];const m=k.filter(x=>!t.includes(x));console.log(m.length?'MISSING '+m.join(','):'ALL_PRESENT')"` -> A reader can tell which filenames take the 20-word cap <!--p:{"type":"output_contains","value":"ALL_PRESENT"}-->
  - [x] Proof: `node -e "const t=require('fs').readFileSync('plugins/natural-output-style/output-styles/natural.md','utf8').toLowerCase();const all=['seamless','robust','powerful','cutting-edge','effortless','world-class','next-generation','revolutionary','game-changer','blazing fast','leverage','utilize','facilitate','seek to','delve into','unlock','elevate','streamline','holistic','paradigm','synergy','best-in-class','state-of-the-art','comprehensive','plethora','myriad'];const n=all.filter(x=>t.includes(x)).length;console.log(n<16?'NOT_ENUMERATED '+n:'ENUMERATED '+n)"` -> Guards the principle-plus-traps decision. Passes today, so it only catches a regression <!--p:{"type":"output_contains","value":"NOT_ENUMERATED"}-->
  - [x] Proof: `node -e "const L=require('fs').readFileSync('plugins/natural-output-style/output-styles/natural.md','utf8').toLowerCase().split(/\r?\n/);const near=L.some((l,i)=>{const w=[l,L[i+1]||'',L[i+2]||''].join(' ');return /redact|strip/.test(w)&&/flag|string|path/.test(w)});const cov=['token','credential','password','username'].filter(x=>!L.join(' ').includes(x));console.log(near&&!cov.length?'SECRETS_RULE_OK':'SECRETS_RULE_ABSENT '+cov.join(','))"` -> Quoting a real error string or flag must not leak a token, credential, password or username <!--p:{"type":"output_contains","value":"SECRETS_RULE_OK"}-->
  - [x] Proof: `node -e "const L=require('fs').readFileSync('plugins/natural-output-style/output-styles/natural.md','utf8').toLowerCase().split(/\r?\n/);const hit=L.some((l,i)=>{const w=[l,L[i+1]||'',L[i+2]||''].join(' ');return /assume/.test(w)&&/(saw|seen|read)/.test(w)&&/(between|tool|step|search|agent)/.test(w)});console.log(hit?'STATED':'MISSING')"` -> The rule names tool output and other agents' work as invisible to the reader <!--p:{"type":"output_contains","value":"STATED"}-->
  - [x] Proof: `node -e "const L=require('fs').readFileSync('plugins/natural-output-style/output-styles/natural.md','utf8').toLowerCase().split(/\r?\n/);const hit=L.some((l,i)=>{const w=[l,L[i+1]||'',L[i+2]||''].join(' ');return /rare|rarity/.test(w)&&/word length|long word|letters/.test(w)&&/short sentence|even when|even inside|still fail/.test(w)});console.log(hit?'CEILING_OK':'CEILING_ABSENT')"` -> The readability rule says rarity and word length score together, so long rare words fail even in short sentences <!--p:{"type":"output_contains","value":"CEILING_OK"}-->
  - [x] Proof: `node -e "const L=require('fs').readFileSync('plugins/natural-output-style/output-styles/natural.md','utf8').toLowerCase().split(/\r?\n/);const rule=L.some((l,i)=>{const w=[l,L[i+1]||''].join(' ');return /example|show one case|show a case|show the case/.test(w)&&/abstract|general|vague|claim/.test(w)});const demo=L.filter(l=>(l.match(/`[^`]+`/g)||[]).length>=2).length;console.log(rule&&demo>=6?'EXAMPLE_RULE_OK':'EXAMPLE_RULE_MISSING rule='+rule+' pairs='+demo)"` -> The style tells the writer to show a case when a claim is abstract, and shows cases itself <!--p:{"type":"output_contains","value":"EXAMPLE_RULE_OK"}-->
  - [x] Proof: `node -e "const L=require('fs').readFileSync('plugins/natural-output-style/output-styles/natural.md','utf8').toLowerCase().split(/\r?\n/);const hit=L.some((l,i)=>{const w=[l,L[i+1]||'',L[i+2]||''].join(' ');return /name the|prefer the|give the|write the/.test(w)&&/file/.test(w)&&/flag/.test(w)&&/number/.test(w)&&/error string/.test(w)&&/categor/.test(w)});console.log(hit?'SPECIFIC_RULE_OK':'SPECIFIC_RULE_MISSING')"` -> The style says prefer the actual file, flag, number or error string over its category <!--p:{"type":"output_contains","value":"SPECIFIC_RULE_OK"}-->
  - [x] Proof: `node -e "const L=require('fs').readFileSync('plugins/natural-output-style/output-styles/natural.md','utf8').toLowerCase().split(/\r?\n/);const hit=L.some((l,i)=>{const w=[l,L[i+1]||'',L[i+2]||''].join(' ');return /first use/.test(w)&&/\bterm\b/.test(w)&&/not only|beyond|more than|any term/.test(w)&&/acronym|abbreviation/.test(w)});console.log(hit?'GLOSS_RULE_OK':'GLOSS_RULE_MISSING')"` -> The style asks for a short gloss at first use for any term the reader may not hold, not only for acronyms <!--p:{"type":"output_contains","value":"GLOSS_RULE_OK"}-->

### README and manifests [x]

  - [x] Proof: `node -e "const v=JSON.parse(require('fs').readFileSync('plugins/natural-output-style/.claude-plugin/plugin.json','utf8')).version;console.log(v==='1.0.0'?'VERSION_UNCHANGED':'VERSION_RAISED '+v)"` -> A user can tell the shipped style changed <!--p:{"type":"output_contains","value":"VERSION_RAISED"}-->
  - [x] Proof: `node -e "const m=JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'));const e=m.plugins.find(p=>p.name==='natural-output-style');console.log(e&&e.source==='./plugins/natural-output-style'?'PINNED':'MOVED')"` -> validate-plugins only checks that a source path resolves, not that it resolves to the right place <!--p:{"type":"output_contains","value":"PINNED"}-->
  - [x] Proof: `node -e "const fs=require('fs');const r=fs.readFileSync('plugins/natural-output-style/README.md','utf8').toLowerCase();const s=fs.readFileSync('plugins/natural-output-style/output-styles/natural.md','utf8').toLowerCase();const bad=[];if(r.includes('jargon'))bad.push('claims-no-jargon');if(!/there is|weak opener/.test(r))bad.push('no-weak-opener');if(!(r.includes('20')&&r.includes('25')))bad.push('no-caps');if(!/rare|rarity/.test(r))bad.push('no-readability');for(const k of ['weak opener','trap word','first use'])if(r.includes(k)&&!s.includes(k))bad.push('unbacked:'+k);console.log(bad.length?'README_DRIFT '+bad.join(','):'README_MATCHES')"` -> The README describes the rules the style now holds and claims none it does not <!--p:{"type":"output_contains","value":"README_MATCHES"}-->
  - [x] Proof: `node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('plugins/natural-output-style/.claude-plugin/plugin.json','utf8')).description.toLowerCase();const m=JSON.parse(fs.readFileSync('.claude-plugin/marketplace.json','utf8')).plugins.find(x=>x.name==='natural-output-style').description.toLowerCase();const r=fs.readFileSync('plugins/natural-output-style/README.md','utf8').toLowerCase().split('## ')[0];const bad=[];for(const pair of [['plugin',p],['market',m],['readme',r]]){const d=pair[1];if(d.includes('jargon'))bad.push(pair[0]+':jargon');if(!/common word/.test(d))bad.push(pair[0]+':no-common-words');if(!/short sentence/.test(d))bad.push(pair[0]+':no-short-sentences');}console.log(bad.length?'DESCRIPTIONS_DIFFER '+bad.join(','):'DESCRIPTIONS_AGREE')"` -> All three descriptions claim only what the style holds, and none of them says no jargon <!--p:{"type":"output_contains","value":"DESCRIPTIONS_AGREE"}-->

### Gates [x]

  - [x] Proof: `node "%USERPROFILE%\.claude\ste\ste-lint.mjs" --tier=strict plugins/natural-output-style/output-styles/natural.md` -> Zero error-severity findings at the 20-word bar <!--p:{"type":"exit_code","value":0}-->
  - [x] Proof: `node "%USERPROFILE%\.claude\ste\ste-lint.mjs" --tier=strict plugins/natural-output-style/README.md` -> Currently fails on one 23-word sentence at line 6 <!--p:{"type":"exit_code","value":0}-->
  - [x] Proof: `node -e "const f=['plugins/natural-output-style/.claude-plugin/plugin.json','.claude-plugin/marketplace.json'];const re=/[—–‘’“”…→]/;const bad=f.filter(p=>re.test(require('fs').readFileSync(p,'utf8')));console.log(bad.length?'DIRTY '+bad.join(','):'CLEAN')"` -> Catches em dash, en dash, curly quotes, ellipsis and arrow, which double-encode and corrupt the file <!--p:{"type":"output_contains","value":"CLEAN"}-->
  - [x] Proof: `node -e "const v=require('fs').readFileSync(process.env.USERPROFILE+'/.claude/ste/vocabulary.mjs','utf8');const w=['leverage','utilize','facilitate','delve into','comprehensive','streamline','robust','seamless','holistic','unlock'];const m=w.filter(x=>!v.includes(String.fromCharCode(39)+x+String.fromCharCode(39)));console.log(m.length?'INVENTED '+m.join(','):'ALL_REAL')"` -> Every trap word the style names exists in BANNED_WORDS, so the style does not over-restrict <!--p:{"type":"output_contains","value":"ALL_REAL"}-->
  - [x] Proof: `git ls-files --error-unmatch plugins/natural-output-style/output-styles/natural.md plugins/natural-output-style/README.md plugins/natural-output-style/.claude-plugin/plugin.json .claude-plugin/marketplace.json` -> The marketplace installs from git, so an untracked file never reaches a user <!--p:{"type":"exit_code","value":0}-->
  - [x] Proof: `node scripts/ci/validate-plugins.mjs` -> Drives the style through the same frontmatter reader CI uses, so a broken style is caught before the picker hides it <!--p:{"type":"exit_code","value":0}-->

### Human judgement [~]

  - [~] **Draft**: MANUAL: read the revised natural.md and judge whether it reads plainly and covers requirements R1 through R8
  - [~] **Draft**: MANUAL: select Natural in /config, start a new session, and confirm a reply reads plainly
  - [~] **Draft**: MANUAL: confirm the style names no banned word the checker allows, and that the ten trap words, ten tier filenames and weak-opener pattern still match vocabulary.mjs and classify.mjs

</definition_of_done>

## Open risks

<open_risks>
Baseline rows that do not apply, recorded rather than dropped in silence.

The general baseline requires test-first proofs, unit tests for new components and a full test suite run. This change ships no code. plugins/ holds no package.json, no build and no tests, and npm test runs node --test over packages/ only. So there is no red-then-green proof and no suite to run. The strict prose lint and validate-plugins.mjs stand in as the behavioral gates.

The baseline also asks for code review by another developer, release to an environment and test database cleanup. This is a solo repository with no deployment step and no database.

Prose quality has no machine oracle. ste-lint scores word rarity and sentence shape. Nothing in this tree proves R5, R7 or R8 actually made the style clearer. The manual read-through leaf is the only check on that.

The ten trap words, the ten strict-tier filenames and the weak-opener pattern are all copied by hand out of vocabulary.mjs and classify.mjs. If either file changes, natural.md goes stale and no proof here notices. The manual parity leaf is the only guard.

The user declined a live-session check being machine-checked, which it cannot be. A style takes effect only after /clear or a new session.
</open_risks>

## Amendment log

- **2026-08-10T21:08:26.881Z** [0.children.4] modified: The proof passed on the untouched file, so it proved nothing. The failure sentinel UNGUARDED contains the pass sentinel GUARDED, so output_contains matched on the failure string. Verified directly: the file holds none of token, credential, password or username, and no window matches, yet the leaf reported PASS. New sentinels SECRETS_RULE_OK and SECRETS_RULE_ABSENT cannot nest, confirmed by running both through includes.
- **2026-08-10T21:08:31.965Z** [1.children.0] modified: The proof passed while the version was still 1.0.0, so it proved nothing. The failure sentinel NOT_BUMPED contains the pass sentinel BUMPED, so output_contains matched the failure string. Verified directly that includes returns true for that pair. New sentinels VERSION_RAISED and VERSION_UNCHANGED cannot nest.
- **2026-08-10T21:19:25.940Z** [0.children.6] refined: Refined draft → concrete: The readability rule says rarity and word length score together, so long rare words fail even in short sentences
- **2026-08-10T21:19:31.866Z** [0.children.7] refined: Refined draft → concrete: The style tells the writer to show a case when a claim is abstract, and shows cases itself
- **2026-08-10T21:19:37.196Z** [0.children.8] refined: Refined draft → concrete: The style says prefer the actual file, flag, number or error string over its category
- **2026-08-10T21:19:42.807Z** [0.children.9] refined: Refined draft → concrete: The style asks for a short gloss at first use for any term the reader may not hold, not only for acronyms
- **2026-08-10T21:19:49.196Z** [1.children.2] refined: Refined draft → concrete: The README describes the rules the style now holds and claims none it does not
- **2026-08-10T21:19:56.232Z** [1.children.3] refined: Refined draft → concrete: All three descriptions claim only what the style holds, and none of them says no jargon
