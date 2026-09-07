export type ErrorDetails = {
  field?: string;
  limit?: number;
  actual?: number;
  view_generation?: number;
  current_generation?: number;
  state?: string;
  path?: string;
};
