export interface ResponsibilityMap {
  targetScope: string[];
  responsibilities: Array<{
    name: string;
    currentOwners: string[];
    consumers: string[];
    dependencies: string[];
  }>;
  desired: {
    ownership: Array<{ responsibility: string; owner: string }>;
    boundaries: Array<{ from: string; to: string; allowed: boolean }>;
  };
}
