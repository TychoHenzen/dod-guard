// Git state capture for full (unscoped) checks. Failure means "not a repo",
// not "check failed". The caller keeps going with is_git_repo: false.
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execP = promisify(exec);

export interface VcsState {
  is_git_repo: boolean;
  checked_commit?: string;
  checked_dirty?: boolean;
}

export async function captureVcsState(cwd: string): Promise<VcsState> {
  try {
    const commit = await execP("git rev-parse HEAD", { cwd });
    const status = await execP("git status --porcelain", { cwd });
    return {
      is_git_repo: true,
      checked_commit: commit.stdout.trim(),
      checked_dirty: status.stdout.trim().length > 0,
    };
  } catch {
    return { is_git_repo: false };
  }
}
