## dod-guard triage standards

- **Acceptance a run can prove.** Each acceptance line names a check that can fail: a command, a test, or an observation with its expected result. A line no check can fail, such as "works well" or "is clean", needs contract work, and the proposed edit names the check that would prove it.
- **Noise is not a pass.** A probabilistic target, such as a rate, a latency or a model score, states the band it must land in at four or more standard errors, and the sample size that gives it.
- **Checks only a person can run.** An acceptance check that needs a visible window, real credentials, paid services or a person's judgment says so in the acceptance line, so the build queue asks for it instead of claiming it.
