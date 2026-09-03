import { requestRender } from './render/canvas';
import { initInteraction, initZoomAndViews } from './ui/interaction';
import { initGeneratorPanel, initMapSettings } from './ui/panels';
import { initSaveLoad } from './ui/saveLoad';
import { setStatus } from './ui/status';
import { initBrushButtons, initSwatches, initTabs } from './ui/swatches';
import { initTokenForm, renderInspector, renderTokenList } from './ui/tokens';

initSwatches();
initTabs();
initBrushButtons();
initTokenForm();
initInteraction();
initZoomAndViews();
initGeneratorPanel();
initMapSettings();
initSaveLoad();

setStatus();
renderTokenList();
renderInspector();
requestRender();
