// What Can I Cook?: show the slider's value while it moves
(() => {
  const slider = document.getElementById("min-match");
  const output = document.getElementById("min-match-value");
  if (!slider || !output) return;

  const show = () => {
    output.textContent = `${slider.value}%`;
  };
  slider.addEventListener("input", show);
  show(); // the browser may restore an old slider position when you press Back
})();
