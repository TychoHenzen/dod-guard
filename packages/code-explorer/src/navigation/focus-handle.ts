export type FocusHandle = {
  handle: string;
  name: string;
  symbol_id: string;
  start: number;
  end: number;
  out_of_range: boolean;
  relations: readonly string[];
};
