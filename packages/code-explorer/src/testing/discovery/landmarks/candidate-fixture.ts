import { type LandmarkCandidate } from "../../../discovery/landmarks.js";
export function candidate(name: string, kind: string): LandmarkCandidate {
  return {
    symbol: { symbol_id: name, name, path: `src/${name}.ts`, kind },
    references: [{ path: `app/${name}.ts`, content: "production" }],
  };
}
