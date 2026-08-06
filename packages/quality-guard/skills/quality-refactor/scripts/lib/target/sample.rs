// quality-guard: off -- fixture with deliberate violations. See README.md.
//! Pins Rust-specific scanner behavior: lifetimes, impl blocks, cfg(test)
//! regions, format captures, and match arms. Never "fix" the violations here.

/// Wraps a borrowed label. Exercises a lifetime parameter on both the
/// struct and its impl block.
pub struct Wrapper<'a> {
    label: &'a str,
    count: u32,
}

impl<'a> Wrapper<'a> {
    pub fn new(label: &'a str, count: u32) -> Self {
        Wrapper { label, count }
    }

    /// Touches self.count -- must not be flagged stateless-method.
    pub fn describe(&self) -> String {
        match self.count {
            0 => format!("{} has none", self.label),
            1 => format!("{} has one", self.label),
            n if n < 10 => format!("{} has a few: {n}"),
            _ => format!("{} has many", self.label),
        }
    }

    /// Never touches self -- pins stateless-method detection on an
    /// associated function with a receiver-free signature.
    pub fn shout(word: &str) -> String {
        let emphasis: char = '!';
        format!("{word}{emphasis}{emphasis}{emphasis}")
    }
}

/// Deliberate else branch, to pin else-branch detection.
pub fn classify(n: i32) -> &'static str {
    if n < 0 {
        "negative"
    } else {
        "non-negative"
    }
}

// Never `pub`, never called by name -- but the plain-string quirk below
// (see `notes`) keeps it looking referenced. Interpolation identifiers are
// collected from every Rust double-quoted string, not only from a
// format!/println! argument, so an ordinary string with a brace pair
// contributes the identifier inside it as a reference. That can only hide
// a dead symbol, never invent a violation -- pinned here, not "fixed".
fn phantom() -> u32 {
    42
}

pub fn notes() -> &'static str {
    "plain { phantom } here"
}

// TODO: revisit rounding once the spec settles.
pub fn round_up(x: f64) -> f64 {
    if x.is_nan() {
        return 0.0;
    }
    x.ceil()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrapper_describes_zero() {
        let w = Wrapper::new("cats", 0);
        assert_eq!(w.describe(), "cats has none");
    }
}
