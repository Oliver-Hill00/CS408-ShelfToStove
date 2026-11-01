// Display helpers for quantities, units, and dates

const FRACTIONS = { 0.25: "¼", 0.5: "½", 0.75: "¾" };

// 1.5 -> "1½", 0.25 -> "¼", 2 -> "2", 0.333333 -> "0.33"
function formatQuantity(quantity) {
  const whole = Math.floor(quantity);
  const fraction = FRACTIONS[quantity - whole];
  if (fraction) return `${whole || ""}${fraction}`;
  return String(Math.round(quantity * 100) / 100);
}

function pluralize(name) {
  if (name.endsWith("s")) return name;
  return name.endsWith("o") ? `${name}es` : `${name}s`;
}

// Used for pantry amounts: "2 cups", "1 lb", "8"
function formatAmount(quantity, unit) {
  if (quantity === null || quantity === undefined) return "";
  const amount = formatQuantity(quantity);
  if (unit === "each") return amount;
  return `${amount} ${unit === "cup" && quantity > 1 ? "cups" : unit}`;
}

// Used for recipe lines: "3 cups cooked rice", "2 carrots"
function formatIngredient(quantity, unit, name) {
  if (unit === "each") {
    return `${formatQuantity(quantity)} ${quantity > 1 ? pluralize(name) : name}`;
  }
  return `${formatAmount(quantity, unit)} ${name}`;
}

// "2026-10-02" -> "10/02/2026"
function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
}

module.exports = { formatQuantity, formatAmount, formatIngredient, formatDate };
