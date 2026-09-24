// biome-ignore lint/correctness/noNodejsModules: This adapter invokes the local Git CLI from Node.
import { spawnSync } from "node:child_process";

function runGit(args, acceptedExitCodes = [0]) {
  const result = spawnSync("git", args, { encoding: "utf8", windowsHide: true });
  if (result.error) {
    throw result.error;
  }
  if (!acceptedExitCodes.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || `git exited with ${result.status}`;
    throw new Error(detail);
  }
  return result;
}

export class LocalGit {
  #commandRunner;

  constructor(commandRunner = runGit) {
    this.#commandRunner = commandRunner;
  }

  #run(args, acceptedExitCodes = [0]) {
    return this.#commandRunner(args, acceptedExitCodes);
  }

  #tryRun(args) {
    try {
      this.#run(args);
      return null;
    } catch (error) {
      return error.message;
    }
  }

  #currentCheckoutIsDirty() {
    const root = this.#run(["rev-parse", "--show-toplevel"]).stdout.trim();
    return this.#run(["-C", root, "status", "--porcelain"]).stdout.trim().length > 0;
  }

  #moveCurrentCheckoutToDefault(branchName, defaultBranch) {
    if (this.#tryRun(["fetch", "--no-tags", "origin", defaultBranch])) {
      return { branch: "switch_refused", currentCheckout: "unchanged" };
    }
    const fastForward = this.#run(["merge-base", "--is-ancestor", defaultBranch, `origin/${defaultBranch}`], [0, 1]);
    if (fastForward.status !== 0) {
      return { branch: "switch_refused", currentCheckout: "unchanged" };
    }
    if (this.#tryRun(["switch", defaultBranch])) {
      return { branch: "switch_refused", currentCheckout: "unchanged" };
    }
    if (!this.#tryRun(["merge", "--ff-only", `origin/${defaultBranch}`])) {
      return { branch: null, currentCheckout: "switched_to_default" };
    }
    const restoreFailure = this.#tryRun(["switch", branchName]);
    let currentCheckout = "unchanged";
    if (restoreFailure) {
      currentCheckout = "switched_to_default";
    }
    return { branch: "switch_refused", currentCheckout };
  }

  #deleteBranch(branchName) {
    const failure = this.#tryRun(["branch", "-d", "--", branchName]);
    if (this.hasLocalBranch(branchName)) {
      return "delete_refused";
    }
    if (failure) {
      return "already_absent";
    }
    return "deleted";
  }

  currentBranch() {
    return this.#run(["branch", "--show-current"]).stdout.trim();
  }

  hasLocalBranch(branchName) {
    return this.#run(["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], [0, 1]).status === 0;
  }

  cleanupBranch(branchName, defaultBranch, { dryRun = false } = {}) {
    const currentBranch = this.currentBranch();
    if (!this.hasLocalBranch(branchName)) {
      return { branch: "already_absent", currentCheckout: "unchanged" };
    }
    if (branchName === defaultBranch) {
      return { branch: "delete_refused", currentCheckout: "unchanged" };
    }

    let currentCheckout = "unchanged";
    if (currentBranch === branchName) {
      if (this.#currentCheckoutIsDirty()) {
        return { branch: "retained_dirty", currentCheckout };
      }
      if (dryRun) {
        return { branch: "would_delete", currentCheckout: "would_switch_to_default" };
      }
      const { branch: movedBranch, currentCheckout: movedCheckout } = this.#moveCurrentCheckoutToDefault(
        branchName,
        defaultBranch,
      );
      if (movedBranch) {
        return { branch: movedBranch, currentCheckout: movedCheckout };
      }
      currentCheckout = movedCheckout;
    } else if (dryRun) {
      return { branch: "would_delete", currentCheckout };
    }

    return { branch: this.#deleteBranch(branchName), currentCheckout };
  }
}
