function buildStopReport(error) {
  const report = {
    ok: false,
    code: error.code ?? "unknown",
    message: error.message,
  };
  if (error.recovery) {
    report.recovery = error.recovery;
  }
  return report;
}

export { buildStopReport };
