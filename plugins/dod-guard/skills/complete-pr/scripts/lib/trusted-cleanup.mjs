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
  let deleteError;
  try {
    await client.deleteBranchRef(branchName);
  } catch (error) {
    deleteError = error;
  }
  const remaining = await client.getBranchRef(branchName);
  if (remaining === null) {
    return "deleted";
  }
  if (remaining.sha !== trustedHead) {
    stop(
      "branch_ref_changed",
      `Remote branch ${branchName} points to ${remaining.sha}, not merged head ${trustedHead}; it was not deleted.`,
    );
  }
  if (deleteError) {
    throw deleteError;
  }
  stop("branch_delete_unconfirmed", `Remote branch ${branchName} still exists after deletion.`);
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
