export type FocusContent = {
  body?: string;
  declaration?: string;
  visible_symbols?: readonly {
    name: string;
    symbol_id: string;
  }[];
};
