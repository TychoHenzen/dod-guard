## REMOVED Requirements

### Requirement: steps subcommand writes the change's plan
**Reason**: The `dod-guard steps` CLI command is deleted. The step-by-step skill resolves verify_cmd at startup from the cover report, directly from tasks.md annotations.
**Migration**: Skills that ran `dod-guard steps` to generate steps.json stop doing so. The cover lookup moves into the skill's startup.

### Requirement: a task binds to a scenario through an annotation
**Reason**: The annotation format (`<!-- covers: -->`) stays. The requirement is removed from this spec because the steps-generation capability is deleted. The annotation parsing moves to the step-by-step skill's startup.
**Migration**: No change to annotation format. Parsing responsibility moves from `steps-cli.ts` to the skill's startup logic.

### Requirement: a task item becomes a verified step
**Reason**: Deleted with the steps-generation capability.
**Migration**: The skill resolves verify_cmd at startup instead.

### Requirement: an unbound task becomes a manual step
**Reason**: Deleted with the steps-generation capability.
**Migration**: The skill treats unannotated tasks as manual_required at startup.

### Requirement: fields a machine cannot know are left for judgment
**Reason**: Deleted with the steps-generation capability.
**Migration**: The skill determines verify_surface and files from the task context at startup.

### Requirement: exit codes match the cover subcommand
**Reason**: Deleted with the steps-generation capability.
**Migration**: No CLI command, no exit codes.
