// 조각로그 v1.9.0 · 초기화·작업 명령·히스토리·저장 시점 조율
// 개조 길잡이: saveDraft는 초안 저장 · captureActionState는 작업 기록 · changes는 변경 뒤 처리.
// 작업 전체 교체는 replaceWork, 초기화는 initializeApplication. 상세 안내 MODDING.md.
globalThis.MosaicApp = (() => {
'use strict';


let draftSaveTimer = null;

let draftDirty = false;

let draftBaseUpdatedAt = 0;

let draftReadRaw;

function storedDraftUpdatedAt(){
  try { return MosaicStorage.draftUpdatedAtFromRaw(MosaicStorage.readDraftRaw()); }
  catch(e){ return 0; }
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
  MosaicUI.setDraftStatus('저장 중…', 'saving');
  draftSaveTimer = setTimeout(() => saveDraft(false), 140);
}

function saveDraft(force = true){
  clearTimeout(draftSaveTimer);
  draftSaveTimer = null;
  if(!force && !draftDirty) return true;
  try {
    const currentRaw = MosaicStorage.readDraftRaw();
    const conflictReason = MosaicStorage.draftSaveConflictReason(currentRaw, draftReadRaw, draftBaseUpdatedAt);
    if(conflictReason === 'unread' || conflictReason === 'changed'){
      draftDirty = true;
      MosaicUI.setDraftStatus(conflictReason === 'unread' ? '초안 원본 확인 필요' : '다른 탭에 최신 작업 있음', 'paused');
      return false;
    }
    if(conflictReason === 'newer'){
      draftDirty = true;
      MosaicUI.setDraftStatus('다른 탭에 최신 작업 있음', 'paused');
      return false;
    }
    const snapshot = MosaicUI.captureDraftUiState();
    // 기존 초안의 평평한 필드와 속성 순서를 유지한다. UI는 원본 수집만 맡는다.
    const d = {...snapshot.fields, cards:snapshot.cards, ...snapshot.booleans, style:snapshot.style};
    d.updatedAt = Math.max(Date.now(), draftBaseUpdatedAt + 1);
    const serialized = JSON.stringify(d);
    MosaicStorage.writeDraftRaw(serialized, currentRaw);
    draftReadRaw = serialized;
    draftBaseUpdatedAt = d.updatedAt;
    draftDirty = false;
    const savedAt = MosaicUI.savedTimeLabel();
    MosaicUI.setDraftStatus('저장됨', 'saved', `마지막 저장 ${savedAt}`);
    return true;
  } catch(e){
    draftDirty = true;
    MosaicUI.setDraftStatus('저장 실패', 'error');
    return false;
  }
}

function restoreDraft(){
  draftReadRaw = undefined;
  try {
    const raw = MosaicStorage.readDraftRaw();
    if(raw === null){ draftReadRaw = null; return 'empty'; }
    const d = JSON.parse(raw);
    if(MosaicStorage.isRetiredDefaultDraft(d)){
      MosaicStorage.removeDraftRaw();
      draftReadRaw = null;
      return 'empty';
    }
    const plan = MosaicStorage.prepareDraftRestore(d);
    if(!plan) throw new Error('invalid draft');
    const before = {...MosaicUI.captureDraftUiState(), updatedAt:draftBaseUpdatedAt, dirty:draftDirty};
    try { MosaicUI.applyDraftRestorePlan(plan); draftBaseUpdatedAt = plan.updatedAt; draftDirty = Boolean(plan.dirty); }
    catch(e){
      try { MosaicUI.applyDraftRestorePlan(before); draftBaseUpdatedAt = before.updatedAt; draftDirty = before.dirty; }
      catch(rollbackError){ MosaicUI.cards.clear(); }
      throw e;
    }
    draftReadRaw = raw;
    return 'restored';
  } catch(e){
    MosaicUI.setDraftStatus('초안 복원 실패', 'error', '저장된 초안을 보존하고 기본 화면을 표시함');
    return 'error';
  }
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
  cancelStyleHistoryCommit();
  undoSnapshot = captureActionState('작업 전');
}

function styleStateEqual(a, b){
  if(!a || !b) return false;
  return MosaicState.STYLE_FIELDS.every(id => String(a[id]) === String(b[id]));
}

function cloneHistoryValue(value){
  return JSON.parse(JSON.stringify(value));
}

function captureActionState(label){
  const {style, ...work} = MosaicUI.work.collectSlot();
  return {
    label: label || '작업',
    work: cloneHistoryValue(work),
    style: cloneHistoryValue(style),
    editorIds: MosaicUI.captureEditorIdentities()
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
    actionHistory[actionIndex].editorIds = snap.editorIds;
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
  u.title = undoLabel ? `${undoLabel} 되돌리기 (${MosaicUI.MOD_KEY}+Alt+Z)` : `되돌릴 작업 없음 (${MosaicUI.MOD_KEY}+Alt+Z)`;
  r.title = redoLabel ? `${redoLabel} 되살리기 (${MosaicUI.MOD_KEY}+Alt+Shift+Z)` : `되살릴 작업 없음 (${MosaicUI.MOD_KEY}+Alt+Shift+Z)`;
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
  cancelStyleHistoryCommit();
  const doCommit = () => {
    styleCommitTimer = null;
    const after = captureActionState('디자인 변경');
    if(actionIndex < 0){ pushActionState(after, '초기 상태'); return; }
    const current = actionHistory[actionIndex];
    if(styleStateEqual(after.style, current.style)) return;
    // 본문은 지금 상태, 디자인은 변경 전 상태인 기준점을 먼저 둔다.
    const before = {
      label: '디자인 변경 전',
      work: cloneHistoryValue(after.work),
      style: cloneHistoryValue(current.style),
      editorIds: after.editorIds
    };
    pushActionState(before, '디자인 변경 전');
    pushActionState(after, '디자인 변경');
  };
  if(immediate){ doCommit(); }
  else { styleCommitTimer = setTimeout(doCommit, 350); }
}

function goActionHistory(delta){
  // 슬라이더의 묶음 기록이 아직 대기 중이면 먼저 확정한다. 빠르게 되돌려도
  // 디자인보다 앞선 카드 작업을 건너뛰어 취소하지 않게 한다.
  if(styleCommitTimer !== null) commitStyleHistory(true);
  const target = actionIndex + delta;
  if(target < 0 || target >= actionHistory.length) return;
  actionIndex = target;
  const state = actionHistory[actionIndex];
  undoSnapshot = null;
  imageHistorySession = null;
  MosaicUI.feedback.dismiss();
  replaceWork({
    ...cloneHistoryValue(state.work),
    style: cloneHistoryValue(state.style),
    editorIds: state.editorIds
  }, {resetTheme:true});
  updateHistoryButtons();
}

// 되돌린 상태에서 새 편집이 시작되면 기존 redo 분기는 더 이상 안전하지 않다.
// 검색어·프리셋 이름 같은 임시 UI 입력은 제외하고 실제 작업값만 감시한다.
const HISTORY_WORK_IDS = new Set([
  ...MosaicState.WORK_FIELDS, ...MosaicState.STYLE_FIELDS, ...MosaicState.WORK_BOOLEAN_FIELDS
]);

function isHistoryAffectingInput(el){
  if(!el || el.nodeType !== 1) return false;
  if(el.id === 'fsTextarea') return true;
  if(el.matches('.cardFoldChk, .foldTitleInput')) return true;
  if(el.matches('#cardEditors textarea')) return true;
  return !!el.id && HISTORY_WORK_IDS.has(el.id);
}

// 대표 이미지와 BOT·USER 프로필 이미지는 URL뿐 아니라 크기·위치까지 하나의 편집
// 단계로 기록한다. range 드래그나 URL 타이핑 중간값을 매번 쌓지 않고, 포커스를
// 얻은 시점의 상태와 현재 상태 두 항목만 유지해 되돌리기 버튼을 즉시 활성화한다.
const IMAGE_HISTORY_IDS = new Set([
  'imgOn', 'imgUrl', 'imgHeight', 'xpos', 'ypos', 'titleImageBackgroundOn',
  'profileImageBackgroundOn', 'profileCharImage', 'profileCharScale', 'profileCharX', 'profileCharY',
  'profileUserImage', 'profileUserScale', 'profileUserX', 'profileUserY',
  ...MosaicState.EXTRA_PROFILE_SLOTS.flatMap(slot => ['Image','Scale','X','Y'].map(field => `profileExtra${slot}${field}`))
]);

let imageHistorySession = null;

function imageHistoryLabel(id){
  if(id === 'profileImageBackgroundOn') return '프로필 사진 배경 변경';
  if(id.startsWith('profileChar')) return 'BOT 프로필 이미지 변경';
  if(id.startsWith('profileUser')) return 'USER 프로필 이미지 변경';
  if(id.startsWith('profileExtra')) return '추가 인물 프로필 이미지 변경';
  return '대표 이미지 변경';
}// 조각로그 v1.9.0 애플리케이션 조율·초기화 모듈.

// ---------- 본문 입력창 서식 단축키 ----------
// 카드 입력창·전체 화면 입력창에 커서가 있을 때만 동작
// Ctrl/⌘+B 굵게 · Ctrl/⌘+I 강조 · Ctrl/⌘+E 가운데 정렬
const FMT_SHORTCUT = { b: 'bold', i: 'emphasis', e: 'center' };

// ---------- 접기 그룹 상태 기억 ----------
const FOLD_KEY = 'logGenFoldGroup_v1';

// 글자와 세부 조정의 소그룹은 서로 독립적으로 열고 닫으며 상태를 기억한다.
const TYPOGRAPHY_SUBSECTION_KEY = 'logGenTypographySubsection_v1';

// ---------- 작업 화면 색상 ----------
const UI_MODE_KEY = 'mosaicUiMode_v1';

const UI_PALETTE_KEY = 'mosaicUiPalette_v1';

const uiNightModeBtn = document.getElementById('uiNightModeBtn');

const uiPaletteBtn = document.getElementById('uiPaletteBtn');

const uiPaletteMenu = document.getElementById('uiPaletteMenu');

const uiAppearanceControls = document.querySelector('.uiAppearanceControls');

const UI_PALETTE_NAMES = { default:'기본', gray:'회색', blue:'파랑', pink:'분홍', yellow:'노랑' };

let uiModeSwitchFrame = null;

let uiModeSwitchCleanupFrame = null;

function beginUiModeSwitch(){
  cancelAnimationFrame(uiModeSwitchFrame);
  cancelAnimationFrame(uiModeSwitchCleanupFrame);
  document.documentElement.classList.add('uiModeSwitching');
}

function finishUiModeSwitch(){
  uiModeSwitchFrame = requestAnimationFrame(() => {
    uiModeSwitchCleanupFrame = requestAnimationFrame(() => document.documentElement.classList.remove('uiModeSwitching'));
  });
}

function setUiNightMode(on, save){
  const root = document.documentElement;
  if(save) beginUiModeSwitch();
  root.classList.toggle('uiNight', !!on);
  uiNightModeBtn.setAttribute('aria-pressed', String(!!on));
  const action = on ? '나이트 모드 끄기' : '나이트 모드 켜기';
  uiNightModeBtn.setAttribute('aria-label', action);
  uiNightModeBtn.title = action;
  if(save){
    try { localStorage.setItem(UI_MODE_KEY, on ? 'night' : 'default'); }
    catch(e){ /* 저장소를 쓸 수 없어도 현재 화면 모드는 유지한다. */ }
    finishUiModeSwitch();
  }
}

function setUiPalette(palette, save){
  const selected = Object.hasOwn(UI_PALETTE_NAMES, palette) ? palette : 'default';
  const root = document.documentElement;
  if(save) beginUiModeSwitch();
  if(selected === 'default') delete root.dataset.uiPalette;
  else root.dataset.uiPalette = selected;
  uiPaletteMenu.querySelectorAll('[data-ui-palette]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.uiPalette === selected));
  });
  const label = `색상 팔레트: ${UI_PALETTE_NAMES[selected]}`;
  uiPaletteBtn.setAttribute('aria-label', label);
  uiPaletteBtn.title = label;
  if(save){
    try { localStorage.setItem(UI_PALETTE_KEY, selected); }
    catch(e){ /* 저장소를 쓸 수 없어도 현재 팔레트는 유지한다. */ }
    finishUiModeSwitch();
  }
}

function setUiPaletteMenuOpen(open){
  uiPaletteMenu.hidden = !open;
  uiPaletteBtn.setAttribute('aria-expanded', String(open));
}

// ---------- 사이드바 폭 조절 ----------
// 드래그해서 왼쪽 작업 영역 폭을 바꾸고, 그 값을 브라우저에 기억한다.
const LAYOUT_MIRROR_KEY = 'mosaicLayoutMirrored_v1';

const layoutMirrorBtn = document.getElementById('layoutMirrorBtn');

function isDesktopLayoutMirrored(){
  return document.body.classList.contains('layoutMirrored')
    && window.matchMedia('(min-width: 681px)').matches;
}

function syncLayoutMirrorUi(){
  const mirrored = document.body.classList.contains('layoutMirrored');
  const title = mirrored
    ? '기본 배치로 되돌리기 · 설정 왼쪽, 미리보기 오른쪽'
    : '좌우 반전 · 미리보기 왼쪽, 설정 오른쪽';
  layoutMirrorBtn.classList.toggle('active', mirrored);
  layoutMirrorBtn.setAttribute('aria-pressed', String(mirrored));
  layoutMirrorBtn.setAttribute('aria-label', title);
  layoutMirrorBtn.title = title;
  const handle = document.getElementById('sidebarResizer');
  if(handle){
    const side = mirrored ? '오른쪽' : '왼쪽';
    handle.setAttribute('aria-label', `${side} 설정 영역 너비 조절`);
    handle.title = `드래그해서 ${side} 설정 영역 폭을 조절해 (더블클릭하면 기본값)`;
  }
}

function setLayoutMirrored(on, save){
  document.body.classList.toggle('layoutMirrored', !!on);
  syncLayoutMirrorUi();
  MosaicUI.preview.syncToolbarLabel({immediate:true});
  if(save){
    try { localStorage.setItem(LAYOUT_MIRROR_KEY, on ? 'on' : 'off'); }
    catch(e){ /* 저장소를 쓸 수 없어도 현재 화면 배치는 유지 */ }
  }
  requestAnimationFrame(() => {
    MosaicUI.preview.syncCommentOutset();
    MosaicUI.preview.layoutFloatingButtons();
  });
}

const SIDEBAR_KEY = 'logGenSidebarW_v1';

const SIDEBAR_DEFAULT = 460;

const SIDEBAR_MIN = 340;

const SIDEBAR_MAX = 760;

function setSidebarWidth(px, save){
  const w = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.round(px)));
  document.documentElement.style.setProperty('--sidebar-w', w + 'px');
  const handle = document.getElementById('sidebarResizer');
  if(handle){
    handle.setAttribute('aria-valuemin', String(SIDEBAR_MIN));
    handle.setAttribute('aria-valuemax', String(SIDEBAR_MAX));
    handle.setAttribute('aria-valuenow', String(w));
  }
  if(save){ try { localStorage.setItem(SIDEBAR_KEY, String(w)); } catch(e){} }
}

// ---------- 보관함 오버레이 ----------
function setArchiveDrawerOpen(open){
  const drawer = document.getElementById('archiveDrawer');
  const button = document.getElementById('archiveOpenBtn');
  drawer.hidden = !open;
  drawer.setAttribute('aria-hidden', String(!open));
  button.setAttribute('aria-expanded', String(open));
  if(open){
    MosaicUI.renderSlotList();
    requestAnimationFrame(() => document.getElementById('archiveCloseBtn').focus());
  }else{
    MosaicUI.closeSlotExportMenu();
    button.focus();
  }
}

// ---------- 탭 전환 ----------
// 탭별 스크롤 위치를 기억해서, 오갈 때 보던 자리로 돌아오게 함.
// 사이드바 스크롤을 상시 추적해두면, 버튼 클릭으로 브라우저가 스크롤을 건드려도
// 마지막으로 사용자가 보고 있던 위치가 남는다.
const tabScroll = {};

let activeTabId = document.querySelector('.tabBtn.active')?.dataset.tab || 'tabBody';

let tabSwitching = false;

// ---------- 본문 글자수/문단수/읽기시간 카운터 ----------
function updateCounter(allCards = MosaicUI.cards.all(), settings = MosaicUI.getSettings()){
  const visibleCards = allCards.filter(card => card.visible !== false);
  const bodies = visibleCards.map(card => card.body);
  const bodyCardText = visibleCards
    .filter(card => card.type !== 'comment')
    .map(card => card.body)
    .join('\n');
  const text = bodies.join('\n');
  const paraList = text.split('\n').map(l => l.trim()).filter(l => l !== '');
  const bodyParaList = bodyCardText.split('\n').map(l => l.trim()).filter(l => l !== '');
  const chars = text.replace(/\s/g, '').length;
  const paras = paraList.length;

  // 예상 읽기 시간 (한국어 묵독 대략 분당 500자 기준)
  const mins = chars / 500;
  const readTime = chars === 0 ? '' : (mins < 1 ? ' · 1분 미만' : ` · 약 ${Math.round(mins)}분`);

  // 긴 문단 감지 (공백 제외 300자 초과) — 소제목/구분선 줄은 제외
  const longCount = bodyParaList.filter(l => {
    const structuralLine = l.replace(/^\[C\]\s*/i, '');
    const u = structuralLine.toUpperCase();
    if(['[HR]', '[HR2]', '[HR3]', '[HR4]', '[GAP]'].includes(u)
       || /^#{1,4}\s/.test(structuralLine)
       || /^\[IMG\s/i.test(structuralLine)
       || /^\[\/?접기(?:\s|\])/i.test(structuralLine)
       || MosaicRenderer.statusLineContent(structuralLine) !== null) return false;
    return structuralLine.replace(/\s/g, '').length > 300;
  }).length;
  const longNote = longCount > 0 ? ` · 긴 문단 ${longCount}개` : '';

  // 대사/서술/강조 구성비 (강조 글자는 서술에서 빼 중복 없이 합계 100%로 계산)
  let dlgC = 0, emphasisC = 0, narrC = 0;
  bodyParaList.forEach(l => {
    const structuralLine = l.replace(/^\[C\]\s*/i, '');
    const u = structuralLine.toUpperCase();
    if(['[HR]', '[HR2]', '[HR3]', '[HR4]', '[GAP]'].includes(u) || /^#{1,4}\s/.test(structuralLine) || /^\[IMG\s/i.test(structuralLine)
       || MosaicRenderer.statusLineContent(structuralLine) !== null
       || /^\[접기/.test(structuralLine) || /^\[\/접기\]$/.test(structuralLine)) return;
    let body = MosaicParser.normalizeQuotes(structuralLine);
    const cm = body.match(/^\{(#?[0-9A-Fa-f]{3,8})\}\s*/);
    if(cm) body = body.slice(cm[0].length).trim();
    body = MosaicRenderer.stripSpeaker(body, settings).line;
    if(/^"[^"]*"$/.test(body)){
      dlgC += MosaicParser.stripMarkers(body.slice(1, -1)).replace(/\s/g, '').length;
    }else{
      const plainLength = MosaicParser.stripMarkers(body).replace(/\s/g, '').length;
      let emphasized = 0;
      for(const match of MosaicParser.formatMatches('emphasis', body)){
        emphasized += MosaicParser.stripMarkers(MosaicParser.formatMatchContent('emphasis', match)).replace(/\s/g, '').length;
      }
      emphasisC += emphasized;
      narrC += Math.max(0, plainLength - emphasized);
    }
  });
  const totalC = dlgC + emphasisC + narrC;
  const pct = (v) => Math.round(v / totalC * 100);
  const ratioNote = totalC > 0
    ? ` · 대사 ${pct(dlgC)}% / 서술 ${pct(narrC)}% / 강조 ${pct(emphasisC)}%`
    : '';

  const visibleCardCount = visibleCards.filter(card => card.type !== 'comment').length;
  const visibleCommentCount = visibleCards.filter(card => card.type === 'comment').length;
  const cardNote = visibleCardCount > 1 ? ` · 카드 ${visibleCardCount}장` : '';
  const commentNote = visibleCommentCount ? ` · 코멘트 ${visibleCommentCount}개` : '';
  const hiddenCardCount = allCards.filter(card => card.type !== 'comment' && card.visible === false).length;
  const hiddenCardNote = hiddenCardCount ? ` · 숨김 ${hiddenCardCount}장` : '';
  document.getElementById('bodyCounter').textContent =
    `공백 제외 ${chars.toLocaleString()}자 · ${paras}문단${cardNote}${commentNote}${hiddenCardNote}${readTime}${ratioNote}${longNote}`;
}

// ---------- 미리보기 도구모음 ----------
// 표지의 표시 스위치를 그대로 조작해 저장·복원 경로를 공유한다.
const PREVIEW_VISIBILITY_TOGGLES = [
  ['previewProfileBtn', 'profileOn', '프로필'],
  ['previewCreditBtn', 'creditOn', '크레딧']
];

function syncPreviewVisibilityToggles(){
  PREVIEW_VISIBILITY_TOGGLES.forEach(([buttonId, inputId, label]) => {
    const button = document.getElementById(buttonId);
    const visible = document.getElementById(inputId).checked;
    button.setAttribute('aria-pressed', String(visible));
    button.title = `${label} ${visible ? '숨기기' : '표시'}`;
  });
}

// 카드 표시 방식은 기존 디자인 설정과 연결한다.
function syncPreviewCardStyleToggles(){
  const borderButton = document.getElementById('previewCardBorderBtn');
  const layoutButton = document.getElementById('previewCardLayoutBtn');
  const borderInput = document.getElementById('cardBorderOn');
  const layoutInput = document.getElementById('cardLayoutUnifiedOn');
  if(borderButton && borderInput){
    borderButton.setAttribute('aria-pressed', String(borderInput.checked));
    borderButton.title = borderInput.checked ? '카드 외곽선 숨기기' : '카드 외곽선 표시';
  }
  if(layoutButton && layoutInput){
    layoutButton.setAttribute('aria-pressed', String(layoutInput.checked));
    layoutButton.title = layoutInput.checked ? '카드 이어보기 해제' : '여러 카드를 이어서 표시';
  }
}

function setPreviewArcaTheme(theme){
  const dark = theme === 'dark';
  const previewArea = document.getElementById('previewArea');
  const lightButton = document.getElementById('previewThemeLightBtn');
  const darkButton = document.getElementById('previewThemeDarkBtn');
  previewArea.classList.toggle('previewArcaDark', dark);
  lightButton.classList.toggle('active', !dark);
  darkButton.classList.toggle('active', dark);
  lightButton.setAttribute('aria-pressed', String(!dark));
  darkButton.setAttribute('aria-pressed', String(dark));
}

// ---------- 코드 전체 화면 ----------
let codePrevFocus = null;

function openCodeFullscreen(){
  const area = document.getElementById('codeFsArea');
  area.value = document.getElementById('codeBox').value;
  codePrevFocus = document.activeElement;
  const overlay = document.getElementById('codeOverlay');
  overlay.style.display = 'block';
  overlay.setAttribute('aria-hidden', 'false');
  MosaicUI.workspace.setInert(true);
  document.body.classList.add('fsLock');
  area.focus();
  area.setSelectionRange(0, 0);
}

function closeCodeFullscreen(){
  const overlay = document.getElementById('codeOverlay');
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('fsLock');
  MosaicUI.workspace.setInert(false);
  if(codePrevFocus && typeof codePrevFocus.focus === 'function'){
    try { codePrevFocus.focus({ preventScroll: true }); }
    catch(e){ codePrevFocus.focus(); }
  }
  codePrevFocus = null;
}

// ---------- 대표 이미지와 BOT·USER 사진 상태 확인 ----------
const IMAGE_STATUS_CONFIGS = [
  { inputId:'imgUrl', statusId:'imageLoadStatus', enabledIds:['imgOn'], showDimensions:true },
  { inputId:'profileCharImage', statusId:'profileCharImageStatus', enabledIds:['profileOn','profileCharOn'] },
  { inputId:'profileUserImage', statusId:'profileUserImageStatus', enabledIds:['profileOn','profileUserOn'] },
  ...MosaicState.EXTRA_PROFILE_SLOTS.map(slot => ({ inputId:`profileExtra${slot}Image`, statusId:`profileExtra${slot}ImageStatus`, enabledIds:['profileOn',`profileExtra${slot}On`], slot })),
];

const imageStatusTimers = new Map();

const imageStatusTokens = new Map();

let deferredImageStatusEditor = null;

function probeImage(url, timeoutMs = 6000){
  return new Promise(resolve => {
    const img = new Image();
    let settled = false;
    const finish = result => {
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok:false, reason:'시간 초과' }), timeoutMs);
    img.onload = () => finish({ ok:true, width:img.naturalWidth, height:img.naturalHeight });
    img.onerror = () => finish({ ok:false, reason:'불러오기 실패' });
    img.src = url;
  });
}

// 이미지 판정이 편집 중인 미리보기를 곧바로 교체하면 contenteditable의 blur 저장이
// 건너뛰거나 선택이 끊길 수 있다. 편집이 끝난 뒤 한 번만 갱신하고, 그사이 다른 입력이
// 이미 렌더했다면 중복 렌더를 생략한다.
function refreshAfterImageStatusChange(){
  const active = document.activeElement;
  const editor = active && active.closest
    ? active.closest('#preview [data-preview-direct-edit="true"]')
    : null;
  if(!editor){
    deferredImageStatusEditor = null;
    MosaicUI.preview.scheduleRefresh(() => {
      // 예약 뒤 새로 직접 편집을 시작했으면 실제 교체 직전에 다시 미룬다.
      if(!document.activeElement?.closest?.('#preview [data-preview-direct-edit="true"]')) return true;
      refreshAfterImageStatusChange();
      return false;
    });
    return;
  }
  if(deferredImageStatusEditor === editor) return;
  deferredImageStatusEditor = editor;
  const revision = MosaicUI.preview.revision();
  editor.addEventListener('blur', () => {
    if(deferredImageStatusEditor === editor) deferredImageStatusEditor = null;
    requestAnimationFrame(() => {
      if(MosaicUI.preview.revision() !== revision) return;
      refreshAfterImageStatusChange();
    });
  }, { once:true });
}

async function updateSingleImageLoadStatus(config){
  const status = document.getElementById(config.statusId);
  if(!status) return;
  const isProfileStatus = status.classList.contains('profileImageDot');
  const token = (imageStatusTokens.get(config.statusId) || 0) + 1;
  imageStatusTokens.set(config.statusId, token);
  const enabled = (!config.slot || config.slot <= MosaicUI.extraProfileCount() + 2)
    && config.enabledIds.every(id => document.getElementById(id).checked);
  const raw = document.getElementById(config.inputId).value.trim();
  if(!enabled){
    status.dataset.state = 'idle';
    status.textContent = '';
    status.hidden = true;
    status.title = '';
    MosaicUI.controls.syncImageBackgroundAvailability();
    return;
  }
  if(!raw){
    status.dataset.state = 'idle';
    status.textContent = '';
    status.hidden = true;
    status.title = '';
    MosaicUI.controls.syncImageBackgroundAvailability();
    return;
  }
  let url;
  try {
    url = new URL(raw.startsWith('//') ? `https:${raw}` : raw, location.href).href;
  } catch(e){
    status.hidden = false;
    status.dataset.state = 'error';
    status.textContent = isProfileStatus ? '!' : '주소 형식 확인 필요';
    status.title = '주소 형식 확인 필요';
    MosaicUI.controls.syncImageBackgroundAvailability();
    refreshAfterImageStatusChange();
    return;
  }
  status.hidden = isProfileStatus;
  status.dataset.state = 'idle';
  status.textContent = isProfileStatus ? '' : '이미지 확인 중…';
  status.title = isProfileStatus ? '' : status.textContent;
  const result = await probeImage(url);
  if(token !== imageStatusTokens.get(config.statusId)) return;
  if(result.ok){
    if(config.inputId.startsWith('profile')){
      const imageKey = MosaicState.normalizeProtocolRelativeUrl(raw);
      MosaicRenderer.rememberProfileImageSize(imageKey, { width:result.width, height:result.height });
      MosaicRenderer.rememberProfileImageSize(url, { width:result.width, height:result.height });
      // 방향을 확인한 뒤 확대 배율을 cover 기준으로 다시 계산해 출력 HTML에도 고정한다.
      // 아래 공통 갱신에서 성공·실패 상태와 함께 한 번만 다시 그린다.
    }
    status.dataset.state = 'ok';
    const successText = config.showDimensions
      ? `정상 · ${result.width.toLocaleString()}×${result.height.toLocaleString()}`
      : '정상';
    status.hidden = isProfileStatus;
    status.textContent = isProfileStatus ? '' : successText;
    status.title = isProfileStatus ? '' : successText;
  }else{
    status.dataset.state = 'error';
    const errorText = result.reason || '불러오기 실패';
    status.hidden = false;
    status.textContent = isProfileStatus ? '!' : errorText;
    status.title = errorText;
  }
  MosaicUI.controls.syncImageBackgroundAvailability();
  // 대표·프로필 이미지는 URL을 보존하되 검사에 실패하면 출력에서 제외한다.
  // 성공으로 돌아오면 같은 URL을 다시 살려 옛 동작 계약을 유지한다.
  refreshAfterImageStatusChange();
}

function scheduleImageStatusCheck(config){
  clearTimeout(imageStatusTimers.get(config.statusId));
  imageStatusTimers.set(config.statusId, setTimeout(() => updateSingleImageLoadStatus(config), 350));
}

function updateAllImageLoadStatuses(){
  IMAGE_STATUS_CONFIGS.forEach(updateSingleImageLoadStatus);
}

// ---------- 문서 탐색기 ----------
const docNavBtn = document.getElementById('docNavBtn');

const docNavPanel = document.getElementById('docNavPanel');

function lineStartOffset(text, lineIndex){
  if(lineIndex <= 0) return 0;
  const lines = text.split('\n');
  let offset = 0;
  for(let i = 0; i < Math.min(lineIndex, lines.length); i++) offset += lines[i].length + 1;
  return Math.min(offset, text.length);
}

function jumpToDocumentLine(cardIndex, lineIndex){
  document.getElementById('tabBtnBody').click();
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  const editor = editors[cardIndex];
  if(!editor) return;
  const ta = editor.querySelector('textarea');
  if(getComputedStyle(ta).display === 'none'){
    const collapse = editor.querySelector('.collapseCtl');
    if(collapse) collapse.click();
  }
  const start = lineStartOffset(ta.value, lineIndex);
  const line = ta.value.split('\n')[lineIndex] || '';
  try { ta.focus({ preventScroll:true }); }
  catch(e){ ta.focus(); }
  ta.setSelectionRange(start, Math.min(start + line.length, ta.value.length));
  MosaicUI.cards.setActiveTextarea(ta);
  MosaicUI.preview.revealOffsetAtTop(ta, start, editor);
  if(MosaicUI.preview.positionSyncEnabled()) requestAnimationFrame(() => MosaicUI.preview.focusCaret(ta));
}

function navigatorItemsForCard(card, index){
  const items = [];
  const lines = card.body.split('\n');
  lines.forEach((raw, lineIndex) => {
    const line = raw.trim();
    if(!line) return;
    const structuralLine = line.replace(/^\[C\]\s*/i, '');
    const heading = MosaicRenderer.parseBodyHeading(structuralLine);
    if(heading){
      items.push({ lineIndex, label:`${'·'.repeat(heading.level)} ${MosaicParser.stripMarkers(heading.title).trim()}` });
      return;
    }
    if(structuralLine.toUpperCase() === '[HR]') items.push({ lineIndex, label:'— 구분선' });
    else if(structuralLine.toUpperCase() === '[HR2]') items.push({ lineIndex, label:'✦ 장면 전환' });
    else if(structuralLine.toUpperCase() === '[HR3]') items.push({ lineIndex, label:'··· 호흡' });
    else if(['[HR4]', '[GAP]'].includes(structuralLine.toUpperCase())) items.push({ lineIndex, label:'↕ 여백' });
    else if(MosaicRenderer.statusLineContent(structuralLine) !== null) items.push({ lineIndex, label:'◌ 상태창' });
    else if(MosaicRenderer.parseOutputBodyImage(raw)) items.push({ lineIndex, label:'▧ 본문 이미지' });
    else if(/^\[접기/i.test(structuralLine)){
      const foldTitle = structuralLine.replace(/^\[접기\s*|\]$/g, '').trim();
      const heading = MosaicRenderer.parseBodyHeading(foldTitle);
      items.push({ lineIndex, label:`＋ ${heading ? MosaicParser.stripMarkers(heading.title).trim() : (foldTitle || '접기')}` });
    }
  });
  if(!items.length){
    const firstLine = lines.findIndex(line => line.trim());
    if(firstLine >= 0){
      const summary = MosaicParser.stripMarkers(lines[firstLine])
        .replace(/^\s*\[C\]\s*/i, '')
        .replace(/^>{1,2}\s*/, '')
        .trim();
      items.push({ lineIndex:firstLine, label:summary.slice(0, 48) || `카드 ${index + 1}` });
    }
  }
  return items;
}

function buildDocumentNavigator(){
  if(docNavPanel.hidden) return;
  const cards = MosaicUI.cards.all();
  docNavPanel.innerHTML = '';
  let visibleCardNumber = 0;
  let commentNumber = 0;
  cards.forEach((card, cardIndex) => {
    const isComment = card.type === 'comment';
    const displayNumber = isComment ? ++commentNumber : ++visibleCardNumber;
    const group = document.createElement('div');
    group.className = 'docNavGroup';
    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'docNavCardTitle uiButton';
    const firstHeading = card.body
      .split('\n')
      .map(line => MosaicRenderer.parseBodyHeading(line.trim().replace(/^\[C\]\s*/i, '')))
      .find(Boolean);
    const cardNavigatorTitle = String(card.foldTitle || '').trim();
    const navigatorTitle = cardNavigatorTitle
      ? cardNavigatorTitle
      : (firstHeading ? MosaicParser.stripMarkers(firstHeading.title).trim() : '');
    const cardKindBase = isComment ? `코멘트 ${displayNumber}` : (card.folded ? '접기' : `카드 ${displayNumber}`);
    const cardKind = card.visible === false ? `${cardKindBase} · 숨김` : cardKindBase;
    title.textContent = navigatorTitle ? `${cardKind} · ${navigatorTitle}` : cardKind;
    title.title = title.textContent;
    const firstLineIndex = card.body.split('\n').findIndex(line => line.trim());
    title.addEventListener('click', () => jumpToDocumentLine(cardIndex, Math.max(0, firstLineIndex)));
    group.appendChild(title);
    const list = document.createElement('div');
    list.className = 'docNavItems';
    const items = isComment ? [] : navigatorItemsForCard(card, displayNumber - 1);
    if(!items.length){
      const empty = document.createElement('span');
      empty.className = 'docNavEmpty';
      empty.textContent = isComment ? (card.body.trim().slice(0, 48) || '빈 코멘트') : '빈 카드';
      list.appendChild(empty);
    }else{
      items.forEach(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'docNavItem uiButton';
        button.textContent = item.label;
        button.title = item.label;
        button.addEventListener('click', () => jumpToDocumentLine(cardIndex, item.lineIndex));
        list.appendChild(button);
      });
    }
    group.appendChild(list);
    docNavPanel.appendChild(group);
  });
}

// ---------- 집중 작성 모드 ----------
const focusModeBtn = document.getElementById('focusModeBtn');

function setFocusMode(enabled){
  if(enabled) document.getElementById('tabBtnBody').click();
  document.body.classList.toggle('labFocus', enabled);
  focusModeBtn.setAttribute('aria-pressed', String(enabled));
  focusModeBtn.textContent = enabled ? '집중 종료' : '집중 모드';
  focusModeBtn.title = enabled ? '일반 화면으로 돌아가기 (Esc)' : '본문 입력과 미리보기만 보기';
  requestAnimationFrame(() => {
    const activeTextarea = MosaicUI.cards.activeTextarea();
    if(activeTextarea) activeTextarea.scrollIntoView({ block:'nearest' });
  });
}

// ---------- 출력 전 점검 ----------
const preflightBtn = document.getElementById('preflightBtn');

const preflightPanel = document.getElementById('preflightPanel');

let preflightRunToken = 0;

function focusPreflightTarget(issue){
  if(issue.cardIndex !== undefined){
    jumpToDocumentLine(issue.cardIndex, issue.lineIndex || 0);
    return;
  }
  if(issue.targetId){
    document.getElementById('tabBtnCover').click();
    const target = document.getElementById(issue.targetId);
    if(target){
      const folds = [];
      let fold = target.closest('details');
      while(fold){ folds.push(fold); fold = fold.parentElement && fold.parentElement.closest('details'); }
      folds.reverse().forEach(details => { details.open = true; });
      target.focus();
      target.scrollIntoView({ behavior:'smooth', block:'center' });
    }
  }
}

function renderPreflightIssues(issues, checking){
  const summary = document.getElementById('preflightSummary');
  const list = document.getElementById('preflightList');
  list.innerHTML = '';
  if(checking){
    summary.textContent = '출력물을 점검하는 중…';
    return;
  }
  if(!issues.length){
    summary.textContent = '문제 없음 · 바로 출력해도 좋습니다.';
    return;
  }
  const errors = issues.filter(issue => issue.severity === 'error').length;
  summary.textContent = `확인할 항목 ${issues.length}개${errors ? ` · 오류 ${errors}개` : ''}`;
  issues.forEach(issue => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preflightIssue uiButton';
    button.dataset.severity = issue.severity;
    button.textContent = `${issue.severity === 'error' ? '오류' : '확인'} · ${issue.message}`;
    button.addEventListener('click', () => focusPreflightTarget(issue));
    list.appendChild(button);
  });
}

function basicPreflightIssues(){
  const issues = [];
  const cards = MosaicUI.cards.all();
  let cardNumber = 0;
  let commentNumber = 0;
  cards.forEach((card, cardIndex) => {
    if(card.visible === false) return;
    const isComment = card.type === 'comment';
    const blockLabel = isComment ? `코멘트 ${++commentNumber}` : `카드 ${++cardNumber}`;
    if(!card.body.trim()){
      if(!isComment) issues.push({ severity:'warn', message:`${blockLabel}이 비어 있습니다.`, cardIndex, lineIndex:0 });
      return;
    }
    // 코멘트는 이번 버전에서 문법을 해석하지 않는 순수 텍스트이므로
    // 본문용 굵게·강조·접기·이미지 문법 점검 대상에서 제외한다.
    if(isComment) return;
    const underscoreStrongMarkers = (card.body.match(/__/g) || []).length;
    const asteriskStrongMarkers = (card.body.match(/\*\*/g) || []).length;
    if(underscoreStrongMarkers % 2 || asteriskStrongMarkers % 2){
      issues.push({ severity:'error', message:`${blockLabel}의 굵게 문법이 닫히지 않았습니다.`, cardIndex, lineIndex:0 });
    }
    const withoutStrong = card.body.replace(/__/g, '');
    let emphasisMarkers = 0;
    for(let i = 0; i < withoutStrong.length; i++){
      if(withoutStrong[i] === '*' && withoutStrong[i - 1] !== '\\') emphasisMarkers++;
    }
    if(emphasisMarkers % 2){
      issues.push({ severity:'error', message:`${blockLabel}의 강조(*) 문법이 닫히지 않았습니다.`, cardIndex, lineIndex:0 });
    }
    const openFolds = (card.body.match(/^(?:\[C\]\s*)?\[접기(?:[^\]]*)\]\s*$/gmi) || []).length;
    const closeFolds = (card.body.match(/^\[\/접기\]\s*$/gmi) || []).length;
    if(openFolds !== closeFolds){
      issues.push({ severity:'warn', message:`${blockLabel}의 일부 접기 시작·끝 개수가 다릅니다.`, cardIndex, lineIndex:0 });
    }
    card.body.split('\n').forEach((raw, lineIndex) => {
      const line = raw.trim().replace(/^\[C\]\s*/i, '');
      if(/^\[IMG\b/i.test(line) && !MosaicRenderer.parseOutputBodyImage(raw)){
        issues.push({ severity:'error', message:`${blockLabel}의 이미지 문법을 확인해 주세요.`, cardIndex, lineIndex });
      }
    });
  });
  if(document.getElementById('imgOn').checked && !document.getElementById('imgUrl').value.trim()){
    issues.push({ severity:'error', message:'대표 이미지 표시가 켜져 있지만 주소가 비어 있습니다.', targetId:'imgUrl' });
  }
  if(document.getElementById('creditOn').checked){
    MosaicUI.storedCreditItems().forEach((item, index) => {
      const rawUrl = item.url.trim();
      if(rawUrl && !MosaicParser.normalizeHttpLinkUrl(rawUrl)){
        issues.push({
          severity:'error',
          message:`크레딧 ${index + 1}의 링크 주소는 http:// 또는 https:// 형식이어야 합니다.`,
          targetId:`creditUrl${index}`
        });
      }
    });
  }
  if(document.getElementById('charSpeakerOn').checked && !document.getElementById('charName').value.trim()){
    issues.push({ severity:'warn', message:'빈 {{char}} 이름은 {{char}} 변수로 출력됩니다.', targetId:'charName' });
  }
  if(document.getElementById('userSpeakerOn').checked && !document.getElementById('userName').value.trim()){
    issues.push({ severity:'warn', message:'빈 {{user}} 이름은 {{user}} 변수로 출력됩니다.', targetId:'userName' });
  }
  MosaicUI.preview.render();
  const bytes = new Blob([document.getElementById('codeBox').value]).size;
  if(bytes > 1024 * 1024){
    issues.push({ severity:'warn', message:`출력 HTML이 ${(bytes / 1024 / 1024).toFixed(1)}MB로 큽니다.` });
  }
  return issues;
}

async function runPreflight(){
  const token = ++preflightRunToken;
  preflightPanel.hidden = false;
  preflightBtn.setAttribute('aria-expanded', 'true');
  renderPreflightIssues([], true);
  const issues = basicPreflightIssues();
  const imgOn = document.getElementById('imgOn').checked;
  const imgUrl = document.getElementById('imgUrl').value.trim();
  if(imgOn && imgUrl){
    let normalized = imgUrl;
    try { normalized = new URL(imgUrl.startsWith('//') ? `https:${imgUrl}` : imgUrl, location.href).href; }
    catch(e){ normalized = ''; }
    if(!normalized){
      issues.push({ severity:'error', message:'대표 이미지 주소 형식이 올바르지 않습니다.', targetId:'imgUrl' });
    }else{
      const result = await probeImage(normalized);
      if(token !== preflightRunToken) return;
      if(!result.ok){
        issues.push({ severity:'error', message:'대표 이미지를 불러오지 못했습니다.', targetId:'imgUrl' });
      }else if(result.width > 5000 || result.height > 5000){
        issues.push({ severity:'warn', message:`대표 이미지 원본이 ${result.width}×${result.height}로 매우 큽니다.`, targetId:'imgUrl' });
      }
    }
  }
  const bodyImages = [];
  let visibleBodyCardNumber = 0;
  MosaicUI.cards.all().forEach((card, cardIndex) => {
    if(card.type === 'comment' || card.visible === false) return;
    const cardNumber = ++visibleBodyCardNumber;
    card.body.split('\n').forEach((raw, lineIndex) => {
      const match = MosaicRenderer.parseOutputBodyImage(raw);
      if(!match) return;
      let url = match.src;
      if(url.startsWith('//')) url = `https:${url}`;
      try {
        url = new URL(url, location.href).href;
        // 원본 배열 위치는 입력창 이동에, 화면 카드 번호는 안내 문구에 각각 사용한다.
        bodyImages.push({ url, cardIndex, cardNumber, lineIndex });
      } catch(e){ /* 형식 오류는 기본 점검에서 이미 표시됨 */ }
    });
  });
  const uniqueBodyImages = [];
  const seenImageUrls = new Set();
  bodyImages.forEach(item => {
    if(seenImageUrls.has(item.url)) return;
    seenImageUrls.add(item.url);
    uniqueBodyImages.push(item);
  });
  const bodyChecks = uniqueBodyImages.slice(0, 12);
  const bodyResults = await Promise.all(bodyChecks.map(async item => ({
    item,
    result:await probeImage(item.url)
  })));
  if(token !== preflightRunToken) return;
  bodyResults.forEach(({ item, result }) => {
    if(!result.ok){
      issues.push({
        severity:'error',
        message:`카드 ${item.cardNumber}의 본문 이미지를 불러오지 못했습니다.`,
        cardIndex:item.cardIndex,
        lineIndex:item.lineIndex
      });
    }else if(result.width > 5000 || result.height > 5000){
      issues.push({
        severity:'warn',
        message:`카드 ${item.cardNumber}의 본문 이미지 원본이 ${result.width}×${result.height}로 매우 큽니다.`,
        cardIndex:item.cardIndex,
        lineIndex:item.lineIndex
      });
    }
  });
  if(uniqueBodyImages.length > bodyChecks.length){
    issues.push({ severity:'warn', message:`본문 이미지가 많아 앞의 ${bodyChecks.length}개만 연결 상태를 확인했습니다.` });
  }
  if(token !== preflightRunToken) return;
  renderPreflightIssues(issues, false);
}

// 시작 순서는 앱 셸이 조율하고 저장 상태 판정은 저장 계층에 맡긴다.
function initializeApplication(){
  const draftResult = restoreDraft();
  MosaicUI.renderCreditItemsEditor();
  MosaicUI.renderCreditPresetOptions();
  MosaicUI.renderDetailPresetOptions();
  MosaicUI.controls.renderNameRules();
  MosaicUI.controls.renderKeywordRules();
  MosaicUI.controls.syncProfileTags();
  MosaicUI.controls.syncCover();
  if(draftResult !== 'restored' && MosaicUI.cards.all().length === 0){
    MosaicUI.cards.add(MosaicUI.cards.exampleBody, false); // 초안이 없으면 예시 본문으로 시작
  }
  MosaicUI.cards.setActiveTextarea(MosaicUI.cards.textareas()[0] || null);
  MosaicUI.controls.updateHexLabels();
  MosaicUI.controls.syncTypographyLabels();
  MosaicUI.controls.syncDesignSummaries();
  MosaicUI.preview.setDirectEditReady(true);
  MosaicUI.preview.render();
  updateCounter();
  MosaicUI.initializeThemeSelection();
}

// ---------- 변경 완료 경로 ----------
// 새 기능은 값을 바꾼 뒤 아래 경로 하나를 고른다. 본문 타이핑의 브라우저
// 실행 취소와 한글 조합은 UI가 유지하며, 작업 단위 기록은 별도로 확정한다.
const changes = Object.freeze({
  settingsInput(id){
    MosaicUI.preview.scheduleMarkupRefresh();
    scheduleDraftSave();
    if(MosaicState.STYLE_FIELDS.includes(id)) commitStyleHistory(false);
  },
  liveInput(){
    MosaicUI.preview.scheduleRefresh();
    scheduleDraftSave();
  },
  controlChange(){
    MosaicUI.preview.renderWithCount();
    scheduleDraftSave();
  },
  committedChange(){
    MosaicUI.preview.renderWithCount();
    return saveDraft();
  },
  renderedDraftChange(){
    MosaicUI.preview.render();
    scheduleDraftSave();
  },
  renderedSavedChange(){
    MosaicUI.preview.render();
    return saveDraft();
  },
  styleChange(){
    MosaicUI.preview.render();
    const saved = saveDraft();
    commitStyleHistory(true);
    return saved;
  }
});

// HTML·보관함·작업 히스토리는 같은 적용 → 선택 상태 정리 → 완료 순서를 쓴다.
// applyState는 DOM 복원만, 이 명령은 그 결과의 렌더와 저장까지 책임진다.
function replaceWork(data, {resetTheme = false} = {}){
  MosaicUI.work.applyState(data);
  if(resetTheme) MosaicUI.resetThemeSelection();
  return changes.committedChange();
}

function cancelStyleHistoryCommit(){ clearTimeout(styleCommitTimer); styleCommitTimer = null; }
const commands = Object.freeze({
buildDocumentNavigator,
isDesktopLayoutMirrored,
setPreviewArcaTheme,
syncPreviewCardStyleToggles,
syncPreviewVisibilityToggles,
updateAllImageLoadStatuses,
updateCounter,
changes,
replaceWork,
cancelStyleHistoryCommit,
commitStyleHistory,
deferDraftSave,
discardUndoSnapshot,
goActionHistory,
recordCompletedAction,
saveDraft,
scheduleDraftSave,
setArchiveDrawerOpen,
snapshotCards,
updateHistoryButtons
});
MosaicUI.configure(commands);
MosaicUI.init();
function bindApplicationEvents(){


// 짧은 저장 지연 중 창을 닫아도 마지막 입력이 빠지지 않게 함.
window.addEventListener('beforeunload', event => {
  if(!(draftDirty || draftSaveTimer) || saveDraft(false)) return;
  // 충돌·저장소 오류로 현재 작업을 보존하지 못했으면 브라우저의 기본 이탈 확인을 띄운다.
  event.preventDefault();
  event.returnValue = '';
});

// 다른 탭의 저장을 입력 시점보다 먼저 알려 사용자가 충돌 상태를 놓치지 않게 한다.
window.addEventListener('storage', event => {
  if(event.storageArea !== localStorage || event.key !== MosaicState.DRAFT_KEY) return;
  if(event.newValue === draftReadRaw) return;
  MosaicUI.setDraftStatus('다른 탭에 최신 작업 있음', 'paused');
});

document.getElementById('draftConflictBtn').addEventListener('click', () => {
  const message = draftReadRaw === undefined
    ? '저장된 초안을 읽지 못했습니다. 원본을 덮어쓰면 복구할 수 없습니다.\n원본 백업을 보관한 뒤 계속해 주세요.'
    : '다른 탭의 최신 초안을 덮어쓰려면 확인을 누르세요.\n덮어쓴 초안은 되돌릴 수 없습니다.';
  if(!confirm(message)) return;
  try {
    draftReadRaw = MosaicStorage.readDraftRaw();
    draftBaseUpdatedAt = storedDraftUpdatedAt();
    saveDraft(true);
  }catch(e){ MosaicUI.setDraftStatus('저장 실패', 'error'); }
});

document.getElementById('undoStyleBtn').addEventListener('click', () => goActionHistory(-1));

document.getElementById('redoStyleBtn').addEventListener('click', () => goActionHistory(1));

document.addEventListener('input', (e) => {
  if(actionIndex >= actionHistory.length - 1 || !isHistoryAffectingInput(e.target)) return;
  actionHistory = actionHistory.slice(0, actionIndex + 1);
  updateHistoryButtons();
}, true);

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

document.addEventListener('keydown', (e) => {
  if(e.isComposing || e.keyCode === 229) return;
  if(!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  const fmt = FMT_SHORTCUT[e.key.toLowerCase()];
  if(!fmt) return;

  const el = document.activeElement;
  if(!el || el.tagName !== 'TEXTAREA') return;
  const isBodyTa = el.id === 'fsTextarea'
    || !!el.closest('#cardEditors .cardEditor:not(.commentEditor)');
  if(!isBodyTa) return;

  e.preventDefault();
  MosaicUI.cards.format(el, fmt);
});

// ---------- 키보드 단축키 ----------
// Ctrl/⌘+Enter: HTML 복사 · Ctrl/⌘+S: 파일 저장
// Ctrl/⌘+F: 검색 — 전체 화면 편집 중이면 본문 검색창, 아니면 미리보기 검색
document.addEventListener('keydown', (e) => {
  if(e.isComposing || e.keyCode === 229) return;
  if(!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if(e.shiftKey) return;
  if(e.key === 'Enter'){
    e.preventDefault();
    document.getElementById('copyBtn').click();
  } else if(e.key === 's' || e.key === 'S'){
    e.preventDefault();
    document.getElementById('downloadBtn').click();
  } else if(e.key === 'f' || e.key === 'F'){
    // 코드 전체 화면에서는 대체 검색이 없으므로 브라우저 기본 찾기를 막지 않음
    if(document.getElementById('codeOverlay').style.display === 'block') return;
    e.preventDefault();
    if(document.getElementById('fsOverlay').style.display === 'block'){
      MosaicUI.preview.setFullscreenSearchOpen(true, true);
    } else {
      MosaicUI.preview.openSearch();
    }
  }
});

document.querySelectorAll('details.foldGroup').forEach(el => {
  const key = FOLD_KEY + ':' + el.id;
  try {
    const saved = localStorage.getItem(key);
    if(saved === 'open') el.setAttribute('open', '');
    else if(saved === 'closed') el.removeAttribute('open');
  } catch(e){}
  el.addEventListener('toggle', () => {
    try { localStorage.setItem(key, el.open ? 'open' : 'closed'); } catch(e){}
  });
});

document.querySelectorAll('details.typographySubsection').forEach(el => {
  const key = TYPOGRAPHY_SUBSECTION_KEY + ':' + el.id;
  try {
    const saved = localStorage.getItem(key);
    if(saved === 'open') el.setAttribute('open', '');
    else if(saved === 'closed') el.removeAttribute('open');
  } catch(e){}
  el.addEventListener('toggle', () => {
    try { localStorage.setItem(key, el.open ? 'open' : 'closed'); } catch(e){}
  });
});

setUiNightMode(document.documentElement.classList.contains('uiNight'), false);

setUiPalette(document.documentElement.dataset.uiPalette || 'default', false);

uiPaletteBtn.addEventListener('click', () => setUiPaletteMenuOpen(uiPaletteMenu.hidden));

uiPaletteMenu.addEventListener('click', event => {
  const button = event.target.closest('[data-ui-palette]');
  if(!button) return;
  setUiPalette(button.dataset.uiPalette, true);
});

document.addEventListener('click', event => {
  if(!uiAppearanceControls.contains(event.target)) setUiPaletteMenuOpen(false);
});

document.addEventListener('keydown', event => {
  if(event.key === 'Escape' && !uiPaletteMenu.hidden){
    setUiPaletteMenuOpen(false);
    uiPaletteBtn.focus();
  }
});

uiNightModeBtn.addEventListener('click', () => {
  setUiPaletteMenuOpen(false);
  setUiNightMode(!document.documentElement.classList.contains('uiNight'), true);
});

try { setLayoutMirrored(localStorage.getItem(LAYOUT_MIRROR_KEY) === 'on', false); }
catch(e){ setLayoutMirrored(false, false); }

layoutMirrorBtn.addEventListener('click', () => {
  if(!window.matchMedia('(min-width: 681px)').matches) return;
  setLayoutMirrored(!document.body.classList.contains('layoutMirrored'), true);
});

(function initSidebarWidth(){
  let saved = SIDEBAR_DEFAULT;
  try { const v = parseInt(localStorage.getItem(SIDEBAR_KEY), 10); if(v) saved = v; } catch(e){}
  setSidebarWidth(saved, false);
})();

(function initSidebarResizer(){
  const bar = document.getElementById('sidebarResizer');
  if(!bar) return;
  let dragging = false;
  let activePointerId = null;

  const finishDrag = () => {
    if(!dragging) return;
    dragging = false;
    activePointerId = null;
    bar.classList.remove('dragging');
    document.body.classList.remove('resizingSidebar');
    const w = parseInt(getComputedStyle(document.getElementById('sidebar')).width, 10);
    setSidebarWidth(w, true);
  };

  bar.addEventListener('pointerdown', (e) => {
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    activePointerId = e.pointerId;
    try { bar.setPointerCapture(e.pointerId); } catch(err){}
    bar.classList.add('dragging');
    document.body.classList.add('resizingSidebar');
  });

  bar.addEventListener('pointermove', (e) => {
    if(!dragging || e.pointerId !== activePointerId) return;
    const width = isDesktopLayoutMirrored() ? window.innerWidth - e.clientX : e.clientX;
    setSidebarWidth(width, false);
  });

  bar.addEventListener('pointerup', finishDrag);
  bar.addEventListener('pointercancel', finishDrag);
  bar.addEventListener('lostpointercapture', finishDrag);

  // 더블클릭하면 기본 폭으로
  bar.addEventListener('dblclick', () => setSidebarWidth(SIDEBAR_DEFAULT, true));
  bar.addEventListener('keydown', (e) => {
    if(!['ArrowLeft','ArrowRight','Home'].includes(e.key)) return;
    e.preventDefault();
    if(e.key === 'Home') return setSidebarWidth(SIDEBAR_DEFAULT, true);
    const current = parseInt(getComputedStyle(document.getElementById('sidebar')).width, 10) || SIDEBAR_DEFAULT;
    const visualDelta = e.key === 'ArrowRight' ? 20 : -20;
    setSidebarWidth(current + (isDesktopLayoutMirrored() ? -visualDelta : visualDelta), true);
  });
})();

document.getElementById('archiveOpenBtn').addEventListener('click', () => {
  setArchiveDrawerOpen(document.getElementById('archiveDrawer').hidden);
});

document.getElementById('archiveCloseBtn').addEventListener('click', () => setArchiveDrawerOpen(false));

document.getElementById('archiveDrawer').addEventListener('keydown', e => {
  if(e.key === 'Escape'){
    e.preventDefault();
    e.stopPropagation();
    setArchiveDrawerOpen(false);
  }
});

document.getElementById('sidebar').addEventListener('scroll', () => {
  if(!tabSwitching) tabScroll[activeTabId] = document.getElementById('sidebar').scrollTop;
});

document.querySelectorAll('.tabBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    tabSwitching = true; // 전환 중 스크롤 변화는 기록하지 않음
    document.querySelectorAll('.tabBtn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
      b.tabIndex = -1;
    });
    document.querySelectorAll('.tabPanel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    btn.tabIndex = 0;
    activeTabId = btn.dataset.tab;
    document.getElementById(activeTabId).classList.add('active');
    // 패널이 바뀌면 사이드바 높이도 바뀌므로, 레이아웃이 확정된 뒤에 스크롤을 복원해야
    // 브라우저가 값을 잘라버리지(clamp) 않음
    const target = tabScroll[activeTabId] || 0;
    requestAnimationFrame(() => {
      sidebar.scrollTop = target;
      requestAnimationFrame(() => { tabSwitching = false; });
    });
  });
});

document.querySelector('.tabBar').addEventListener('keydown', (e) => {
  if(e.isComposing || e.keyCode === 229) return;
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
  const tabs = Array.from(document.querySelectorAll('.tabBtn'));
  const current = Math.max(0, tabs.indexOf(document.activeElement));
  let next = current;
  if(e.key === 'Home') next = 0;
  else if(e.key === 'End') next = tabs.length - 1;
  else next = (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  e.preventDefault();
  tabs[next].click();
  tabs[next].focus();
});

document.getElementById('clearBodyBtn').addEventListener('click', () => {
  MosaicUI.cards.snapshot();
  MosaicUI.cards.clear();
  MosaicUI.cards.setActiveTextarea(null);
  MosaicUI.cards.add('', true);
  changes.committedChange();
  MosaicUI.feedback.undo('본문 전부 비움.');
});

PREVIEW_VISIBILITY_TOGGLES.forEach(([buttonId, inputId]) => {
  document.getElementById(buttonId).addEventListener('click', () => {
    document.getElementById(inputId).click();
  });
});

document.getElementById('previewCardBorderBtn').addEventListener('click', () => {
  const input = document.getElementById('cardBorderOn');
  if(!input || input.disabled) return;
  input.click();
  // 프로그램으로 누른 체크박스는 포커스 이탈을 기다리지 않고 한 작업으로 기록한다.
  commitStyleHistory(true);
});

document.getElementById('previewCardLayoutBtn').addEventListener('click', () => {
  const input = document.getElementById('cardLayoutUnifiedOn');
  if(!input || input.disabled) return;
  // 기존 사이드바 체크박스를 통해 바꿔 저장·프리셋·히스토리 경로를 하나로 유지한다.
  input.click();
});

document.getElementById('previewThemeLightBtn').addEventListener('click', () => {
  setPreviewArcaTheme('light');
});

document.getElementById('previewThemeDarkBtn').addEventListener('click', () => {
  setPreviewArcaTheme('dark');
});

// ---------- 미리보기 폭 (일반: 카드 폭 순환 / 전체화면: 데스크톱·모바일) ----------
document.getElementById('previewWidthCycleBtn').addEventListener('click', () => {
  MosaicUI.stepSelectOption('cardWidth', 1);
  requestAnimationFrame(MosaicUI.layoutPreviewFloatingButtons);
});

document.getElementById('widthDesktopBtn').addEventListener('click', () => {
  const cardWidth = parseInt(document.getElementById('cardWidth').value, 10) || 750;
  document.getElementById('previewWrap').style.maxWidth = `${cardWidth}px`;
  document.getElementById('widthDesktopBtn').classList.add('active');
  document.getElementById('widthMobileBtn').classList.remove('active');
  document.getElementById('widthDesktopBtn').setAttribute('aria-pressed', 'true');
  document.getElementById('widthMobileBtn').setAttribute('aria-pressed', 'false');
  MosaicUI.preview.syncToolbarLabel();
  requestAnimationFrame(() => {
    MosaicUI.preview.syncCommentOutset();
    MosaicUI.preview.layoutFloatingButtons();
  });
});

document.getElementById('widthMobileBtn').addEventListener('click', () => {
  document.getElementById('previewWrap').style.maxWidth = '380px';
  document.getElementById('widthMobileBtn').classList.add('active');
  document.getElementById('widthDesktopBtn').classList.remove('active');
  document.getElementById('widthDesktopBtn').setAttribute('aria-pressed', 'false');
  document.getElementById('widthMobileBtn').setAttribute('aria-pressed', 'true');
  MosaicUI.preview.syncToolbarLabel();
  requestAnimationFrame(() => {
    MosaicUI.preview.syncCommentOutset();
    MosaicUI.preview.layoutFloatingButtons();
  });
});

document.getElementById('copyWithOuterBreaks').addEventListener('change', () => {
  MosaicUI.preview.syncOuterBreaks();
  requestAnimationFrame(MosaicUI.layoutPreviewFloatingButtons);
});

document.getElementById('copyBtn').addEventListener('click', () => {
  const status = document.getElementById('copyStatus');
  let html;
  try {
    html = MosaicUI.generateHTML();
    if(document.getElementById('copyWithOuterBreaks').checked){
      html = '<br>' + html + '<br>';
    }
  } catch(e){
    status.textContent = 'HTML 생성 중 오류: ' + e.message;
    return;
  }
  const ok = () => {
    status.textContent = '복사 완료. 아카라이브 에디터에 붙여넣기.';
    setTimeout(() => { status.textContent = ''; }, 3000);
  };

  // 임시 입력 요소를 이용해 복사하므로 미리보기·편집 원문·코드 보기는 바뀌지 않음.
  // 로컬 파일(file://)에서도 동작하는 동기 방식을 먼저 쓰고, 실패하면 클립보드 API를 시도함.
  try {
    const temp = document.createElement('textarea');
    temp.value = html;
    temp.setAttribute('readonly', '');
    temp.style.position = 'fixed';
    temp.style.left = '-9999px';
    temp.style.opacity = '0';
    document.body.appendChild(temp);
    temp.select();
    temp.setSelectionRange(0, temp.value.length);
    let done = false;
    try { done = document.execCommand('copy'); } catch(e){ done = false; }
    document.body.removeChild(temp);
    if(done){
      if(window.getSelection) window.getSelection().removeAllRanges();
      ok();
      return;
    }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(html).then(() => {
        ok();
      }).catch(() => {
        status.textContent = '자동 복사가 차단됐습니다. 브라우저의 클립보드 권한을 확인해 주세요.';
      });
    } else {
      status.textContent = '자동 복사가 차단됐습니다. 브라우저의 클립보드 권한을 확인해 주세요.';
    }
  } catch(e){
    status.textContent = '복사 중 오류: ' + e.message;
  }
});

document.getElementById('codeFsBtn').addEventListener('click', openCodeFullscreen);

document.getElementById('codeFsCloseBtn').addEventListener('click', closeCodeFullscreen);

document.getElementById('codeOverlay').addEventListener('mousedown', (e) => {
  if(e.target.id === 'codeOverlay') closeCodeFullscreen();
});

document.getElementById('codeOverlay').addEventListener('wheel', (e) => {
  if(!e.target.closest('#codeFsArea')) e.preventDefault();
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if(e.isComposing || e.keyCode === 229) return;
  if(e.key === 'Escape' && document.getElementById('codeOverlay').style.display === 'block'){
    e.preventDefault();
    closeCodeFullscreen();
  }
});

// 전체 화면에서 바로 복사
document.getElementById('codeFsCopyBtn').addEventListener('click', () => {
  const area = document.getElementById('codeFsArea');
  area.focus();
  area.select();
  let done = false;
  try { done = document.execCommand('copy'); } catch(e){ done = false; }
  const st = document.getElementById('codeFsStatus');
  st.textContent = done ? '복사 완료.' : 'Ctrl+C(⌘+C)로 복사.';
  setTimeout(() => { st.textContent = ''; }, 2500);
});

IMAGE_STATUS_CONFIGS.forEach(config => {
  document.getElementById(config.inputId).addEventListener('input', () => scheduleImageStatusCheck(config));
});

docNavBtn.addEventListener('click', () => {
  const open = docNavPanel.hidden;
  docNavPanel.hidden = !open;
  docNavBtn.setAttribute('aria-expanded', String(open));
  docNavBtn.setAttribute('aria-pressed', String(open));
  if(open) buildDocumentNavigator();
});

document.getElementById('cardEditors').addEventListener('input', buildDocumentNavigator);

document.getElementById('cardEditors').addEventListener('change', buildDocumentNavigator);

new MutationObserver(buildDocumentNavigator).observe(document.getElementById('cardEditors'), { childList:true });

focusModeBtn.addEventListener('click', () => setFocusMode(!document.body.classList.contains('labFocus')));

document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && document.body.classList.contains('labFocus')) setFocusMode(false);
});

preflightBtn.addEventListener('click', () => {
  if(!preflightPanel.hidden){
    preflightPanel.hidden = true;
    preflightBtn.setAttribute('aria-expanded', 'false');
    return;
  }
  runPreflight();
});

// 맥이면 단축키 표기를 ⌘ 로 바꿔줌 (툴팁·도움말)
if(MosaicUI.IS_MAC){
  document.querySelectorAll('[title*="Ctrl+"]').forEach(el => {
    el.title = el.title.replace(/Ctrl\+/g, '⌘+');
  });
  document.querySelectorAll('.hint code').forEach(el => {
    if(/^Ctrl\+/.test(el.textContent)) el.textContent = el.textContent.replace(/^Ctrl\+/, '⌘+');
  });
}
}
bindApplicationEvents();
initializeApplication();
return commands;
})();
