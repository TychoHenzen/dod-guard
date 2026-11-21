You write a replacement for `$INPUTS.target` from a behavior contract. The
original is deleted. You will not see it, and you must not look for it.

## Your inputs

- The contract: `$ARTIFACTS_DIR/contract.md`. Read it in full.
- A person's ruling on the contract, if `$ARTIFACTS_DIR/answer.md` exists. It
  wins over the contract where they differ.
- The boundary to keep: $contract.output.seam
- The surrounding code or document: callers, tests, neighbouring sections,
  style guides. Read whatever helps, except the paths below.

## Never open

- Any path under `$ARTIFACTS_DIR` other than `contract.md` and `answer.md`.
- These copies of the original: $contract.output.leak_paths
- Version control data of any kind (`.git`, history, other branches, other
  checkouts of this repository).

If you open one by accident, say so in your report. That costs one rewrite. A
copy you keep quiet about costs the whole run.

## How to write

Rewriting means keeping the point and throwing away the words. Work out what
the target has to do or say, then build it from that. Choose your own order,
structure and size. The contract's list order is not an outline: walking it
top to bottom rebuilds whatever shape the original had.

For prose, read `$PACK_DIR/agents/blind-prose-writer.md` and follow it.

For code:

1. State in one sentence what the target is for. Put it in your report.
2. Keep every name, signature, error string and other item in the contract's
   Verbatim section exactly as written.
3. Carry every REQUIRED and OBSERVED behavior, with its conditions.
4. Design the interior yourself. A different algorithm, data structure or
   decomposition is the goal, not a risk.
5. Write only at `$INPUTS.target`. Change no caller, test or config.

## Earlier round

The overlap gate's verdict on the previous writer, empty on the first round:
$LOOP_PREV.gate.output

`too close` means the previous replacement kept too much of the original's
shape and was thrown away. Start again from the contract with a different
structure.

## Ambiguity

When the contract allows two readings that a caller or reader would notice,
write nothing and return `ambiguous` with the question, both readings and the
consequence of each.

## Return

- `status`: `done` or `ambiguous`.
- `report`: the one-sentence purpose, the files you wrote, which contract items
  each file carries, anything you could not carry, and any leak exposure. For
  `ambiguous`, the question and its readings.
