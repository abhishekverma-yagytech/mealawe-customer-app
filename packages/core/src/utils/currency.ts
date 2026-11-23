/**
 * ₹-prefixed amount with Indian digit grouping — e.g. `135` → `"₹135"`,
 * `1234.5` → `"₹1,234.50"`. Decimals are shown only when the amount actually
 * has a fractional part, so a whole-rupee price never carries a redundant
 * ".00". The one money format for every price shown in the app.
 */
export function formatINR(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const hasFraction = rounded % 1 !== 0;
  return `₹${rounded.toLocaleString('en-IN', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
