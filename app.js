// 조각로그 v1.8.4 애플리케이션 조율·초기화 모듈.

// ---------- 본문 입력창 서식 단축키 ----------
// 카드 입력창·전체 화면 입력창에 커서가 있을 때만 동작
// Ctrl/⌘+B 굵게 · Ctrl/⌘+I 강조 · Ctrl/⌘+E 가운데 정렬
const FMT_SHORTCUT = { b: 'bold', i: 'emphasis', e: 'center' };
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

// ---------- 접기 그룹 상태 기억 ----------
const FOLD_KEY = 'logGenFoldGroup_v1';
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

// 글자와 세부 조정의 소그룹은 서로 독립적으로 열고 닫으며 상태를 기억한다.
const TYPOGRAPHY_SUBSECTION_KEY = 'logGenTypographySubsection_v1';
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
  if(save){
    try { localStorage.setItem(LAYOUT_MIRROR_KEY, on ? 'on' : 'off'); }
    catch(e){ /* 저장소를 쓸 수 없어도 현재 화면 배치는 유지 */ }
  }
  requestAnimationFrame(() => {
    MosaicUI.preview.syncCommentOutset();
    MosaicUI.preview.layoutFloatingButtons();
  });
}

try { setLayoutMirrored(localStorage.getItem(LAYOUT_MIRROR_KEY) === 'on', false); }
catch(e){ setLayoutMirrored(false, false); }

layoutMirrorBtn.addEventListener('click', () => {
  if(!window.matchMedia('(min-width: 681px)').matches) return;
  setLayoutMirrored(!document.body.classList.contains('layoutMirrored'), true);
});

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

// ---------- 보관함 오버레이 ----------
function setArchiveDrawerOpen(open){
  const drawer = document.getElementById('archiveDrawer');
  const button = document.getElementById('archiveOpenBtn');
  drawer.hidden = !open;
  drawer.setAttribute('aria-hidden', String(!open));
  button.setAttribute('aria-expanded', String(open));
  if(open){
    renderSlotList();
    requestAnimationFrame(() => document.getElementById('archiveCloseBtn').focus());
  }else{
    button.focus();
  }
}
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

// ---------- 탭 전환 ----------
// 탭별 스크롤 위치를 기억해서, 오갈 때 보던 자리로 돌아오게 함.
// 사이드바 스크롤을 상시 추적해두면, 버튼 클릭으로 브라우저가 스크롤을 건드려도
// 마지막으로 사용자가 보고 있던 위치가 남는다.
const tabScroll = {};
let activeTabId = 'tabCover';
let tabSwitching = false;
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

// ---------- 본문 글자수/문단수/읽기시간 카운터 ----------
function updateCounter(allCards = MosaicUI.cards.all(), settings = getSettings()){
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
       || statusLineContent(structuralLine) !== null) return false;
    return structuralLine.replace(/\s/g, '').length > 300;
  }).length;
  const longNote = longCount > 0 ? ` · 긴 문단 ${longCount}개` : '';

  // 대사/서술/강조 구성비 (강조 글자는 서술에서 빼 중복 없이 합계 100%로 계산)
  let dlgC = 0, emphasisC = 0, narrC = 0;
  bodyParaList.forEach(l => {
    const structuralLine = l.replace(/^\[C\]\s*/i, '');
    const u = structuralLine.toUpperCase();
    if(['[HR]', '[HR2]', '[HR3]', '[HR4]', '[GAP]'].includes(u) || /^#{1,4}\s/.test(structuralLine) || /^\[IMG\s/i.test(structuralLine)
       || statusLineContent(structuralLine) !== null
       || /^\[접기/.test(structuralLine) || /^\[\/접기\]$/.test(structuralLine)) return;
    let body = normalizeQuotes(structuralLine);
    const cm = body.match(/^\{(#?[0-9A-Fa-f]{3,8})\}\s*/);
    if(cm) body = body.slice(cm[0].length).trim();
    body = stripSpeaker(body, settings).line;
    if(/^"[^"]*"$/.test(body)){
      dlgC += stripMarkers(body.slice(1, -1)).replace(/\s/g, '').length;
    }else{
      const plainLength = stripMarkers(body).replace(/\s/g, '').length;
      const re = new RegExp(FMT_RE.emphasis.source, 'g');
      let match, emphasized = 0;
      while((match = re.exec(body)) !== null){
        emphasized += stripMarkers(formatMatchContent('emphasis', match)).replace(/\s/g, '').length;
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

document.getElementById('clearBodyBtn').addEventListener('click', () => {
  MosaicUI.cards.snapshot();
  MosaicUI.cards.clear();
  MosaicUI.cards.setActiveTextarea(null);
  MosaicUI.cards.add('', true);
  MosaicUI.preview.render();
  updateCounter();
  saveDraft();
  MosaicUI.feedback.undo('본문 전부 비움.');
});

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
PREVIEW_VISIBILITY_TOGGLES.forEach(([buttonId, inputId]) => {
  document.getElementById(buttonId).addEventListener('click', () => {
    document.getElementById(inputId).click();
  });
});
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
document.getElementById('previewThemeLightBtn').addEventListener('click', () => {
  setPreviewArcaTheme('light');
});
document.getElementById('previewThemeDarkBtn').addEventListener('click', () => {
  setPreviewArcaTheme('dark');
});

// ---------- 미리보기 폭 (일반: 카드 폭 순환 / 전체화면: 데스크톱·모바일) ----------
document.getElementById('previewWidthCycleBtn').addEventListener('click', () => {
  stepSelectOption('cardWidth', 1);
  requestAnimationFrame(layoutPreviewFloatingButtons);
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
  requestAnimationFrame(layoutPreviewFloatingButtons);
});

document.getElementById('copyBtn').addEventListener('click', () => {
  const status = document.getElementById('copyStatus');
  let html;
  try {
    html = generateHTML();
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

// ---------- 대표 이미지와 BOT·USER 사진 상태 확인 ----------
const IMAGE_STATUS_CONFIGS = [
  { inputId:'imgUrl', statusId:'imageLoadStatus', enabledIds:['imgOn'], showDimensions:true },
  { inputId:'profileCharImage', statusId:'profileCharImageStatus', enabledIds:['profileOn','profileCharOn'] },
  { inputId:'profileUserImage', statusId:'profileUserImageStatus', enabledIds:['profileOn','profileUserOn'] },
  ...EXTRA_PROFILE_SLOTS.map(slot => ({ inputId:`profileExtra${slot}Image`, statusId:`profileExtra${slot}ImageStatus`, enabledIds:['profileOn',`profileExtra${slot}On`], slot })),
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
  const enabled = (!config.slot || config.slot <= extraProfileCount() + 2)
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
      const imageKey = normalizeProtocolRelativeUrl(raw);
      profileImageDimensions.set(imageKey, { width:result.width, height:result.height });
      profileImageDimensions.set(url, { width:result.width, height:result.height });
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

IMAGE_STATUS_CONFIGS.forEach(config => {
  document.getElementById(config.inputId).addEventListener('input', () => scheduleImageStatusCheck(config));
});

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
    const heading = parseBodyHeading(structuralLine);
    if(heading){
      items.push({ lineIndex, label:`${'·'.repeat(heading.level)} ${stripMarkers(heading.title).trim()}` });
      return;
    }
    if(structuralLine.toUpperCase() === '[HR]') items.push({ lineIndex, label:'— 구분선' });
    else if(structuralLine.toUpperCase() === '[HR2]') items.push({ lineIndex, label:'✦ 장면 전환' });
    else if(structuralLine.toUpperCase() === '[HR3]') items.push({ lineIndex, label:'··· 호흡' });
    else if(['[HR4]', '[GAP]'].includes(structuralLine.toUpperCase())) items.push({ lineIndex, label:'↕ 여백' });
    else if(statusLineContent(structuralLine) !== null) items.push({ lineIndex, label:'◌ 상태창' });
    else if(parseOutputBodyImage(raw)) items.push({ lineIndex, label:'▧ 본문 이미지' });
    else if(/^\[접기/i.test(structuralLine)){
      const foldTitle = structuralLine.replace(/^\[접기\s*|\]$/g, '').trim();
      const heading = parseBodyHeading(foldTitle);
      items.push({ lineIndex, label:`＋ ${heading ? stripMarkers(heading.title).trim() : (foldTitle || '접기')}` });
    }
  });
  if(!items.length){
    const firstLine = lines.findIndex(line => line.trim());
    if(firstLine >= 0){
      const summary = stripMarkers(lines[firstLine])
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
      .map(line => parseBodyHeading(line.trim().replace(/^\[C\]\s*/i, '')))
      .find(Boolean);
    const cardNavigatorTitle = String(card.foldTitle || '').trim();
    const navigatorTitle = cardNavigatorTitle
      ? cardNavigatorTitle
      : (firstHeading ? stripMarkers(firstHeading.title).trim() : '');
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
focusModeBtn.addEventListener('click', () => setFocusMode(!document.body.classList.contains('labFocus')));
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && document.body.classList.contains('labFocus')) setFocusMode(false);
});

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
    const emphasisMarkers = (withoutStrong.match(/(?<!\\)\*/g) || []).length;
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
      if(/^\[IMG\b/i.test(line) && !parseOutputBodyImage(raw)){
        issues.push({ severity:'error', message:`${blockLabel}의 이미지 문법을 확인해 주세요.`, cardIndex, lineIndex });
      }
    });
  });
  if(document.getElementById('imgOn').checked && !document.getElementById('imgUrl').value.trim()){
    issues.push({ severity:'error', message:'대표 이미지 표시가 켜져 있지만 주소가 비어 있습니다.', targetId:'imgUrl' });
  }
  if(document.getElementById('creditOn').checked){
    storedCreditItems().forEach((item, index) => {
      const rawUrl = item.url.trim();
      if(rawUrl && !normalizeHttpLinkUrl(rawUrl)){
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
      const match = parseOutputBodyImage(raw);
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

preflightBtn.addEventListener('click', () => {
  if(!preflightPanel.hidden){
    preflightPanel.hidden = true;
    preflightBtn.setAttribute('aria-expanded', 'false');
    return;
  }
  runPreflight();
});

// 맥이면 단축키 표기를 ⌘ 로 바꿔줌 (툴팁·도움말)
if(IS_MAC){
  document.querySelectorAll('[title*="Ctrl+"]').forEach(el => {
    el.title = el.title.replace(/Ctrl\+/g, '⌘+');
  });
  document.querySelectorAll('.hint code').forEach(el => {
    if(/^Ctrl\+/.test(el.textContent)) el.textContent = el.textContent.replace(/^Ctrl\+/, '⌘+');
  });
}

// UI가 앱 셸의 내부 전역 대신 필요한 화면 작업만 호출하도록 경계를 고정한다.
const MosaicApp = Object.freeze({
  buildDocumentNavigator,
  isDesktopLayoutMirrored,
  setPreviewArcaTheme,
  syncPreviewCardStyleToggles,
  syncPreviewVisibilityToggles,
  updateAllImageLoadStatuses,
  updateCounter
});

// 시작 순서는 앱 셸이 조율하고 저장 상태 판정은 저장 계층에 맡긴다.
function initializeApplication(){
  MosaicStorage.restoreDraft();
  MosaicRenderer.renderCreditItemsEditor();
  MosaicRenderer.renderCreditPresetOptions();
  MosaicRenderer.renderDetailPresetOptions();
  MosaicUI.controls.renderNameRules();
  MosaicUI.controls.renderKeywordRules();
  MosaicUI.controls.syncProfileTags();
  MosaicUI.controls.syncCover();
  if(MosaicUI.cards.textareas().length === 0){
    MosaicUI.cards.add(MosaicUI.cards.exampleBody, false); // 초안이 없으면 예시 본문으로 시작
  }
  MosaicUI.cards.setActiveTextarea(MosaicUI.cards.textareas()[0] || null);
  MosaicUI.controls.updateHexLabels();
  MosaicUI.controls.syncTypographyLabels();
  MosaicUI.controls.syncDesignSummaries();
  MosaicUI.preview.setDirectEditReady(true);
  MosaicUI.preview.render();
  updateCounter();
  MosaicStorage.initializeThemeSelection();
}
initializeApplication();
