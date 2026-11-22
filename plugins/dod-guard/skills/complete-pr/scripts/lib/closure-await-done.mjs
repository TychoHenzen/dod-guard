// Judges a delivery as if every readable Project item already read Done. A run that stopped
// before the Done write leaves that one condition unmet, and it must not hide the rest.
import { indexSnapshot, itemStatus } from "../../../../lib/closure-index.mjs";
import { judgeDelivery } from "./closure-delivery.mjs";

function markDone(item) {
  const field = (item.fields ?? []).find(({ name }) => name === "Status");
  if (field && itemStatus(item) !== null) field.value = { name: "Done" };
}

function createOnceDone(snapshot) {
  let index = null;
  return (number) => {
    if (index === null) {
      const copy = structuredClone(snapshot);
      for (const item of copy.items ?? []) markDone(item);
      index = indexSnapshot(copy);
    }
    return judgeDelivery(index, number);
  };
}

export { createOnceDone };
