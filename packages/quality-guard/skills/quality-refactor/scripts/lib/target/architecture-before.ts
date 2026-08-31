// quality-guard: off -- architecture parser before fixture.
export class InvoiceService {
  private total = 0;

  summarize() {
    return this.total.toString();
  }
}
