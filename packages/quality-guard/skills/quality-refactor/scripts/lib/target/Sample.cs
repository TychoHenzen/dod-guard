// quality-guard: off -- fixture with deliberate violations. See README.md.
// Pins C#-specific scanner behavior: raw strings, interpolation, auto
// properties, and a namespace block. Never "fix" the violations here.
namespace Fixtures.Sample
{
    public class Invoice
    {
        public string Customer { get; set; }
        public decimal Total { get; private set; }

        public Invoice(string customer, decimal total)
        {
            Customer = customer;
            Total = total;
        }

        // Reads Customer and Total, both auto-implemented properties.
        // Pins CS_PROPERTY_DECL detection: this must never be flagged
        // stateless-method.
        public string Summarize()
        {
            return $"Invoice for {Customer}: {Total:C}";
        }

        // Never touches instance state -- pins stateless-method detection
        // on a static method.
        public static string Greet(string name)
        {
            return $"Hello, {name}!";
        }

        public string Banner()
        {
            return """
                ==========
                RECEIPT
                ==========
                """;
        }

        // Deliberate else branch.
        public string Grade(int score)
        {
            if (score >= 90)
            {
                return "A";
            }
            else
            {
                return "B or lower";
            }
        }
    }
}
