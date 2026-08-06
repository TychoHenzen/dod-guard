// quality-guard: off -- fixture with deliberate violations. See README.md.
// Pins Go-specific scanner behavior: keyword-anchored function detection
// (a call before a brace in an if/for/select must not read as a func),
// a method receiver, and a select statement. Never "fix" the violations
// here.
package sample

import "fmt"

// Counter tracks a running total.
type Counter struct {
	Label string
	Total int
}

// Add is a method with a receiver. The receiver must never be counted as
// a parameter.
func (c *Counter) Add(n int) {
	c.Total += n
}

// Report calls a method before an open brace -- a case the keyword
// anchor (the `func` keyword itself) must not mistake for a nested
// function declaration.
func Report(c *Counter, ready chan bool) string {
	if c.exists() {
		return fmt.Sprintf("%s: %d", c.Label, c.Total)
	} else {
		return "no counter"
	}
}

func (c *Counter) exists() bool {
	return c.Label != ""
}

// TODO: add a timeout to the select below.
func Wait(done chan bool, cancel chan bool) string {
	select {
	case <-done:
		return "done"
	case <-cancel:
		return "cancelled"
	}
}
