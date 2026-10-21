export const PROJECT_STATUS_FIELD_ID = 407;

export function linkedProjectItem(id, number = 24, repository = "owner/repo") {
  return {
    id,
    node_id: `PVTI_item-${id}`,
    content: {
      number,
      repository: { full_name: repository },
      repository_url: `https://api.github.com/repos/${repository}`,
    },
  };
}

function statusField(status) {
  return {
    id: PROJECT_STATUS_FIELD_ID,
    name: "Status",
    value: { name: { raw: status } },
  };
}

export function projectStatusResponse(status, id = 1701) {
  return { ...linkedProjectItem(id), fields: [statusField(status)] };
}

export function projectItemIdentity(item) {
  return {
    id: item.id,
    node_id: item.node_id,
    content_type: item.content_type,
    content: {
      number: item.content?.number,
      repository: {
        full_name: item.content?.repository?.full_name,
        fullName: item.content?.repository?.fullName,
      },
      repository_url: item.content?.repository_url,
    },
  };
}
