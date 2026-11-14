// Runs before first paint so the page never flashes the wrong theme or direction.
(function () {
  try {
    var root = document.documentElement;
    var theme = localStorage.getItem('tessera.theme');
    var dark =
      theme === 'dark' || ((!theme || theme === 'system') && matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    var locale = localStorage.getItem('tessera.locale');
    if (locale) {
      root.lang = locale;
      root.dir = locale === 'ar' ? 'rtl' : 'ltr';
    }
  } catch (e) {
    /* storage unavailable: defaults apply */
  }
})();
