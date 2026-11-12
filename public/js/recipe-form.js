// Add Recipe / Edit Recipe form: add and remove ingredient rows (unit filtering is in unit-filter.js)
(() => {
  const rows = document.getElementById("ingredient-rows");
  const template = document.getElementById("ingredient-row-template");
  const addButton = document.getElementById("add-ingredient");
  if (!rows || !template || !addButton) return;

  // New rows get numbers after the existing ones; gaps from removed rows are fine
  let nextIndex = rows.querySelectorAll(".ingredient-row").length;

  function addRow() {
    rows.insertAdjacentHTML("beforeend", template.innerHTML.replaceAll("__INDEX__", String(nextIndex++)));
    rows.lastElementChild.querySelector(".ingredient-name").focus();
  }

  rows.addEventListener("click", (event) => {
    const button = event.target.closest(".remove-ingredient");
    if (!button) return;
    button.closest(".ingredient-row").remove();
    if (!rows.querySelector(".ingredient-row")) addRow(); // always keep one row
  });

  addButton.addEventListener("click", addRow);
})();
