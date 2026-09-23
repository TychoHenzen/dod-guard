import process from "node:process";

export function npmCommand(args) {
  if (process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath, ...args], shell: false };
  }
  return { command: "npm", args, shell: process.platform === "win32" };
}
