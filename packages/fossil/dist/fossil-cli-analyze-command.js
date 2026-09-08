export function addAnalyzeCommand(program, action) {
    program
        .command("analyze [repo-path]")
        .option("--days <days>")
        .option("--gap-hours <hours>")
        .option("--threshold <threshold>")
        .option("--format <format>")
        .option("--extensions <extensions>")
        .option("--untracked-age <days>")
        .option("--exclude <patterns>")
        .option("--verbose")
        .action(action);
}
//# sourceMappingURL=fossil-cli-analyze-command.js.map