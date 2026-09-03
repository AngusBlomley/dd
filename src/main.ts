import { bootCampaign, initAutosave, onSaveStatus } from './campaign';
import { requestRender } from './render/canvas';
import { initCampaignModal, initMapsPanel, renderMapList } from './ui/campaignPanel';
import { initInteraction, initZoomAndViews } from './ui/interaction';
import { initGeneratorPanel, initLayersPanel, initMapSettings } from './ui/panels';
import { setSaveStatus, setStatus } from './ui/status';
import { initSessionPanel } from './ui/sessionPanel';
import { initBrushButtons, initSwatches, initTabs } from './ui/swatches';
import { initTokenForm, renderInspector, renderTokenList } from './ui/tokens';

async function main(): Promise<void> {
  initSwatches();
  initTabs();
  initBrushButtons();
  initTokenForm();
  initInteraction();
  initZoomAndViews();
  initGeneratorPanel();
  initMapSettings();
  initLayersPanel();
  initMapsPanel();
  initCampaignModal();
  initSessionPanel();

  onSaveStatus(setSaveStatus);
  await bootCampaign();
  initAutosave();

  renderMapList();
  setStatus();
  renderTokenList();
  renderInspector();
  requestRender();
  setSaveStatus('saved');
}

const joinMatch = /^#\/join(?:\/([A-Za-z0-9]+))?/.exec(location.hash);
if (joinMatch) {
  void import('./player/app').then(m => m.startPlayerApp(joinMatch[1] ? joinMatch[1].toUpperCase() : null));
} else {
  void main();
}
