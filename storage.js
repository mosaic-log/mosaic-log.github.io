// 조각로그 v1.9.0 · 저장소 읽기·충돌 보호·HTML 복원 코덱
// 개조 길잡이: 초안 충돌 보호 · 보관함/프리셋 직렬화 · encodeRestoreState/decodeRestoreState.
// Dependencies: MosaicState
globalThis.MosaicStorage = (() => {
'use strict';
// HTML 출력에 포함하는 복원 메타데이터 코덱.
const RESTORE_META_PREFIX = '<!--MOSAIC_LOG_STATE_V1:';

const RESTORE_META_SUFFIX = '-->';

function encodeRestoreState(data){
  const bytes = new TextEncoder().encode(JSON.stringify({ app:'mosaic-log', version:1, data }));
  let binary = '';
  const chunkSize = 0x8000;
  for(let i = 0; i < bytes.length; i += chunkSize){
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodeRestoreState(html){
  const start = html.indexOf(RESTORE_META_PREFIX);
  if(start < 0) return null;
  const payloadStart = start + RESTORE_META_PREFIX.length;
  const end = html.indexOf(RESTORE_META_SUFFIX, payloadStart);
  if(end < 0) throw new Error('복원 데이터가 끝까지 저장되지 않았습니다.');
  const encoded = html.slice(payloadStart, end).trim();
  if(!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('복원 데이터 형식이 올바르지 않습니다.');
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const envelope = JSON.parse(new TextDecoder().decode(bytes));
  if(!envelope || envelope.app !== 'mosaic-log' || envelope.version !== 1 || !envelope.data){
    throw new Error('지원하지 않는 조각로그 복원 데이터입니다.');
  }
  return envelope.data;
}

const CREDIT_PRESET_KEY = 'mosaicCreditItemPresets_v1';

const DETAIL_PRESET_KEY = 'mosaicDetailPresets_v1';

function sanitizeDetailPresetList(value){
  if(!Array.isArray(value)) return [];
  return value.slice(0, MosaicState.MAX_DETAIL_PRESETS).map((preset, index) => {
    if(!preset || typeof preset !== 'object' || Array.isArray(preset)) return null;
    const name = typeof preset.name === 'string' ? preset.name.trim().slice(0, 80) : '';
    if(!name || !preset.values || typeof preset.values !== 'object' || Array.isArray(preset.values)
      || !MosaicState.DETAIL_PRESET_FIELDS.some(id => Object.prototype.hasOwnProperty.call(preset.values, id))) return null;
    const safe = MosaicState.sanitizeImportedPreset({ name, values:preset.values });
    if(!safe) return null;
    const values = {};
    MosaicState.DETAIL_PRESET_FIELDS.forEach(id => { values[id] = safe.values[id]; });
    const id = typeof preset.id === 'string' && preset.id
      ? preset.id.slice(0, 120)
      : `detail-preset-${index}-${name.toLowerCase()}`;
    return { id, name, values, updatedAt:Number(preset.updatedAt) || 0 };
  }).filter(Boolean);
}

// ---------- 로그 보관함 (초안 슬롯) ----------
const SLOT_KEY = 'logGenSlots_v1';

const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;

const MAX_IMPORTED_SLOTS = 200;

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
      try { data = MosaicState.sanitizeImportedWork(slot.data); }
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

// 검증된 데이터가 아니라 원본 payload를 사용해 미지원 추가 필드도 백업에 보존한다.
function slotExportPayload(list){
  return list.map(slot => {
    const stored = slot._stored && typeof slot._stored === 'object' ? slot._stored : null;
    return {
      ...(stored ? stored : {}),
      id: slot.id,
      name: slot.name,
      savedAt: slot.savedAt,
      data: stored ? stored.data : slot.data
    };
  });
}

function draftUpdatedAtFromRaw(raw){
  try {
    if(!raw) return 0;
    return Number(JSON.parse(raw).updatedAt) || 0;
  } catch(e){ return 0; }
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

// 저장 내용을 끝까지 확인한 뒤에만 화면을 변경한다. 오래된 초안의 카드 저장
// 형식(cards/cardBodies/bodyInput)과 빠진 옵션의 HTML 기본값은 그대로 지원한다.
function prepareDraftRestore(d){
  if(!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const fields = {};
  for(const id of MosaicState.DRAFT_FIELDS){
    if(d[id] === undefined) continue;
    if(typeof d[id] !== 'string' && typeof d[id] !== 'number') return null;
    fields[id] = String(d[id]);
  }
  for(const id of ['profileTextPosition','titleTextPosition']){
    if(fields[id] === undefined) fields[id] = 'center';
    if(!['top','center','bottom'].includes(fields[id])) return null;
  }
  const draftExtraCount = Math.max(0, Math.min(3, Number(fields.profileExtraCount) || 0));
  if(fields.profileEntityOrder !== undefined){
    try {
      const parsed = JSON.parse(fields.profileEntityOrder);
      if(!Array.isArray(parsed) || parsed.some(key => typeof key !== 'string')) return null;
    } catch(e){ return null; }
  }
  fields.profileEntityOrder = JSON.stringify(MosaicState.normalizeProfileEntityOrder(
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
  for(const id of MosaicState.WORK_BOOLEAN_FIELDS){
    if(d[id] === undefined) continue;
    if(!['boolean','string','number'].includes(typeof d[id])) return null;
    booleans[id] = MosaicState.settingFlagOn(d[id]);
  }
  if(d.profileCommonOn !== undefined && !['boolean','string','number'].includes(typeof d.profileCommonOn)) return null;
  Object.assign(booleans, MosaicState.savedProfileCommonVisibility(d));
  booleans.profileImageBackgroundOn = MosaicState.savedProfileImageBackgroundOn(d);
  booleans.profileDividerMinimal = MosaicState.savedProfileDividerMinimal(d);
  let style = null;
  if(d.style !== undefined && d.style !== null){
    if(typeof d.style !== 'object' || Array.isArray(d.style)) return null;
    for(const id of MosaicState.STYLE_FIELDS){
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
    if(card.outputRuleExclusions !== undefined && (!Array.isArray(card.outputRuleExclusions)
      || card.type === 'comment' || MosaicState.normalizeOutputRuleExclusions(card.outputRuleExclusions,card.body || '').length !== card.outputRuleExclusions.length)) return null;
    if(card.parallelExclusions !== undefined && (!Array.isArray(card.parallelExclusions) || card.type === 'comment'
      || MosaicState.normalizeParallelExclusions(card.parallelExclusions,card.body || '').length !== card.parallelExclusions.length)) return null;
    for(const key of ['foldTitle','cardTitle']){
      if(card[key] !== undefined && typeof card[key] !== 'string') return null;
    }
    for(const key of ['folded','foldMinimal','visible','bodyCenter']){
      if(card[key] !== undefined && !['boolean','string','number'].includes(typeof card[key])) return null;
    }
  }
  const legacyFoldDividerMinimal = cards.some(card => card && typeof card === 'object'
    && card.type !== 'comment' && MosaicState.settingFlagOn(card.foldMinimal));
  if(style && style.foldDividerOn === undefined && style.foldDividerMinimal === undefined && legacyFoldDividerMinimal){
    style.foldDividerOn = false;
  }
  const timestamp = Number(d.updatedAt);
  return {
    fields, booleans, style, cards, legacyFoldDividerMinimal,
    updatedAt:Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0
  };
}

// ---------- 프리셋 ----------
const PRESET_KEY = 'logGenPresets_v2';

let lastPresetReadRaw;

let presetSaveFailure = '';

function loadPresets(defaultValues = Object.fromEntries(MosaicState.SAVED_PRESET_FIELDS.map(id => [id, MosaicState.DEFAULT_STYLE[id]]))){
  lastPresetReadRaw = undefined;
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if(raw === null){
      lastPresetReadRaw = null;
      const defaultPreset = { name: '프리셋 1', values: {...defaultValues} };
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
      const safe = MosaicState.sanitizeImportedPreset(candidate);
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

const MAX_PRESET_BYTES = 512 * 1024;

const MAX_IMPORTED_PRESETS = 100;

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
  const fail = message => { protectedPresetFailure = `${label} ${message}`; return false; };
  protectedPresetFailure = ''; 
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
let protectedPresetFailure = "";
function readDraftRaw(){ return localStorage.getItem(MosaicState.DRAFT_KEY); }
function writeDraftRaw(raw, expected){
  if(localStorage.getItem(MosaicState.DRAFT_KEY) !== expected) throw new Error("draft changed");
  localStorage.setItem(MosaicState.DRAFT_KEY, raw);
}
function removeDraftRaw(){ localStorage.removeItem(MosaicState.DRAFT_KEY); }

return Object.freeze({
loadProtectedPresetList,
saveProtectedPresetList,
CREDIT_PRESET_KEY,
DETAIL_PRESET_KEY,
MAX_ARCHIVE_BYTES,
MAX_IMPORTED_PRESETS,
MAX_IMPORTED_SLOTS,
MAX_PRESET_BYTES,
PRESET_KEY,
RESTORE_META_PREFIX,
RESTORE_META_SUFFIX,
SLOT_KEY,
decodeRestoreState,
draftSaveConflictReason,
draftUpdatedAtFromRaw,
encodeRestoreState,
isRetiredDefaultDraft,
loadPresets,
loadSlots,
makeSlotId,
prepareDraftRestore,
readDraftRaw,
removeDraftRaw,
restoreStoredValue,
sanitizeDetailPresetList,
savePresets,
saveSlots,
slotExportPayload,
validSlotId,
writeDraftRaw,
get lastPresetReadRaw(){ return lastPresetReadRaw; },
get lastSlotReadRaw(){ return lastSlotReadRaw; },
get presetSaveFailure(){ return presetSaveFailure; },
get protectedPresetFailure(){ return protectedPresetFailure; },
get slotReadIssue(){ return slotReadIssue; },
get slotSaveFailure(){ return slotSaveFailure; }
});
})();
