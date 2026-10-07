// 조각로그 v1.8.2 HTML 복원·파일 저장·로그 보관함 모듈.

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
      rawWork = decodeRestoreState(String(reader.result || ''));
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
    const work = sanitizeImportedWork(rawWork);
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
  const blob = new Blob([generateHTML(true)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name + '.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ---------- 로그 보관함 (초안 슬롯) ----------
const SLOT_KEY = 'logGenSlots_v1';
const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;
const MAX_IMPORTED_SLOTS = 200;
const MAX_CARD_CHARS = 500000;
const MAX_TOTAL_BODY_CHARS = 2000000;
const MAX_FOLD_TITLE_CHARS = 200;

// 보관함·프리셋처럼 현재 작업과 별도로 저장되는 자료는 덮어쓰기 직전의
// 원본 문자열만 잠시 보관한다. 큰 보관함을 일반 작업 기록마다 복제하지 않으면서
// 덮어쓰기 직후에는 정확한 저장 상태로 되돌릴 수 있다.
function restoreStoredValue(key, previousValue, expectedCurrentValue){
  try {
    if(expectedCurrentValue !== undefined && localStorage.getItem(key) !== expectedCurrentValue) return false;
    if(previousValue === null) localStorage.removeItem(key);
    else localStorage.setItem(key, previousValue);
    return true;
  } catch(e){
    return false;
  }
}

function validSlotId(id){
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

function makeSlotId(){
  if(globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'slot-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function makeLegacySlotId(slot, index){
  const seed = `${slot && slot.name || ''}|${slot && slot.savedAt || ''}|${index}`;
  let hash = 2166136261;
  for(let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return `legacy-${(hash >>> 0).toString(36)}-${index}`;
}

let slotReadIssue = '';
let lastSlotReadRaw;
let slotSaveFailure = '';
function loadSlots(allowPartial = false){
  slotReadIssue = '';
  lastSlotReadRaw = undefined;
  try {
    const raw = localStorage.getItem(SLOT_KEY);
    lastSlotReadRaw = raw;
    if(raw === null) return [];
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed)){
      slotReadIssue = '저장된 보관함 목록 형식이 올바르지 않습니다.';
      return null;
    }
    const cleaned = [];
    const seenIds = new Set();
    const unreadable = [];
    for(let index = 0; index < parsed.length; index++){
      const slot = parsed[index];
      if(!slot || typeof slot.name !== 'string' || !slot.name.trim() || slot.name.trim().length > 100 || /[\u0000-\u001F\u007F]/.test(slot.name)){
        unreadable.push(`${index + 1}번 항목의 이름`);
        continue;
      }
      let data;
      try { data = sanitizeImportedWork(slot.data); }
      catch(e){ data = null; }
      if(!data){
        unreadable.push(`${index + 1}번 항목의 작업·설정`);
        continue;
      }
      if(slot.id !== undefined && slot.id !== '' && !validSlotId(slot.id)){
        unreadable.push(`${index + 1}번 항목의 ID`);
        continue;
      }
      const id = validSlotId(slot.id) ? slot.id : makeLegacySlotId(slot, index);
      if(seenIds.has(id)){
        unreadable.push(`${index + 1}번 항목의 중복 ID`);
        continue;
      }
      seenIds.add(id);
      const savedAt = Number(slot.savedAt);
      const entry = { id, name: slot.name.trim(), savedAt: Number.isFinite(savedAt) && savedAt > 0 ? savedAt : Date.now(), data };
      // 검증에는 정규화된 data를 쓰되, 수정하지 않은 슬롯의 추가 필드가 사라지지 않게 원본도 보존한다.
      Object.defineProperty(entry, '_stored', { value:slot, writable:true, enumerable:false });
      cleaned.push(entry);
    }
    if(unreadable.length){
      slotReadIssue = `${unreadable.slice(0, 3).join(', ')}${unreadable.length > 3 ? ` 외 ${unreadable.length - 3}개 항목` : ''}을 읽지 못했습니다.`;
      return allowPartial ? cleaned : null;
    }
    return cleaned;
  } catch(e){
    slotReadIssue = '보관함 저장소 또는 JSON 데이터를 읽지 못했습니다.';
    return null;
  }
}
function saveSlots(list){
  slotSaveFailure = '';
  if(!Array.isArray(list) || lastSlotReadRaw === undefined){
    slotSaveFailure = '보관함 목록을 다시 읽은 뒤 저장해 주세요.';
    return false;
  }
  try {
    if(localStorage.getItem(SLOT_KEY) !== lastSlotReadRaw){
      slotSaveFailure = '다른 탭에서 보관함이 변경되어 저장하지 않았습니다. 보관함을 다시 열어 확인해 주세요.';
      return false;
    }
    const payload = list.map(slot => {
      const stored = slot && slot._stored && typeof slot._stored === 'object' ? slot._stored : null;
      const base = stored ? { ...stored } : {};
      return {
        ...base,
        id: slot.id,
        name: slot.name,
        savedAt: slot.savedAt,
        data: stored ? stored.data : slot.data
      };
    });
    const serialized = JSON.stringify(payload);
    localStorage.setItem(SLOT_KEY, serialized);
    lastSlotReadRaw = serialized;
    return true;
  }
  catch(e){
    slotSaveFailure = '저장 공간 부족 또는 브라우저 저장소 오류로 보관함을 변경하지 못했습니다.';
    return false;
  }
}

function showSlotReadError(){
  const status = document.getElementById('slotImportStatus');
  status.style.color = '#c0392b';
  status.textContent = `${slotReadIssue || '기존 보관함을 읽지 못했습니다.'} 저장 데이터는 변경하지 않았습니다. 원본 백업을 먼저 보관해 주세요.`;
}

function collectValidatedSlotWork(){
  const data = sanitizeImportedWork(MosaicUI.work.collectSlot());
  if(data) return data;
  const status = document.getElementById('slotImportStatus');
  status.style.color = '#c0392b';
  status.textContent = '현재 작업이 보관 한도를 넘었거나 형식이 올바르지 않아 저장하지 않았습니다.';
  return null;
}

function sanitizeImportedWork(data){
  if(!data || !Array.isArray(data.cards) || data.cards.length > 200) return null;
  const cards = [];
  let totalBodyChars = 0;
  for(const card of data.cards){
    let type = 'card';
    if(typeof card === 'object' && card !== null){
      if(card.type !== undefined && !['card','comment'].includes(card.type)) return null;
      type = card.type === 'comment' ? 'comment' : 'card';
      if(card.folded !== undefined && typeof card.folded !== 'boolean') return null;
      if(card.foldTitle !== undefined && typeof card.foldTitle !== 'string') return null;
      if(card.foldMinimal !== undefined && typeof card.foldMinimal !== 'boolean') return null;
      if(card.visible !== undefined && typeof card.visible !== 'boolean') return null;
    }
    const body = typeof card === 'string' ? card : card && card.body;
    const foldTitle = typeof card === 'object' && typeof card.foldTitle === 'string' ? card.foldTitle : '';
    if(typeof body !== 'string' || body.length > MAX_CARD_CHARS || foldTitle.length > MAX_FOLD_TITLE_CHARS) return null;
    totalBodyChars += body.length;
    if(totalBodyChars > MAX_TOTAL_BODY_CHARS) return null;
    const visible = typeof card !== 'object' || card.visible !== false;
    cards.push(type === 'comment'
      ? { type:'comment', body, visible }
      : {
          type:'card',
          body,
          folded: typeof card === 'object' && !!card.folded,
          foldTitle,
          foldMinimal: typeof card === 'object' && !!card.foldMinimal,
          visible
        });
  }
  const source = data.fields && typeof data.fields === 'object' && !Array.isArray(data.fields) ? data.fields : {};
  const fields = {};
  for(const id of WORK_FIELDS){
    if(source[id] === undefined) continue;
    if(typeof source[id] !== 'string' && typeof source[id] !== 'number') return null;
    const value = String(source[id]);
    if(id === 'profilePlacement' && !['below','top'].includes(value)) return null;
    if(id === 'profileTextPosition' && !['top','center','bottom'].includes(value)) return null;
    if(id === 'creditPlacement' && !['top','bottom'].includes(value)) return null;
    if(id === 'profileStyle' && !['compact','portrait','showcase'].includes(value)) return null;
    if(id === 'profileOrder' && !['bot-user','user-bot'].includes(value)) return null;
    if(id === 'subtitleCoupleSeparator' && !['×','&','·'].includes(value)) return null;
    if(/^(?:profileChar|profileUser|profileExtra[3-5])Scale$/.test(id)){
      const scale = Number(value);
      if(!Number.isFinite(scale) || scale < 100 || scale > 300) return null;
    }
    if(/^(?:profileChar|profileUser|profileExtra[3-5])[XY]$/.test(id)){
      const position = Number(value);
      if(!Number.isFinite(position) || position < 0 || position > 100) return null;
    }
    if(id === 'profileExtraCount' && !/^[0-3]$/.test(value)) return null;
    if(/^(?:profileChar|profileUser|profileExtra[3-5])Role$/.test(id) && value.length > 24) return null;
    const limit = (id === 'imgUrl' || /^(?:profileChar|profileUser|profileExtra[3-5])Image$/.test(id))
      ? 8192
      : ((id === 'extraChars' || id === 'creditItems') ? 200000 : 5000);
    if(value.length > limit) return null;
    fields[id] = value;
  }
  const importedExtraCount = Math.max(0, Math.min(3, Number(fields.profileExtraCount) || 0));
  if(fields.profileEntityOrder !== undefined){
    try {
      const parsed = JSON.parse(fields.profileEntityOrder);
      if(!Array.isArray(parsed) || parsed.some(key => typeof key !== 'string')) return null;
    } catch(e){ return null; }
  }
  // 옛 파일의 bot-user/user-bot 값은 새 자유 순서표의 초기값으로 승계한다.
  fields.profileEntityOrder = JSON.stringify(normalizeProfileEntityOrder(
    fields.profileEntityOrder,
    importedExtraCount,
    fields.profileOrder || 'bot-user'
  ));
  let invalidBoolean = false;
  WORK_BOOLEAN_FIELDS.forEach(id => {
    if(source[id] !== undefined){
      if(typeof source[id] !== 'boolean') invalidBoolean = true;
      else fields[id] = source[id];
    }
  });
  if(invalidBoolean) return null;
  if(source.profileImageBackgroundOn === undefined){
    for(const legacyId of ['profileCharImageBackgroundOn','profileUserImageBackgroundOn']){
      if(source[legacyId] !== undefined && typeof source[legacyId] !== 'boolean') return null;
    }
    fields.profileImageBackgroundOn = savedProfileImageBackgroundOn(source);
  }
  if(fields.extraChars !== undefined){
    try {
      const cleanChars = sanitizeExtraCharList(JSON.parse(fields.extraChars));
      if(!cleanChars) return null;
      fields.extraChars = JSON.stringify(cleanChars);
    }
    catch(e){ return null; }
  }
  if(fields.creditItems !== undefined){
    try {
      const items = JSON.parse(fields.creditItems);
      if(!Array.isArray(items) || items.length > MAX_CREDIT_ITEMS) return null;
      const cleaned = items.map((item, index) => {
        if(!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('invalid credit item');
        if(typeof item.label !== 'string' || typeof item.value !== 'string' || typeof item.url !== 'string') throw new Error('invalid credit fields');
        if(item.dividerBefore !== undefined && typeof item.dividerBefore !== 'boolean') throw new Error('invalid credit divider');
        if(item.label.length > 80 || item.value.length > 500 || item.url.length > 8192) throw new Error('credit field too long');
        return { label:item.label, value:item.value, url:item.url, dividerBefore:index > 0 && item.dividerBefore === true };
      });
      fields.creditItems = JSON.stringify(cleaned);
    }
    catch(e){ return null; }
  }
  if(fields.nameRules !== undefined){
    try {
      const rules = JSON.parse(fields.nameRules);
      if(!Array.isArray(rules) || rules.length > 20) return null;
      const cleaned = rules.map((rule, index) => {
        if(!rule || typeof rule !== 'object' || Array.isArray(rule)
          || typeof rule.from !== 'string' || typeof rule.to !== 'string'
          || !rule.from || !rule.to || rule.from.length > 80 || rule.to.length > 80) throw new Error('invalid name rule');
        const id = typeof rule.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(rule.id)
          ? rule.id : `nr_import_${index}`;
        return { id, from:rule.from, to:rule.to };
      });
      fields.nameRules = JSON.stringify(cleaned);
    } catch(e){ return null; }
  }
  if(fields.keywordRules !== undefined){
    try {
      const rules = JSON.parse(fields.keywordRules);
      if(!Array.isArray(rules) || rules.length > KEYWORD_RULE_LIMIT) return null;
      const cleaned = rules.map((rule, index) => {
        if(!rule || typeof rule !== 'object' || Array.isArray(rule)
          || typeof rule.from !== 'string' || typeof rule.to !== 'string'
          || !rule.from || !rule.to || rule.from.length > 80 || rule.to.length > 80) throw new Error('invalid keyword rule');
        const id = typeof rule.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(rule.id)
          ? rule.id : `kr_import_${index}`;
        return { id, from:rule.from, to:rule.to };
      });
      fields.keywordRules = JSON.stringify(cleaned);
    } catch(e){ return null; }
  }
  const legacyFoldDividerMinimal = cards.some(card => card.type !== 'comment' && settingFlagOn(card.foldMinimal));
  const out = { cards: cards.length ? cards : [{ type:'card', body:'', folded:false, foldTitle:'', foldMinimal:false, visible:true }], fields };
  if(data.style !== undefined){
    const style = sanitizeImportedPreset({ name:'보관함', values:data.style });
    if(!style) return null;
    out.style = style.values;
    // 카드별 미니멀 저장값은 현재의 전체 접기 구분선 옵션으로 합친다.
    if(data.style.foldDividerOn === undefined && data.style.foldDividerMinimal === undefined && legacyFoldDividerMinimal){
      out.style.foldDividerOn = false;
    }
  } else {
    out.style = { ...DEFAULT_STYLE, foldDividerOn: !legacyFoldDividerMinimal };
  }
  return out;
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
function updateSlotExportSelection(){
  const button = document.getElementById('exportSelectedSlotsBtn');
  button.disabled = selectedSlotIds.size === 0;
  button.textContent = `선택 내보내기 (${selectedSlotIds.size})`;
  const deleteButton = document.getElementById('deleteSelectedSlotsBtn');
  deleteButton.disabled = selectedSlotIds.size === 0;
  deleteButton.textContent = `선택 삭제 (${selectedSlotIds.size})`;
  document.getElementById('slotSelectionBar').hidden = !slotSelectionMode;
  const selectButton = document.getElementById('slotSelectBtn');
  selectButton.setAttribute('aria-pressed', String(slotSelectionMode));
  selectButton.textContent = slotSelectionMode ? '취소' : '선택';
}

function renderSlotList(){
  const container = document.getElementById('slotList');
  const count = document.getElementById('slotCount');
  const expandBtn = document.getElementById('slotExpandBtn');
  container.innerHTML = '';
  const slots = loadSlots(true);
  document.getElementById('exportSlotsBtn').textContent = slotReadIssue ? '원본 백업' : '전체 내보내기';
  if(slots === null){
    count.textContent = '';
    expandBtn.hidden = true;
    showSlotReadError();
    return;
  }
  if(slotReadIssue) showSlotReadError();
  const existingIds = new Set(slots.map(slot => slot.id));
  for(const id of selectedSlotIds) if(!existingIds.has(id)) selectedSlotIds.delete(id);
  updateSlotExportSelection();
  const query = document.getElementById('slotSearch').value.trim().toLocaleLowerCase('ko');
  const sort = document.getElementById('slotSort').value;
  const filtered = slots.filter(slot => {
    if(!query) return true;
    return slot.name.toLocaleLowerCase('ko').includes(query)
      || slotCharacterName(slot).toLocaleLowerCase('ko').includes(query);
  });
  if(sort === 'oldest') filtered.sort((a, b) => a.savedAt - b.savedAt);
  else if(sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  else filtered.sort((a, b) => b.savedAt - a.savedAt);

  const canExpand = !query && filtered.length > SLOT_PREVIEW_COUNT;
  const visible = canExpand && !slotListExpanded ? filtered.slice(0, SLOT_PREVIEW_COUNT) : filtered;
  count.textContent = query
    ? `${filtered.length}개 찾음 · 전체 ${slots.length}개`
    : (canExpand && !slotListExpanded ? `${visible.length}개 표시 · 전체 ${slots.length}개` : `전체 ${slots.length}개`);
  expandBtn.hidden = !canExpand;
  expandBtn.textContent = slotListExpanded ? '접기' : '전체 보기';

  if(!visible.length){
    const empty = document.createElement('div');
    empty.className = 'slotEmpty';
    empty.textContent = slots.length ? '일치하는 보관함이 없습니다.'
      : slotReadIssue ? '읽을 수 있는 보관함이 없습니다. 원본 백업을 먼저 보관해 주세요.' : '저장된 보관함이 없습니다.';
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
      setArchiveDrawerOpen(false);
    });
    over.addEventListener('click', (e) => {
      e.stopPropagation();
      const list = loadSlots();
      if(list === null){ showSlotReadError(); return; }
      const targetIndex = list.findIndex(item => item.id === slot.id);
      if(targetIndex < 0){
        document.getElementById('slotImportStatus').textContent = '덮어쓸 보관함 항목을 찾지 못했습니다.';
        renderSlotList();
        return;
      }
      const data = collectValidatedSlotWork();
      if(!data) return;
      const previousStoredSlots = localStorage.getItem(SLOT_KEY);
      list[targetIndex].data = data;
      list[targetIndex]._stored = null;
      list[targetIndex].savedAt = Date.now();
      if(!saveSlots(list)){
        document.getElementById('slotImportStatus').textContent = slotSaveFailure;
        return;
      }
      const writtenStoredSlots = lastSlotReadRaw;
      renderSlotList();
      const status = document.getElementById('slotImportStatus');
      status.style.color = '';
      status.textContent = `'${slot.name}'을 현재 작업으로 덮어썼습니다.`;
      MosaicUI.feedback.undo(`'${slot.name}' 보관함 덮어씀.`, () => {
        const restored = restoreStoredValue(SLOT_KEY, previousStoredSlots, writtenStoredSlots);
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
      const list = loadSlots();
      if(list === null){ showSlotReadError(); return; }
      const targetIndex = list.findIndex(item => item.id === slot.id);
      if(targetIndex < 0) return;
      list.splice(targetIndex, 1);
      if(!saveSlots(list)){
        document.getElementById('slotImportStatus').textContent = slotSaveFailure;
        return;
      }
      renderSlotList();
    });

    row.appendChild(identity);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

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
  const list = loadSlots();
  if(list === null){ showSlotReadError(); return; }
  const data = collectValidatedSlotWork();
  if(!data) return;
  const next = [{ id: makeSlotId(), name, savedAt: Date.now(), data }, ...list];
  if(!saveSlots(next)){
    document.getElementById('slotImportStatus').textContent = slotSaveFailure;
    return;
  }
  nameInput.value = '';
  const status = document.getElementById('slotImportStatus');
  status.style.color = '';
  status.textContent = `'${name}'을 보관했습니다.`;
  renderSlotList();
});

function exportSlots(selectedOnly = false){
  const slots = loadSlots(selectedOnly);
  const list = slots === null ? null : slots.filter(slot => !selectedOnly || selectedSlotIds.has(slot.id));
  if(list === null){
    if(!selectedOnly) exportRawSlotsBackup();
    else showSlotReadError();
    return;
  }
  if(!selectedOnly && slotReadIssue){
    exportRawSlotsBackup();
    return;
  }
  const st = document.getElementById('slotImportStatus');
  if(!list.length){
    st.style.color = '';
    st.textContent = selectedOnly ? '내보낼 항목을 선택해 주세요.' : '보관함이 비어 있음. 현재 작업을 먼저 저장.';
    return;
  }
  const exportList = list.map(slot => {
    const stored = slot._stored && typeof slot._stored === 'object' ? slot._stored : null;
    return {
      ...(stored ? stored : {}),
      id: slot.id,
      name: slot.name,
      savedAt: slot.savedAt,
      data: stored ? stored.data : slot.data
    };
  });
  const blob = new Blob([JSON.stringify(exportList, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = selectedOnly ? '조각로그_보관함_선택.json' : '조각로그_보관함.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  st.style.color = '';
  st.textContent = `보관함 ${list.length}개 저장됨.`;
}
function exportRawSlotsBackup(){
  const st = document.getElementById('slotImportStatus');
  let raw;
  try { raw = localStorage.getItem(SLOT_KEY); }
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
document.getElementById('exportSlotsBtn').addEventListener('click', () => exportSlots());
document.getElementById('exportSelectedSlotsBtn').addEventListener('click', () => exportSlots(true));
function deleteSelectedSlots(){
  const list = loadSlots();
  if(list === null){ showSlotReadError(); return; }
  const removed = list.filter(slot => selectedSlotIds.has(slot.id));
  if(!removed.length) return;
  const status = document.getElementById('slotImportStatus');
  if(!saveSlots(list.filter(slot => !selectedSlotIds.has(slot.id)))){
    status.textContent = slotSaveFailure;
    return;
  }
  selectedSlotIds.clear();
  renderSlotList();
  status.textContent = `보관함 ${removed.length}개를 삭제했습니다.`;
  MosaicUI.feedback.undo(`보관함 ${removed.length}개 삭제됨.`, () => {
    const current = loadSlots();
    if(current === null){ showSlotReadError(); return; }
    // 삭제 이후 저장한 항목은 유지하고, 사라진 항목만 복원한다.
    const existingIds = new Set(current.map(slot => slot.id));
    const restored = removed.filter(slot => !existingIds.has(slot.id));
    if(!saveSlots(current.concat(restored))){
      status.textContent = slotSaveFailure;
      return;
    }
    renderSlotList();
    status.textContent = `보관함 ${restored.length}개를 복원했습니다.`;
  });
}
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
  if(file.size > MAX_ARCHIVE_BYTES){
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
    if(!Array.isArray(imported) || imported.length > MAX_IMPORTED_SLOTS){
      st.style.color = '#c0392b';
      st.textContent = '조각로그 보관함 파일이 아니거나 항목이 너무 많습니다. (최대 200개)';
      return;
    }
    const cleaned = imported.map(sl => {
      let data;
      try { data = sl && sanitizeImportedWork(sl.data); }
      catch(err){ data = null; }
      if(!data || typeof sl.name !== 'string' || !sl.name.trim() || sl.name.length > 100 || /[\u0000-\u001F\u007F]/.test(sl.name)) return null;
      if(sl.id !== undefined && sl.id !== '' && !validSlotId(sl.id)) return null;
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
    const list = loadSlots();
    if(list === null){
      showSlotReadError();
      return;
    }
    let added = 0, updated = 0;
    imported.forEach(sl => {
      const idx = sl.id
        ? list.findIndex(existing => existing.id === sl.id)
        : list.findIndex(existing => existing.name === sl.name);
      const entry = { id: idx >= 0 ? list[idx].id : (sl.id || makeSlotId()), name: sl.name, savedAt: sl.savedAt || Date.now(), data: sl.data };
      if(idx >= 0){ list[idx] = entry; updated++; }
      else { list.unshift(entry); added++; }
    });
    if(!saveSlots(list)){
      st.style.color = '#c0392b';
      st.textContent = slotSaveFailure;
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
  MosaicUI.preview.render();
  updateCounter();
  saveDraft();
  MosaicUI.feedback.undo('새 로그 시작.');
  setArchiveDrawerOpen(false);
}
document.getElementById('newLogBtn').addEventListener('click', startNewLog);
document.getElementById('sidebarNewLogBtn').addEventListener('click', startNewLog);

document.getElementById('resetCurrentWorkBtn').addEventListener('click', () => {
  clearTimeout(styleCommitTimer);
  MosaicUI.cards.snapshot();

  // 현재 작업 데이터만 빈 작업 상태로 되돌림. SLOT_KEY·PRESET_KEY는 건드리지 않는다.
  Object.entries(WORK_FIELD_DEFAULTS).forEach(([id, value]) => {
    document.getElementById(id).value = value;
  });
  MosaicUI.controls.syncProfileTags();
  MosaicUI.controls.renderNameRules();
  MosaicUI.controls.renderKeywordRules();
  Object.entries(WORK_BOOLEAN_DEFAULTS).forEach(([id, value]) => {
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

  applyStyleValues(DEFAULT_STYLE);
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

  try { localStorage.removeItem(DRAFT_KEY); } catch(e){ /* 저장소 사용 불가 시 무시 */ }
  renderPresetList();
  renderComboList();
  updateSavePresetBtn();
  MosaicUI.preview.render();
  updateCounter();
  saveDraft();
  MosaicUI.feedback.undo('현재 작업 전체 초기화.');

  const status = document.getElementById('slotImportStatus');
  status.style.color = '';
  status.textContent = '현재 작업을 모두 비웠습니다.';
  setTimeout(() => { status.textContent = ''; }, 3000);
  const activeTextarea = MosaicUI.cards.activeTextarea();
  if(activeTextarea) activeTextarea.focus();
});

// ---------- 초안 자동 저장 ----------
// 본문/이미지 관련 입력을 이 브라우저(localStorage)에 자동 저장해서,
// 창을 닫거나 새로고침해도 작업 내용이 유지되게 함.
const DRAFT_KEY = 'logGenDraft_v1';
// 초안과 보관함은 같은 작업 필드 스키마를 공유한다. 별도 배열을 복제하면 새 필드가
// 한쪽 저장 경로에서 빠질 수 있으므로 WORK_FIELDS를 단일 기준으로 사용한다.
const DRAFT_FIELDS = WORK_FIELDS;
let draftSaveTimer = null;
let draftDirty = false;
let draftBaseUpdatedAt = 0;
let draftReadRaw;

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

function draftUpdatedAtFromRaw(raw){
  try {
    if(!raw) return 0;
    return Number(JSON.parse(raw).updatedAt) || 0;
  } catch(e){ return 0; }
}

function storedDraftUpdatedAt(){
  try { return draftUpdatedAtFromRaw(localStorage.getItem(DRAFT_KEY)); }
  catch(e){ return 0; }
}

function draftSaveConflictReason(currentRaw, lastReadRaw, baseUpdatedAt){
  if(lastReadRaw === undefined) return 'unread';
  if(currentRaw !== lastReadRaw) return 'changed';
  if(draftUpdatedAtFromRaw(currentRaw) > baseUpdatedAt) return 'newer';
  return '';
}

// 예전 기본 예시가 자동 저장된 브라우저에서는 새 기본 화면이 영원히 가려졌다.
// 실제 작성 초안은 보존하고, 제목과 본문이 폐기된 예시와 일치하는 경우만 새 기본값으로 교체한다.
function isRetiredDefaultDraft(d){
  if(!d || d.logTitle !== '5.5초의 침묵') return false;
  let bodies = [];
  if(Array.isArray(d.cards)){
    bodies = d.cards.map(card => typeof card === 'string' ? card : (card && card.body) || '');
  }else if(Array.isArray(d.cardBodies)){
    bodies = d.cardBodies;
  }else if(typeof d.bodyInput === 'string'){
    bodies = [d.bodyInput];
  }
  if(bodies.length !== 1) return false;
  const body = String(bodies[0]);
  return body.includes('나는 살짝 웃으며 대답했다.')
    && body.includes('고마워요. 다음에 또 올게요.')
    && body.includes('그럼 약속인가.')
    && body.includes('...진짜?');
}

function deferDraftSave(){
  // 한글 조합 중간값도 이탈 시에는 보존하되, 조합 중에는 저장 알림을 반복하지 않는다.
  draftDirty = true;
  clearTimeout(draftSaveTimer);
  draftSaveTimer = null;
}

function scheduleDraftSave(){
  draftDirty = true;
  clearTimeout(draftSaveTimer);
  setDraftStatus('저장 중…', 'saving');
  draftSaveTimer = setTimeout(() => saveDraft(false), 140);
}

function saveDraft(force = true){
  clearTimeout(draftSaveTimer);
  draftSaveTimer = null;
  if(!force && !draftDirty) return true;
  try {
    const currentRaw = localStorage.getItem(DRAFT_KEY);
    const conflictReason = draftSaveConflictReason(currentRaw, draftReadRaw, draftBaseUpdatedAt);
    if(conflictReason === 'unread' || conflictReason === 'changed'){
      draftDirty = true;
      setDraftStatus(conflictReason === 'unread' ? '초안 원본 확인 필요' : '다른 탭에 최신 작업 있음', 'paused');
      return false;
    }
    if(conflictReason === 'newer'){
      draftDirty = true;
      setDraftStatus('다른 탭에 최신 작업 있음', 'paused');
      return false;
    }
    const d = {};
    DRAFT_FIELDS.forEach(id => { d[id] = document.getElementById(id).value; });
    d.cards = MosaicUI.cards.all();
    WORK_BOOLEAN_FIELDS.forEach(id => { d[id] = document.getElementById(id).checked; });
    d.style = currentStyleValues();
    d.updatedAt = Math.max(Date.now(), draftBaseUpdatedAt + 1);
    const serialized = JSON.stringify(d);
    localStorage.setItem(DRAFT_KEY, serialized);
    draftReadRaw = serialized;
    draftBaseUpdatedAt = d.updatedAt;
    draftDirty = false;
    const savedAt = savedTimeLabel();
    setDraftStatus('저장됨', 'saved', `마지막 저장 ${savedAt}`);
    return true;
  } catch(e){
    draftDirty = true;
    setDraftStatus('저장 실패', 'error');
    return false;
  }
}

// 짧은 저장 지연 중 창을 닫아도 마지막 입력이 빠지지 않게 함.
window.addEventListener('beforeunload', event => {
  if(!(draftDirty || draftSaveTimer) || saveDraft(false)) return;
  // 충돌·저장소 오류로 현재 작업을 보존하지 못했으면 브라우저의 기본 이탈 확인을 띄운다.
  event.preventDefault();
  event.returnValue = '';
});

// 다른 탭의 저장을 입력 시점보다 먼저 알려 사용자가 충돌 상태를 놓치지 않게 한다.
window.addEventListener('storage', event => {
  if(event.storageArea !== localStorage || event.key !== DRAFT_KEY) return;
  if(event.newValue === draftReadRaw) return;
  setDraftStatus('다른 탭에 최신 작업 있음', 'paused');
});

document.getElementById('draftConflictBtn').addEventListener('click', () => {
  const message = draftReadRaw === undefined
    ? '저장된 초안을 읽지 못했습니다. 원본을 덮어쓰면 복구할 수 없습니다.\n원본 백업을 보관한 뒤 계속해 주세요.'
    : '다른 탭의 최신 초안을 덮어쓰려면 확인을 누르세요.\n덮어쓴 초안은 되돌릴 수 없습니다.';
  if(!confirm(message)) return;
  try {
    draftReadRaw = localStorage.getItem(DRAFT_KEY);
    draftBaseUpdatedAt = storedDraftUpdatedAt();
    saveDraft(true);
  }catch(e){ setDraftStatus('저장 실패', 'error'); }
});

// 저장 내용을 끝까지 확인한 뒤에만 화면을 변경한다. 오래된 초안의 카드 저장
// 형식(cards/cardBodies/bodyInput)과 빠진 옵션의 HTML 기본값은 그대로 지원한다.
function prepareDraftRestore(d){
  if(!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const fields = {};
  for(const id of DRAFT_FIELDS){
    if(d[id] === undefined) continue;
    if(typeof d[id] !== 'string' && typeof d[id] !== 'number') return null;
    fields[id] = String(d[id]);
  }
  if(fields.profileTextPosition === undefined) fields.profileTextPosition = 'center';
  if(!['top','center','bottom'].includes(fields.profileTextPosition)) return null;
  const draftExtraCount = Math.max(0, Math.min(3, Number(fields.profileExtraCount) || 0));
  if(fields.profileEntityOrder !== undefined){
    try {
      const parsed = JSON.parse(fields.profileEntityOrder);
      if(!Array.isArray(parsed) || parsed.some(key => typeof key !== 'string')) return null;
    } catch(e){ return null; }
  }
  fields.profileEntityOrder = JSON.stringify(normalizeProfileEntityOrder(
    fields.profileEntityOrder,
    draftExtraCount,
    fields.profileOrder || 'bot-user'
  ));
  for(const id of ['extraChars','creditItems','nameRules','keywordRules']){
    if(fields[id] === undefined) continue;
    try { if(!Array.isArray(JSON.parse(fields[id] || '[]'))) return null; }
    catch(e){ return null; }
  }
  const booleans = {};
  for(const id of WORK_BOOLEAN_FIELDS){
    if(d[id] === undefined) continue;
    if(!['boolean','string','number'].includes(typeof d[id])) return null;
    booleans[id] = settingFlagOn(d[id]);
  }
  booleans.profileImageBackgroundOn = savedProfileImageBackgroundOn(d);
  let style = null;
  if(d.style !== undefined && d.style !== null){
    if(typeof d.style !== 'object' || Array.isArray(d.style)) return null;
    for(const id of STYLE_FIELDS){
      const value = d.style[id];
      if(value !== undefined && !['boolean','string','number'].includes(typeof value)) return null;
    }
    style = { ...d.style };
  }
  let cards = [];
  if(Array.isArray(d.cards) && d.cards.length) cards = d.cards;
  else if(Array.isArray(d.cardBodies) && d.cardBodies.length) cards = d.cardBodies;
  else if(typeof d.bodyInput === 'string'){
    const parts = [];
    let cur = [];
    d.bodyInput.split('\n').forEach(line => {
      if(line.trim().toUpperCase() === '[NEWCARD]'){ parts.push(cur.join('\n')); cur = []; }
      else cur.push(line);
    });
    parts.push(cur.join('\n'));
    cards = parts;
  }
  for(const card of cards){
    if(typeof card === 'string') continue;
    if(!card || typeof card !== 'object' || Array.isArray(card)) return null;
    if(card.body !== undefined && typeof card.body !== 'string') return null;
    if(card.type !== undefined && !['card','comment'].includes(card.type)) return null;
    for(const key of ['foldTitle','cardTitle']){
      if(card[key] !== undefined && typeof card[key] !== 'string') return null;
    }
    for(const key of ['folded','foldMinimal','visible']){
      if(card[key] !== undefined && !['boolean','string','number'].includes(typeof card[key])) return null;
    }
  }
  const legacyFoldDividerMinimal = cards.some(card => card && typeof card === 'object'
    && card.type !== 'comment' && settingFlagOn(card.foldMinimal));
  if(style && style.foldDividerOn === undefined && style.foldDividerMinimal === undefined && legacyFoldDividerMinimal){
    style.foldDividerOn = false;
  }
  const timestamp = Number(d.updatedAt);
  return {
    fields, booleans, style, cards, legacyFoldDividerMinimal,
    updatedAt:Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0
  };
}

function captureDraftUiState(){
  const fields = {};
  DRAFT_FIELDS.forEach(id => { fields[id] = document.getElementById(id).value; });
  const booleans = {};
  WORK_BOOLEAN_FIELDS.forEach(id => { booleans[id] = document.getElementById(id).checked; });
  return { fields, booleans, style:currentStyleValues(), cards:MosaicUI.cards.all(),
    updatedAt:draftBaseUpdatedAt, dirty:draftDirty };
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
  draftBaseUpdatedAt = plan.updatedAt;
  draftDirty = Boolean(plan.dirty);
}

function restoreDraft(){
  draftReadRaw = undefined;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if(raw === null){ draftReadRaw = null; return; }
    const d = JSON.parse(raw);
    if(isRetiredDefaultDraft(d)){
      localStorage.removeItem(DRAFT_KEY);
      draftReadRaw = null;
      return;
    }
    const plan = prepareDraftRestore(d);
    if(!plan) throw new Error('invalid draft');
    const before = captureDraftUiState();
    try { applyDraftRestorePlan(plan); }
    catch(e){
      try { applyDraftRestorePlan(before); }
      catch(rollbackError){ MosaicUI.cards.clear(); }
      throw e;
    }
    draftReadRaw = raw;
  } catch(e){
    setDraftStatus('초안 복원 실패', 'error', '저장된 초안을 보존하고 기본 화면을 표시함');
  }
}

// ---------- 프리셋 ----------
const PRESET_KEY = 'logGenPresets_v2';
let lastPresetReadRaw;
let presetSaveFailure = '';
const THEME_COLOR_FIELDS = ['bgColor', 'narrColor', 'emphasisColor', 'charColor', 'userColor'];
const SAVED_PRESET_FIELDS = [...THEME_COLOR_FIELDS, 'outputTheme', 'dlgStyle'];
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
const DIALOG_STYLE_CYCLE = ['softlight', 'highlight', 'badge', 'gradient', 'box', 'messenger'];

function nextDialogueStyleValue(value){
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
  commitStyleHistory(true);
}

document.getElementById('dlgStylePrev').addEventListener('click', () => stepDialogueStyle(-1));
document.getElementById('dlgStyleNext').addEventListener('click', () => stepDialogueStyle(1));

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
  commitStyleHistory(true);
}

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
  commitStyleHistory(true);
});

const SEGMENTED_CHOICE_SELECT_IDS = ['profilePlacement', 'profileTextPosition', 'profileStyle', 'profileOuterBackground', 'creditPlacement', 'hrShape', 'hr2Shape', 'hr3Shape', 'foldAutoNumberStyle'];

function syncMinimalChoiceControls(){
  document.querySelectorAll('[data-minimal-control]').forEach(group => {
    const input = document.getElementById(group.dataset.minimalControl);
    group.querySelectorAll('button[data-value]').forEach(button => {
      button.setAttribute('aria-pressed', String(input.checked === (button.dataset.value === 'minimal')));
      button.disabled = input.disabled;
    });
  });
}

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

document.querySelectorAll('.segmentedChoice[data-control]').forEach(group => {
  const selectId = group.dataset.control;
  group.querySelectorAll('button[data-value]').forEach(button => {
    button.addEventListener('click', () => {
      const select = document.getElementById(selectId);
      if(!select || select.disabled || select.value === button.dataset.value) return;
      select.value = button.dataset.value;
      select.dispatchEvent(new Event('input', { bubbles:true }));
      syncSegmentedChoiceControl(selectId);
    });
  });
});

SEGMENTED_CHOICE_SELECT_IDS.forEach(id => {
  const select = document.getElementById(id);
  if(!select) return;
  select.addEventListener('input', () => syncSegmentedChoiceControl(id));
  select.addEventListener('change', () => syncSegmentedChoiceControl(id));
});

// 추천·저장 프리셋의 호버는 실제 입력값·저장값·작업 기록을 건드리지 않고
// 미리보기 HTML만 임시 색상으로 다시 그린다.
let themeHoverPreview = null;
const themeHoverPreviewCards = new WeakMap();

function beginThemeHoverPreview(key, values){
  if(outputThemeTransparent(document.getElementById('outputTheme').value)) return;
  if(themeHoverPreview && themeHoverPreview.key === key) return;
  themeHoverPreview = { key };
  // 호버는 팔레트 확인만 제공한다. 내 프리셋에 저장된 대사 옵션은 클릭할 때만 적용한다.
  const previewColors = {};
  THEME_COLOR_FIELDS.forEach(id => {
    if(values[id] !== undefined) previewColors[id] = values[id];
  });
  const previewSettings = { ...getSettings(), ...previewColors, outputTheme: document.getElementById('outputTheme').value };
  MosaicUI.preview.renderMarkup(buildCard(previewSettings, MosaicUI.cards.all()));
}

function endThemeHoverPreview(key){
  if(!themeHoverPreview || themeHoverPreview.key !== key) return;
  themeHoverPreview = null;
  MosaicUI.preview.renderMarkup(buildCard(getSettings(), MosaicUI.cards.all()));
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

bindThemeHoverPreviewList('comboList', '.comboCard');
bindThemeHoverPreviewList('presetList', '.presetCard', true);

window.addEventListener('blur', () => {
  if(themeHoverPreview) endThemeHoverPreview(themeHoverPreview.key);
});

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

document.getElementById('currentThemePaletteButton').addEventListener('click', () => {
  const select = document.getElementById('dlgStyle');
  select.value = nextDialogueStyleValue(select.value);
  MosaicUI.controls.syncDesignSummaries();
  MosaicUI.preview.render();
  updateOverwriteBtn();
  saveDraft();
  commitStyleHistory(true);
});

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
      MosaicUI.preview.render();
      saveDraft();
      commitStyleHistory(true);
    });
    container.appendChild(chip);
  });
}



let currentPresetName = null;

// 추천 색상·저장 프리셋을 적용한 뒤 값을 직접 바꾸면 선택 맥락은 저장 버튼을 위해
// 유지하되, 접힌 요약에서는 더 이상 '적용 중'으로 표시하지 않는다.
SAVED_PRESET_FIELDS.forEach(id => {
  document.getElementById(id).addEventListener('input', updateOverwriteBtn);
});

function currentStyleValues(){
  const v = {};
  STYLE_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    v[id] = (el.type === 'checkbox') ? el.checked : el.value;
  });
  return v;
}

function currentSavedPresetValues(){
  const values = {};
  SAVED_PRESET_FIELDS.forEach(id => { values[id] = document.getElementById(id).value; });
  return values;
}

function applyThemeColorValues(values){
  THEME_COLOR_FIELDS.forEach(id => {
    if(values[id] === undefined) return;
    const input = document.getElementById(id);
    const color = normalizeHex(String(values[id]));
    if(input && color) input.value = color;
  });
  MosaicUI.controls.updateHexLabels();
}
function applySavedPresetValues(values){
  const outputTheme = document.getElementById('outputTheme');
  const nextTheme = normalizeOutputTheme(values.outputTheme);
  MosaicUI.cards.setDefaultsForShape(outputTheme.value, nextTheme);
  outputTheme.value = nextTheme;
  applyThemeColorValues(values);
  const dialogueStyle = document.getElementById('dlgStyle');
  if(values && Array.from(dialogueStyle.options).some(option => option.value === values.dlgStyle)){
    dialogueStyle.value = values.dlgStyle;
  }
  MosaicUI.controls.syncDesignSummaries();
}
function savedPresetStateEqual(a, b){
  if(!a || !b) return false;
  return SAVED_PRESET_FIELDS.every(id => String(id === 'outputTheme' ? (a[id] || 'solid') : a[id]).toLowerCase() === String(id === 'outputTheme' ? (b[id] || 'solid') : b[id]).toLowerCase());
}

function applyStyleValues(v){
  // 따로 저장된 나레이션·대사 폰트는 전체 폰트 값으로 정규화한다.
  const values = { ...v, outputTheme: normalizeOutputTheme(v.outputTheme) };
  if(values.hrShape !== undefined) values.hrShape = normalizeHrShape(values.hrShape);
  if(values.hr2Shape !== undefined) values.hr2Shape = normalizeHr2Shape(values.hr2Shape);
  if(values.hr3Shape !== undefined) values.hr3Shape = normalizeHr3Shape(values.hr3Shape);
  // 고급 스위치가 없는 이전 저장본은 기존 100% 농도를 새 슬라이더의 50%로 옮긴다.
  if(values.advancedOn === undefined){
    ['hrOpacity','hr2Opacity','hr3Opacity'].forEach(id => {
      if(values[id] !== undefined) values[id] = String(advancedPercent(values[id], 100) / 2);
    });
    values.advancedOn = true;
  }
  // 이전 버전의 `장식/구분선 제거` 값을 긍정형 `표시` 설정으로 변환한다.
  if(values.foldTitleDecorationOn === undefined && values.foldTitleMinimal !== undefined){
    values.foldTitleDecorationOn = !settingFlagOn(values.foldTitleMinimal);
  }
  if(values.foldDividerOn === undefined && values.foldDividerMinimal !== undefined){
    values.foldDividerOn = !settingFlagOn(values.foldDividerMinimal);
  }
  if(values.textFont === undefined){
    values.textFont = values.narrFont !== undefined ? values.narrFont : values.dlgFont;
  }
  // 이전 버전의 체크박스 저장값을 새 드롭다운의 `미적용` 값으로 변환한다.
  if(values.parallelTranslationSoft !== undefined){
    if(!settingFlagOn(values.parallelTranslationSoft)) values.parallelTranslationLayout = 'off';
    else if(values.parallelTranslationLayout === undefined) values.parallelTranslationLayout = 'auto';
  }
  if(values.paragraphGap === undefined) values.paragraphGap = DEFAULT_STYLE.paragraphGap;
  if(values.narrDialogueGap === undefined) values.narrDialogueGap = values.paragraphGap;
  if(values.softBreakSpacing === undefined) values.softBreakSpacing = DEFAULT_STYLE.softBreakSpacing;
  ['hrVerticalSpace','hr2VerticalSpace','hr3VerticalSpace'].forEach(id => {
    if(values[id] === undefined) values[id] = DEFAULT_STYLE[id];
  });
  if(values.cardBodyTopSpace === undefined) values.cardBodyTopSpace = DEFAULT_STYLE.cardBodyTopSpace;
  if(values.cardBodyBottomSpace === undefined) values.cardBodyBottomSpace = DEFAULT_STYLE.cardBodyBottomSpace;
  if(values.footerBodyGap === undefined) values.footerBodyGap = DEFAULT_STYLE.footerBodyGap;
  if(values.profileOuterBackground === undefined) values.profileOuterBackground = DEFAULT_STYLE.profileOuterBackground;
  if(values.profileItemGap === undefined) values.profileItemGap = DEFAULT_STYLE.profileItemGap;
  if(values.headingTopSpace === undefined) values.headingTopSpace = DEFAULT_STYLE.headingTopSpace;
  if(values.headingBetweenSpace === undefined) values.headingBetweenSpace = DEFAULT_STYLE.headingBetweenSpace;
  if(values.headingBottomSpace === undefined) values.headingBottomSpace = DEFAULT_STYLE.headingBottomSpace;
  if(values.cardTitleOrnamentOpacity === undefined) values.cardTitleOrnamentOpacity = DEFAULT_STYLE.cardTitleOrnamentOpacity;
  values.foldAutoNumberStyle = values.foldAutoNumberStyle === 'roman' ? 'roman' : 'arabic';
  if(values.creditTransparentOn === undefined && values.creditOpacity !== undefined){
    values.creditTransparentOn = Number(values.creditOpacity) === 0;
  }
  // v1.5.x 초안에는 카드 구성 값이 없으므로 기존 개별 카드 방식으로 읽는다.
  values.cardLayout = normalizeCardLayout(values.cardLayout);
  // rev1의 문자열 저장값(normal/relaxed/wide)도 현재 3단계 range 값으로 변환한다.
  values.softBreakSpacing = softBreakSpacingControlValue(values.softBreakSpacing);
  if(values.narrCenter === undefined) values.narrCenter = DEFAULT_STYLE.narrCenter;
  if(values.quoteCenter === undefined) values.quoteCenter = DEFAULT_STYLE.quoteCenter;
  if(values.bodyFoldTitleCenter === undefined) values.bodyFoldTitleCenter = DEFAULT_STYLE.bodyFoldTitleCenter;
  // 단일 선택이었던 작업본의 코멘트 배치값도 폭·정렬 두 축으로 안전하게 변환한다.
  if(values.commentWidth === undefined){
    values.commentWidth = values.commentLayout === 'card' ? 'card' : DEFAULT_STYLE.commentWidth;
  }
  if(values.commentAlign === undefined){
    values.commentAlign = values.commentLayout === 'center' ? 'center' : DEFAULT_STYLE.commentAlign;
  }
  values.commentWidth = normalizeCommentWidth(values.commentWidth);
  values.commentAlign = normalizeCommentAlign(values.commentAlign);
  // 이전 화면의 사진 상태가 바꿔 둔 min 때문에 저장된 음수 간격이 대입 즉시 잘리지 않게 한다.
  // 전체 값 적용 후 syncTypographyRangeLabels가 복원된 프로필 상태로 최솟값을 다시 계산한다.
  document.getElementById('profileItemGap').min = '-10';
  STYLE_FIELDS.forEach(id => {
    if(values[id] === undefined) return;
    const el = document.getElementById(id);
    if(el.type === 'checkbox'){
      el.checked = settingFlagOn(values[id]);
    } else if(el.type === 'range' && (id === 'titleSize' || id === 'foldTitleSize' || id === 'cardCornerRadius' || id === 'gapHeight' || id === 'narrDialogueGap')){
      // 제목 크기는 현재 슬라이더 단위인 1px에 맞춘다.
      const n = Number(values[id]);
      const rounded = Number.isFinite(n) ? Math.round(n) : Number(DEFAULT_STYLE[id]);
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

// ---------- 추가 인물 (본문에서 자동 감지) ----------
// 본문에 [이름]"대사" 를 쓰면 그 이름이 자동으로 인물 목록에 나타난다.
// 색은 처음엔 나레이션 글자색과 같고, 사용자가 고른 색은 extraChars에 기억된다.

function sanitizeExtraCharList(value){
  if(!Array.isArray(value) || value.length > 100) return null;
  const clean = [];
  const seen = new Set();
  for(const item of value){
    if(!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const color = typeof item.color === 'string' ? normalizeHex(item.color) : null;
    if(!name || name.length > 24 || /[\[\]\u0000-\u001F\u007F]/.test(name) || !color) return null;
    const key = name.toLowerCase();
    if(seen.has(key)) continue;
    seen.add(key);
    clean.push({ name, color });
  }
  return clean;
}

function parseExtraChars(){
  try {
    const v = JSON.parse(document.getElementById('extraChars').value);
    return sanitizeExtraCharList(v) || [];
  } catch(e){ return []; }
}

// 모든 카드 본문에서 [이름] 마커를 훑어 등장 순서대로 이름 목록을 만듦
// ([HR...] 및 이전 여백 별칭, [IMG ...], [C], [접기...] 같은 기능 마커는 제외)
const RESERVED_MARKERS = /^(HR(?:[2-4])?|GAP|C|IMG\b|NEWCARD|\/?접기)/i;
function detectCharNames(){
  const names = [];
  MosaicUI.cards.all().filter(card => card.type !== 'comment' && card.visible !== false).forEach(card => {
    const body = card.body;
    normalizeQuotes(body).split('\n').forEach(line => {
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
      saveDraft();
    };
    color.addEventListener('input', () => { hex.value = color.value; commit(color.value); });
    hex.addEventListener('input', () => {
      const n = normalizeHex(hex.value);
      if(n){ color.value = n; commit(n); }
    });
    hex.addEventListener('blur', () => { hex.value = normalizeHex(hex.value) || color.value; });

    field.appendChild(hex);
    field.appendChild(color);
    row.appendChild(label);
    row.appendChild(field);
    list.appendChild(row);
  });
}

// ---------- 큰 작업 + 디자인 변경 통합 히스토리 ----------
// 본문 타이핑은 기록하지 않고, 파괴적 편집과 디자인 변경만 전체 작업 상태로 보관한다.
let actionHistory = [];
let actionIndex = -1;
let styleCommitTimer = null;
// 큰 작업 직전 스냅샷은 통합 작업 히스토리와 같은 저장 계층이 소유한다.
// ui.js의 MosaicUI.cards.snapshot()는 이 값을 준비하고, 아래 기록기가 완료 상태와 짝지어 소비한다.
let undoSnapshot = null;
const ACTION_HISTORY_MAX = 30;

function discardUndoSnapshot(){
  undoSnapshot = null;
}

function snapshotCards(){
  // 막 끝난 디자인 조절이 뒤늦게 끼어들지 않도록 작업 경계를 확정한다.
  clearTimeout(styleCommitTimer);
  undoSnapshot = captureActionState('작업 전');
}

function styleStateEqual(a, b){
  if(!a || !b) return false;
  return STYLE_FIELDS.every(id => String(a[id]) === String(b[id]));
}

function cloneHistoryValue(value){
  return JSON.parse(JSON.stringify(value));
}

function captureActionState(label){
  return {
    label: label || '작업',
    work: cloneHistoryValue(MosaicUI.work.collect()),
    style: cloneHistoryValue(currentStyleValues())
  };
}

function actionStateEqual(a, b){
  if(!a || !b) return false;
  return styleStateEqual(a.style, b.style)
    && JSON.stringify(a.work) === JSON.stringify(b.work);
}

function pushActionState(state, label){
  const snap = cloneHistoryValue(state);
  if(label) snap.label = label;
  if(actionIndex >= 0 && actionStateEqual(snap, actionHistory[actionIndex])){
    // 같은 상태라도 가장 최근 작업명은 유지해 툴팁이 정확하게 보이게 함.
    actionHistory[actionIndex].label = snap.label;
    updateHistoryButtons();
    return false;
  }
  actionHistory = actionHistory.slice(0, actionIndex + 1);
  actionHistory.push(snap);
  if(actionHistory.length > ACTION_HISTORY_MAX) actionHistory.shift();
  actionIndex = actionHistory.length - 1;
  updateHistoryButtons();
  return true;
}

function updateHistoryButtons(){
  const u = document.getElementById('undoStyleBtn');
  const r = document.getElementById('redoStyleBtn');
  if(!u || !r) return;
  u.disabled = actionIndex <= 0;
  r.disabled = actionIndex >= actionHistory.length - 1;
  const undoLabel = actionIndex > 0 ? actionHistory[actionIndex].label : '';
  const redoLabel = actionIndex < actionHistory.length - 1 ? actionHistory[actionIndex + 1].label : '';
  u.title = undoLabel ? `${undoLabel} 되돌리기 (${MOD_KEY}+Alt+Z)` : `되돌릴 작업 없음 (${MOD_KEY}+Alt+Z)`;
  r.title = redoLabel ? `${redoLabel} 되살리기 (${MOD_KEY}+Alt+Shift+Z)` : `되살릴 작업 없음 (${MOD_KEY}+Alt+Shift+Z)`;
}

// 큰 작업은 snapshotCards()가 잡은 직전 상태와 완료 상태를 한 쌍으로 기록.
function recordCompletedAction(label){
  if(!undoSnapshot) return;
  pushActionState(undoSnapshot, `${label} 전`);
  undoSnapshot = null;
  pushActionState(captureActionState(label), label);
}

// 디자인 변경도 통합 기록에 넣되, 그동안 타이핑한 본문은 현재 상태로 보존한다.
// 슬라이더·색상 드래그는 짧게 묶어 한 단계로 기록한다.
function commitStyleHistory(immediate){
  clearTimeout(styleCommitTimer);
  const doCommit = () => {
    const after = captureActionState('디자인 변경');
    if(actionIndex < 0){ pushActionState(after, '초기 상태'); return; }
    const current = actionHistory[actionIndex];
    if(styleStateEqual(after.style, current.style)) return;
    // 본문은 지금 상태, 디자인은 변경 전 상태인 기준점을 먼저 둔다.
    const before = {
      label: '디자인 변경 전',
      work: cloneHistoryValue(after.work),
      style: cloneHistoryValue(current.style)
    };
    pushActionState(before, '디자인 변경 전');
    pushActionState(after, '디자인 변경');
  };
  if(immediate){ doCommit(); }
  else { styleCommitTimer = setTimeout(doCommit, 350); }
}

function goActionHistory(delta){
  const target = actionIndex + delta;
  if(target < 0 || target >= actionHistory.length) return;
  actionIndex = target;
  const state = actionHistory[actionIndex];
  undoSnapshot = null;
  imageHistorySession = null;
  MosaicUI.feedback.dismiss();
  MosaicUI.work.applyState({
    ...cloneHistoryValue(state.work),
    style: cloneHistoryValue(state.style)
  });
  currentPresetName = null;
  currentComboName = null;
  renderPresetList();
  renderComboList();
  MosaicUI.work.finishRestore();
  updateHistoryButtons();
}

document.getElementById('undoStyleBtn').addEventListener('click', () => goActionHistory(-1));
document.getElementById('redoStyleBtn').addEventListener('click', () => goActionHistory(1));

// 되돌린 상태에서 새 편집이 시작되면 기존 redo 분기는 더 이상 안전하지 않다.
// 검색어·프리셋 이름 같은 임시 UI 입력은 제외하고 실제 작업값만 감시한다.
const HISTORY_WORK_IDS = new Set([
  ...WORK_FIELDS, ...STYLE_FIELDS, ...WORK_BOOLEAN_FIELDS
]);
function isHistoryAffectingInput(el){
  if(!el || el.nodeType !== 1) return false;
  if(el.id === 'fsTextarea') return true;
  if(el.matches('.cardFoldChk, .foldTitleInput')) return true;
  if(el.matches('#cardEditors textarea')) return true;
  return !!el.id && HISTORY_WORK_IDS.has(el.id);
}
document.addEventListener('input', (e) => {
  if(actionIndex >= actionHistory.length - 1 || !isHistoryAffectingInput(e.target)) return;
  actionHistory = actionHistory.slice(0, actionIndex + 1);
  updateHistoryButtons();
}, true);

// 대표 이미지와 BOT·USER 프로필 이미지는 URL뿐 아니라 크기·위치까지 하나의 편집
// 단계로 기록한다. range 드래그나 URL 타이핑 중간값을 매번 쌓지 않고, 포커스를
// 얻은 시점의 상태와 현재 상태 두 항목만 유지해 되돌리기 버튼을 즉시 활성화한다.
const IMAGE_HISTORY_IDS = new Set([
  'imgOn', 'imgUrl', 'imgHeight', 'xpos', 'ypos', 'titleImageBackgroundOn',
  'profileImageBackgroundOn', 'profileCharImage', 'profileCharScale', 'profileCharX', 'profileCharY',
  'profileUserImage', 'profileUserScale', 'profileUserX', 'profileUserY',
  ...EXTRA_PROFILE_SLOTS.flatMap(slot => ['Image','Scale','X','Y'].map(field => `profileExtra${slot}${field}`))
]);
let imageHistorySession = null;

function imageHistoryLabel(id){
  if(id === 'profileImageBackgroundOn') return '프로필 사진 배경 변경';
  if(id.startsWith('profileChar')) return 'BOT 프로필 이미지 변경';
  if(id.startsWith('profileUser')) return 'USER 프로필 이미지 변경';
  if(id.startsWith('profileExtra')) return '추가 인물 프로필 이미지 변경';
  return '대표 이미지 변경';
}

document.addEventListener('focusin', event => {
  const target = event.target;
  if(!target || !IMAGE_HISTORY_IDS.has(target.id)) return;
  imageHistorySession = {
    id: target.id,
    before: captureActionState(`${imageHistoryLabel(target.id)} 전`),
    afterIndex: -1
  };
});

document.addEventListener('input', event => {
  const target = event.target;
  if(!target || !IMAGE_HISTORY_IDS.has(target.id)) return;
  const label = imageHistoryLabel(target.id);
  if(!imageHistorySession || imageHistorySession.id !== target.id){
    // 키보드 포커스 없이 스크립트가 실제 입력 이벤트를 보낸 경우에도 안전하게 기록한다.
    imageHistorySession = {
      id: target.id,
      before: actionIndex >= 0
        ? cloneHistoryValue(actionHistory[actionIndex])
        : captureActionState(`${label} 전`),
      afterIndex: -1
    };
  }
  const after = captureActionState(label);
  if(actionStateEqual(imageHistorySession.before, after)){
    updateHistoryButtons();
    return;
  }
  if(imageHistorySession.afterIndex === actionIndex && actionIndex >= 0){
    actionHistory[actionIndex] = cloneHistoryValue(after);
    actionHistory[actionIndex].label = label;
  } else {
    pushActionState(imageHistorySession.before, `${label} 전`);
    pushActionState(after, label);
    imageHistorySession.afterIndex = actionIndex;
  }
  updateHistoryButtons();
}, true);

document.addEventListener('focusout', event => {
  if(imageHistorySession && event.target && event.target.id === imageHistorySession.id){
    imageHistorySession = null;
  }
});

// 본문 입력의 기본 실행 취소와 충돌하지 않는 작업 단위 단축키.
document.addEventListener('keydown', (e) => {
  if(e.isComposing || e.keyCode === 229) return;
  if(!(e.ctrlKey || e.metaKey) || !e.altKey || e.key.toLowerCase() !== 'z') return;
  e.preventDefault();
  goActionHistory(e.shiftKey ? 1 : -1);
});

function loadPresets(){
  lastPresetReadRaw = undefined;
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if(raw === null){
      lastPresetReadRaw = null;
      const defaultPreset = { name: '프리셋 1', values: currentSavedPresetValues() };
      return savePresets([defaultPreset]) ? [defaultPreset] : null;
    }
    const list = JSON.parse(raw);
    // 사용자가 마지막 프리셋까지 삭제한 빈 배열도 정상적인 저장 상태다.
    // 손상된 JSON/자료형만 오류로 취급해야 빈 목록이 오류 안내로 바뀌지 않는다.
    if(!Array.isArray(list)) return null;
    const seen = new Set();
    const cleaned = [];
    for(const stored of list){
      if(!stored || !stored.values || typeof stored.values !== 'object') return null;
      const candidate = { name:stored.name, values:{ ...stored.values } };
      // 누락된 값은 메모리에서만 보완하고, 읽기만으로 원본 저장값을 덮어쓰지 않는다.
      if(candidate.values.bgColor === undefined){
        candidate.values.bgColor = candidate.values.cardTone === 'dark' ? '#1b1a19' : '#ffffff';
      }
      const safe = sanitizeImportedPreset(candidate);
      if(!safe) return null;
      const key = safe.name.toLowerCase();
      if(seen.has(key)) return null;
      seen.add(key);
      safe.lastUsed = Number.isFinite(Number(stored.lastUsed)) ? Number(stored.lastUsed) : 0;
      Object.defineProperty(safe, '_stored', { value:stored, writable:true, enumerable:false });
      cleaned.push(safe);
    }
    lastPresetReadRaw = raw;
    return cleaned;
  } catch(e){
    return null;
  }
}

function savePresets(list){
  presetSaveFailure = '';
  if(!Array.isArray(list) || lastPresetReadRaw === undefined){
    presetSaveFailure = '프리셋 원본을 읽지 못해 저장하지 않았습니다.';
    return false;
  }
  try {
    if(localStorage.getItem(PRESET_KEY) !== lastPresetReadRaw){
      lastPresetReadRaw = undefined;
      presetSaveFailure = '다른 탭에서 프리셋이 변경되어 저장하지 않았습니다. 목록을 다시 열어 확인해 주세요.';
      return false;
    }
    const payload = list.map(preset => {
      const stored = preset && preset._stored && typeof preset._stored === 'object' ? preset._stored : null;
      return {
        ...(stored ? stored : {}),
        name: preset.name,
        values: stored ? stored.values : preset.values,
        lastUsed: Number.isFinite(Number(preset.lastUsed)) ? Number(preset.lastUsed) : 0
      };
    });
    const serialized = JSON.stringify(payload);
    localStorage.setItem(PRESET_KEY, serialized);
    lastPresetReadRaw = serialized;
    return true;
  }
  catch(e){
    presetSaveFailure = '저장 공간 부족 또는 브라우저 저장소 오류로 프리셋을 저장하지 못했습니다.';
    return false;
  }
}

function showPresetReadError(){
  const status = document.getElementById('presetStatus');
  if(status) status.textContent = '저장한 프리셋을 읽지 못해 변경하지 않았습니다. 내보낸 백업 파일을 확인해 주세요.';
}

const MAX_PRESET_BYTES = 512 * 1024;
const MAX_IMPORTED_PRESETS = 100;

// 외부 프리셋 파일의 값을 실제 컨트롤 형식과 범위에 맞는지 확인한다.
// 알 수 없는 필드는 버리고, 누락된 최신 필드는 기본값으로 채운다.
// 알려진 필드 하나라도 잘못되면 해당 프리셋을 거부한다.
function sanitizeImportedPreset(preset){
  if(!preset || typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > 80
     || /[\u0000-\u001F\u007F]/.test(preset.name)
     || !preset.values || typeof preset.values !== 'object' || Array.isArray(preset.values)) return null;
  const clean = { ...DEFAULT_STYLE };
  // 나레이션·대사 폰트가 따로 저장돼 있으면 나레이션 값을 우선해 전체 폰트로 읽는다.
  const sourceValues = { ...preset.values };
  if(['dotted','double','fade','end-dots'].includes(sourceValues.hrShape)){
    sourceValues.hrShape = normalizeHrShape(sourceValues.hrShape);
  }
  if(['circle','line'].includes(sourceValues.hr2Shape)) sourceValues.hr2Shape = normalizeHr2Shape(sourceValues.hr2Shape);
  if(sourceValues.hr3Shape === 'diamond') sourceValues.hr3Shape = normalizeHr3Shape(sourceValues.hr3Shape);
  if(sourceValues.advancedOn === undefined){
    ['hrOpacity','hr2Opacity','hr3Opacity'].forEach(id => {
      const number = Number(sourceValues[id]);
      if(sourceValues[id] !== undefined && Number.isFinite(number) && number >= 0 && number <= 100) {
        sourceValues[id] = String(number / 2);
      }
    });
    sourceValues.advancedOn = true;
  }
  if(sourceValues.foldTitleDecorationOn === undefined && sourceValues.foldTitleMinimal !== undefined){
    if(typeof sourceValues.foldTitleMinimal !== 'boolean') return null;
    sourceValues.foldTitleDecorationOn = !sourceValues.foldTitleMinimal;
  }
  if(sourceValues.foldDividerOn === undefined && sourceValues.foldDividerMinimal !== undefined){
    if(typeof sourceValues.foldDividerMinimal !== 'boolean') return null;
    sourceValues.foldDividerOn = !sourceValues.foldDividerMinimal;
  }
  if(sourceValues.textFont === undefined){
    sourceValues.textFont = sourceValues.narrFont !== undefined
      ? sourceValues.narrFont
      : sourceValues.dlgFont;
  }
  // 이전 버전의 원문 병행 체크박스를 현재 드롭다운 값으로 변환한다.
  // 검증 전에 옮겨야 `끔`이 DEFAULT_STYLE의 자동 배치로 덮이지 않는다.
  if(sourceValues.parallelTranslationLayout === undefined && sourceValues.parallelTranslationSoft !== undefined){
    if(typeof sourceValues.parallelTranslationSoft !== 'boolean') return null;
    sourceValues.parallelTranslationLayout = sourceValues.parallelTranslationSoft ? 'auto' : 'off';
  }
  if(sourceValues.commentWidth === undefined){
    sourceValues.commentWidth = sourceValues.commentLayout === 'card' ? 'card' : DEFAULT_STYLE.commentWidth;
  }
  if(sourceValues.commentAlign === undefined){
    sourceValues.commentAlign = sourceValues.commentLayout === 'center' ? 'center' : DEFAULT_STYLE.commentAlign;
  }
  if(sourceValues.paragraphGap === undefined) sourceValues.paragraphGap = DEFAULT_STYLE.paragraphGap;
  if(sourceValues.narrDialogueGap === undefined) sourceValues.narrDialogueGap = sourceValues.paragraphGap;
  if(sourceValues.softBreakSpacing === undefined) sourceValues.softBreakSpacing = DEFAULT_STYLE.softBreakSpacing;
  if(sourceValues.creditTransparentOn === undefined && sourceValues.creditOpacity !== undefined){
    sourceValues.creditTransparentOn = Number(sourceValues.creditOpacity) === 0;
  }
  if(sourceValues.cardLayout === undefined) sourceValues.cardLayout = DEFAULT_STYLE.cardLayout;
  if(!['0','1','2','normal','relaxed','wide'].includes(String(sourceValues.softBreakSpacing))) return null;
  sourceValues.softBreakSpacing = softBreakSpacingControlValue(sourceValues.softBreakSpacing);
  let found = 0;
  for(const id of STYLE_FIELDS){
    if(sourceValues[id] === undefined) continue;
    const el = document.getElementById(id);
    const raw = sourceValues[id];
    if(el.type === 'checkbox'){
      if(typeof raw !== 'boolean') return null;
      clean[id] = raw;
    } else if(el.type === 'color'){
      const color = typeof raw === 'string' ? normalizeHex(raw) : null;
      if(!color) return null;
      clean[id] = color;
    } else if(el.type === 'range'){
      // 화면의 동적 최솟값은 현재 작업의 사진 상태에 따라 달라진다. 저장값의 유효 범위는 고정이다.
      const n = Number(raw), min = id === 'profileItemGap' ? -10 : Number(el.min), max = Number(el.max);
      const raisedMinimum = id === 'creditCardGap'
        || (id === 'coverCardGap' && n >= -20);
      const previousTitleHeight = id === 'cardTitlePadding' && n <= 60;
      const previousCardGap = id === 'cardGap' && n <= 80;
      const previousUnifiedBottomSpace = id === 'unifiedBottomSpace' && n >= 0 && n <= 80;
      const previousCornerRadius = id === 'cardCornerRadius' && n <= 32;
      const previousGapHeight = id === 'gapHeight' && n >= 16 && n <= 144;
      const previousNarrDialogueGap = id === 'narrDialogueGap' && n >= 0 && n < min;
      if(!Number.isFinite(n) || (n < min && !raisedMinimum && !previousGapHeight && !previousNarrDialogueGap) || (n > max && !previousTitleHeight && !previousCardGap && !previousUnifiedBottomSpace && !previousCornerRadius && !previousGapHeight)) return null;
      clean[id] = (id === 'titleSize' || id === 'foldTitleSize')
        ? String(Math.round(n))
        : String(Math.max(min, Math.min(max, n)));
    } else if(el.tagName === 'SELECT'){
      const value = String(raw);
      if(Array.from(el.options).some(opt => opt.value === value)){
        clean[id] = value;
      } else if(id === 'dlgStyle' && value === 'split'){
        // 저장된 split 표현은 이름 배지 방식으로 읽는다.
        clean[id] = 'badge';
      } else if(id === 'dlgStyle' && value === 'quote'){
        // 저장된 quote 표현은 인용박스 방식으로 읽는다.
        clean[id] = 'box';
      } else if(id === 'textFont'){
        // 더 이상 제공하지 않는 서체만 안전한 기본값으로 교체한다.
        clean[id] = DEFAULT_STYLE[id];
      } else {
        return null;
      }
    } else {
      if(typeof raw !== 'string') return null;
      if(id === 'commentWidth' && !['default','card'].includes(raw)) return null;
      if(id === 'commentAlign' && !['left','center'].includes(raw)) return null;
      clean[id] = raw;
    }
    found++;
  }
  return found ? { name: preset.name.trim(), values: clean } : null;
}

// 색 조합 스와치: 배경/나레이션/강조/{{char}}/{{user}} 순서의 소형 컬러칩.
function buildSwatchRow(v){
  if(outputThemeTransparent(v.outputTheme)) return '<div class="transparentSwatch">배경 없이 · 기본 글자색</div>';
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
try {
  const savedView = JSON.parse(localStorage.getItem(PRESET_VIEW_KEY) || '{}');
  if(['manual','recent','name'].includes(savedView.sort)) presetSortMode = savedView.sort;
} catch(e){}

function savePresetView(){
  try { localStorage.setItem(PRESET_VIEW_KEY, JSON.stringify({ sort:presetSortMode })); } catch(e){}
}

function persistPresetDomOrder(){
  if(presetSortMode !== 'manual' || presetSearchQuery) return;
  const names = Array.from(document.querySelectorAll('#presetList .presetCard')).map(card => card.dataset.presetName);
  const all = loadPresets();
  if(all === null || names.length !== all.length) return;
  const byName = new Map(all.map(p => [p.name, p]));
  const ordered = names.map(name => byName.get(name)).filter(Boolean);
  if(ordered.length === all.length) savePresets(ordered);
}

// 평소에는 팔레트·이름·선택만, 관리 모드에서만 검색·정렬·순서 변경·메뉴를 표시한다.
function renderPresetList(){
  const all = loadPresets();
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
      const storedList = loadPresets();
      if(storedList){
        const used = storedList.find(item => item.name === p.name);
        if(used) used.lastUsed = Date.now();
        savePresets(storedList);
      }
      currentPresetName = p.name;
      currentComboName = null;
      renderPresetList();
      renderComboList();
      MosaicUI.preview.render();
      saveDraft();
      commitStyleHistory(true);
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
          const storedList = loadPresets();
          if(storedList === null){ showPresetReadError(); input.focus(); return; }
          if(storedList.some(x => x.name.toLowerCase() === name.toLowerCase())){
            document.getElementById('presetStatus').textContent = '다른 프리셋 이름을 입력하세요.';
            input.focus();
            return;
          }
          const target = storedList.find(x => x.name === p.name);
          if(target) target.name = name;
          if(!savePresets(storedList)){
            document.getElementById('presetStatus').textContent = presetSaveFailure;
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
      const storedList = loadPresets();
      if(storedList === null){ showPresetReadError(); return; }
      let name = `${p.name} 복사본`;
      let suffix = 2;
      while(storedList.some(item => item.name.toLowerCase() === name.toLowerCase())) name = `${p.name} 복사본 ${suffix++}`;
      const index = storedList.findIndex(item => item.name === p.name);
      storedList.splice(index + 1, 0, { name, values:{ ...p.values }, lastUsed:0 });
      if(!savePresets(storedList)){
        document.getElementById('presetStatus').textContent = presetSaveFailure;
        return;
      }
      renderPresetList();
    });
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const storedList = loadPresets();
      if(storedList === null){ showPresetReadError(); return; }
      if(storedList.length <= 1){ document.getElementById('presetStatus').textContent = '프리셋을 1개 이상 유지하세요.'; return; }
      if(!confirm(`'${p.name}' 프리셋을 삭제하려면 확인을 누르세요.\n삭제 후 되돌릴 수 없습니다.`)) return;
      if(!savePresets(storedList.filter(x => x.name !== p.name))){
        document.getElementById('presetStatus').textContent = presetSaveFailure;
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

function currentAppliedThemeSource(){
  const currentValues = currentSavedPresetValues();
  if(currentPresetName){
    const presets = loadPresets();
    const selected = presets && presets.find(p => p.name === currentPresetName);
    if(selected && savedPresetStateEqual(selected.values, currentValues)){
      return { kind:'saved', name:currentPresetName };
    }
  }
  if(currentComboName){
    const combo = COLOR_COMBOS.find(item => item.name === currentComboName);
    const sameColors = combo && THEME_COLOR_FIELDS.every(id =>
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



document.getElementById('overwritePresetBtn').addEventListener('click', () => {
  if(!currentPresetName) return;
  const list = loadPresets();
  if(list === null){ showPresetReadError(); return; }
  const target = list.find(p => p.name === currentPresetName);
  if(!target) return;
  const overwrittenPresetName = currentPresetName;
  const previousStoredPresets = localStorage.getItem(PRESET_KEY);
  target.values = currentSavedPresetValues();
  target._stored = null;
  if(!savePresets(list)){
    document.getElementById('presetStatus').textContent = presetSaveFailure;
    return;
  }
  const writtenStoredPresets = lastPresetReadRaw;
  renderPresetList();
  const st = document.getElementById('presetStatus');
  st.textContent = `'${overwrittenPresetName}'에 덮어씀.`;
  MosaicUI.feedback.undo(`'${overwrittenPresetName}' 프리셋 덮어씀.`, () => {
    const restored = restoreStoredValue(PRESET_KEY, previousStoredPresets, writtenStoredPresets);
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

function updateSavePresetBtn(){
  const input = document.getElementById('presetName');
  document.getElementById('savePresetBtn').disabled = !input.value.trim();
}
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
  const list = loadPresets();
  if(list === null){ showPresetReadError(); return; }
  const values = currentSavedPresetValues();
  const existingIdx = list.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
  if(existingIdx >= 0){
    document.getElementById('presetStatus').textContent = '같은 이름이 이미 있습니다. 선택 후 변경사항 저장을 사용해 주세요.';
    return;
  }
  list.push({ name, values });
  if(!savePresets(list)){
    document.getElementById('presetStatus').textContent = presetSaveFailure;
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
  applyStyleValues(DEFAULT_STYLE);
  currentPresetName = null;
  currentComboName = '모노 클래식';
  currentComboFamily = 'featured';
  renderPresetList();
  renderComboList();
  MosaicUI.preview.render();
  saveDraft();
  commitStyleHistory(true);
});

const ADVANCED_RESET_GROUP_FIELDS = {
  cardTitle:['cardDividerLength','cardTitlePadding','cardTitleOrnamentOpacity','foldAutoNumberStyle'],
  cardOutline:['cardCornerRadius'],
  cardSpacing:['profileTitleGap','coverCardGap','cardGap'],
  creditAppearance:['creditWidth','creditCardGap','creditBorderOn','creditTransparentOn'],
  coverSpace:['coverVerticalSpace','coverDividerLength'],
  topProfile:['profileOuterBackground','profileItemGap'],
  cardInterior:['cardBodyTopSpace','cardBodyBottomSpace','cardInlinePadding','unifiedBottomSpace'],
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
    if(input.type === 'checkbox') input.checked = DEFAULT_STYLE[id];
    else input.value = DEFAULT_STYLE[id];
  });
  ['hrShape','hr2Shape','hr3Shape','foldAutoNumberStyle','profileOuterBackground'].filter(id => ids.includes(id)).forEach(syncSegmentedChoiceControl);
  MosaicUI.controls.syncTypographyLabels();
  MosaicUI.controls.syncDesignSummaries();
  MosaicUI.controls.updateHexLabels();
  MosaicUI.preview.render();
  saveDraft();
  commitStyleHistory(true);
}

document.getElementById('advancedResetBtn').addEventListener('click', () => {
  resetAdvancedControlFields(['advancedOn', ...Object.values(ADVANCED_RESET_GROUP_FIELDS).flat()]);
});
document.querySelectorAll('#advancedDesignGroup .advancedOptionResetBtn').forEach(button => {
  button.addEventListener('click', () => {
    const fields = ADVANCED_RESET_GROUP_FIELDS[button.dataset.resetGroup];
    if(fields) resetAdvancedControlFields(fields);
  });
});

// ---------- 프리셋 내보내기 / 불러오기 ----------
document.getElementById('exportPresetBtn').addEventListener('click', () => {
  const list = loadPresets();
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
  if(file.size > MAX_PRESET_BYTES){
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
    if(!Array.isArray(imported) || imported.length > MAX_IMPORTED_PRESETS){
      statusEl.style.color = '#c0392b';
      statusEl.textContent = '이 도구의 프리셋 파일이 아니거나 항목이 너무 많습니다. (최대 100개)';
      return;
    }
    const cleaned = imported.map(sanitizeImportedPreset);
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

    const list = loadPresets();
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
    if(!savePresets(list)){
      statusEl.style.color = '#c0392b';
      statusEl.textContent = presetSaveFailure;
      return;
    }
    const appliedPreset = list.find(p => p.name.toLowerCase() === imported[0].name.toLowerCase());
    currentPresetName = appliedPreset ? appliedPreset.name : imported[0].name;
    currentComboName = null;
    applyThemeColorValues(imported[0].values);
    renderPresetList();
    renderComboList();
    MosaicUI.preview.render();
    saveDraft();
    commitStyleHistory(true);

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

function initializeThemeSelection(){
  const initialList = loadPresets();
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
  commitStyleHistory(true); // 초기 작업 상태를 기록의 첫 항목으로
  updateHistoryButtons();
}

// ---------- 크레딧·세부 프리셋의 저장 충돌 보호 ----------
const presetReadSnapshots = new Map();

// 보관함과 마찬가지로, 읽지 못한 원본이나 다른 탭이 바꾼 원본은 덮어쓰지 않는다.
// 수정하지 않은 항목은 저장 당시의 필드를 그대로 유지한다.
function loadProtectedPresetList(key, sanitize, maxCount){
  presetReadSnapshots.delete(key);
  try {
    const raw = localStorage.getItem(key);
    if(raw === null){
      presetReadSnapshots.set(key, null);
      return [];
    }
    const stored = JSON.parse(raw);
    if(!Array.isArray(stored) || stored.length > maxCount) return null;
    const presets = sanitize(stored);
    if(presets.length !== stored.length) return null;
    presets.forEach((preset, index) => {
      Object.defineProperty(preset, '_stored', { value:stored[index], enumerable:false });
    });
    presetReadSnapshots.set(key, raw);
    return presets;
  }catch(e){ return null; }
}

function saveProtectedPresetList(key, presets, sanitize, maxCount, label){
  const fail = message => { MosaicUI.feedback.notice(`${label} ${message}`); return false; };
  if(!Array.isArray(presets) || presets.length > maxCount || !presetReadSnapshots.has(key)){
    return fail('원본을 읽지 못해 저장하지 않았습니다.');
  }
  try {
    const cleaned = sanitize(presets);
    if(cleaned.length !== presets.length) return fail('항목 형식을 확인하지 못해 저장하지 않았습니다.');
    if(localStorage.getItem(key) !== presetReadSnapshots.get(key)){
      presetReadSnapshots.delete(key);
      return fail('다른 탭에서 변경되어 저장하지 않았습니다. 다시 열어 확인해 주세요.');
    }
    const payload = presets.map((preset, index) => preset._stored || cleaned[index]);
    const serialized = JSON.stringify(payload);
    localStorage.setItem(key, serialized);
    presetReadSnapshots.set(key, serialized);
    return true;
  }catch(e){ return fail('저장소 오류로 저장하지 못했습니다.'); }
}

// 편집 UI가 저장 계층의 내부 상태를 직접 만지지 않도록 공개 작업만 묶는다.
const MosaicStorage = Object.freeze({
  applyStyleValues,
  commitStyleHistory,
  commitThemeHoverPreview,
  currentStyleValues,
  discardUndoSnapshot,
  goActionHistory,
  invalidateCharacterRows,
  initializeThemeSelection,
  loadProtectedPresetList,
  recordCompletedAction,
  renderComboList,
  renderCurrentThemePalette,
  renderPresetList,
  restoreDraft,
  saveDraft,
  saveProtectedPresetList,
  scheduleDraftSave,
  deferDraftSave,
  snapshotCards,
  syncAllSegmentedChoiceControls,
  syncCharList,
  syncMinimalChoiceControls,
  syncSegmentedChoiceControl,
  updateOverwriteBtn
});
