'use strict';
/* ===== Pestañas de herramientas =====
   Para añadir una herramienta: un botón role="tab" con id "tab-<id>" y un panel con id "panel-<id>" en el HTML.
   El enlace #<id> abre directamente esa herramienta. */
(function () {
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
  const idOf = t => t.id.replace(/^tab-/, '');
  function show(id, focus) {
    const tab = tabs.find(t => idOf(t) === id) || tabs[0], cur = idOf(tab);
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      document.getElementById('panel-' + idOf(t)).hidden = !on;
    });
    if (focus) tab.focus();
    window.dispatchEvent(new Event('resize'));
  }
  tabs.forEach(t => {
    t.addEventListener('click', () => { if (location.hash !== '#' + idOf(t)) location.hash = idOf(t); else show(idOf(t)); });
    t.addEventListener('keydown', e => {
      const i = tabs.indexOf(t); let j = -1;
      if (e.key === 'ArrowRight') j = (i + 1) % tabs.length; else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = tabs.length - 1; else return;
      e.preventDefault(); location.hash = idOf(tabs[j]); tabs[j].focus();
    });
  });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1));
})();
