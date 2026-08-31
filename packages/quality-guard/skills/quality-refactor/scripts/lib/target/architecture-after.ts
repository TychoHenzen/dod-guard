// quality-guard: off -- architecture parser after fixture.
import { TaxCalculator } from "./tax-calculator";

export class InvoiceService {
  private total = 0;
  private calculator = new TaxCalculator();

  summarize() {
    return this.total.toString();
  }

  public calculateTax() {
    return this.calculator.for(this.total);
  }
}
