// Unit dropdowns only offer units that fit the ingredient typed beside them (cups for rice, lb for chicken).
// Applies to any .ingredient-row that holds an .ingredient-name and an .ingredient-unit.
// A new ingredient offers every unit, and the unit picked sets its measure type.
(() => {
  let measureOf;

  function filterUnits(row) {
    const nameInput = row.querySelector(".ingredient-name");
    const select = row.querySelector(".ingredient-unit");
    if (!nameInput || !select) return;

    // Known ingredient name (lowercase) -> measure type, read from the autocomplete list
    measureOf ??= new Map(
      [...document.querySelectorAll("#ingredient-names option")].map((option) => [
        option.value.toLowerCase(),
        option.dataset.measure,
      ])
    );

    const measure = measureOf.get(nameInput.value.trim().toLowerCase());
    for (const group of select.querySelectorAll("optgroup")) {
      const allowed = !measure || group.dataset.measure === measure;
      group.hidden = !allowed;
      group.disabled = !allowed;
    }
    if (select.selectedOptions[0]?.closest("optgroup")?.disabled) select.value = "";
  }

  document.addEventListener("input", (event) => {
    if (!event.target.classList?.contains("ingredient-name")) return;
    const row = event.target.closest(".ingredient-row");
    if (row) filterUnits(row);
  });

  document.querySelectorAll(".ingredient-row").forEach(filterUnits);
})();
