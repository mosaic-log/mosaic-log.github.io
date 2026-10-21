// 조각로그 UI · 보관함·테마·프리셋·크레딧
// 생성 함수만 등록하며, 실행 상태와 기능 연결은 ui.js에서 구성한다.
globalThis.MosaicUIParts.library = (() => {
'use strict';

function createCredit(host){


let creditDragIndex = null;

let creditDropMarker = null;

function clearCreditDragUi(){
  document.querySelectorAll('#creditEditorList .creditEditorRow').forEach(row => {
    row.classList.remove('isCreditDragging');
    row.removeAttribute('aria-grabbed');
  });
  if(creditDropMarker) creditDropMarker.remove();
  creditDropMarker = null;
  creditDragIndex = null;
}

function reorderCreditItem(from, insertionIndex){
  const items = creditItemsFromEditor();
  if(from < 0 || from >= items.length) return false;
  let target = Math.max(0, Math.min(items.length, insertionIndex));
  const [moved] = items.splice(from, 1);
  if(target > from) target--;
  if(target === from) return false;
  items.splice(target, 0, moved);
  MosaicUI.cards.snapshot();
  setStoredCreditItems(items, true);
  renderCreditItemsEditor();
  MosaicUI.feedback.undo('크레딧 항목 순서를 변경했습니다.');
  return true;
}

function finishCreditItemDrop(event){
  if(creditDragIndex === null || !creditDropMarker || !creditDropMarker.isConnected) return;
  event.preventDefault();
  event.stopPropagation();
  const list = document.getElementById('creditEditorList');
  const children = Array.from(list.children);
  const insertionIndex = children
    .slice(0, children.indexOf(creditDropMarker))
    .filter(child => child.classList && child.classList.contains('creditEditorRow'))
    .length;
  const from = creditDragIndex;
  clearCreditDragUi();
  reorderCreditItem(from, insertionIndex);
}

function creditItemsFromEditor(){
  return Array.from(document.querySelectorAll('#creditEditorList .creditEditorRow')).map(row => ({
    label:row.querySelector('.creditLabelInput').value,
    value:row.querySelector('.creditValueInput').value,
    url:row.querySelector('.creditUrlInput').value,
    dividerBefore:row.dataset.dividerBefore === 'true'
  }));
}

function storedCreditItems(){
  return MosaicState.normalizeCreditItems(document.getElementById('creditItems').value);
}

function setStoredCreditItems(items, dispatch){
  const field = document.getElementById('creditItems');
  field.value = JSON.stringify(MosaicState.normalizeCreditItems(items));
  if(dispatch) field.dispatchEvent(new Event('input', { bubbles:true }));
}

function syncCreditItemsField(){
  setStoredCreditItems(creditItemsFromEditor(), true);
}

function renderCreditItemsEditor(){
  const list = document.getElementById('creditEditorList');
  if(!list) return;
  const stored = storedCreditItems();
  const items = stored.length ? stored : [{ label:'', value:'', url:'', dividerBefore:false }];
  list.replaceChildren();
  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'creditEditorRow';
    row.dataset.creditIndex = String(index);
    row.dataset.dividerBefore = String(index > 0 && MosaicState.settingFlagOn(item.dividerBefore));

    const header = document.createElement('div');
    header.className = 'creditRowHeader';
    header.draggable = true;
    header.title = '헤더를 끌어서 크레딧 순서 변경';

    const rowTitle = document.createElement('span');
    rowTitle.className = 'creditRowTitle';
    rowTitle.textContent = `항목 ${index + 1}`;

    const label = document.createElement('input');
    label.type = 'text';
    label.id = `creditLabel${index}`;
    label.className = 'creditLabelInput';
    label.maxLength = 80;
    label.placeholder = '항목명 · 예: Model';
    label.setAttribute('aria-label', `크레딧 ${index + 1} 항목명`);
    label.value = item.label;

    const value = document.createElement('input');
    value.type = 'text';
    value.id = `creditValue${index}`;
    value.className = 'creditValueInput';
    value.maxLength = 500;
    value.placeholder = '내용';
    value.setAttribute('aria-label', `크레딧 ${index + 1} 내용`);
    value.value = item.value;

    const url = document.createElement('input');
    url.type = 'url';
    url.id = `creditUrl${index}`;
    url.className = 'creditUrlInput';
    url.maxLength = 8192;
    url.placeholder = '연결 URL · 선택';
    url.setAttribute('aria-label', `크레딧 ${index + 1} 링크`);
    url.value = item.url;

    const actions = document.createElement('div');
    actions.className = 'creditRowActions';
    const divider = document.createElement('button');
    divider.type = 'button';
    divider.className = 'creditDividerBtn uiButton';
    divider.textContent = '―';
    divider.title = index === 0 ? '첫 항목 위에는 구분선을 넣을 수 없습니다.' : '이 항목 위 구분선 표시 전환';
    divider.setAttribute('aria-label', `크레딧 ${index + 1} 위 구분선 표시 전환`);
    divider.setAttribute('aria-pressed', row.dataset.dividerBefore);
    divider.disabled = index === 0;
    const moveGroup = document.createElement('span');
    moveGroup.className = 'creditMoveGroup';
    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'itemMoveBtn uiButton';
    up.textContent = '↑';
    up.title = '항목을 위로';
    up.setAttribute('aria-label', `크레딧 ${index + 1} 위로 이동`);
    up.disabled = index === 0;
    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'itemMoveBtn uiButton';
    down.textContent = '↓';
    down.title = '항목을 아래로';
    down.setAttribute('aria-label', `크레딧 ${index + 1} 아래로 이동`);
    down.disabled = index === items.length - 1;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'creditDeleteBtn';
    remove.textContent = '×';
    remove.title = '항목 삭제';
    remove.setAttribute('aria-label', `크레딧 ${index + 1} 삭제`);
    moveGroup.append(up, down);
    actions.append(divider, moveGroup, remove);

    header.addEventListener('dragstart', event => {
      if(event.target.closest('button') || !document.getElementById('creditOn').checked){
        event.preventDefault();
        return;
      }
      creditDragIndex = index;
      creditDropMarker = document.createElement('div');
      creditDropMarker.className = 'creditDropMarker';
      creditDropMarker.setAttribute('aria-hidden', 'true');
      row.classList.add('isCreditDragging');
      row.setAttribute('aria-grabbed', 'true');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    });
    header.addEventListener('dragend', clearCreditDragUi);
    row.addEventListener('dragover', event => {
      if(creditDragIndex === null) return;
      // 끌던 항목으로 다시 돌아오면 앞서 가리키던 위치를 취소한다. 표시선이
      // 다른 자리에 남은 채 원래 항목에서 놓여 뜻밖의 순서 변경이 되는 것을 막는다.
      if(creditDragIndex === index){
        if(creditDropMarker && creditDropMarker.isConnected) creditDropMarker.remove();
        return;
      }
      event.preventDefault();
      if(event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      if(event.clientY >= rect.top + rect.height / 2) row.after(creditDropMarker);
      else row.before(creditDropMarker);
    });
    row.addEventListener('drop', finishCreditItemDrop);

    [label, value, url].forEach(input => input.addEventListener('input', syncCreditItemsField));
    url.addEventListener('change', () => {
      const normalized = MosaicState.normalizeProtocolRelativeUrl(url.value);
      if(url.value !== normalized) url.value = normalized;
      syncCreditItemsField();
    });
    up.addEventListener('click', () => moveCreditItem(index, -1));
    down.addEventListener('click', () => moveCreditItem(index, 1));
    divider.addEventListener('click', () => {
      if(index === 0) return;
      MosaicUI.cards.snapshot();
      const enabled = row.dataset.dividerBefore !== 'true';
      row.dataset.dividerBefore = String(enabled);
      divider.setAttribute('aria-pressed', String(enabled));
      syncCreditItemsField();
      MosaicUI.feedback.undo(`크레딧 ${index + 1} 위 구분선을 ${enabled ? '표시합니다.' : '숨겼습니다.'}`);
    });
    remove.addEventListener('click', () => deleteCreditItem(index));
    const fields = document.createElement('div');
    fields.className = 'creditRowFields';
    fields.append(label, value, url);
    header.append(rowTitle, actions);
    row.append(header, fields);
    list.appendChild(row);
  });
  MosaicUI.controls.syncCredit();
}

function addCreditItem(){
  const items = creditItemsFromEditor();
  if(items.length >= MosaicState.MAX_CREDIT_ITEMS){
    MosaicUI.feedback.notice(`크레딧은 최대 ${MosaicState.MAX_CREDIT_ITEMS}개까지 추가할 수 있습니다.`);
    return;
  }
  MosaicUI.cards.snapshot();
  items.push({ label:'', value:'', url:'', dividerBefore:false });
  setStoredCreditItems(items, true);
  renderCreditItemsEditor();
  const next = document.querySelector('#creditEditorList .creditEditorRow:last-child .creditLabelInput');
  if(next) next.focus();
  MosaicUI.feedback.undo('크레딧 항목을 추가했습니다.');
}

function moveCreditItem(index, delta){
  const items = creditItemsFromEditor();
  const target = index + delta;
  if(target < 0 || target >= items.length) return;
  MosaicUI.cards.snapshot();
  [items[index], items[target]] = [items[target], items[index]];
  setStoredCreditItems(items, true);
  renderCreditItemsEditor();
  MosaicUI.feedback.undo('크레딧 항목 순서를 변경했습니다.');
}

function deleteCreditItem(index){
  const items = creditItemsFromEditor();
  if(index < 0 || index >= items.length) return;
  MosaicUI.cards.snapshot();
  items.splice(index, 1);
  setStoredCreditItems(items, true);
  renderCreditItemsEditor();
  MosaicUI.feedback.undo('크레딧 항목을 삭제했습니다.');
}

function loadCreditPresets(){
  return MosaicStorage.loadProtectedPresetList(MosaicStorage.CREDIT_PRESET_KEY, MosaicState.sanitizeCreditPresetList, MosaicState.MAX_CREDIT_PRESETS);
}

function saveCreditPresets(presets){
  const saved = MosaicStorage.saveProtectedPresetList(MosaicStorage.CREDIT_PRESET_KEY, presets, MosaicState.sanitizeCreditPresetList, MosaicState.MAX_CREDIT_PRESETS, '크레딧 프리셋');
  if(!saved) MosaicUI.feedback.notice(MosaicStorage.protectedPresetFailure);
  return saved;
}

function syncCreditPresetControls(){
  const selected = document.getElementById('creditPresetSelect').value !== '';
  const hasName = document.getElementById('creditPresetName').value.trim() !== '';
  document.getElementById('creditPresetLoadBtn').disabled = !selected;
  document.getElementById('creditPresetDeleteBtn').disabled = !selected;
  document.getElementById('creditPresetSaveBtn').disabled = !hasName;
}

function renderCreditPresetOptions(selectedId){
  const select = document.getElementById('creditPresetSelect');
  const presets = loadCreditPresets();
  const preferred = selectedId !== undefined ? selectedId : select.value;
  select.replaceChildren(new Option(presets === null ? '저장된 프리셋을 읽지 못함' : '저장된 프리셋 선택', ''));
  if(presets) presets.forEach(preset => select.appendChild(new Option(preset.name, preset.id)));
  select.value = presets && presets.some(preset => preset.id === preferred) ? preferred : '';
  syncCreditPresetControls();
}

function saveCurrentCreditPreset(){
  const nameInput = document.getElementById('creditPresetName');
  const name = nameInput.value.trim();
  if(!name) return;
  const items = MosaicState.normalizeCreditItems(creditItemsFromEditor())
    .filter(item => item.label.trim() || item.value.trim() || item.url.trim());
  if(!items.length){
    MosaicUI.feedback.notice('저장할 크레딧 항목이 없습니다.');
    return;
  }
  const presets = loadCreditPresets();
  if(presets === null){ MosaicUI.feedback.notice('크레딧 프리셋 원본을 읽지 못해 저장하지 않았습니다.'); return; }
  const existing = presets.find(preset => preset.name.toLowerCase() === name.toLowerCase());
  if(!existing && presets.length >= MosaicState.MAX_CREDIT_PRESETS){
    MosaicUI.feedback.notice(`크레딧 프리셋은 최대 ${MosaicState.MAX_CREDIT_PRESETS}개까지 저장할 수 있습니다.`);
    return;
  }
  const id = existing ? existing.id : `credit-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const next = existing
    ? presets.map(preset => preset.id === id ? { id, name, items, updatedAt:Date.now() } : preset)
    : [...presets, { id, name, items, updatedAt:Date.now() }];
  if(!saveCreditPresets(next)) return;
  renderCreditPresetOptions(id);
  MosaicUI.feedback.notice(existing ? `'${name}' 크레딧 프리셋을 덮어썼습니다.` : `'${name}' 크레딧 프리셋을 저장했습니다.`);
}

function loadSelectedCreditPreset(){
  const id = document.getElementById('creditPresetSelect').value;
  const presets = loadCreditPresets();
  const preset = presets && presets.find(item => item.id === id);
  if(!preset) return;
  MosaicUI.cards.snapshot();
  setStoredCreditItems(preset.items, true);
  renderCreditItemsEditor();
  document.getElementById('creditPresetName').value = preset.name;
  syncCreditPresetControls();
  MosaicUI.feedback.undo(`'${preset.name}' 크레딧 항목을 불러왔습니다.`);
}

function deleteSelectedCreditPreset(){
  const id = document.getElementById('creditPresetSelect').value;
  const presets = loadCreditPresets();
  const preset = presets && presets.find(item => item.id === id);
  if(!preset || !confirm(`'${preset.name}' 크레딧 프리셋을 삭제하려면 확인을 누르세요.\n삭제 후 되돌릴 수 없습니다.`)) return;
  if(!saveCreditPresets(presets.filter(item => item.id !== id))) return;
  renderCreditPresetOptions('');
  MosaicUI.feedback.notice(`'${preset.name}' 크레딧 프리셋을 삭제했습니다.`);
}

function loadDetailPresets(){
  return MosaicStorage.loadProtectedPresetList(MosaicStorage.DETAIL_PRESET_KEY, MosaicStorage.sanitizeDetailPresetList, MosaicState.MAX_DETAIL_PRESETS);
}

function saveDetailPresets(presets){
  const saved = MosaicStorage.saveProtectedPresetList(MosaicStorage.DETAIL_PRESET_KEY, presets, MosaicStorage.sanitizeDetailPresetList, MosaicState.MAX_DETAIL_PRESETS, '세부 조정 프리셋');
  if(!saved) MosaicUI.feedback.notice(MosaicStorage.protectedPresetFailure);
  return saved;
}

function syncDetailPresetControls(){
  const selected = document.getElementById('detailPresetSelect').value !== '';
  const hasName = document.getElementById('detailPresetName').value.trim() !== '';
  document.getElementById('detailPresetLoadBtn').disabled = !selected;
  document.getElementById('detailPresetDeleteBtn').disabled = !selected;
  document.getElementById('detailPresetSaveBtn').disabled = !hasName;
}

function renderDetailPresetOptions(selectedId){
  const select = document.getElementById('detailPresetSelect');
  const presets = loadDetailPresets();
  const preferred = selectedId !== undefined ? selectedId : select.value;
  select.replaceChildren(new Option(presets === null ? '저장된 프리셋을 읽지 못함' : '저장된 프리셋 선택', ''));
  if(presets) presets.forEach(preset => select.appendChild(new Option(preset.name, preset.id)));
  select.value = presets && presets.some(preset => preset.id === preferred) ? preferred : '';
  syncDetailPresetControls();
}

function currentDetailPresetValues(){
  const values = {};
  MosaicState.DETAIL_PRESET_FIELDS.forEach(id => {
    const input = document.getElementById(id);
    values[id] = input.type === 'checkbox' ? input.checked : input.value;
  });
  return values;
}

function saveCurrentDetailPreset(){
  const nameInput = document.getElementById('detailPresetName');
  const name = nameInput.value.trim();
  if(!name) return;
  const values = currentDetailPresetValues();
  const presets = loadDetailPresets();
  if(presets === null){ MosaicUI.feedback.notice('세부 조정 프리셋 원본을 읽지 못해 저장하지 않았습니다.'); return; }
  const existing = presets.find(preset => preset.name.toLowerCase() === name.toLowerCase());
  if(!existing && presets.length >= MosaicState.MAX_DETAIL_PRESETS){
    MosaicUI.feedback.notice(`세부 조정 프리셋은 최대 ${MosaicState.MAX_DETAIL_PRESETS}개까지 저장할 수 있습니다.`);
    return;
  }
  const id = existing ? existing.id : `detail-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const next = existing
    ? presets.map(preset => preset.id === id ? { id, name, values, updatedAt:Date.now() } : preset)
    : [...presets, { id, name, values, updatedAt:Date.now() }];
  if(!saveDetailPresets(next)) return;
  renderDetailPresetOptions(id);
  MosaicUI.feedback.notice(existing ? `'${name}' 세부 조정 프리셋을 덮어썼습니다.` : `'${name}' 세부 조정 프리셋을 저장했습니다.`);
}

function loadSelectedDetailPreset(){
  const id = document.getElementById('detailPresetSelect').value;
  const presets = loadDetailPresets();
  const preset = presets && presets.find(item => item.id === id);
  if(!preset) return;
  host.applyStyleValues({ ...host.currentStyleValues(), ...preset.values });
  host.styleChange();
  document.getElementById('detailPresetName').value = preset.name;
  syncDetailPresetControls();
  MosaicUI.feedback.open(`'${preset.name}' 세부 조정을 불러왔습니다.`, null, true);
}

function deleteSelectedDetailPreset(){
  const id = document.getElementById('detailPresetSelect').value;
  const presets = loadDetailPresets();
  const preset = presets && presets.find(item => item.id === id);
  if(!preset || !confirm(`'${preset.name}' 세부 조정 프리셋을 삭제하십시오.\n삭제 후 되돌릴 수 없습니다.`)) return;
  if(!saveDetailPresets(presets.filter(item => item.id !== id))) return;
  renderDetailPresetOptions('');
  MosaicUI.feedback.notice(`'${preset.name}' 세부 조정 프리셋을 삭제했습니다.`);
}
function bindFeatureEvents(){


document.getElementById('creditEditorList').addEventListener('dragover', event => {
  if(creditDragIndex === null || !creditDropMarker || !creditDropMarker.isConnected) return;
  event.preventDefault();
  if(event.dataTransfer) event.dataTransfer.dropEffect = 'move';
});

document.getElementById('creditEditorList').addEventListener('drop', finishCreditItemDrop);

}
return Object.freeze({...Object.freeze({
addCreditItem,
creditItemsFromEditor,
deleteSelectedCreditPreset,
deleteSelectedDetailPreset,
loadSelectedCreditPreset,
loadSelectedDetailPreset,
renderCreditItemsEditor,
renderCreditPresetOptions,
renderDetailPresetOptions,
saveCurrentCreditPreset,
saveCurrentDetailPreset,
setStoredCreditItems,
storedCreditItems,
syncCreditPresetControls,
syncDetailPresetControls
}), bindFeatureEvents});
}

function createLibrary(host){


const SLOT_EXPORT_CHUNK_SIZE = 10;

function showSlotReadError(){
  const status = document.getElementById('slotImportStatus');
  status.style.color = '#c0392b';
  status.textContent = `${MosaicStorage.slotReadIssue || '기존 보관함을 읽지 못했습니다.'} 저장 데이터는 변경하지 않았습니다. 원본 백업을 먼저 보관해 주세요.`;
}

function collectValidatedSlotWork(){
  const data = MosaicState.sanitizeImportedWork(MosaicUI.work.collectSlot());
  if(data) return data;
  const status = document.getElementById('slotImportStatus');
  status.style.color = '#c0392b';
  status.textContent = '현재 작업이 보관 한도를 넘었거나 형식이 올바르지 않아 저장하지 않았습니다.';
  return null;
}

function fmtDate(ts){
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function slotCharacterName(slot){
  const value = slot && slot.data && slot.data.fields && slot.data.fields.subChar;
  return typeof value === 'string' ? value.trim() : '';
}

const SLOT_PREVIEW_COUNT = 6;

let slotListExpanded = false;

let slotSelectionMode = false;

const selectedSlotIds = new Set();

let slotMatchingIds = [];

// 검색·정렬은 목록과 일괄 선택에서 공유하고, 처음 6개만 보여주는 생략은 제외한다.
function matchingArchiveSlots(slots){
  const query = document.getElementById('slotSearch').value.trim().toLocaleLowerCase('ko');
  const sort = document.getElementById('slotSort').value;
  const filtered = slots.filter(slot => !query || slot.name.toLocaleLowerCase('ko').includes(query)
    || slotCharacterName(slot).toLocaleLowerCase('ko').includes(query));
  if(sort === 'oldest') filtered.sort((a,b)=>a.savedAt-b.savedAt);
  else if(sort === 'name') filtered.sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  else filtered.sort((a,b)=>b.savedAt-a.savedAt);
  return filtered;
}

function archiveUsageText(){
  if(MosaicStorage.lastSlotReadRaw === undefined) return '용량 확인 불가';
  // localStorage 문자열의 UTF-16 길이만 이용한 추정치다. 다른 저장 키나
  // 브라우저의 실제 할당량·남은 공간으로 표시하지 않으며 저장소를 수정하지 않는다.
  const bytes = (MosaicStorage.lastSlotReadRaw || '').length * 2;
  return `약 ${bytes >= 1000000 ? (bytes / 1000000).toFixed(2)+'MB' : (bytes / 1000).toFixed(1)+'KB'}`;
}

function updateSlotExportSelection(){
  const button = document.getElementById('exportSelectedSlotsBtn');
  button.disabled = selectedSlotIds.size === 0;
  button.textContent = `선택 내보내기 (${selectedSlotIds.size})`;
  const deleteButton = document.getElementById('deleteSelectedSlotsBtn');
  deleteButton.disabled = selectedSlotIds.size === 0;
  deleteButton.textContent = `선택 삭제 (${selectedSlotIds.size})`;
  document.getElementById('slotSelectionBar').hidden = !slotSelectionMode;
  document.getElementById('slotSelectionTools').hidden = !slotSelectionMode;
  const hasMore = slotMatchingIds.some(id=>!selectedSlotIds.has(id));
  document.getElementById('slotSelectTenBtn').disabled = !slotSelectionMode || !!MosaicStorage.slotReadIssue || !hasMore;
  document.getElementById('slotSelectAllBtn').disabled = !slotSelectionMode || !!MosaicStorage.slotReadIssue || !hasMore;
  document.getElementById('slotClearSelectionBtn').disabled = selectedSlotIds.size === 0;
  const searching = !!document.getElementById('slotSearch').value.trim();
  document.getElementById('slotSelectTenBtn').title = `${searching ? '검색 결과의' : '현재 정렬 순서의'} 아직 선택하지 않은 항목을 최대 10개 추가 선택`;
  document.getElementById('slotSelectAllBtn').title = searching ? '현재 검색 결과를 모두 추가 선택 (기존 선택 유지)' : '보관함 전체 선택';
  const selectButton = document.getElementById('slotSelectBtn');
  selectButton.setAttribute('aria-pressed', String(slotSelectionMode));
  selectButton.textContent = slotSelectionMode ? '취소' : '선택';
}

function renderSlotList(){
  const container = document.getElementById('slotList');
  const count = document.getElementById('slotCount');
  const expandBtn = document.getElementById('slotExpandBtn');
  container.innerHTML = '';
  const slots = MosaicStorage.loadSlots(true);
  document.getElementById('exportSlotsBtn').textContent = MosaicStorage.slotReadIssue ? '원본 백업' : '전체 내보내기';
  document.getElementById('exportSplitSlotsBtn').disabled = !!MosaicStorage.slotReadIssue;
  count.title = '보관함 저장 문자열의 UTF-16 크기를 기준으로 한 추정 용량입니다. 초안·프리셋과 브라우저 실제 할당량은 포함하지 않습니다.';
  if(slots === null){
    slotMatchingIds = [];
    updateSlotExportSelection();
    count.textContent = `목록 확인 불가 · ${archiveUsageText()}`;
    expandBtn.hidden = true;
    showSlotReadError();
    return;
  }
  if(MosaicStorage.slotReadIssue) showSlotReadError();
  const existingIds = new Set(slots.map(slot => slot.id));
  for(const id of selectedSlotIds) if(!existingIds.has(id)) selectedSlotIds.delete(id);
  const query = document.getElementById('slotSearch').value.trim().toLocaleLowerCase('ko');
  const filtered = matchingArchiveSlots(slots);
  slotMatchingIds = filtered.map(slot=>slot.id);
  updateSlotExportSelection();

  const canExpand = !query && filtered.length > SLOT_PREVIEW_COUNT;
  const visible = canExpand && !slotListExpanded ? filtered.slice(0, SLOT_PREVIEW_COUNT) : filtered;
  count.textContent = query
    ? `${filtered.length}개 찾음 · 전체 ${slots.length}개 · ${archiveUsageText()}`
    : (canExpand && !slotListExpanded ? `${visible.length}개 표시 · 전체 ${slots.length}개 · ${archiveUsageText()}` : `전체 ${slots.length}개 · ${archiveUsageText()}`);
  expandBtn.hidden = !canExpand;
  expandBtn.textContent = slotListExpanded ? '접기' : '전체 보기';

  if(!visible.length){
    const empty = document.createElement('div');
    empty.className = 'slotEmpty';
    empty.textContent = slots.length ? '일치하는 보관함이 없습니다.'
      : MosaicStorage.slotReadIssue ? '읽을 수 있는 보관함이 없습니다. 원본 백업을 먼저 보관해 주세요.' : '저장된 보관함이 없습니다.';
    container.appendChild(empty);
    return;
  }

  visible.forEach(slot => {
    const characterName = slotCharacterName(slot);
    const row = document.createElement('div');
    row.className = 'slotRow';
    row.title = '';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', `${slot.name}${characterName ? `, 캐릭터 ${characterName}` : ''} 보관함 항목`);
    const identity = document.createElement('span');
    identity.className = 'slotIdentity';
    const select = document.createElement('input');
    select.type = 'checkbox';
    select.className = 'slotExportCheck';
    select.checked = selectedSlotIds.has(slot.id);
    select.setAttribute('aria-label', `${slot.name} 내보내기 선택`);
    select.addEventListener('change', () => {
      if(select.checked) selectedSlotIds.add(slot.id);
      else selectedSlotIds.delete(slot.id);
      name.setAttribute('aria-pressed', String(select.checked));
      updateSlotExportSelection();
    });
    select.hidden = !slotSelectionMode;
    row.appendChild(select);
    row.classList.toggle('isSelecting', slotSelectionMode);
    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'slotName';
    name.textContent = slot.name;
    identity.appendChild(name);
    name.title = `${slot.name} · ${slotSelectionMode ? '내보내기 선택' : '불러오기'}`;
    if(slotSelectionMode) name.setAttribute('aria-pressed', String(select.checked));
    const date = document.createElement('span');
    date.className = 'slotDate';
    date.textContent = [characterName, fmtDate(slot.savedAt)].filter(Boolean).join(' · ');
    date.title = date.textContent;
    identity.appendChild(date);
    const over = document.createElement('button');
    over.type = 'button';
    over.textContent = '덮어쓰기';
    over.title = '현재 작업을 이 슬롯에 다시 저장해';
    over.className = 'slotOverwrite uiButton';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'slotDel uiButton';
    del.textContent = '×';
    del.title = '슬롯 삭제';
    del.setAttribute('aria-label', `${slot.name} 삭제`);
    const actions = document.createElement('div');
    actions.className = 'slotActions';
    const meta = document.createElement('div');
    meta.className = 'slotMeta';
    meta.append(date);
    identity.appendChild(meta);
    actions.append(del, over);

    name.addEventListener('click', () => {
      if(slotSelectionMode){
        select.checked = !select.checked;
        select.dispatchEvent(new Event('change'));
        return;
      }
      MosaicUI.cards.snapshot();
      MosaicUI.work.apply(JSON.parse(JSON.stringify(slot.data)));
      MosaicUI.feedback.undo(`'${slot.name}' 불러옴.`);
      host.setArchiveDrawerOpen(false);
    });
    over.addEventListener('click', (e) => {
      e.stopPropagation();
      const list = MosaicStorage.loadSlots();
      if(list === null){ showSlotReadError(); return; }
      const targetIndex = list.findIndex(item => item.id === slot.id);
      if(targetIndex < 0){
        document.getElementById('slotImportStatus').textContent = '덮어쓸 보관함 항목을 찾지 못했습니다.';
        renderSlotList();
        return;
      }
      const data = collectValidatedSlotWork();
      if(!data) return;
      const previousStoredSlots = localStorage.getItem(MosaicStorage.SLOT_KEY);
      list[targetIndex].data = data;
      list[targetIndex]._stored = null;
      list[targetIndex].savedAt = Date.now();
      if(!MosaicStorage.saveSlots(list)){
        document.getElementById('slotImportStatus').textContent = MosaicStorage.slotSaveFailure;
        return;
      }
      const writtenStoredSlots = MosaicStorage.lastSlotReadRaw;
      renderSlotList();
      const status = document.getElementById('slotImportStatus');
      status.style.color = '';
      status.textContent = `'${slot.name}'을 현재 작업으로 덮어썼습니다.`;
      MosaicUI.feedback.undo(`'${slot.name}' 보관함 덮어씀.`, () => {
        const restored = MosaicStorage.restoreStoredValue(MosaicStorage.SLOT_KEY, previousStoredSlots, writtenStoredSlots);
        const undoStatus = document.getElementById('slotImportStatus');
        if(!restored){
          undoStatus.style.color = '#c0392b';
          undoStatus.textContent = '보관함이 그사이 변경되었거나 저장소에 오류가 있어 되돌리지 못했습니다. 목록을 다시 확인해 주세요.';
          return;
        }
        undoStatus.style.color = '';
        undoStatus.textContent = `'${slot.name}' 보관함 덮어쓰기를 되돌렸습니다.`;
        renderSlotList();
      });
    });
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if(!confirm(`'${slot.name}' 보관함을 삭제하려면 확인을 누르세요.\n삭제 후 되돌릴 수 없습니다.`)) return;
      const list = MosaicStorage.loadSlots();
      if(list === null){ showSlotReadError(); return; }
      const targetIndex = list.findIndex(item => item.id === slot.id);
      if(targetIndex < 0) return;
      list.splice(targetIndex, 1);
      if(!MosaicStorage.saveSlots(list)){
        document.getElementById('slotImportStatus').textContent = MosaicStorage.slotSaveFailure;
        return;
      }
      renderSlotList();
    });

    row.appendChild(identity);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

function downloadSlotJSON(list, filename){
  const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  try {
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
  } finally {
    a.remove();
    URL.revokeObjectURL(url);
  }
  return blob.size;
}

function exportSlots(selectedOnly = false){
  const slots = MosaicStorage.loadSlots(selectedOnly);
  const list = slots === null ? null : slots.filter(slot => !selectedOnly || selectedSlotIds.has(slot.id));
  if(list === null){
    if(!selectedOnly) exportRawSlotsBackup();
    else showSlotReadError();
    return;
  }
  if(!selectedOnly && MosaicStorage.slotReadIssue){
    exportRawSlotsBackup();
    return;
  }
  const st = document.getElementById('slotImportStatus');
  if(!list.length){
    st.style.color = '';
    st.textContent = selectedOnly ? '내보낼 항목을 선택해 주세요.' : '보관함이 비어 있음. 현재 작업을 먼저 저장.';
    return;
  }
  downloadSlotJSON(MosaicStorage.slotExportPayload(list), selectedOnly ? '조각로그_보관함_선택.json' : '조각로그_보관함.json');
  st.style.color = '';
  st.textContent = `보관함 ${list.length}개 저장됨.`;
}

function exportSplitSlots(){
  // 화면의 검색·정렬·선택과 무관하게 전체 목록을 한 번만 읽어 고정한다.
  // 한 항목이라도 읽지 못하면 부분 백업을 전체 백업처럼 내보내지 않는다.
  const list = MosaicStorage.loadSlots();
  if(list === null || MosaicStorage.slotReadIssue){ showSlotReadError(); return; }
  const status = document.getElementById('slotImportStatus');
  if(!list.length){
    status.style.color = '';
    status.textContent = '보관함이 비어 있음. 현재 작업을 먼저 저장.';
    return;
  }
  let requested = 0;
  let oversized = 0;
  try {
    const payload = MosaicStorage.slotExportPayload(list);
    for(let start = 0; start < payload.length; start += SLOT_EXPORT_CHUNK_SIZE){
      const part = String(requested + 1).padStart(2, '0');
      const bytes = downloadSlotJSON(payload.slice(start, start + SLOT_EXPORT_CHUNK_SIZE), `조각로그_보관함_분할_${part}.json`);
      if(bytes > MosaicStorage.MAX_ARCHIVE_BYTES) oversized++;
      requested++;
    }
  } catch(e){
    status.style.color = '#c0392b';
    status.textContent = `분할 내보내기에 실패했습니다.${requested ? ` ${requested}개 파일은 이미 다운로드를 요청했습니다.` : ''} 보관함 원본은 변경하지 않았습니다.`;
    return;
  }
  status.style.color = '';
  // a.click()은 다운로드 완료/차단을 알려주지 않으므로 저장 완료라고 표시하지 않는다.
  status.textContent = `보관함 ${list.length}개를 ${requested}개 JSON 파일로 나누어 내보내기 요청했습니다.${requested > 1 ? ' 여러 파일 다운로드가 차단되면 이 사이트의 자동 다운로드를 허용해 주세요.' : ''}${oversized ? ` ${oversized}개 파일은 기존 파일 가져오기 제한(4MB)을 넘습니다.` : ''}`;
}

function exportRawSlotsBackup(){
  const st = document.getElementById('slotImportStatus');
  let raw;
  try { raw = localStorage.getItem(MosaicStorage.SLOT_KEY); }
  catch(e){ showSlotReadError(); return; }
  if(raw === null){ showSlotReadError(); return; }
  const blob = new Blob([raw], { type:'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '조각로그_보관함_원본백업.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  st.style.color = '';
  st.textContent = '보관함 저장 데이터를 수정하지 않고 원본 그대로 백업했습니다.';
}

function closeSlotExportMenu(restoreFocus = false){
  const menu = document.getElementById('slotExportMenu');
  const inside = menu.contains(document.activeElement);
  menu.hidden = true;
  document.getElementById('slotExportMenuBtn').setAttribute('aria-expanded','false');
  if(restoreFocus && inside) document.getElementById('slotExportMenuBtn').focus();
}

function openSlotExportMenu(last = false){
  const menu = document.getElementById('slotExportMenu');
  menu.hidden = false;
  document.getElementById('slotExportMenuBtn').setAttribute('aria-expanded','true');
  const items = Array.from(menu.querySelectorAll('button')).filter(button=>!button.disabled);
  (last ? items.at(-1) : items[0])?.focus();
}

function selectArchiveSlots(limit){
  if(!slotSelectionMode) return;
  const slots = MosaicStorage.loadSlots();
  if(slots === null){ showSlotReadError();return; }
  const existing = new Set(slots.map(slot=>slot.id));
  for(const id of selectedSlotIds) if(!existing.has(id)) selectedSlotIds.delete(id);
  const remaining = matchingArchiveSlots(slots).filter(slot=>!selectedSlotIds.has(slot.id));
  remaining.slice(0,limit).forEach(slot=>selectedSlotIds.add(slot.id));
  if(remaining.length) slotListExpanded = true;
  renderSlotList();
}

function deleteSelectedSlots(){
  const list = MosaicStorage.loadSlots();
  if(list === null){ showSlotReadError(); return; }
  const removed = list.filter(slot => selectedSlotIds.has(slot.id));
  if(!removed.length) return;
  const matching = new Set(matchingArchiveSlots(list).map(slot=>slot.id));
  const outside = removed.filter(slot=>!matching.has(slot.id)).length;
  if(!confirm(`선택한 보관함 ${removed.length}개를 삭제하시겠습니까?${outside ? `\n현재 검색 결과 밖에서 선택한 ${outside}개도 포함됩니다.` : ''}\n필요한 항목은 먼저 내보내기로 백업해 주세요.`)) return;
  const status = document.getElementById('slotImportStatus');
  if(!MosaicStorage.saveSlots(list.filter(slot => !selectedSlotIds.has(slot.id)))){
    status.textContent = MosaicStorage.slotSaveFailure;
    return;
  }
  selectedSlotIds.clear();
  renderSlotList();
  status.textContent = `보관함 ${removed.length}개를 삭제했습니다.`;
  MosaicUI.feedback.undo(`보관함 ${removed.length}개 삭제됨.`, () => {
    const current = MosaicStorage.loadSlots();
    if(current === null){ showSlotReadError(); return; }
    // 삭제 이후 저장한 항목은 유지하고, 사라진 항목만 복원한다.
    const existingIds = new Set(current.map(slot => slot.id));
    const restored = removed.filter(slot => !existingIds.has(slot.id));
    if(!MosaicStorage.saveSlots(current.concat(restored))){
      status.textContent = MosaicStorage.slotSaveFailure;
      return;
    }
    renderSlotList();
    status.textContent = `보관함 ${restored.length}개를 복원했습니다.`;
  });
}

function startNewLog(){
  MosaicUI.cards.snapshot();
  // 디자인 설정, 화자 이름, 꼬리말은 유지하고 본문·표제·이미지만 초기화
  ['imgUrl','logNumber','subChar','subUser','logSubtitle'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('logTitle').value = '';
  document.getElementById('imgOn').checked = false;
  document.getElementById('logTitleOn').checked = false;
  MosaicUI.controls.syncCover();
  MosaicUI.controls.syncDesignSummaries();
  MosaicUI.cards.clear();
  MosaicUI.cards.setActiveTextarea(null);
  MosaicUI.cards.add('', true);
  host.committedChange();
  MosaicUI.feedback.undo('새 로그 시작.');
  host.setArchiveDrawerOpen(false);
}

function setDraftStatus(text, state, detail){
  const status = document.getElementById('draftStatus');
  if(!status) return;
  status.textContent = text;
  status.dataset.state = state || '';
  status.title = detail || text;
  const conflictBtn = document.getElementById('draftConflictBtn');
  if(conflictBtn) conflictBtn.hidden = state !== 'paused';
}

function savedTimeLabel(){
  return new Intl.DateTimeFormat('ko-KR', {
    hour:'2-digit',
    minute:'2-digit',
    hour12:false
  }).format(new Date());
}

function applyDraftRestorePlan(plan){
  Object.entries(plan.fields).forEach(([id, value]) => { document.getElementById(id).value = value; });
  Object.entries(plan.booleans).forEach(([id, value]) => { document.getElementById(id).checked = value; });
  if(plan.style) applyStyleValues(plan.style);
  else if(plan.legacyFoldDividerMinimal) document.getElementById('foldDividerOn').checked = false;
  MosaicUI.cards.clear();
  plan.cards.forEach(card => MosaicUI.cards.add(card, false));
  MosaicUI.controls.syncTypographyLabels();
  ['xpos','ypos','imgHeight'].forEach(id => {
    document.getElementById(`${id}Val`).value = document.getElementById(id).value;
  });
  syncCharList();

}

// 저채도 배경과 4.5:1 이상의 본문 대비를 기준으로 구성한 추천 색 조합.
// 밝은 색 계열과 다크 계열을 분리해 필터를 오갈 때 배경 명도가 튀지 않게 한다.
const COLOR_COMBO_FAMILIES = [
  { key:'featured', label:'추천' },
  { key:'mono', label:'모노' },
  { key:'blue', label:'블루' },
  { key:'green', label:'그린' },
  { key:'warm', label:'웜' },
  { key:'red', label:'레드' },
  { key:'dark', label:'다크' },
];

const COLOR_COMBOS = [
  { name:'모노 클래식', families:['featured','mono'], v:{ bgColor:'#ffffff', narrColor:'#555555', emphasisColor:'#747474', charColor:'#222222', userColor:'#707070' } },
  { name:'백자', families:['featured','mono'], v:{ bgColor:'#fbfaf7', narrColor:'#55524c', emphasisColor:'#706c64', charColor:'#25231f', userColor:'#5e5a52' } },
  { name:'쿨 차콜', families:['mono'], v:{ bgColor:'#f2f4f6', narrColor:'#4a5159', emphasisColor:'#616b75', charColor:'#1f2933', userColor:'#604b59' } },
  { name:'웜 그래파이트', families:['mono'], v:{ bgColor:'#f5f1eb', narrColor:'#534f4a', emphasisColor:'#6f665d', charColor:'#2c2925', userColor:'#61483a' } },
  { name:'스톤 페이퍼', families:['mono'], v:{ bgColor:'#f3f1ed', narrColor:'#514f4b', emphasisColor:'#69655f', charColor:'#282724', userColor:'#57534e' } },
  { name:'종이', families:['mono'], v:{ bgColor:'#faf9f5', narrColor:'#494740', emphasisColor:'#78644b', charColor:'#303530', userColor:'#666259' } },

  { name:'딥 네이비', families:['blue'], v:{ bgColor:'#f3f6fa', narrColor:'#4a5564', emphasisColor:'#596b82', charColor:'#183a63', userColor:'#485f7c' } },
  { name:'라벤더 블루', families:['featured','blue'], v:{ bgColor:'#f7f5fa', narrColor:'#575263', emphasisColor:'#6b6480', charColor:'#4e4680', userColor:'#6d4f74' } },
  { name:'포그 블루', families:['blue'], v:{ bgColor:'#f1f5f7', narrColor:'#4b5960', emphasisColor:'#61717a', charColor:'#2f5c73', userColor:'#5e5264' } },
  { name:'잉크 블루', families:['blue'], v:{ bgColor:'#f2f4f8', narrColor:'#485365', emphasisColor:'#5e6b82', charColor:'#263f69', userColor:'#604f6a' } },
  { name:'더스크 블루', families:['blue'], v:{ bgColor:'#f4f3f8', narrColor:'#514f61', emphasisColor:'#68657c', charColor:'#3d4f79', userColor:'#705060' } },
  { name:'파우더 네이비', families:['blue'], v:{ bgColor:'#edf3f8', narrColor:'#465563', emphasisColor:'#5c6b7a', charColor:'#2d5776', userColor:'#675243' } },

  { name:'포레스트', families:['featured','green'], v:{ bgColor:'#f2f5f0', narrColor:'#4b574b', emphasisColor:'#626f61', charColor:'#23543a', userColor:'#5e4a32' } },
  { name:'올리브 페이퍼', families:['green'], v:{ bgColor:'#f6f5ee', narrColor:'#555548', emphasisColor:'#6c6a52', charColor:'#465a30', userColor:'#6b5332' } },
  { name:'모스 브릭', families:['green'], v:{ bgColor:'#f4f2e9', narrColor:'#54564a', emphasisColor:'#6a6c59', charColor:'#4a632c', userColor:'#765044' } },
  { name:'시더 세이지', families:['green'], v:{ bgColor:'#f4f3ec', narrColor:'#54564b', emphasisColor:'#6c705e', charColor:'#3f5b36', userColor:'#6e4f42' } },
  { name:'티 리프', families:['green'], v:{ bgColor:'#f7f5ec', narrColor:'#565647', emphasisColor:'#6e6c56', charColor:'#4f6230', userColor:'#695044' } },
  { name:'라이큰 페이퍼', families:['green'], v:{ bgColor:'#f2f4ed', narrColor:'#50584d', emphasisColor:'#687063', charColor:'#3a6246', userColor:'#625766' } },

  { name:'세피아 문고', families:['warm'], v:{ bgColor:'#faf6ef', narrColor:'#5c5245', emphasisColor:'#756b5f', charColor:'#7a4a2a', userColor:'#516044' } },
  { name:'허니 골드', families:['warm'], v:{ bgColor:'#fbf7ed', narrColor:'#5a5142', emphasisColor:'#796532', charColor:'#6d4d12', userColor:'#6a4b3d' } },
  { name:'오트 네이비', families:['featured','warm'], v:{ bgColor:'#f8f4ea', narrColor:'#585249', emphasisColor:'#6d665b', charColor:'#735a32', userColor:'#384f6a' } },
  { name:'카멜 잉크', families:['warm'], v:{ bgColor:'#f6f0e7', narrColor:'#5b5048', emphasisColor:'#746256', charColor:'#7b4f37', userColor:'#596148' } },
  { name:'애프리콧 페이퍼', families:['warm'], v:{ bgColor:'#fbf1e9', narrColor:'#5e5048', emphasisColor:'#765f54', charColor:'#844a37', userColor:'#48606b' } },
  { name:'리넨 네이비', families:['warm'], v:{ bgColor:'#f8f5ed', narrColor:'#575149', emphasisColor:'#6e675d', charColor:'#6f5635', userColor:'#374f68' } },

  { name:'로즈 페이퍼', families:['featured','red'], v:{ bgColor:'#fdf3f4', narrColor:'#66565a', emphasisColor:'#7b6067', charColor:'#963b50', userColor:'#4e5e78' } },
  { name:'더스티 로즈', families:['red'], v:{ bgColor:'#faf4f4', narrColor:'#5f5254', emphasisColor:'#765b60', charColor:'#874351', userColor:'#5c536b' } },
  { name:'버건디 북', families:['red'], v:{ bgColor:'#f8f3f2', narrColor:'#5d5050', emphasisColor:'#745955', charColor:'#712e38', userColor:'#604c5e' } },
  { name:'플럼 잉크', families:['red'], v:{ bgColor:'#f8f2f7', narrColor:'#5b4f59', emphasisColor:'#765e71', charColor:'#75365f', userColor:'#4c5267' } },
  { name:'클라레 페이퍼', families:['red'], v:{ bgColor:'#faf2f2', narrColor:'#5c4f51', emphasisColor:'#745a5f', charColor:'#752f3b', userColor:'#4d586d' } },
  { name:'피그 페이퍼', families:['red'], v:{ bgColor:'#f7f2f3', narrColor:'#595055', emphasisColor:'#705e65', charColor:'#6d3b52', userColor:'#556048' } },

  { name:'미드나잇', families:['dark'], v:{ bgColor:'#16181f', narrColor:'#b8bcc8', emphasisColor:'#9299aa', charColor:'#9db4e8', userColor:'#d9a679' } },
  { name:'잉크&골드', families:['dark'], v:{ bgColor:'#1b1a19', narrColor:'#c9c2b6', emphasisColor:'#9c9589', charColor:'#d4af6a', userColor:'#9db4e8' } },
  { name:'딥 포레스트', families:['dark'], v:{ bgColor:'#18201c', narrColor:'#bfc8c0', emphasisColor:'#93a094', charColor:'#8fb99d', userColor:'#d1b18a' } },
  { name:'에스프레소 세이지', families:['dark'], v:{ bgColor:'#211b18', narrColor:'#cfc5bd', emphasisColor:'#a3958b', charColor:'#d6a66f', userColor:'#9fc3a9' } },
  { name:'차콜 페이퍼', families:['dark'], v:{ bgColor:'#18191b', narrColor:'#c5c6c2', emphasisColor:'#999b97', charColor:'#b6bdc5', userColor:'#c7aa91' } },
  { name:'코코아 플럼', families:['dark'], v:{ bgColor:'#21191d', narrColor:'#c9c1c5', emphasisColor:'#9c9298', charColor:'#c099ac', userColor:'#a8b39b' } },
];

let currentComboName = null;

let currentComboFamily = 'featured';

const DIALOG_STYLE_CYCLE = ['softlight', 'highlight', 'badge', 'gradient', 'quote-bg', 'box', 'messenger2'];

function nextDialogueStyleValue(value){
  if(value === 'messenger') value = 'messenger2';
  const current = DIALOG_STYLE_CYCLE.indexOf(value);
  const base = current >= 0 ? current : 0;
  return DIALOG_STYLE_CYCLE[(base + 1) % DIALOG_STYLE_CYCLE.length];
}

function stepDialogueStyle(delta){
  const select = document.getElementById('dlgStyle');
  const current = DIALOG_STYLE_CYCLE.indexOf(select.value);
  const base = current >= 0 ? current : 0;
  select.value = DIALOG_STYLE_CYCLE[(base + delta + DIALOG_STYLE_CYCLE.length) % DIALOG_STYLE_CYCLE.length];
  select.dispatchEvent(new Event('input', { bubbles:true }));
  updateOverwriteBtn();
  host.commitStyleHistory(true);
}

function stepSelectOption(selectId, delta){
  const select = document.getElementById(selectId);
  const enabledIndexes = Array.from(select.options)
    .map((option, index) => option.disabled ? -1 : index)
    .filter(index => index >= 0);
  if(!enabledIndexes.length) return;
  const currentPosition = Math.max(0, enabledIndexes.indexOf(select.selectedIndex));
  const nextPosition = (currentPosition + delta + enabledIndexes.length) % enabledIndexes.length;
  select.selectedIndex = enabledIndexes[nextPosition];
  select.dispatchEvent(new Event('input', { bubbles:true }));
  updateOverwriteBtn();
  host.commitStyleHistory(true);
}

const SEGMENTED_CHOICE_SELECT_IDS = ['profilePlacement', 'profileTextPosition', 'titleTextPosition', 'profileStyle', 'profileOuterBackground', 'creditPlacement', 'hrShape', 'hr2Shape', 'hr3Shape', 'foldAutoNumberStyle', 'parallelTranslationOrder', 'parallelTranslationBrackets'];

function syncMinimalChoiceControls(){
  document.querySelectorAll('[data-minimal-control]').forEach(group => {
    const input = document.getElementById(group.dataset.minimalControl);
    group.querySelectorAll('button[data-value]').forEach(button => {
      button.setAttribute('aria-pressed', String(input.checked === (button.dataset.value === 'minimal')));
      button.disabled = input.disabled;
    });
  });
}

function syncSegmentedChoiceControl(selectId){
  const select = document.getElementById(selectId);
  const group = document.querySelector(`[data-control="${selectId}"]`);
  if(!select || !group) return;
  const displayedValue = select.value;
  group.title = select.title || '';
  group.querySelectorAll('button[data-value]').forEach(button => {
    const active = button.dataset.value === displayedValue;
    button.setAttribute('aria-pressed', String(active));
    button.disabled = select.disabled;
  });
}

function syncAllSegmentedChoiceControls(){
  SEGMENTED_CHOICE_SELECT_IDS.forEach(syncSegmentedChoiceControl);
}

// 추천·저장 프리셋의 호버는 실제 입력값·저장값·작업 기록을 건드리지 않고
// 미리보기 HTML만 임시 색상으로 다시 그린다.
let themeHoverPreview = null;

const themeHoverPreviewCards = new WeakMap();

function beginThemeHoverPreview(key, values){
  if(MosaicState.outputThemeTransparent(document.getElementById('outputTheme').value)) return;
  if(themeHoverPreview && themeHoverPreview.key === key) return;
  themeHoverPreview = { key };
  // 호버는 팔레트 확인만 제공한다. 내 프리셋에 저장된 대사 옵션은 클릭할 때만 적용한다.
  const previewColors = {};
  MosaicState.THEME_COLOR_FIELDS.forEach(id => {
    if(values[id] !== undefined) previewColors[id] = values[id];
  });
  const previewSettings = { ...host.getSettings(), ...previewColors, outputTheme: document.getElementById('outputTheme').value };
  MosaicUI.preview.renderMarkup(MosaicRenderer.buildCard(previewSettings, MosaicUI.cards.all()));
}

function endThemeHoverPreview(key){
  if(!themeHoverPreview || themeHoverPreview.key !== key) return;
  themeHoverPreview = null;
  MosaicUI.preview.renderMarkup(MosaicRenderer.buildCard(host.getSettings(), MosaicUI.cards.all()));
}

function commitThemeHoverPreview(){
  // 클릭 시 현재 호버 색상이 곧 실제 적용값이 되므로 복원하지 않는다.
  themeHoverPreview = null;
}

function registerThemeHoverPreviewCard(card, key, values){
  themeHoverPreviewCards.set(card, { key, values });
}

// 프리셋 카드는 필터·선택 때마다 새 DOM으로 교체된다. 고정된 목록 요소에서
// mouseover/out을 받아 새로 만들어진 카드에도 항상 호버 미리보기가 작동하게 한다.
function bindThemeHoverPreviewList(containerId, cardSelector, manageSensitive = false){
  const container = document.getElementById(containerId);
  if(!container) return;
  const cardFrom = target => target && target.closest ? target.closest(cardSelector) : null;

  container.addEventListener('mouseover', e => {
    const card = cardFrom(e.target);
    if(!card || !container.contains(card) || (e.relatedTarget && card.contains(e.relatedTarget))) return;
    if(manageSensitive && presetManageMode) return;
    const preview = themeHoverPreviewCards.get(card);
    if(preview) beginThemeHoverPreview(preview.key, preview.values);
  });

  container.addEventListener('mouseout', e => {
    const card = cardFrom(e.target);
    if(!card || !container.contains(card) || (e.relatedTarget && card.contains(e.relatedTarget))) return;
    const preview = themeHoverPreviewCards.get(card);
    if(preview) endThemeHoverPreview(preview.key);
  });
}

// 현재 테마의 실제 5색을 색상 프리셋과 같은 순서로 보여준다.
function renderCurrentThemePalette(){
  const button = document.getElementById('currentThemePaletteButton');
  if(!button) return;
  button.querySelectorAll('[data-theme-color]').forEach(chip => {
    const input = document.getElementById(chip.dataset.themeColor);
    if(input) chip.style.background = input.value;
  });
  const styleName = MosaicUI.controls.selectedText('dlgStyle') || '글자 강조';
  const option = document.getElementById('currentThemePaletteOption');
  if(option) option.textContent = styleName;
  button.setAttribute('aria-label', `현재 테마 컬러칩 · ${styleName} · 누를 때마다 다음 대사 표현 방식으로 변경`);
}

function syncComboFamilyFilters(){
  document.querySelectorAll('#comboFamilyFilters .comboFamilyFilter').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.family === currentComboFamily));
  });
}

function renderComboFamilyFilters(){
  const container = document.getElementById('comboFamilyFilters');
  container.innerHTML = '';
  COLOR_COMBO_FAMILIES.forEach(family => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'comboFamilyFilter uiButton';
    btn.dataset.family = family.key;
    btn.textContent = family.label;
    btn.setAttribute('aria-pressed', String(family.key === currentComboFamily));
    btn.addEventListener('click', () => {
      currentComboFamily = family.key;
      syncComboFamilyFilters();
      renderComboList();
    });
    container.appendChild(btn);
  });
}

function renderComboList(){
  const container = document.getElementById('comboList');
  container.innerHTML = '';
  syncComboFamilyFilters();
  COLOR_COMBOS.filter(combo => combo.families.includes(currentComboFamily)).forEach(combo => {
    const v = combo.v;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'comboCard uiButton' + (combo.name === currentComboName ? ' active' : '');
    const presetKey = `recommended:${combo.name}`;
    chip.title = '마우스를 올리면 색상 미리보기 · 클릭하면 색상 적용';
    chip.setAttribute('aria-label', `${combo.name} 색상 프리셋 적용`);
    registerThemeHoverPreviewCard(chip, presetKey, v);
    chip.innerHTML = `
      <div class="compactPresetHead">
        <div class="comboName">${combo.name}</div>
        <span class="comboActiveMark" aria-hidden="true">✓</span>
      </div>
      <div class="comboPalette" aria-hidden="true">
        <span title="배경" style="background:${v.bgColor}"></span>
        <span title="서술" style="background:${v.narrColor}"></span>
        <span title="강조" style="background:${v.emphasisColor}"></span>
        <span title="캐릭터" style="background:${v.charColor}"></span>
        <span title="유저" style="background:${v.userColor}"></span>
      </div>
    `;
    chip.addEventListener('click', () => {
      commitThemeHoverPreview();
      applyThemeColorValues(v);
      currentComboName = combo.name;
      currentPresetName = null;
      MosaicUI.controls.updateHexLabels();
      renderPresetList();
      renderComboList();
      host.styleChange();
    });
    container.appendChild(chip);
  });
}

let currentPresetName = null;

// 색상·프리셋 기능도 공통 읽기 경계를 사용한다.
const currentStyleValues = host.currentStyleValues;

function currentSavedPresetValues(){
  const values = {};
  MosaicState.SAVED_PRESET_FIELDS.forEach(id => { values[id] = document.getElementById(id).value; });
  return values;
}

function applyThemeColorValues(values){
  MosaicState.THEME_COLOR_FIELDS.forEach(id => {
    if(values[id] === undefined) return;
    const input = document.getElementById(id);
    const color = MosaicState.normalizeHex(String(values[id]));
    if(input && color) input.value = color;
  });
  MosaicUI.controls.updateHexLabels();
}

function applySavedPresetValues(values){
  const outputTheme = document.getElementById('outputTheme');
  const nextTheme = MosaicState.normalizeOutputTheme(values.outputTheme);
  MosaicUI.cards.setDefaultsForShape(outputTheme.value, nextTheme);
  outputTheme.value = nextTheme;
  applyThemeColorValues(values);
  const dialogueStyle = document.getElementById('dlgStyle');
  const style = values?.dlgStyle === 'messenger' ? 'messenger2' : values?.dlgStyle;
  if(Array.from(dialogueStyle.options).some(option => option.value === style)){
    dialogueStyle.value = style;
  }
  MosaicUI.controls.syncDesignSummaries();
}

function savedPresetStateEqual(a, b){
  if(!a || !b) return false;
  return MosaicState.SAVED_PRESET_FIELDS.every(id => String(id === 'outputTheme' ? (a[id] || 'solid') : a[id]).toLowerCase() === String(id === 'outputTheme' ? (b[id] || 'solid') : b[id]).toLowerCase());
}

function applyStyleValues(v){
  // 따로 저장된 나레이션·대사 폰트는 전체 폰트 값으로 정규화한다.
  const values = { ...MosaicState.migrateStyleValues(v), outputTheme: MosaicState.normalizeOutputTheme(v.outputTheme) };
  if(values.hrShape !== undefined) values.hrShape = MosaicState.normalizeHrShape(values.hrShape);
  if(values.hr2Shape !== undefined) values.hr2Shape = MosaicState.normalizeHr2Shape(values.hr2Shape);
  if(values.hr3Shape !== undefined) values.hr3Shape = MosaicState.normalizeHr3Shape(values.hr3Shape);
  // 고급 스위치가 없는 이전 저장본은 기존 100% 농도를 새 슬라이더의 50%로 옮긴다.
  if(values.advancedOn === undefined){
    ['hrOpacity','hr2Opacity','hr3Opacity'].forEach(id => {
      if(values[id] !== undefined) values[id] = String(MosaicState.advancedPercent(values[id], 100) / 2);
    });
    values.advancedOn = true;
  }
  // 이전 버전의 `장식/구분선 제거` 값을 긍정형 `표시` 설정으로 변환한다.
  // 옛 전역 OFF는 제거된 배치 옵션 대신 두 범위 OFF로 복원한다.
  if(values.parallelTranslationLayout === 'off'){
    values.parallelTranslationLayout = 'auto';
    values.parallelDialogueOn = false;
    values.parallelNarrationOn = false;
  }
  if(values.paragraphGap === undefined) values.paragraphGap = MosaicState.DEFAULT_STYLE.paragraphGap;
  values.parallelTranslationOrder = values.parallelTranslationOrder === 'translation' ? 'translation' : 'original';
  values.parallelTranslationBrackets = values.parallelTranslationBrackets === 'hide' ? 'hide' : 'show';
  values.parallelDialogueOn = values.parallelDialogueOn === undefined ? true : MosaicState.settingFlagOn(values.parallelDialogueOn);
  values.parallelNarrationOn = values.parallelNarrationOn === undefined ? false : MosaicState.settingFlagOn(values.parallelNarrationOn);
  if(values.narrDialogueGap === undefined) values.narrDialogueGap = values.paragraphGap;
  if(values.softBreakSpacing === undefined) values.softBreakSpacing = MosaicState.DEFAULT_STYLE.softBreakSpacing;
  ['hrVerticalSpace','hr2VerticalSpace','hr3VerticalSpace'].forEach(id => {
    if(values[id] === undefined) values[id] = MosaicState.DEFAULT_STYLE[id];
  });
  if(values.cardBodyTopSpace === undefined) values.cardBodyTopSpace = MosaicState.DEFAULT_STYLE.cardBodyTopSpace;
  if(values.cardBodyBottomSpace === undefined) values.cardBodyBottomSpace = MosaicState.DEFAULT_STYLE.cardBodyBottomSpace;
  if(values.footerBodyGap === undefined) values.footerBodyGap = MosaicState.DEFAULT_STYLE.footerBodyGap;
  if(values.profileOuterBackground === undefined) values.profileOuterBackground = MosaicState.DEFAULT_STYLE.profileOuterBackground;
  if(values.profileItemGap === undefined) values.profileItemGap = MosaicState.DEFAULT_STYLE.profileItemGap;
  if(values.headingTopSpace === undefined) values.headingTopSpace = MosaicState.DEFAULT_STYLE.headingTopSpace;
  if(values.headingBetweenSpace === undefined) values.headingBetweenSpace = MosaicState.DEFAULT_STYLE.headingBetweenSpace;
  if(values.headingBottomSpace === undefined) values.headingBottomSpace = MosaicState.DEFAULT_STYLE.headingBottomSpace;
  if(values.cardTitleOrnamentOpacity === undefined) values.cardTitleOrnamentOpacity = MosaicState.DEFAULT_STYLE.cardTitleOrnamentOpacity;
  values.foldAutoNumberStyle = values.foldAutoNumberStyle === 'roman' ? 'roman' : 'arabic';
  // v1.5.x 초안에는 카드 구성 값이 없으므로 기존 개별 카드 방식으로 읽는다.
  values.cardLayout = MosaicState.normalizeCardLayout(values.cardLayout);
  // rev1의 문자열 저장값(normal/relaxed/wide)도 현재 3단계 range 값으로 변환한다.
  values.softBreakSpacing = MosaicState.softBreakSpacingControlValue(values.softBreakSpacing);
  if(values.narrCenter === undefined) values.narrCenter = MosaicState.DEFAULT_STYLE.narrCenter;
  if(values.memoCenter === undefined) values.memoCenter = MosaicState.DEFAULT_STYLE.memoCenter;
  if(values.quoteCenter === undefined) values.quoteCenter = MosaicState.DEFAULT_STYLE.quoteCenter;
  if(values.bodyFoldTitleCenter === undefined) values.bodyFoldTitleCenter = MosaicState.DEFAULT_STYLE.bodyFoldTitleCenter;
  // 단일 선택이었던 작업본의 코멘트 배치값도 폭·정렬 두 축으로 안전하게 변환한다.
  values.commentWidth = MosaicState.normalizeCommentWidth(values.commentWidth);
  values.commentAlign = MosaicState.normalizeCommentAlign(values.commentAlign);
  // 이전 화면의 사진 상태가 바꿔 둔 min 때문에 저장된 음수 간격이 대입 즉시 잘리지 않게 한다.
  // 전체 값 적용 후 syncTypographyRangeLabels가 복원된 프로필 상태로 최솟값을 다시 계산한다.
  document.getElementById('profileItemGap').min = '-10';
  MosaicState.STYLE_FIELDS.forEach(id => {
    if(values[id] === undefined) return;
    const el = document.getElementById(id);
    if(el.type === 'checkbox'){
      el.checked = MosaicState.settingFlagOn(values[id]);
    } else if(id === 'unifiedBottomSpace'){
      // 화면 조절은 제거했지만 이전 저장본은 기존 슬라이더 범위로 복원한다.
      const n = Number(values[id]);
      el.value = String(Number.isFinite(n) ? Math.max(0, Math.min(60, n)) : 0);
    } else if(el.type === 'range' && (id === 'titleSize' || id === 'foldTitleSize' || id === 'cardCornerRadius' || id === 'gapHeight' || id === 'narrDialogueGap')){
      // 제목 크기는 현재 슬라이더 단위인 1px에 맞춘다.
      const n = Number(values[id]);
      const rounded = Number.isFinite(n) ? Math.round(n) : Number(MosaicState.DEFAULT_STYLE[id]);
      el.value = String(Math.min(Number(el.max), Math.max(Number(el.min), rounded)));
    } else {
      el.value = values[id];
    }
  });
  MosaicUI.controls.syncParagraphSettings();
  MosaicUI.controls.syncTypographyLabels();
  MosaicUI.controls.syncDesignSummaries();
  ['hrShape','hr2Shape','hr3Shape','foldAutoNumberStyle','profileOuterBackground'].forEach(syncSegmentedChoiceControl);
  MosaicUI.controls.updateHexLabels();
}

function parseExtraChars(){
  try {
    const v = JSON.parse(document.getElementById('extraChars').value);
    return MosaicState.sanitizeExtraCharList(v) || [];
  } catch(e){ return []; }
}

// 모든 카드 본문에서 [이름] 마커를 훑어 등장 순서대로 이름 목록을 만듦
// ([HR...] 및 이전 여백 별칭, [IMG ...], [C], [접기...] 같은 기능 마커는 제외)
const RESERVED_MARKERS = /^(HR(?:[2-4])?|GAP|C|IMG\b|NEWCARD|\/?접기)/i;

function detectCharNames(){
  const names = [];
  MosaicUI.cards.all().filter(card => card.type !== 'comment' && card.visible !== false).forEach(card => {
    const body = card.body;
    const comments = MosaicParser.bodyCommentLineContexts(body);
    MosaicParser.normalizeQuotes(body).split('\n').forEach((line,raw) => {
      if(comments[raw]) return;
      const re = /\[([^\[\]\n]{1,24})\]\s*(?=")/g;
      let m;
      while((m = re.exec(line)) !== null){
        const name = m[1].trim();
        if(!name || RESERVED_MARKERS.test(name)) continue;
        if(!names.some(existing => existing.toLowerCase() === name.toLowerCase())) names.push(name);
      }
    });
  });
  return names;
}

// 본문에서 감지된 이름 + 저장된 색을 합쳐 현재 인물 목록을 만듦
function currentChars(){
  const saved = parseExtraChars();
  const fallback = document.getElementById('narrColor').value;
  return detectCharNames().map(name => {
    const prev = saved.find(c => c.name.toLowerCase() === name.toLowerCase());
    return { name, color: (prev && prev.color) || fallback };
  });
}

// 인물 목록을 다시 그리고, extraChars(저장값)도 현재 상태로 정리함.
// 저장된 색은 지우지 않고 병합한다 — 초기화 중(카드 복원 전) 감지 결과가 비어 있을 때
// 저장된 색이 날아가는 것을 막기 위함.
let charRowsKey = null;   // 현재 화면에 그려진 인물 이름 목록
function invalidateCharacterRows(){
  charRowsKey = null;
}

function syncCharList(){
  const chars = currentChars();
  const saved = parseExtraChars();
  const merged = saved.slice();
  chars.forEach(c => {
    if(!merged.some(s => s.name.toLowerCase() === c.name.toLowerCase())) merged.push(c);
  });
  document.getElementById('extraChars').value = JSON.stringify(merged);

  const list = document.getElementById('charList');

  // 이름 목록이 그대로면 행을 다시 만들지 않음.
  // (색을 고르는 중에 DOM이 교체되면 열려 있던 색상 팔레트가 닫혀버리기 때문)
  const key = chars.map(c => c.name).join('\u0000');
  if(key === charRowsKey){
    // 이름은 같고 색만 바뀐 경우(슬롯 전환·초안 복원 등)에는 값만 조용히 맞춰줌
    Array.from(list.children).forEach((row, i) => {
      const c = chars[i];
      if(!c) return;
      const color = row.querySelector('input[type="color"]');
      const hex = row.querySelector('.hexLabel');
      if(color && color.value !== c.color && document.activeElement !== color) color.value = c.color;
      if(hex && hex.value !== c.color && document.activeElement !== hex) hex.value = c.color;
    });
    return;
  }
  charRowsKey = key;
  list.innerHTML = '';

  chars.forEach((c, index) => {
    const row = document.createElement('div');
    row.className = 'row';

    const label = document.createElement('label');
    label.textContent = `${c.name} 대사 색상`;

    const field = document.createElement('div');
    field.className = 'colorField';

    const hex = document.createElement('input');
    hex.type = 'text';
    hex.className = 'hexLabel';
    hex.maxLength = 7;
    hex.id = `extraCharHex-${index}`;
    label.htmlFor = hex.id;
    hex.value = c.color;

    const color = document.createElement('input');
    color.type = 'color';
    color.value = c.color;
    color.setAttribute('aria-label', `${c.name} 대사 색상 선택`);

    const commit = (val) => {
      const saved = parseExtraChars();
      const target = saved.find(x => x.name.toLowerCase() === c.name.toLowerCase());
      if(target) target.color = val;
      document.getElementById('extraChars').value = JSON.stringify(saved);
      MosaicUI.preview.render();
      host.saveDraft();
    };
    color.addEventListener('input', () => { hex.value = color.value; commit(color.value); });
    hex.addEventListener('input', () => {
      const n = MosaicState.normalizeHex(hex.value);
      if(n){ color.value = n; commit(n); }
    });
    hex.addEventListener('blur', () => { hex.value = MosaicState.normalizeHex(hex.value) || color.value; });

    field.appendChild(hex);
    field.appendChild(color);
    row.appendChild(label);
    row.appendChild(field);
    list.appendChild(row);
  });
}

function showPresetReadError(){
  const status = document.getElementById('presetStatus');
  if(status) status.textContent = '저장한 프리셋을 읽지 못해 변경하지 않았습니다. 내보낸 백업 파일을 확인해 주세요.';
}

// 색 조합 스와치: 배경/나레이션/강조/{{char}}/{{user}} 순서의 소형 컬러칩.
function buildSwatchRow(v){
  if(MosaicState.outputThemeTransparent(v.outputTheme)) return '<div class="transparentSwatch">배경 없이 · 기본 글자색</div>';
  const bg = v.bgColor || '#ffffff';
  const dots = [
    { c: bg,                         t: '배경' },
    { c: v.narrColor     || '#ccc',  t: '서술' },
    { c: v.emphasisColor || '#ccc',  t: '강조' },
    { c: v.charColor     || '#ccc',  t: '캐릭터' },
    { c: v.userColor     || '#ccc',  t: '유저' },
  ];
  return '<div class="swRow">' + dots.map(d =>
    `<span class="swDot" title="${d.t}" style="background:${d.c};"></span>`
  ).join('') + '</div>';
}

const PRESET_VIEW_KEY = 'logGenPresetView_v1';

let presetSearchQuery = '';

let presetSortMode = 'manual';

let presetManageMode = false;

let draggedPresetCard = null;

function savePresetView(){
  try { localStorage.setItem(PRESET_VIEW_KEY, JSON.stringify({ sort:presetSortMode })); } catch(e){}
}

function persistPresetDomOrder(){
  if(presetSortMode !== 'manual' || presetSearchQuery) return;
  const names = Array.from(document.querySelectorAll('#presetList .presetCard')).map(card => card.dataset.presetName);
  const all = MosaicStorage.loadPresets(currentSavedPresetValues());
  if(all === null || names.length !== all.length) return;
  const byName = new Map(all.map(p => [p.name, p]));
  const ordered = names.map(name => byName.get(name)).filter(Boolean);
  if(ordered.length === all.length) MosaicStorage.savePresets(ordered);
}

// 평소에는 팔레트·이름·선택만, 관리 모드에서만 검색·정렬·순서 변경·메뉴를 표시한다.
function renderPresetList(){
  const all = MosaicStorage.loadPresets(currentSavedPresetValues());
  const container = document.getElementById('presetList');
  const empty = document.getElementById('presetListEmpty');
  const count = document.getElementById('presetLibraryCount');
  const group = document.getElementById('savedPresetGroup');
  if(group) group.classList.toggle('isManaging', presetManageMode);
  container.innerHTML = '';
  if(all === null){
    currentPresetName = null;
    showPresetReadError();
    updateOverwriteBtn();
    return;
  }

  const query = presetSearchQuery.trim().toLocaleLowerCase('ko');
  let list = all.filter(p => !query || p.name.toLocaleLowerCase('ko').includes(query));
  if(presetSortMode === 'name'){
    list = list.slice().sort((a,b) => a.name.localeCompare(b.name, 'ko', { numeric:true, sensitivity:'base' }));
  } else if(presetSortMode === 'recent'){
    list = list.slice().sort((a,b) => (b.lastUsed || 0) - (a.lastUsed || 0));
  }
  count.textContent = query ? `${list.length}/${all.length}` : String(all.length);
  empty.hidden = list.length !== 0;
  container.hidden = list.length === 0;

  list.forEach(p => {
    const v = p.values;
    const card = document.createElement('div');
    card.className = 'presetCard' + (p.name === currentPresetName ? ' active' : '');
    card.dataset.presetName = p.name;
    const canReorder = presetManageMode && presetSortMode === 'manual' && !query;
    const presetKey = `saved:${p.name}`;
    card.title = presetManageMode
      ? (canReorder ? '핸들을 드래그해 순서 변경 · 더보기에서 이름 변경, 복제, 삭제' : '더보기에서 이름 변경, 복제, 삭제')
      : '마우스를 올리면 색상 미리보기 · 클릭하면 저장된 색상과 대사 표현 방식 적용';
    card.tabIndex = 0;
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', `${p.name} 프리셋`);
    card.draggable = false;
    registerThemeHoverPreviewCard(card, presetKey, v);

    const dragHandle = document.createElement('span');
    dragHandle.className = 'presetDragHandle';
    dragHandle.hidden = !canReorder;
    dragHandle.draggable = canReorder;
    dragHandle.setAttribute('role', 'img');
    dragHandle.setAttribute('aria-label', `${p.name} 순서 변경`);
    dragHandle.title = '드래그해 순서 변경';
    dragHandle.textContent = '⠿';

    const head = document.createElement('div');
    head.className = 'presetHead';

    const nameEl = document.createElement('span');
    nameEl.className = 'pname';
    nameEl.textContent = p.name;
    nameEl.title = p.name;

    const activeMark = document.createElement('span');
    activeMark.className = 'pActiveMark';
    activeMark.setAttribute('aria-hidden', 'true');
    activeMark.textContent = '✓';

    const swatch = document.createElement('span');
    swatch.className = 'pSwatch';
    swatch.innerHTML = buildSwatchRow(v);

    const manage = document.createElement('span');
    manage.className = 'presetManage';
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'presetMenuBtn';
    menuBtn.textContent = '⋯';
    menuBtn.title = '프리셋 관리';
    menuBtn.setAttribute('aria-label', `${p.name} 관리`);
    menuBtn.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('span');
    menu.className = 'presetMenu';
    menu.hidden = true;

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'uiButton';
    renameBtn.textContent = '이름 변경';
    const duplicateBtn = document.createElement('button');
    duplicateBtn.type = 'button';
    duplicateBtn.className = 'uiButton';
    duplicateBtn.textContent = '복제';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'presetDeleteAction uiButton';
    deleteBtn.textContent = '삭제';
    menu.append(renameBtn, duplicateBtn, deleteBtn);
    manage.append(menuBtn, menu);

    // 카드 클릭 = 적용. 관리 메뉴나 이름 편집 중에는 적용하지 않는다.
    card.addEventListener('click', (e) => {
      if(e.target.closest('.presetManage') || e.target.closest('.presetDragHandle') || card.classList.contains('editing')) return;
      if(presetManageMode) return;
      commitThemeHoverPreview();
      applySavedPresetValues(v);
      const storedList = MosaicStorage.loadPresets(currentSavedPresetValues());
      if(storedList){
        const used = storedList.find(item => item.name === p.name);
        if(used) used.lastUsed = Date.now();
        MosaicStorage.savePresets(storedList);
      }
      currentPresetName = p.name;
      currentComboName = null;
      renderPresetList();
      renderComboList();
      host.styleChange();
    });
    card.addEventListener('keydown', (e) => {
      if(e.isComposing || e.keyCode === 229 || e.target !== card) return;
      if(e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      card.click();
    });
    const startEdit = () => {
      if(!presetManageMode || card.classList.contains('editing')) return;
      menu.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
      card.classList.add('editing');
      card.draggable = false;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'pNameInput';
      input.maxLength = 80;
      input.value = p.name;
      nameEl.replaceWith(input);
      input.focus();
      input.select();

      let settled = false;
      const finish = (save) => {
        if(settled) return;
        const name = input.value.trim();
        if(save && name && name !== p.name){
          const storedList = MosaicStorage.loadPresets(currentSavedPresetValues());
          if(storedList === null){ showPresetReadError(); input.focus(); return; }
          if(storedList.some(x => x.name.toLowerCase() === name.toLowerCase())){
            document.getElementById('presetStatus').textContent = '다른 프리셋 이름을 입력하세요.';
            input.focus();
            return;
          }
          const target = storedList.find(x => x.name === p.name);
          if(target) target.name = name;
          if(!MosaicStorage.savePresets(storedList)){
            document.getElementById('presetStatus').textContent = MosaicStorage.presetSaveFailure;
            input.focus();
            return;
          }
          if(currentPresetName === p.name) currentPresetName = name;
        }
        settled = true;
        card.classList.remove('editing');
        renderPresetList();
      };
      input.addEventListener('keydown', (e) => {
        if(e.isComposing || e.keyCode === 229) return;
        if(e.key === 'Enter'){ e.preventDefault(); finish(true); }
        if(e.key === 'Escape'){ e.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('click', (e) => e.stopPropagation());
    };

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('#presetList .presetMenu').forEach(other => {
        if(other !== menu) other.hidden = true;
      });
      document.querySelectorAll('#presetList .presetMenuBtn').forEach(otherBtn => {
        if(otherBtn !== menuBtn) otherBtn.setAttribute('aria-expanded', 'false');
      });
      menu.hidden = !menu.hidden;
      menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
    });
    renameBtn.addEventListener('click', (e) => { e.stopPropagation(); startEdit(); });
    nameEl.addEventListener('dblclick', (e) => {
      if(!presetManageMode) return;
      e.stopPropagation();
      startEdit();
    });
    duplicateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const storedList = MosaicStorage.loadPresets(currentSavedPresetValues());
      if(storedList === null){ showPresetReadError(); return; }
      let name = `${p.name} 복사본`;
      let suffix = 2;
      while(storedList.some(item => item.name.toLowerCase() === name.toLowerCase())) name = `${p.name} 복사본 ${suffix++}`;
      const index = storedList.findIndex(item => item.name === p.name);
      storedList.splice(index + 1, 0, { name, values:{ ...p.values }, lastUsed:0 });
      if(!MosaicStorage.savePresets(storedList)){
        document.getElementById('presetStatus').textContent = MosaicStorage.presetSaveFailure;
        return;
      }
      renderPresetList();
    });
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const storedList = MosaicStorage.loadPresets(currentSavedPresetValues());
      if(storedList === null){ showPresetReadError(); return; }
      if(storedList.length <= 1){ document.getElementById('presetStatus').textContent = '프리셋을 1개 이상 유지하세요.'; return; }
      if(!confirm(`'${p.name}' 프리셋을 삭제하려면 확인을 누르세요.\n삭제 후 되돌릴 수 없습니다.`)) return;
      if(!MosaicStorage.savePresets(storedList.filter(x => x.name !== p.name))){
        document.getElementById('presetStatus').textContent = MosaicStorage.presetSaveFailure;
        return;
      }
      if(currentPresetName === p.name) currentPresetName = null;
      renderPresetList();
    });

    card.addEventListener('dragstart', (e) => {
      if(!canReorder || e.target !== dragHandle) return;
      draggedPresetCard = card;
      card.classList.add('dragging');
      if(e.dataTransfer){
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', p.name);
      }
    });
    card.addEventListener('dragover', (e) => {
      if(!draggedPresetCard || draggedPresetCard === card) return;
      e.preventDefault();
      const rect = card.getBoundingClientRect();
      const nearSameRow = Math.abs(e.clientY - (rect.top + rect.height / 2)) < rect.height * .3;
      const before = nearSameRow ? e.clientX < rect.left + rect.width / 2 : e.clientY < rect.top + rect.height / 2;
      container.insertBefore(draggedPresetCard, before ? card : card.nextSibling);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      draggedPresetCard = null;
      persistPresetDomOrder();
      renderPresetList();
    });

    if(presetManageMode) head.append(dragHandle, nameEl, activeMark, manage);
    else head.append(nameEl, activeMark, manage);
    card.append(head, swatch);
    container.appendChild(card);
  });

  if(!all.find(p => p.name === currentPresetName)) currentPresetName = null;
  updateOverwriteBtn();
}

function currentAppliedThemeSource(){
  const currentValues = currentSavedPresetValues();
  if(currentPresetName){
    const presets = MosaicStorage.loadPresets(currentSavedPresetValues());
    const selected = presets && presets.find(p => p.name === currentPresetName);
    if(selected && savedPresetStateEqual(selected.values, currentValues)){
      return { kind:'saved', name:currentPresetName };
    }
  }
  if(currentComboName){
    const combo = COLOR_COMBOS.find(item => item.name === currentComboName);
    const sameColors = combo && MosaicState.THEME_COLOR_FIELDS.every(id =>
      String(combo.v[id]).toLowerCase() === String(currentValues[id]).toLowerCase()
    );
    if(sameColors) return { kind:'recommended', name:currentComboName };
  }
  return { kind:'direct', name:'' };
}

// 선택된 내 프리셋이 있을 때만 '덮어쓰기' 버튼을 활성화한다. 접힌 세 영역은
// 출처와 현재 상태를 나눠 보여 같은 프리셋 이름이 반복되지 않게 한다.
function updateOverwriteBtn(){
  const btn = document.getElementById('overwritePresetBtn');
  const status = document.getElementById('themeCurrentStatus');
  const appliedName = document.getElementById('currentThemeAppliedName');
  const recommendedStatus = document.getElementById('recommendedPresetStatus');
  const savedActiveName = document.getElementById('savedPresetActiveName');
  const savedCountWrap = document.getElementById('savedPresetCountWrap');
  if(!btn) return;
  btn.disabled = !currentPresetName;
  btn.textContent = '변경사항 저장';
  const source = currentAppliedThemeSource();
  if(appliedName) appliedName.textContent = source.kind === 'direct' ? '직접 편집' : source.name;
  if(recommendedStatus) recommendedStatus.textContent = source.kind === 'recommended'
    ? `${source.name} · 적용 중`
    : '색상 조합';
  if(savedActiveName){
    savedActiveName.hidden = source.kind !== 'saved';
    savedActiveName.textContent = source.kind === 'saved' ? `${source.name} · 적용 중` : '';
  }
  if(savedCountWrap) savedCountWrap.hidden = source.kind === 'saved';
  const styleName = MosaicUI.controls.selectedText('dlgStyle') || '글자 강조';
  if(status) status.textContent = source.kind === 'direct'
    ? `직접 편집 · ${styleName}`
    : styleName;
}

function updateSavePresetBtn(){
  const input = document.getElementById('presetName');
  document.getElementById('savePresetBtn').disabled = !input.value.trim();
}

const ADVANCED_RESET_GROUP_FIELDS = {
  cardTitle:['cardDividerLength','cardTitlePadding','cardTitleOrnamentOpacity','foldAutoNumberStyle'],
  cardOutline:['cardCornerRadius'],
  cardSpacing:['profileTitleGap','coverCardGap','cardGap'],
  creditAppearance:['creditWidth','creditCardGap','creditBorderOn','creditTransparentOn'],
  coverSpace:['coverVerticalSpace','coverDividerLength'],
  topProfile:['profileOuterBackground','profileItemGap'],
  cardInterior:['cardBodyTopSpace','cardBodyBottomSpace','cardInlinePadding'],
  footerSpacing:['footerBodyGap'],
  headingSpacing:['headingTopSpace','headingBetweenSpace','headingBottomSpace'],
  hr:['hrShape','hrOpacity','hrLength','hrVerticalSpace'],
  hr2:['hr2Shape','hr2Opacity','hr2VerticalSpace'],
  hr3:['hr3Shape','hr3Opacity','hr3VerticalSpace'],
  hr4:['gapHeight']
};

function resetAdvancedControlFields(ids){
  if(!document.getElementById('advancedOn').checked) return;
  ids.forEach(id => {
    const input = document.getElementById(id);
    if(input.type === 'checkbox') input.checked = MosaicState.DEFAULT_STYLE[id];
    else input.value = MosaicState.DEFAULT_STYLE[id];
  });
  ['hrShape','hr2Shape','hr3Shape','foldAutoNumberStyle','profileOuterBackground'].filter(id => ids.includes(id)).forEach(syncSegmentedChoiceControl);
  MosaicUI.controls.syncTypographyLabels();
  MosaicUI.controls.syncDesignSummaries();
  MosaicUI.controls.updateHexLabels();
  host.styleChange();
}

function initializeThemeSelection(){
  const initialList = MosaicStorage.loadPresets(currentSavedPresetValues());
  const matchingInitialPreset = initialList && initialList.find(p => savedPresetStateEqual(p.values, currentSavedPresetValues()));
  const matchingInitialCombo = COLOR_COMBOS.find(combo =>
    Object.entries(combo.v).every(([id, value]) =>
      String(document.getElementById(id).value).toLowerCase() === String(value).toLowerCase()
    )
  );
  currentComboName = matchingInitialCombo ? matchingInitialCombo.name : null;
  if(matchingInitialCombo && !matchingInitialCombo.families.includes('featured')){
    currentComboFamily = matchingInitialCombo.families[0];
  }
  currentPresetName = matchingInitialCombo ? null : (matchingInitialPreset ? matchingInitialPreset.name : null);
  renderPresetList();
  renderComboFamilyFilters();
  renderComboList();
  renderSlotList();
  host.commitStyleHistory(true); // 초기 작업 상태를 기록의 첫 항목으로
  host.updateHistoryButtons();
}

function resetThemeSelection(){ currentPresetName = null; currentComboName = null; renderPresetList(); renderComboList(); }
function bindFeatureEvents(){
// 조각로그 v1.9.0 HTML 복원·파일 저장·로그 보관함 모듈.

// ---------- 출력 HTML에서 작업 복원 ----------
document.getElementById('restoreHtmlBtn').addEventListener('click', () => {
  document.getElementById('restoreHtmlFile').click();
});

document.getElementById('restoreHtmlFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const status = document.getElementById('restoreHtmlStatus');
  if(!file) return;
  if(file.size > 12 * 1024 * 1024){
    status.style.color = '#c0392b';
    status.textContent = 'HTML 파일이 너무 큽니다. (최대 12MB)';
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    let rawWork;
    try {
      rawWork = MosaicStorage.decodeRestoreState(String(reader.result || ''));
    } catch(err){
      status.style.color = '#c0392b';
      status.textContent = err && err.message ? err.message : 'HTML 복원 데이터를 읽지 못했습니다.';
      return;
    }
    if(!rawWork){
      status.style.color = '#c0392b';
      status.textContent = '복원 정보가 없는 HTML입니다. 이 기능이 추가된 뒤 저장한 출력물을 선택해 주세요.';
      return;
    }
    const work = MosaicState.sanitizeImportedWork(rawWork);
    if(!work){
      status.style.color = '#c0392b';
      status.textContent = 'HTML 안의 조각로그 작업 정보가 올바르지 않습니다.';
      return;
    }
    MosaicUI.cards.snapshot();
    MosaicUI.work.apply(work);
    MosaicUI.feedback.undo('출력 HTML에서 작업 복원.');
    status.style.color = '';
    status.textContent = `복원 완료: ${work.cards.length}개 블록`;
  };
  reader.onerror = () => {
    status.style.color = '#c0392b';
    status.textContent = 'HTML 파일을 읽지 못했습니다.';
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ---------- HTML 파일로 저장 ----------
document.getElementById('downloadBtn').addEventListener('click', () => {
  const title = (document.getElementById('logTitle').value || '').trim();
  const num = (document.getElementById('logNumber').value || '').trim();
  const rawName = (num || title) ? `${num}${num && title ? ' ' : ''}${title}` : '조각로그';
  const name = rawName.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 120) || '조각로그';
  const blob = new Blob([host.generateHTML(true)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name + '.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById('slotSearch').addEventListener('input', renderSlotList);

document.getElementById('slotSort').addEventListener('change', renderSlotList);

document.getElementById('slotExpandBtn').addEventListener('click', () => {
  slotListExpanded = !slotListExpanded;
  renderSlotList();
});

document.getElementById('saveSlotBtn').addEventListener('click', () => {
  const nameInput = document.getElementById('slotName');
  const name = nameInput.value.trim()
    || document.getElementById('logTitle').value.trim()
    || '무제 로그';
  if(name.length > 100){
    document.getElementById('slotImportStatus').textContent = '보관함 이름은 100자 이하로 입력해 주세요.';
    return;
  }
  const list = MosaicStorage.loadSlots();
  if(list === null){ showSlotReadError(); return; }
  const data = collectValidatedSlotWork();
  if(!data) return;
  const next = [{ id: MosaicStorage.makeSlotId(), name, savedAt: Date.now(), data }, ...list];
  if(!MosaicStorage.saveSlots(next)){
    document.getElementById('slotImportStatus').textContent = MosaicStorage.slotSaveFailure;
    return;
  }
  nameInput.value = '';
  const status = document.getElementById('slotImportStatus');
  status.style.color = '';
  status.textContent = `'${name}'을 보관했습니다.`;
  renderSlotList();
});

document.getElementById('slotExportMenuBtn').addEventListener('click', () => {
  if(document.getElementById('slotExportMenu').hidden) openSlotExportMenu();
  else closeSlotExportMenu(true);
});

document.getElementById('slotExportDropdown').addEventListener('keydown', event => {
  const menu = document.getElementById('slotExportMenu');
  if(event.key === 'Escape' && !menu.hidden){
    event.preventDefault();event.stopPropagation();closeSlotExportMenu(true);return;
  }
  if(event.key === 'Tab' && !menu.hidden){
    event.preventDefault();closeSlotExportMenu();
    document.getElementById(event.shiftKey ? 'slotExportMenuBtn' : 'importSlotsBtn').focus();return;
  }
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
  if(event.target.id === 'slotExportMenuBtn'){
    event.preventDefault();openSlotExportMenu(event.key === 'ArrowUp' || event.key === 'End');return;
  }
  if(menu.hidden) return;
  event.preventDefault();
  const items = Array.from(menu.querySelectorAll('button')).filter(button=>!button.disabled);
  const current = items.indexOf(document.activeElement);
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length-1
    : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[index]?.focus();
});

document.getElementById('slotExportDropdown').addEventListener('focusout', event => {
  if(!event.currentTarget.contains(event.relatedTarget)) closeSlotExportMenu();
});

document.addEventListener('click', event => {
  if(!document.getElementById('slotExportDropdown').contains(event.target)) closeSlotExportMenu(true);
});

document.getElementById('exportSlotsBtn').addEventListener('click', () => { closeSlotExportMenu(true);exportSlots(); });

document.getElementById('exportSplitSlotsBtn').addEventListener('click', () => { closeSlotExportMenu(true);exportSplitSlots(); });

document.getElementById('exportSelectedSlotsBtn').addEventListener('click', () => exportSlots(true));

document.getElementById('slotSelectTenBtn').addEventListener('click', () => selectArchiveSlots(10));

document.getElementById('slotSelectAllBtn').addEventListener('click', () => selectArchiveSlots(Infinity));

document.getElementById('slotClearSelectionBtn').addEventListener('click', () => { selectedSlotIds.clear();renderSlotList(); });

document.getElementById('deleteSelectedSlotsBtn').addEventListener('click', deleteSelectedSlots);

document.getElementById('slotSelectBtn').addEventListener('click', () => {
  slotSelectionMode = !slotSelectionMode;
  if(!slotSelectionMode) selectedSlotIds.clear();
  renderSlotList();
});

document.getElementById('importSlotsBtn').addEventListener('click', () => {
  document.getElementById('importSlotsFile').click();
});

document.getElementById('importSlotsFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const st = document.getElementById('slotImportStatus');
  if(!file) return;
  if(file.size > MosaicStorage.MAX_ARCHIVE_BYTES){
    st.style.color = '#c0392b';
    st.textContent = '보관함 파일이 너무 큽니다. (최대 4MB)';
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    let imported;
    try {
      imported = JSON.parse(reader.result);
    } catch(err){
      st.style.color = '#c0392b';
      st.textContent = '파일 읽기 실패. JSON 형식을 확인.';
      return;
    }
    // 보관함 슬롯 형식과 각 본문·코멘트 블록 및 필드의 자료형을 함께 검증한다.
    if(!Array.isArray(imported) || imported.length > MosaicStorage.MAX_IMPORTED_SLOTS){
      st.style.color = '#c0392b';
      st.textContent = '조각로그 보관함 파일이 아니거나 항목이 너무 많습니다. (최대 200개)';
      return;
    }
    const cleaned = imported.map(sl => {
      let data;
      try { data = sl && MosaicState.sanitizeImportedWork(sl.data); }
      catch(err){ data = null; }
      if(!data || typeof sl.name !== 'string' || !sl.name.trim() || sl.name.length > 100 || /[\u0000-\u001F\u007F]/.test(sl.name)) return null;
      if(sl.id !== undefined && sl.id !== '' && !MosaicStorage.validSlotId(sl.id)) return null;
      const savedAt = Number(sl.savedAt);
      return { id: sl.id || '', name: sl.name.trim(), savedAt: Number.isFinite(savedAt) && savedAt > 0 ? savedAt : Date.now(), data };
    });
    if(!cleaned.length || cleaned.some(sl => !sl)){
      st.style.color = '#c0392b';
      st.textContent = '보관함 블록이나 필드 형식이 올바르지 않음.';
      return;
    }
    imported = cleaned;
    const importedIds = imported.map(sl => sl.id).filter(Boolean);
    if(new Set(importedIds).size !== importedIds.length){
      st.style.color = '#c0392b';
      st.textContent = '보관함 파일 안에 중복된 항목 ID가 있습니다.';
      return;
    }
    const idlessNames = imported.filter(sl => !sl.id).map(sl => sl.name);
    if(new Set(idlessNames).size !== idlessNames.length){
      st.style.color = '#c0392b';
      st.textContent = 'ID가 없는 보관함 항목의 이름이 중복되어 가져오지 않았습니다.';
      return;
    }
    const list = MosaicStorage.loadSlots();
    if(list === null){
      showSlotReadError();
      return;
    }
    let added = 0, updated = 0;
    imported.forEach(sl => {
      const idx = sl.id
        ? list.findIndex(existing => existing.id === sl.id)
        : list.findIndex(existing => existing.name === sl.name);
      const entry = { id: idx >= 0 ? list[idx].id : (sl.id || MosaicStorage.makeSlotId()), name: sl.name, savedAt: sl.savedAt || Date.now(), data: sl.data };
      if(idx >= 0){ list[idx] = entry; updated++; }
      else { list.unshift(entry); added++; }
    });
    if(!MosaicStorage.saveSlots(list)){
      st.style.color = '#c0392b';
      st.textContent = MosaicStorage.slotSaveFailure;
      return;
    }
    renderSlotList();
    st.style.color = '';
    st.textContent = `불러오기 완료 — ${added}개 추가, ${updated}개 덮어씀.`;
  };
  reader.onerror = () => {
    st.style.color = '#c0392b';
    st.textContent = '파일을 읽지 못했습니다.';
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('newLogBtn').addEventListener('click', startNewLog);

document.getElementById('sidebarNewLogBtn').addEventListener('click', startNewLog);

document.getElementById('resetCurrentWorkBtn').addEventListener('click', () => {
  host.cancelStyleHistoryCommit();
  MosaicUI.cards.snapshot();

  // 현재 작업 데이터만 빈 작업 상태로 되돌림. SLOT_KEY·PRESET_KEY는 건드리지 않는다.
  Object.entries(MosaicState.WORK_FIELD_DEFAULTS).forEach(([id, value]) => {
    document.getElementById(id).value = value;
  });
  MosaicUI.controls.syncProfileTags();
  MosaicUI.controls.renderNameRules();
  MosaicUI.controls.renderKeywordRules();
  Object.entries(MosaicState.WORK_BOOLEAN_DEFAULTS).forEach(([id, value]) => {
    document.getElementById(id).checked = value;
  });
  MosaicUI.controls.syncCover();
  document.getElementById('imgHeightVal').value = '300';
  document.getElementById('xposVal').value = '50';
  document.getElementById('yposVal').value = '0';

  MosaicUI.cards.clear();
  MosaicUI.cards.setActiveTextarea(null);
  MosaicUI.cards.add('', false);
  MosaicUI.cards.setActiveTextarea(MosaicUI.cards.textareas()[0] || null);

  applyStyleValues(MosaicState.DEFAULT_STYLE);
  currentPresetName = null;
  currentComboName = '모노 클래식';
  currentComboFamily = 'featured';
  charRowsKey = null;
  syncCharList();

  // 검색·선택·임시 입력 같은 화면 상태도 함께 비움.
  MosaicUI.preview.closeSearch();
  MosaicUI.preview.clearFullscreenSearch();
  MosaicUI.preview.hideSelectionToolbar();
  ['pvFindInput','pvReplInput','fsFindInput','fsReplInput','nameFrom','nameTo','keywordFrom','keywordTo','slotName','presetName']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  ['nameStatus','keywordStatus','copyStatus','presetStatus','importStatus']
    .forEach(id => { const el = document.getElementById(id); if(el) el.textContent = ''; });

  // 초안을 먼저 지우면 원본 비교가 충돌하고 다른 탭의 최신 초안도 잃는다.
  // 빈 작업도 아래의 공통 저장 경로를 통과시켜 실패·충돌 시 기존 원본을 보존한다.
  renderPresetList();
  renderComboList();
  updateSavePresetBtn();
  const saved = host.committedChange();
  MosaicUI.feedback.undo('현재 작업 전체 초기화.');

  const status = document.getElementById('slotImportStatus');
  status.style.color = saved ? '' : '#c0392b';
  status.textContent = saved ? '현재 작업을 모두 비웠습니다.'
    : '현재 작업은 비웠지만 초안을 저장하지 못했습니다. 상단 저장 상태를 확인해 주세요.';
  setTimeout(() => { status.textContent = ''; }, 3000);
  const activeTextarea = MosaicUI.cards.activeTextarea();
  if(activeTextarea) activeTextarea.focus();
});

document.getElementById('dlgStylePrev').addEventListener('click', () => stepDialogueStyle(-1));

document.getElementById('dlgStyleNext').addEventListener('click', () => stepDialogueStyle(1));

[
  ['textFont', 'textFontPrev', 'textFontNext'],
  ['parallelTranslationLayout', 'parallelLayoutPrev', 'parallelLayoutNext'],
  ['spacingMode', 'spacingModePrev', 'spacingModeNext'],
  ['cardWidth', 'cardWidthPrev', 'cardWidthNext']
].forEach(([selectId, prevId, nextId]) => {
  document.getElementById(prevId).addEventListener('click', () => stepSelectOption(selectId, -1));
  document.getElementById(nextId).addEventListener('click', () => stepSelectOption(selectId, 1));
});

document.getElementById('cardLayoutUnifiedOn').addEventListener('change', event => {
  const select = document.getElementById('cardLayout');
  const next = event.target.checked ? 'unified' : 'separate';
  if(select.value === next) return;
  select.value = next;
  select.dispatchEvent(new Event('input', { bubbles:true }));
  host.commitStyleHistory(true);
});

document.querySelectorAll('[data-minimal-control]').forEach(group => {
  const input = document.getElementById(group.dataset.minimalControl);
  group.querySelectorAll('button[data-value]').forEach(button => {
    button.addEventListener('click', () => {
      const next = button.dataset.value === 'minimal';
      if(input.disabled || input.checked === next) return;
      input.checked = next;
      input.dispatchEvent(new Event('input', { bubbles:true }));
      input.dispatchEvent(new Event('change', { bubbles:true }));
    });
  });
});

document.querySelectorAll('.segmentedChoice[data-control]').forEach(group => {
  const selectId = group.dataset.control;
  group.querySelectorAll('button[data-value]').forEach(button => {
    button.addEventListener('click', () => {
      const select = document.getElementById(selectId);
      if(!select || select.disabled || select.value === button.dataset.value) return;
      const workLabel = selectId === 'titleTextPosition' ? '표제 라벨 위치 변경' : null;
      if(workLabel) MosaicUI.cards.snapshot();
      select.value = button.dataset.value;
      select.dispatchEvent(new Event('input', { bubbles:true }));
      syncSegmentedChoiceControl(selectId);
      if(workLabel) host.recordCompletedAction(workLabel);
    });
  });
});

SEGMENTED_CHOICE_SELECT_IDS.forEach(id => {
  const select = document.getElementById(id);
  if(!select) return;
  select.addEventListener('input', () => syncSegmentedChoiceControl(id));
  select.addEventListener('change', () => syncSegmentedChoiceControl(id));
});

bindThemeHoverPreviewList('comboList', '.comboCard');

bindThemeHoverPreviewList('presetList', '.presetCard', true);

window.addEventListener('blur', () => {
  if(themeHoverPreview) endThemeHoverPreview(themeHoverPreview.key);
});

document.getElementById('currentThemePaletteButton').addEventListener('click', () => {
  const select = document.getElementById('dlgStyle');
  select.value = nextDialogueStyleValue(select.value);
  MosaicUI.controls.syncDesignSummaries();
  MosaicUI.preview.render();
  updateOverwriteBtn();
  host.saveDraft();
  host.commitStyleHistory(true);
});

// 추천 색상·저장 프리셋을 적용한 뒤 값을 직접 바꾸면 선택 맥락은 저장 버튼을 위해
// 유지하되, 접힌 요약에서는 더 이상 '적용 중'으로 표시하지 않는다.
MosaicState.SAVED_PRESET_FIELDS.forEach(id => {
  document.getElementById(id).addEventListener('input', updateOverwriteBtn);
});

try {
  const savedView = JSON.parse(localStorage.getItem(PRESET_VIEW_KEY) || '{}');
  if(['manual','recent','name'].includes(savedView.sort)) presetSortMode = savedView.sort;
} catch(e){}

document.getElementById('presetSearch').addEventListener('input', (e) => {
  presetSearchQuery = e.target.value;
  renderPresetList();
});

document.getElementById('presetManageToggle').addEventListener('click', () => {
  presetManageMode = !presetManageMode;
  const toggle = document.getElementById('presetManageToggle');
  toggle.textContent = presetManageMode ? '완료' : '관리';
  toggle.setAttribute('aria-pressed', String(presetManageMode));
  if(!presetManageMode){
    presetSearchQuery = '';
    document.getElementById('presetSearch').value = '';
    document.querySelectorAll('#presetList .presetMenu').forEach(menu => { menu.hidden = true; });
  }
  renderPresetList();
});

document.getElementById('presetSort').value = presetSortMode;

document.getElementById('presetSort').addEventListener('change', (e) => {
  presetSortMode = e.target.value;
  savePresetView();
  renderPresetList();
});

document.addEventListener('click', (e) => {
  if(e.target.closest('.presetManage')) return;
  document.querySelectorAll('#presetList .presetMenu').forEach(menu => { menu.hidden = true; });
  document.querySelectorAll('#presetList .presetMenuBtn').forEach(btn => { btn.setAttribute('aria-expanded', 'false'); });
});

document.getElementById('overwritePresetBtn').addEventListener('click', () => {
  if(!currentPresetName) return;
  const list = MosaicStorage.loadPresets(currentSavedPresetValues());
  if(list === null){ showPresetReadError(); return; }
  const target = list.find(p => p.name === currentPresetName);
  if(!target) return;
  const overwrittenPresetName = currentPresetName;
  const previousStoredPresets = localStorage.getItem(MosaicStorage.PRESET_KEY);
  target.values = currentSavedPresetValues();
  target._stored = null;
  if(!MosaicStorage.savePresets(list)){
    document.getElementById('presetStatus').textContent = MosaicStorage.presetSaveFailure;
    return;
  }
  const writtenStoredPresets = MosaicStorage.lastPresetReadRaw;
  renderPresetList();
  const st = document.getElementById('presetStatus');
  st.textContent = `'${overwrittenPresetName}'에 덮어씀.`;
  MosaicUI.feedback.undo(`'${overwrittenPresetName}' 프리셋 덮어씀.`, () => {
    const restored = MosaicStorage.restoreStoredValue(MosaicStorage.PRESET_KEY, previousStoredPresets, writtenStoredPresets);
    const undoStatus = document.getElementById('presetStatus');
    if(!restored){
      undoStatus.textContent = '프리셋이 그사이 변경되었거나 저장소에 오류가 있어 되돌리지 못했습니다. 목록을 다시 확인해 주세요.';
      return;
    }
    undoStatus.textContent = `'${overwrittenPresetName}' 프리셋 덮어쓰기를 되돌렸습니다.`;
    renderPresetList();
    renderComboList();
  });
});

document.getElementById('presetName').addEventListener('input', updateSavePresetBtn);

document.getElementById('savePresetBtn').addEventListener('click', () => {
  const nameInput = document.getElementById('presetName');
  const name = nameInput.value.trim();
  if(!name){
    nameInput.placeholder = '이름을 먼저 입력';
    return;
  }
  if(name.length > 80){
    document.getElementById('presetStatus').textContent = '프리셋 이름은 80자 이하로 입력해 주세요.';
    return;
  }
  const list = MosaicStorage.loadPresets(currentSavedPresetValues());
  if(list === null){ showPresetReadError(); return; }
  const values = currentSavedPresetValues();
  const existingIdx = list.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
  if(existingIdx >= 0){
    document.getElementById('presetStatus').textContent = '같은 이름이 이미 있습니다. 선택 후 변경사항 저장을 사용해 주세요.';
    return;
  }
  list.push({ name, values });
  if(!MosaicStorage.savePresets(list)){
    document.getElementById('presetStatus').textContent = MosaicStorage.presetSaveFailure;
    return;
  }
  currentPresetName = name;
  currentComboName = null;
  renderPresetList();
  renderComboList();
  nameInput.value = '';
  updateSavePresetBtn();
});

document.getElementById('resetDefaultsBtn').addEventListener('click', () => {
  applyStyleValues(MosaicState.DEFAULT_STYLE);
  currentPresetName = null;
  currentComboName = '모노 클래식';
  currentComboFamily = 'featured';
  renderPresetList();
  renderComboList();
  host.styleChange();
});

document.getElementById('advancedResetBtn').addEventListener('click', () => {
  resetAdvancedControlFields(['advancedOn', 'unifiedBottomSpace', ...Object.values(ADVANCED_RESET_GROUP_FIELDS).flat()]);
});

document.querySelectorAll('#advancedDesignGroup .advancedOptionResetBtn').forEach(button => {
  button.addEventListener('click', () => {
    const fields = ADVANCED_RESET_GROUP_FIELDS[button.dataset.resetGroup];
    if(fields) resetAdvancedControlFields(fields);
  });
});

// ---------- 프리셋 내보내기 / 불러오기 ----------
document.getElementById('exportPresetBtn').addEventListener('click', () => {
  const list = MosaicStorage.loadPresets(currentSavedPresetValues());
  if(list === null){ showPresetReadError(); return; }
  const exportList = list.map(preset => {
    const stored = preset._stored && typeof preset._stored === 'object' ? preset._stored : null;
    return {
      ...(stored ? stored : {}),
      name: preset.name,
      values: stored ? stored.values : preset.values
    };
  });
  const blob = new Blob([JSON.stringify(exportList, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'log_presets.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById('importPresetBtn').addEventListener('click', () => {
  document.getElementById('importPresetFile').click();
});

document.getElementById('importPresetFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const statusEl = document.getElementById('importStatus');
  if(!file) return;
  if(file.size > MosaicStorage.MAX_PRESET_BYTES){
    statusEl.style.color = '#c0392b';
    statusEl.textContent = '프리셋 파일이 너무 큽니다. (최대 512KB)';
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    let imported;
    try {
      imported = JSON.parse(reader.result);
    } catch(err){
      statusEl.style.color = '#c0392b';
      statusEl.textContent = '파일 읽기 실패. JSON 형식을 확인.';
      return;
    }
    if(!Array.isArray(imported) || imported.length > MosaicStorage.MAX_IMPORTED_PRESETS){
      statusEl.style.color = '#c0392b';
      statusEl.textContent = '이 도구의 프리셋 파일이 아니거나 항목이 너무 많습니다. (최대 100개)';
      return;
    }
    const cleaned = imported.map(MosaicState.sanitizeImportedPreset);
    if(!cleaned.length || cleaned.some(p => !p)){
      statusEl.style.color = '#c0392b';
      statusEl.textContent = '프리셋 값이나 색상 형식이 올바르지 않음.';
      return;
    }
    const importedNames = cleaned.map(p => p.name.toLowerCase());
    if(new Set(importedNames).size !== importedNames.length){
      statusEl.style.color = '#c0392b';
      statusEl.textContent = '프리셋 파일 안에 중복된 이름이 있습니다.';
      return;
    }
    imported = cleaned;

    const list = MosaicStorage.loadPresets(currentSavedPresetValues());
    if(list === null){ showPresetReadError(); return; }
    let addedCount = 0, updatedCount = 0;
    imported.forEach(p => {
      const idx = list.findIndex(existing => existing.name.toLowerCase() === p.name.toLowerCase());
      if(idx >= 0){
        list[idx].values = p.values;
        list[idx]._stored = null;
        updatedCount++;
      } else {
        list.push({ name: p.name, values: p.values });
        addedCount++;
      }
    });
    if(!MosaicStorage.savePresets(list)){
      statusEl.style.color = '#c0392b';
      statusEl.textContent = MosaicStorage.presetSaveFailure;
      return;
    }
    const appliedPreset = list.find(p => p.name.toLowerCase() === imported[0].name.toLowerCase());
    currentPresetName = appliedPreset ? appliedPreset.name : imported[0].name;
    currentComboName = null;
    applyThemeColorValues(imported[0].values);
    renderPresetList();
    renderComboList();
    host.styleChange();

    statusEl.style.color = '#2a7a2a';
    statusEl.textContent = `불러오기 완료: 새로 추가 ${addedCount}개, 덮어쓰기 ${updatedCount}개.`;
  };
  reader.onerror = () => {
    statusEl.style.color = '#c0392b';
    statusEl.textContent = '프리셋 파일을 읽지 못했습니다.';
  };
  reader.readAsText(file);
  e.target.value = ''; // 같은 파일 다시 선택해도 change가 발생하도록 초기화
});

}
return Object.freeze({...Object.freeze({
applyDraftRestorePlan,
applyStyleValues,
closeSlotExportMenu,
commitThemeHoverPreview,
currentSavedPresetValues,
currentStyleValues,
initializeThemeSelection,
invalidateCharacterRows,
parseExtraChars,
renderComboList,
renderCurrentThemePalette,
renderPresetList,
renderSlotList,
resetThemeSelection,
savedTimeLabel,
setDraftStatus,
stepSelectOption,
syncAllSegmentedChoiceControls,
syncCharList,
syncMinimalChoiceControls,
syncSegmentedChoiceControl,
updateOverwriteBtn
}), bindFeatureEvents});
}

return Object.freeze({createCredit,createLibrary});
})();
