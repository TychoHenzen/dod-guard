// Git refs and commits of one repository, read and written over REST.
export function encodeBranch(branchName) {
  return branchName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
