// quality-guard: off -- fixture with deliberate violations. See README.md.
// Pins C++-specific scanner behavior: a private field under an access
// specifier section, an instance method that reads it, a static method,
// and an else branch. Never "fix" the violations here.
#include <string>

class Ledger {
private:
    int balance;

public:
    explicit Ledger(int balance) : balance(balance) {}

    // Reads balance, declared under the `private:` access-specifier
    // section above. Pins CPP_FIELD_DECL detection: this must never be
    // flagged stateless-method.
    std::string summarize() {
        return balance >= 0 ? "positive" : "negative";
    }

    // Never touches instance state -- pins stateless-method detection on
    // a static method.
    static std::string greet(const std::string& name) {
        return "Hello, " + name + "!";
    }

    // Deliberate else branch.
    std::string grade(int score) {
        if (score >= 90) {
            return "A";
        } else {
            return "B or lower";
        }
    }
};
