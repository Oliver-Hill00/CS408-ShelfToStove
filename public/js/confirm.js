// Any form with data-confirm="..." asks before submitting (used by the Delete buttons)
document.addEventListener("submit", (event) => {
  const message = event.target.dataset?.confirm;
  if (message && !window.confirm(message)) event.preventDefault();
});
