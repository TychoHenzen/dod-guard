// Git and reviewer output may use Windows separators; changed-line keys use "/".
function slashPath(path) {
  return String(path).replaceAll("\\", "/");
}

export { slashPath };
