// Folio Publisher — renderer entry point.
import './styles/app.css';
import { app } from './core/app.js';
import { buildShell } from './core/shell/index.js';
import './features/index.js';
import { startPersistence } from './core/persistence/index.js';
import { TEMPLATES } from './engines/templates/catalog.js';
import { layoutStories } from './engines/text/flow.js';
import { fitTemplateText } from './features/templates/gallery.js';

function boot() {
  buildShell();
  startPersistence();
  if (!app.session && app.ui.backstage) app.ui.backstage.open('new');
  window.folioApp = app;
  window.folioDiagnostics = { templates: TEMPLATES, layoutStories, fitTemplateText };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
