## dod-guard build standards

- **"Pre-existing" is a false blocker.** A stop that leaves a failing check in a path the change touches, or in a required suite, because the failure is older than the change, continues. The brief cites the Tests section of the project's `engineering.md`.
- **A weakened test is not done.** A round whose checks pass only because a test was deleted, skipped or loosened continues, with that test named in the brief.
- **Unreachable is not done.** A round whose new behavior no user entrypoint reaches, or whose user-facing control no test drives, continues, citing the Done means reachable section of `engineering.md`.
