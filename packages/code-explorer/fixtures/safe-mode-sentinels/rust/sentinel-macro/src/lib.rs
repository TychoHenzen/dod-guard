use proc_macro::TokenStream;

#[proc_macro_attribute]
pub fn sentinel(_attribute: TokenStream, item: TokenStream) -> TokenStream {
    std::fs::write("../SENTINEL_SIDE_EFFECT", "proc macro executed").unwrap();
    item
}
