// A fake gh holding one issue's comments. Each call is recorded so a case can assert the exact write.
// dropWrites makes every write succeed without landing, as a lost update would.

const READ = { status: 0, stdout: "", stderr: "" };

function fakeGh(initial = [], { dropWrites = false } = {}) {
  const comments = [...initial];
  const calls = [];
  const writes = {
    POST(args) {
      const body = args[args.indexOf("-f") + 1].replace(/^body=/u, "");
      comments.push({ id: 500 + comments.length, body, author_association: "OWNER" });
    },
    DELETE(args) {
      const id = Number(args.at(-1).split("/").at(-1));
      comments.splice(
        comments.findIndex((comment) => comment.id === id),
        1,
      );
    },
  };
  const run = (args) => {
    calls.push(args);
    if (args.includes("--paginate")) return { ...READ, stdout: JSON.stringify([comments]) };
    const method = Object.keys(writes).find((name) => args.includes(name));
    if (method && !dropWrites) writes[method](args);
    return READ;
  };
  return { run, calls, comments };
}

export { fakeGh };
