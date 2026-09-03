import { bootCampaign, initAutosave, onSaveStatus } from './campaign';
import { requestRender } from './render/canvas';
import { initCampaignModal, initMapsPanel, renderMapList } from './ui/campaignPanel';
import { initInteraction, initZoomAndViews } from './ui/interaction';
import { initGeneratorPanel, initLayersPanel, initMapSettings } from './ui/panels';
import { setSaveStatus, setStatus } from './ui/status';
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

void main();
