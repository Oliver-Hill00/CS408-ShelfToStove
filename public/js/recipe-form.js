// Add Recipe / Edit Recipe form: add and remove ingredient rows, filter units to the ingredient
(() => {
  const rows = document.getElementById("ingredient-rows");
  const template = document.getElementById("ingredient-row-template");
  const addButton = document.getElementById("add-ingredient");
  if (!rows || !template || !addButton) return;

  // Known ingredient name (lowercase) -> measure type, read from the autocomplete list
  const measureOf = new Map(
    [...document.querySelectorAll("#ingredient-names option")].map((option) => [
      option.value.toLowerCase(),
      option.dataset.measure,
    ])
  );

  // New rows get numbers after the existing ones; gaps from removed rows are fine
  let nextIndex = rows.querySelectorAll(".ingredient-row").length;

  // A known ingredient only offers units of its measure type (cups for rice, lb for chicken).
  // A new ingredient offers every unit, and the unit picked sets its measure type.
  function filterUnits(row) {
    const name = row.querySelector(".ingredient-name").value.trim().toLowerCase();
    const measure = measureOf.get(name);
    const select = row.querySelector(".ingredient-unit");
    for (const group of select.querySelectorAll("optgroup")) {
      const allowed = !measure || group.dataset.measure === measure;
      group.hidden = !allowed;
      group.disabled = !allowed;
    }
    if (select.selectedOptions[0]?.closest("optgroup")?.disabled) select.value = "";
  }

  function addRow() {
    rows.insertAdjacentHTML("beforeend", template.innerHTML.replaceAll("__INDEX__", String(nextIndex++)));
    rows.lastElementChild.querySelector(".ingredient-name").focus();
  }

  rows.addEventListener("input", (event) => {
    if (event.target.classList.contains("ingredient-name")) filterUnits(event.target.closest(".ingredient-row"));
  });

  rows.addEventListener("click", (event) => {
    const button = event.target.closest(".remove-ingredient");
    if (!button) return;
    button.closest(".ingredient-row").remove();
    if (!rows.querySelector(".ingredient-row")) addRow(); // always keep one row
  });

  addButton.addEventListener("click", addRow);
  rows.querySelectorAll(".ingredient-row").forEach(filterUnits);
})();
