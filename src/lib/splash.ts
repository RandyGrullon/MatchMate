/** Quita la animación de apertura (index.html) cuando la app ya tiene la sesión, dejándola verse al menos 1,3 s. */
export function hideSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const wait = Math.max(0, 1300 - performance.now());
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  }, wait);
}
