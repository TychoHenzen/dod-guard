// Refuses to run the merge helper outside a checkout of the pull request's repository.
import { stop } from "./completion-error.mjs";

// github.com must be the host: after the scheme and optional credentials (URL forms),
// or after an optional user (scp form).
const URL_HOST = String.raw`(?:https?|ssh|git):\/\/(?:[^/\s]*@)?github\.com(?::\d+)?\/`;
const SCP_HOST = String.raw`(?:[^/@\s]+@)?github\.com:`;
const GITHUB_REMOTE = new RegExp(String.raw`^(?:${URL_HOST}|${SCP_HOST})([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$`, "i");

function remoteRepository(url) {
  const match = GITHUB_REMOTE.exec(url.trim());
  if (!match) {
    return null;
  }
  return `${match[1]}/${match[2]}`.toLowerCase();
}

function requireRepositoryCheckout(repository, localGit, directory) {
  const recovery = [
    `Run the helper from a checkout of ${repository}, or pass --repo-dir <that checkout>.`,
    "Nothing on GitHub was changed.",
  ].join(" ");
  const origin = localGit.originUrl();
  if (origin === null) {
    stop("not_a_checkout", `${directory} is not a git checkout with an origin remote.`, recovery);
  }
  const found = remoteRepository(origin);
  if (found !== repository.toLowerCase()) {
    // The raw URL is never printed: an origin can embed a credential.
    const named = found ?? "not a github.com repository";
    stop("wrong_checkout", `The origin of ${directory} is ${named}, not ${repository}.`, recovery);
  }
}

export { requireRepositoryCheckout };
