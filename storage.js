// 조각로그 v1.9.0 · 저장소 읽기·충돌 보호·HTML 복원 코덱
// 개조 길잡이: 초안 충돌 보호 · 보관함/프리셋 직렬화 · encodeRestoreState/decodeRestoreState.
// Dependencies: MosaicState
globalThis.MosaicStorage = (() => {
'use strict';
// HTML 출력에 포함하는 복원 메타데이터 코덱.
const RESTORE_META_PREFIX = '<!--MOSAIC_LOG_STATE_V1:';

const RESTORE_META_SUFFIX = '-->';

// 복원 정보만 제한해서 읽는다. 뒤의 출력 HTML 크기는 복원을 막지 않는다.
const MAX_RESTORE_BYTES = 32 * 1024 * 1024;

function readBlobText(blob){
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('파일을 읽지 못했습니다.'));
    reader.onabort = () => reject(new Error('파일 읽기가 취소되었습니다.'));
    reader.readAsText(blob);
  });
}

async function readRestoreStateFile(file){
  let buffer = '', offset = 0, start = -1;
  const limit = Math.min(file.size, MAX_RESTORE_BYTES);
  while(offset < limit){
    const end = Math.min(offset + 256 * 1024, limit), previous = buffer.length;
    buffer += await readBlobText(file.slice(offset,end));
    offset = end;
    if(start < 0) start = buffer.indexOf(RESTORE_META_PREFIX, Math.max(0,previous-RESTORE_META_PREFIX.length+1));
    if(start >= 0){
      const close = buffer.indexOf(RESTORE_META_SUFFIX, Math.max(start+RESTORE_META_PREFIX.length,previous-RESTORE_META_SUFFIX.length+1));
      if(close >= 0) return decodeRestoreState(buffer.slice(start,close+RESTORE_META_SUFFIX.length));
    }
  }
  if(file.size > limit) throw new Error('복원 정보가 검색 한도(32MB)를 넘거나 파일 앞부분에 없습니다.');
  return decodeRestoreState(buffer);
}

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

const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;

const MAX_IMPORTED_SLOTS = 200;

// 다운로드와 가져오기가 같은 바이트·항목 한도를 사용한다.
// 실제 출력하는 들여쓰기 JSON의 크기를 항목별로 한 번씩 계산한다.
function partitionJSONBackup(list, maxBytes, maxItems){
  if(!list.length) return [[]];
  const chunks = [];
  let current = [], bytes = 2;
  for(let index = 0; index < list.length; index++){
    const item = list[index], singleBytes = new TextEncoder().encode(JSON.stringify([item],null,2)).length;
    if(singleBytes > maxBytes) throw new Error(`${index+1}번 항목이 파일 가져오기 한도를 넘습니다. 원본 데이터를 별도로 백업해 주세요.`);
    const nextBytes = current.length ? bytes+singleBytes-2 : singleBytes;
    if(current.length && (current.length >= maxItems || nextBytes > maxBytes)){
      chunks.push(current); current = []; bytes = 2;
    }
    bytes = current.length ? bytes+singleBytes-2 : singleBytes;
    current.push(item);
  }
  if(current.length) chunks.push(current);
  return chunks;
}

// 데이터베이스 이름과 이전 원본은 유지하고 로그별 목록·내용 저장소를 추가한다.
const ARCHIVE_DB_NAME = 'mosaic-log-archive-v1' + (globalThis.location?.protocol === 'file:' ? ':' + globalThis.location.pathname : '');
const ARCHIVE_STORE = 'archives';
const ARCHIVE_INDEX = 'archiveIndex';
const ARCHIVE_ENTRIES = 'archiveEntries';
const ARCHIVE_STATE_KEY = SLOT_KEY + ':state';
const ARCHIVE_SPLIT_KEY = SLOT_KEY + ':split';
const ARCHIVE_STORES = [ARCHIVE_STORE,ARCHIVE_INDEX,ARCHIVE_ENTRIES];
let archiveDatabase, archiveReady;
const slotReadSnapshots = new WeakMap();
const archiveTokens = new WeakSet();
let slotReadIssue = '', lastSlotReadRaw, slotSaveFailure = '', slotReadRevision = 0;

function archiveError(name){ const error = new Error(name); error.name = name; return error; }

function openArchiveDatabase(){
  if(archiveDatabase) return archiveDatabase;
  archiveDatabase = new Promise((resolve,reject) => {
    if(!globalThis.indexedDB){ reject(archiveError('StorageUnavailableError')); return; }
    const request = globalThis.indexedDB.open(ARCHIVE_DB_NAME,2);
    let blocked = false;
    request.onupgradeneeded = () => {
      for(const name of ARCHIVE_STORES){
        if(!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
      }
    };
    request.onblocked = () => { blocked = true; reject(archiveError('StorageBlockedError')); };
    request.onerror = () => reject(request.error || archiveError('UnknownError'));
    request.onsuccess = () => {
      const db = request.result;
      if(blocked){ db.close(); return; }
      const forget = () => { archiveDatabase = undefined; archiveReady = undefined; };
      db.onversionchange = () => { db.close(); forget(); };
      db.onclose = forget;
      resolve(db);
    };
  });
  archiveDatabase.catch(() => { archiveDatabase = undefined; archiveReady = undefined; });
  return archiveDatabase;
}

async function archiveTransaction(mode,names,action){
  const db = await openArchiveDatabase();
  return new Promise((resolve,reject) => {
    const transaction = db.transaction(names,mode);
    let result, failure;
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(failure || transaction.error || archiveError('AbortError'));
    transaction.onerror = event => { failure = failure || event.target.error; };
    const fail = error => { failure = failure || error; transaction.abort(); };
    try { action(transaction,value => { result = value; },fail); } catch(error){ fail(error); }
  });
}

// 다음 요청은 요청 콜백 안에서 등록해 트랜잭션을 유지한다.
function archiveRequests(requests,receive,fail){
  let pending = requests.length;
  const complete = () => {
    if(--pending) return;
    try { receive(requests.map(request => request.result)); } catch(error){ fail(error); }
  };
  if(!pending){ try { receive([]); } catch(error){ fail(error); } return; }
  requests.forEach(request => { request.onsuccess = complete; });
}

function legacyArchiveStamp(raw){
  if(raw === null) return null;
  let first = 2166136261, second = 5381;
  for(let i = 0; i < raw.length; i++){
    const code = raw.charCodeAt(i);
    first = Math.imul(first ^ code,16777619); second = Math.imul(second,33) ^ code;
  }
  return `${raw.length}:${first >>> 0}:${second >>> 0}`;
}

function currentLegacyStamp(){
  try { return legacyArchiveStamp(localStorage.getItem(SLOT_KEY)); } catch(error){ return undefined; }
}

function archiveNotice(state){
  const stamp = currentLegacyStamp();
  return state.legacyStamp !== undefined && stamp !== undefined && state.legacyStamp !== stamp
    ? '이전 저장소의 자료가 변경되었습니다. 자동으로 합치지 않았습니다. 구버전에서 JSON으로 내보낸 뒤 가져오세요.'
    : state.legacyImported ? '기존 보관함을 새 저장소로 옮겼습니다.' : '';
}

function legacyArchiveSnapshot(stored,state){
  if(stored === undefined && state !== undefined) throw archiveError('StorageMissingError');
  const raw = stored === undefined ? localStorage.getItem(SLOT_KEY) : stored;
  if(raw !== null && typeof raw !== 'string') throw archiveError('StorageDataError');
  const source = stored === undefined && raw !== null ? 'legacy' : 'current';
  const notice = state ? archiveNotice(state) : source === 'legacy'
    ? '이전 저장소의 보관함을 표시 중입니다. 최신 자료인지 확인해 주세요.' : '';
  return {raw,source,notice};
}

function validSlotId(id){ return MosaicState.validSlotId(id); }

function makeSlotId(){
  if(globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'slot-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10);
}

function makeLegacySlotId(slot,index){
  const seed = `${slot && slot.name || ''}|${slot && slot.savedAt || ''}|${index}`;
  let hash = 2166136261;
  for(let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i),16777619);
  return `legacy-${(hash >>> 0).toString(36)}-${index}`;
}

function inspectArchive(raw){
  if(raw === null) return {slots:[],issue:''};
  let parsed;
  try { parsed = JSON.parse(raw); } catch(error){ return {slots:[],issue:'보관함 JSON 데이터를 읽지 못했습니다.'}; }
  if(!Array.isArray(parsed)) return {slots:[],issue:'저장된 보관함 목록 형식이 올바르지 않습니다.'};
  const slots = [], unreadable = [], seen = new Set(), now = Date.now();
  parsed.forEach((slot,index) => {
    const checked = MosaicState.inspectSlotRecord(slot,now);
    const id = checked.issue ? '' : validSlotId(slot.id) ? slot.id : makeLegacySlotId(slot,index);
    if(checked.issue || seen.has(id)){
      unreadable.push(`${index+1}번 항목`); return;
    }
    seen.add(id);
    const entry = {...checked.value,id};
    Object.defineProperty(entry,'_stored',{value:slot,writable:true,enumerable:false});
    slots.push(entry);
  });
  return {slots,issue:unreadable.length ? `${unreadable.slice(0,3).join(', ')}${unreadable.length>3 ? ` 외 ${unreadable.length-3}개 항목` : ''}을 읽지 못했습니다.` : ''};
}

function archiveCharacterName(slot){
  const value = slot.data && slot.data.fields && slot.data.fields.subChar;
  return typeof value === 'string' ? value.trim() : '';
}

function prepareArchiveEntry(slot){
  const payload = slotExportPayload([slot])[0];
  const checked = MosaicState.inspectSlotRecord(payload,Date.now());
  if(checked.issue || !validSlotId(payload.id)) throw archiveError('StorageDataError');
  const record = {id:payload.id,revision:makeSlotId(),raw:JSON.stringify({...payload,name:checked.value.name,savedAt:checked.value.savedAt})};
  const index = {id:record.id,name:checked.value.name,savedAt:checked.value.savedAt,
    characterName:archiveCharacterName(checked.value),revision:record.revision,bytes:record.raw.length*2};
  return {record,index};
}

function archiveOverhead(count){ return 4 + Math.max(0,count-1)*2; }

function validSplitState(state){
  return state && state.schema === 2 && validSlotId(state.revision) && Array.isArray(state.order)
    && state.order.every(validSlotId) && new Set(state.order).size === state.order.length
    && Number.isSafeInteger(state.bytes) && state.bytes >= archiveOverhead(state.order.length);
}

function validArchiveIndex(item){
  return item && validSlotId(item.id) && MosaicState.validStoredName(item.name,100)
    && Number.isFinite(item.savedAt) && item.savedAt>0 && typeof item.characterName === 'string'
    && validSlotId(item.revision) && Number.isSafeInteger(item.bytes) && item.bytes >= 0;
}

function inspectArchiveIndex(state,items){
  if(!validSplitState(state)) throw archiveError(state === undefined ? 'StorageMissingError' : 'StorageDataError');
  const map = new Map(items.map(item => [item && item.id,item]));
  if(items.length !== state.order.length || map.size !== items.length
    || state.order.some(id => !validArchiveIndex(map.get(id)))) throw archiveError('StorageDataError');
  const ordered = state.order.map(id => map.get(id));
  if(ordered.reduce((sum,item) => sum+item.bytes,archiveOverhead(ordered.length)) !== state.bytes) throw archiveError('StorageDataError');
  return ordered;
}

async function ensureArchiveSplit(){
  if(archiveReady) return archiveReady;
  const pending = archiveTransaction('readwrite',ARCHIVE_STORES,(tx,done,fail) => {
    const old = tx.objectStore(ARCHIVE_STORE), index = tx.objectStore(ARCHIVE_INDEX), entries = tx.objectStore(ARCHIVE_ENTRIES);
    archiveRequests([old.get(ARCHIVE_SPLIT_KEY)],([state]) => {
      if(state !== undefined){ if(!validSplitState(state)) throw archiveError('StorageDataError'); done(); return; }
      archiveRequests([old.get(SLOT_KEY),old.get(ARCHIVE_STATE_KEY),index.count(),entries.count()],([raw,prior,indexCount,entryCount]) => {
        if(indexCount || entryCount) throw archiveError('StorageDataError');
        if(prior && prior.split) throw archiveError('StorageMissingError');
        const snapshot = legacyArchiveSnapshot(raw,prior), checked = inspectArchive(snapshot.raw);
        if(checked.issue){
          const error = archiveError('StorageMigrationError'); error.snapshot = snapshot; error.checked = checked; throw error;
        }
        const prepared = checked.slots.map(prepareArchiveEntry);
        prepared.forEach(item => { index.put(item.index,item.index.id); entries.put(item.record,item.record.id); });
        const legacyStamp = prior && prior.legacyStamp !== undefined ? prior.legacyStamp
          : raw === undefined ? legacyArchiveStamp(snapshot.raw) : currentLegacyStamp();
        old.put({...prior,version:1,legacyStamp,split:true},ARCHIVE_STATE_KEY);
        old.put({schema:2,revision:makeSlotId(),order:prepared.map(item=>item.index.id),
          bytes:prepared.reduce((sum,item)=>sum+item.index.bytes,archiveOverhead(prepared.length)),legacyStamp,
          legacyImported:snapshot.source === 'legacy'},ARCHIVE_SPLIT_KEY);
        // 이전 본문 JSON과 localStorage 원본은 수정하거나 삭제하지 않는다.
        done();
      },fail);
    },fail);
  });
  archiveReady = pending;
  pending.catch(() => { if(archiveReady === pending) archiveReady = undefined; });
  return pending;
}

function attachArchiveSnapshot(list,snapshot){
  archiveTokens.add(snapshot); slotReadSnapshots.set(list,snapshot);
}

function inspectArchiveRecord(record,index){
  if(!record || record.id !== index.id || record.revision !== index.revision || typeof record.raw !== 'string'
    || record.raw.length*2 !== index.bytes) throw archiveError('StorageDataError');
  const inspected = inspectArchive('['+record.raw+']');
  if(inspected.issue || inspected.slots.length !== 1) throw archiveError('StorageDataError');
  const slot = inspected.slots[0];
  if(slot.id !== index.id || slot.name !== index.name || slot.savedAt !== index.savedAt
    || archiveCharacterName(slot) !== index.characterName) throw archiveError('StorageDataError');
  return slot;
}

async function readArchiveView({indexOnly=false,ids=null,allowPartial=false} = {}){
  const revision = ++slotReadRevision;
  const result = {slots:null,raw:undefined,bytes:undefined,issue:'',notice:'',source:'current',missing:false};
  try {
    await ensureArchiveSplit();
    const names = indexOnly ? [ARCHIVE_STORE,ARCHIVE_INDEX] : ARCHIVE_STORES;
    await archiveTransaction('readonly',names,(tx,done,fail) => {
      archiveRequests([tx.objectStore(ARCHIVE_STORE).get(ARCHIVE_SPLIT_KEY),tx.objectStore(ARCHIVE_INDEX).getAll()],([state,values]) => {
        const indexes = inspectArchiveIndex(state,values), map = new Map(indexes.map(item=>[item.id,item]));
        const wanted = ids === null ? state.order : [...new Set(ids)];
        if(wanted.some(id=>!validSlotId(id))) throw archiveError('StorageDataError');
        result.bytes = state.bytes; result.notice = archiveNotice(state);
        const finish = values => {
          const counted = !indexOnly && ids === null;
          const records = counted ? values.slice(0,-1) : values;
          const countMismatch = counted && values[values.length-1] !== wanted.length;
          const originals = new Map(), slots = [], unreadable = [];
          wanted.forEach((id,position) => {
            const index = map.get(id);
            if(!index){ originals.set(id,null); return; }
            if(indexOnly){ slots.push({...index}); originals.set(id,{index}); return; }
            const record = records[position];
            try { slots.push(inspectArchiveRecord(record,index)); originals.set(id,{index,raw:record.raw}); }
            catch(error){ unreadable.push(id); }
          });
          if(!indexOnly && ids === null && !countMismatch && records.every(record=>record && typeof record.raw === 'string')) result.raw = '['+records.map(record=>record.raw).join(',')+']';
          if(unreadable.length) result.issue = `${unreadable.length}개 보관함 항목의 내용을 읽지 못했습니다.`;
          if(countMismatch) result.issue = '보관함 목록과 내용의 항목 수가 다릅니다. 복구 자료를 먼저 보관해 주세요.';
          result.slots = result.issue && !allowPartial ? null : slots;
          if(!result.issue) attachArchiveSnapshot(slots,{kind:'entries',scope:ids === null ? 'all' : 'selection',
            items:originals,order:[...state.order],revision:state.revision,raw:result.raw,indexOnly});
          done();
        };
        if(indexOnly) finish([]);
        else {
          const requests = wanted.map(id=>tx.objectStore(ARCHIVE_ENTRIES).get(id));
          if(ids === null) requests.push(tx.objectStore(ARCHIVE_ENTRIES).count());
          archiveRequests(requests,finish,fail);
        }
      },fail);
    });
  } catch(error){
    if(error.name === 'StorageMigrationError'){
      Object.assign(result,error.snapshot,{issue:error.checked.issue,
        slots:allowPartial ? (indexOnly ? error.checked.slots.map(slot=>({id:slot.id,name:slot.name,savedAt:slot.savedAt,characterName:archiveCharacterName(slot)})) : error.checked.slots) : null});
    } else {
      result.issue = archiveFailureMessage(error);
      if(error.name === 'StorageMissingError'){
        const empty = await archiveTransaction('readonly',ARCHIVE_STORES,(tx,done,fail) => {
          archiveRequests([tx.objectStore(ARCHIVE_STORE).get(ARCHIVE_SPLIT_KEY),
            tx.objectStore(ARCHIVE_INDEX).count(),tx.objectStore(ARCHIVE_ENTRIES).count()],
          ([state,indexCount,entryCount]) => done(state === undefined && !indexCount && !entryCount),fail);
        }).catch(() => false);
        if(empty){
          result.missing = true;
          attachArchiveSnapshot(result,{kind:'missing'});
        } else result.issue = archiveFailureMessage(archiveError('StorageDataError'));
      }
    }
  }
  if(revision === slotReadRevision){ slotReadIssue = result.issue; lastSlotReadRaw = result.raw; }
  return result;
}

async function readSlots(allowPartial=false){ return readArchiveView({allowPartial}); }
async function readSlotIndex(){ return readArchiveView({indexOnly:true,allowPartial:true}); }
async function readSlot(id){ return readArchiveView({ids:[id],allowPartial:true}); }
async function readSlotsForIds(ids,allowPartial=false){ return readArchiveView({ids:[...ids],allowPartial}); }
async function loadSlots(allowPartial=false){ return (await readSlots(allowPartial)).slots; }

async function readSlotsRaw(){
  const read = await readSlots(true);
  if(read.raw !== undefined) return read.raw;
  throw archiveError('StorageDataError');
}

async function readSlotsBackup(){
  const read = await readSlots(true);
  if(read.raw !== undefined) return {raw:read.raw,source:read.source};
  try {
    const backup = await archiveTransaction('readonly',ARCHIVE_STORES,(tx,done,fail) => {
      const old = tx.objectStore(ARCHIVE_STORE);
      archiveRequests([old.get(ARCHIVE_SPLIT_KEY),tx.objectStore(ARCHIVE_INDEX).getAll(),tx.objectStore(ARCHIVE_ENTRIES).getAll(),old.get(SLOT_KEY)],([state,index,entries,previous]) => {
        if(state !== undefined || index.length || entries.length){
          done({raw:JSON.stringify({app:'mosaic-log-archive-recovery',state,index,entries}),source:'partial'});
        } else if(typeof previous === 'string') done({raw:previous,source:'previous'});
        else done(null);
      },fail);
    });
    if(backup) return backup;
  } catch(error){ /* 접근 불가일 때만 이전 localStorage 사본을 시도한다. */ }
  const raw = localStorage.getItem(SLOT_KEY);
  if(raw === null) throw archiveError('StorageUnavailableError');
  return {raw,source:'legacy'};
}

function archiveFailureMessage(error){
  const name = error && error.name;
  if(name === 'QuotaExceededError') return '브라우저 보관함 저장 공간이 부족합니다. JSON으로 백업한 뒤 불필요한 항목을 정리해 주세요.';
  if(name === 'SecurityError' || name === 'NotAllowedError') return '브라우저에서 보관함 저장소 접근을 차단했습니다. 사이트 데이터 저장 허용 설정을 확인해 주세요.';
  if(name === 'StorageUnavailableError') return '이 브라우저에서는 보관함 저장소를 사용할 수 없습니다. 저장을 지원하는 브라우저에서 열어 주세요.';
  if(name === 'StorageBlockedError' || name === 'VersionError') return '다른 조각로그 탭을 닫은 뒤 다시 시도해 주세요. 보관함 저장소를 열지 못했습니다.';
  if(name === 'StorageMissingError') return '현재 보관함 자료가 없어 이전 사본을 자동으로 불러오지 않았습니다. JSON 백업을 확인해 주세요.';
  if(name === 'StorageDataError') return '보관함 목록과 내용의 저장 상태를 확인하지 못했습니다. 원본 백업을 먼저 보관해 주세요.';
  return '브라우저 보관함 저장소에 오류가 발생했습니다. 다시 시도하거나 JSON 백업을 확인해 주세요.';
}

function slotReadSnapshot(list){ return slotReadSnapshots.get(list)?.raw; }
function slotReadToken(list){ return slotReadSnapshots.get(list); }

function archiveChangePlan(list,snapshot){
  if(!Array.isArray(list) || !snapshot || !archiveTokens.has(snapshot)) throw archiveError('StorageDataError');
  const nextIds = new Set(), puts = [], removes = [];
  list.forEach(slot => {
    if(!slot || !validSlotId(slot.id) || nextIds.has(slot.id) || !MosaicState.validStoredName(slot.name,100)) throw archiveError('StorageDataError');
    nextIds.add(slot.id);
    const original = snapshot.items && snapshot.items.get(slot.id);
    if(!slot.data){
      if(!original || slot.name !== original.index.name || slot.savedAt !== original.index.savedAt) throw archiveError('StorageDataError');
      return;
    }
    const prepared = prepareArchiveEntry(slot);
    if(original && original.raw === prepared.record.raw) return;
    puts.push({...prepared,expected:original ? original.index.revision : null});
  });
  if(snapshot.items) snapshot.items.forEach((item,id) => {
    if(item && !nextIds.has(id)) removes.push({id,expected:item.index.revision});
  });
  return {puts,removes,order:list.map(slot=>slot.id)};
}

function updatedArchiveOrder(state,plan,snapshot){
  const removed = new Set(plan.removes.map(item=>item.id)), desired = new Set(plan.order);
  if(snapshot.scope === 'all' && snapshot.revision === state.revision){
    return [...plan.order,...state.order.filter(id=>!snapshot.items.has(id) && !desired.has(id))];
  }
  if(snapshot.scope === 'all'){
    const original = snapshot.order.filter(id=>snapshot.items.has(id) && !removed.has(id));
    const requested = plan.order.filter(id=>snapshot.items.has(id) && !removed.has(id));
    if(JSON.stringify(original) !== JSON.stringify(requested)) throw archiveError('StorageConflictError');
  }
  return [...plan.puts.filter(item=>item.expected === null).map(item=>item.index.id),...state.order.filter(id=>!removed.has(id))];
}

async function commitArchivePlan(plan,snapshot,strict=false){
  return archiveTransaction('readwrite',ARCHIVE_STORES,(tx,done,fail) => {
    const old = tx.objectStore(ARCHIVE_STORE), index = tx.objectStore(ARCHIVE_INDEX), entries = tx.objectStore(ARCHIVE_ENTRIES);
    archiveRequests([old.get(ARCHIVE_SPLIT_KEY)],([state]) => {
      const start = recovered => {
        const currentIds = new Set(state.order);
        const targets = [...plan.puts.map(item=>({id:item.index.id,expected:item.expected})),...plan.removes];
        archiveRequests(targets.flatMap(item=>[index.get(item.id),entries.getKey(item.id)]),values => {
          let bytes = state.bytes-archiveOverhead(state.order.length);
          for(let i=0;i<targets.length;i++){
            const target=targets[i], current=values[i*2], present=values[i*2+1] !== undefined;
            if(target.expected === null ? current !== undefined || present : !current || current.revision !== target.expected){ done(false); return; }
            if(current){ if(!validArchiveIndex(current) || !currentIds.has(target.id)) throw archiveError('StorageDataError'); bytes -= current.bytes; }
            else if(currentIds.has(target.id)) throw archiveError('StorageDataError');
          }
          const order = updatedArchiveOrder(state,plan,snapshot), changed = recovered || targets.length || JSON.stringify(order)!==JSON.stringify(state.order);
          plan.puts.forEach(item=>{ index.put(item.index,item.index.id); entries.put(item.record,item.record.id); bytes+=item.index.bytes; });
          plan.removes.forEach(item=>{ index.delete(item.id); entries.delete(item.id); });
          const next = {...state,order,bytes:bytes+archiveOverhead(order.length),revision:changed ? makeSlotId() : state.revision,
            legacyImported:changed ? false : state.legacyImported};
          if(!validSplitState(next)) throw archiveError('StorageDataError');
          if(changed) old.put(next,ARCHIVE_SPLIT_KEY);
          if(recovered) old.put({version:1,legacyStamp:state.legacyStamp,split:true},ARCHIVE_STATE_KEY);
          done(next);
        },fail);
      };
      if(snapshot.kind === 'missing'){
        if(state !== undefined){ done(false); return; }
        archiveRequests([index.count(),entries.count(),old.get(ARCHIVE_STATE_KEY)],([a,b,prior])=>{
          if(a || b || prior === undefined){ done(false); return; }
          state={schema:2,revision:makeSlotId(),order:[],bytes:4,legacyStamp:prior && prior.legacyStamp}; start(true);
        },fail);
      } else {
        if(!validSplitState(state)) throw archiveError(state === undefined ? 'StorageMissingError' : 'StorageDataError');
        if(strict && state.revision !== snapshot.revision){ done(false); return; }
        start(false);
      }
    },fail);
  });
}

function snapshotAfterSave(list,plan,source,state){
  const written = new Map(plan.puts.map(item=>[item.index.id,item]));
  const items = new Map(list.map(slot=>{
    const entry=written.get(slot.id); return [slot.id,entry ? {index:entry.index,raw:entry.record.raw} : source.items.get(slot.id)];
  }));
  const raw = [...items.values()].every(item=>item && typeof item.raw === 'string')
    ? '['+[...items.values()].map(item=>item.raw).join(',')+']' : undefined;
  attachArchiveSnapshot(list,{kind:'entries',scope:source.scope || 'selection',items,order:[...state.order],revision:state.revision,raw,indexOnly:source.indexOnly});
  lastSlotReadRaw = raw;
}

async function saveSlots(list,sourceList=list){
  slotSaveFailure = '';
  const snapshot = slotReadSnapshots.get(sourceList);
  if(!snapshot){ slotSaveFailure='보관함 목록을 다시 읽은 뒤 저장해 주세요.'; return false; }
  if(!Array.isArray(list) || list.some(slot=>!slot || !MosaicState.validStoredName(slot.name,100))){
    slotSaveFailure='보관함 이름은 제어 문자 없이 1~100자로 입력해 주세요.'; return false;
  }
  try {
    const plan = archiveChangePlan(list,snapshot), state = await commitArchivePlan(plan,snapshot);
    if(!state){ slotSaveFailure='다른 작업이나 탭에서 보관함이 변경되어 저장하지 않았습니다. 보관함을 다시 열어 확인해 주세요.'; return false; }
    snapshotAfterSave(list,plan,snapshot,state);
    archiveReady = Promise.resolve();
    return true;
  } catch(error){
    slotSaveFailure = error.name === 'StorageConflictError' ? '다른 작업이나 탭에서 보관함 순서가 변경되어 저장하지 않았습니다. 목록을 다시 확인해 주세요.' : archiveFailureMessage(error);
    return false;
  }
}

async function restoreStoredValue(key,previousValue,expectedCurrentValue){
  try {
    if(key === SLOT_KEY){
      if(previousValue && typeof previousValue === 'object' && archiveTokens.has(previousValue)
        && expectedCurrentValue && archiveTokens.has(expectedCurrentValue)){
        const list = [...previousValue.items.values()].filter(Boolean).map(item=>JSON.parse(item.raw));
        slotReadSnapshots.set(list,expectedCurrentValue);
        return saveSlots(list);
      }
      if(expectedCurrentValue === undefined || (previousValue !== null && typeof previousValue !== 'string')) return false;
      const current = await readSlots();
      if(current.slots === null || current.raw !== expectedCurrentValue) return false;
      const checked = inspectArchive(previousValue);
      if(checked.issue) return false;
      // 전체 문자열 되돌리기는 이후의 관련 없는 변경도 덮지 않도록 전체 버전을 확인한다.
      const snapshot = slotReadSnapshots.get(current.slots);
      const plan = archiveChangePlan(checked.slots,snapshot);
      if(!await commitArchivePlan(plan,snapshot,true)) return false;
      lastSlotReadRaw = previousValue === null ? '[]' : previousValue;
      return true;
    }
    if(expectedCurrentValue !== undefined && localStorage.getItem(key) !== expectedCurrentValue) return false;
    if(previousValue === null) localStorage.removeItem(key); else localStorage.setItem(key,previousValue);
    return true;
  } catch(error){ return false; }
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

// 구버전 예시 식별용 공개 함수. 사용자 초안의 자동 삭제 판정으로 사용하지 않는다.
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
  if(list.some(preset => !preset || !MosaicState.validStoredName(preset.name, 80))){
    presetSaveFailure = '프리셋 이름은 제어 문자 없이 1~80자로 입력해 주세요.';
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

function inspectJSONImport(value, kind){
  if(!['archive','preset'].includes(kind)) return {issue:'list'};
  const archive = kind === 'archive', limit = archive ? MAX_IMPORTED_SLOTS : MAX_IMPORTED_PRESETS;
  if(!Array.isArray(value) || value.length>limit) return {issue:'list'};
  const items = value.map(item => archive
    ? MosaicState.inspectSlotRecord(item,Date.now()).value : MosaicState.sanitizeImportedPreset(item));
  if(!items.length || items.some(item=>!item)) return {issue:'item'};
  const ids = archive ? items.map(item=>item.id).filter(Boolean) : [];
  if(new Set(ids).size !== ids.length) return {issue:'duplicateId'};
  const names = archive ? items.filter(item=>!item.id).map(item=>item.name) : items.map(item=>item.name.toLowerCase());
  if(new Set(names).size !== names.length) return {issue:'duplicateName'};
  return {items};
}

async function readJSONImportFile(file, kind){
  if(file.size > (kind === 'archive' ? MAX_ARCHIVE_BYTES : MAX_PRESET_BYTES)) return {issue:'size'};
  let text;
  try { text = await readBlobText(file); } catch(error){ return {issue:'read'}; }
  let value;
  try { value = JSON.parse(text); } catch(error){ return {issue:'json'}; }
  return inspectJSONImport(value,kind);
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
MAX_RESTORE_BYTES,
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
partitionJSONBackup,
readRestoreStateFile,
readDraftRaw,
readSlotsRaw,
readSlots,
readSlotIndex,
readSlot,
readSlotsForIds,
slotReadToken,
removeDraftRaw,
restoreStoredValue,
sanitizeDetailPresetList,
savePresets,
saveSlots,
slotExportPayload,
slotReadSnapshot,
validSlotId,
writeDraftRaw,
inspectJSONImport,
readJSONImportFile,
readSlotsBackup,
get lastPresetReadRaw(){ return lastPresetReadRaw; },
get lastSlotReadRaw(){ return lastSlotReadRaw; },
get presetSaveFailure(){ return presetSaveFailure; },
get protectedPresetFailure(){ return protectedPresetFailure; },
get slotReadIssue(){ return slotReadIssue; },
get slotSaveFailure(){ return slotSaveFailure; }
});
})();
