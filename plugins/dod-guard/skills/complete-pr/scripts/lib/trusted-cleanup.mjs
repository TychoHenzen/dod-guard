import { stop } from "./completion-error.mjs";

async function inspectTrustedBranch(client, branchName, trustedHead) {
  const branch = await client.getBranchRef(branchName);
  if (branch !== null && branch.sha !== trustedHead) {
    stop(
      "branch_ref_changed",
      `Remote branch ${branchName} points to ${branch.sha}, not merged head ${trustedHead}; it was not deleted.`,
    );
  }
  return branch;
}

async function deleteTrustedBranch(client, branchName, trustedHead) {
  const branch = await inspectTrustedBranch(client, branchName, trustedHead);
  if (branch === null) {
    return "already_absent";
  }
  await client.deleteBranchRef(branchName);
  if ((await client.getBranchRef(branchName)) !== null) {
    stop("branch_delete_unconfirmed", `Remote branch ${branchName} still exists after deletion.`);
  }
  return "deleted";
}

async function cleanupTrustedBranch(client, cleanup) {
  const { branchName, defaultBranch, dryRun = false, localGit, trustedHead } = cleanup;
  if (dryRun) {
    const branch = await inspectTrustedBranch(client, branchName, trustedHead);
    let remote = "would_delete";
    if (branch === null) {
      remote = "already_absent";
    }
    return {
      branch: remote,
      local: localGit?.cleanupBranch(branchName, defaultBranch, { dryRun }) ?? null,
    };
  }
  return {
    branch: await deleteTrustedBranch(client, branchName, trustedHead),
    local: localGit?.cleanupBranch(branchName, defaultBranch, { dryRun }) ?? null,
  };
}

export { cleanupTrustedBranch };
