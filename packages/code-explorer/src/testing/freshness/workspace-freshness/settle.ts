export async function settle(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}
