// quality-guard: off -- fixture with deliberate violations. See README.md.
// Pins Java-specific scanner behavior: a field declaration, an instance
// method that reads it, a static method, and a ternary decision point.
// Never "fix" the violations here.
package sample;

public class Ledger {
    private int balance;

    public Ledger(int balance) {
        this.balance = balance;
    }

    // Touches balance -- must not be flagged stateless-method.
    public String summarize() {
        return balance >= 0 ? "positive" : "negative";
    }

    // Never touches instance state -- pins stateless-method detection on
    // a static method (isStatic must keep this quiet).
    public static String greet(String name) {
        return "Hello, " + name + "!";
    }

    // Deliberate else branch.
    public String grade(int score) {
        if (score >= 90) {
            return "A";
        } else {
            return "B or lower";
        }
    }
}
