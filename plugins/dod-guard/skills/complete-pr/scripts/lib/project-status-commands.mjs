const PROJECT_PAGE_SIZE = 100;

function buildProjectViewCommand(owner, projectNumber) {
  return ["api", `users/${owner}/projectsV2/${projectNumber}`];
}

function buildProjectFieldsCommand(owner, projectNumber) {
  return [
    "api",
    "--paginate",
    "--slurp",
    `users/${owner}/projectsV2/${projectNumber}/fields?per_page=${PROJECT_PAGE_SIZE}`,
  ];
}

function buildProjectItemListCommand(owner, projectNumber, statusFieldId) {
  const fields = statusFieldId === undefined ? "" : `&fields=${statusFieldId}`;
  return [
    "api",
    "--paginate",
    "--slurp",
    `users/${owner}/projectsV2/${projectNumber}/items?per_page=${PROJECT_PAGE_SIZE}${fields}`,
  ];
}

function buildProjectItemReadCommand(target) {
  const { owner, projectNumber, itemId, statusFieldId } = target;
  const item = `users/${owner}/projectsV2/${projectNumber}/items/${itemId}`;
  return ["api", `${item}?fields=${statusFieldId}`];
}

function buildProjectItemEditCommand({ owner, projectNumber, itemId, statusFieldId, statusOptionId }) {
  return [
    "api",
    "--method",
    "PATCH",
    `users/${owner}/projectsV2/${projectNumber}/items/${itemId}`,
    "-F",
    `fields[][id]=${statusFieldId}`,
    "-f",
    `fields[][value]=${statusOptionId}`,
  ];
}

export {
  buildProjectFieldsCommand,
  buildProjectItemEditCommand,
  buildProjectItemListCommand,
  buildProjectItemReadCommand,
  buildProjectViewCommand,
};
