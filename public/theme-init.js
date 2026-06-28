var saved = localStorage.getItem('theme');
if (saved === 'dark' || !saved) {
  document.documentElement.classList.add('dark');
}
