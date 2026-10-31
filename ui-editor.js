// 조각로그 UI · 카드 입력과 전체 화면 편집
// 생성 함수만 등록하며, 실행 상태와 기능 연결은 ui.js에서 구성한다.
globalThis.MosaicUIParts.editor = (() => {
'use strict';

function createCardEditors(host){
// 숨길 때의 편집 상태를 기억한다. 숨긴 상태에서도 수동 펼치기는 허용한다.
function syncHiddenEditorCollapse(ed, collapseBtn, hiding){
  if(hiding) ed.dataset.collapsedBeforeHide = String(ed.classList.contains('isCollapsed'));
  const collapsed = hiding || ed.dataset.collapsedBeforeHide === 'true';
  if(ed.classList.contains('isCollapsed') !== collapsed) collapseBtn.click();
  if(!hiding) delete ed.dataset.collapsedBeforeHide;
}

// ---------- 카드별 본문 입력 ----------
const EXAMPLE_BODY = `<<"이리야."

대답이 없었다.

이리의 눈동자는 하늘에 박혀 있었고, 눈꺼풀은 깜빡이는 것조차 잊은 듯 움직이지 않았다. 동공이 빛에 반응하며 천천히 줄어들었다가 구름이 해를 가리자 다시 풀어졌다. 그 작은 변화조차 이리에게는 경이로움이었다. 그의 목구멍에서 낮은 소리가 흘러나왔다. 말이 아니었다. 개가 낯선 것을 마주했을 때 내는, 가슴 깊은 곳에서 울리는 작은 울음소리.

이리의 눈에는 눈물이 맺혀 있었다.

흐르지는 않았다. 속눈썹에 걸린 채로 아침 햇살을 받아 작은 프리즘처럼 빛나고 있었다. 슬픔의 눈물이 아니었다. 두려움도, 고통도 아니었다. 그저 너무 많은 것이 한꺼번에 밀려들어왔을 때, 몸이 감당하지 못해 흘러넘치는 수분. 개였을 때는 볼 수 없었던 색깔들. 인간의 눈이 포착하는 스펙트럼의 넓이. 하늘의 파랑은 단일한 색이 아니라 수백 개의 파랑이 겹쳐진 층위였다. 이리는 그 모든 것을 동시에 보고 있었다.

"하늘."

단 한 단어. 발음은 여전히 서툴렀다. 하지만 그 목소리에는 말로 다 담지 못한 모든 것이 실려 있었다.


*이렇게 생긴 거였어? 이렇게 넓은 거였어? 이렇게 많은 색이 있었어? 나 여태까지 이걸 모르고 살았어?*`;

const cardEditorState = {
  activeTextarea:null, // 마지막으로 포커스된 카드 입력창 (툴바 삽입 대상)
  toolbarHeaderObserver:null,
  delegatedEventsBound:false,
  actionMenuEditor:null,
  actionMenuSerial:0,
  briefViewBatching:false,
  composingTextareas:new WeakSet(),
  autoExpandedResizers:new WeakMap()
};

// 보조 조작은 카드 안에서 펼친다. 편집/출력 상태와 분리하고 한 곳만 열어 둔다.
function closeCardActionMenu(restoreFocus = false){
  const editor = cardEditorState.actionMenuEditor;
  if(!editor) return;
  cardEditorState.actionMenuEditor = null;
  const panel = editor.querySelector('.cardActionMenu');
  const trigger = editor.querySelector('.cardMenuBtn');
  const focusInside = panel?.contains(document.activeElement);
  if(panel) panel.hidden = true;
  trigger?.setAttribute('aria-expanded', 'false');
  if(restoreFocus && focusInside && trigger?.isConnected) trigger.focus({preventScroll:true});
}

function openCardActionMenu(editor){
  closeCardActionMenu();
  host.closePreviewCardNavigator();
  const panel = editor.querySelector('.cardActionMenu');
  if(!panel) return;
  syncCardSplitButton(editor);
  cardEditorState.actionMenuEditor = editor;
  panel.hidden = false;
  editor.querySelector('.cardMenuBtn').setAttribute('aria-expanded', 'true');
}

function cardActionMenuButtons(editor){
  return Array.from(editor.querySelectorAll('.cardActionMenu button'))
    .filter(button => !button.disabled && !button.hidden && button.style.display !== 'none');
}

function syncCardBodyCenterButton(editor){
  const button = editor.querySelector('.cardBodyCenterBtn');
  if(!button) return;
  const centered = editor.dataset.bodyCenter === 'true';
  const label = centered ? '카드 본문 전체 중앙 정렬 해제' : '카드 본문 전체 중앙 정렬';
  button.setAttribute('aria-pressed', String(centered));
  button.setAttribute('aria-label', label);
  button.title = label;
}

function toggleCardBodyCenter(editor){
  host.snapshotCards();
  const centered = editor.dataset.bodyCenter !== 'true';
  editor.dataset.bodyCenter = String(centered);
  syncCardBodyCenterButton(editor);
  afterEditorControlChange();
  host.showUndoToast(centered ? '카드 본문 전체 중앙 정렬.' : '카드 본문 기존 정렬 복원.');
}

// 가져오기·복원에서 허용하는 수와 사용자 추가 동작의 상한을 맞춘다.
// addCard는 복원에도 쓰이므로 기존 초안의 블록을 잘라내는 제한은 두지 않는다.
function hasEditorCapacity(notify = false){
  const available = host.uiElements.cardEditors.children.length < MosaicState.MAX_WORK_BLOCKS;
  if(!available && notify) host.showNoticeToast(`카드·코멘트는 합쳐서 ${MosaicState.MAX_WORK_BLOCKS}개까지 만들 수 있습니다.`);
  return available;
}

function cardSplitPlan(editor){
  const textarea = editor.querySelector('textarea');
  if(!hasEditorCapacity()) return {reason:'limit'};
  if(cardEditorState.composingTextareas.has(textarea)) return {reason:'composing'};
  if(textarea.selectionStart !== textarea.selectionEnd) return {reason:'selection'};
  return host.sourceMap.planCardSplit(readEditorCard(editor),textarea.selectionStart);
}

function syncCardSplitButton(editor){
  const button = editor.querySelector('.splitCardBtn');
  if(!button) return;
  const {reason} = cardSplitPlan(editor);
  const hints = {
    limit:'저장 가능한 카드·코멘트 수를 모두 사용했습니다.',
    boundary:'나눌 위치에 커서를 놓으세요. 양쪽에 본문이 있어야 합니다.',
    character:'한 글자 안쪽에서는 나눌 수 없습니다.',
    marker:'구분선 문법 밖으로 커서를 옮겨 주세요.',
    exclusion:'제외 설정이 적용된 문구 밖으로 커서를 옮겨 주세요.',
    composing:'글자 입력을 마친 뒤 나눌 수 있습니다.',
    selection:'선택을 해제하고 나눌 위치에 커서를 놓으세요.'
  };
  button.disabled = !!reason;
  button.title = reason ? `커서에서 카드 나누기 · ${hints[reason]}` : '커서에서 카드 나누기';
}

function splitCardAtCursor(editor){
  const {cards} = cardSplitPlan(editor);
  if(!cards){ syncCardSplitButton(editor); return; }
  host.snapshotCards();
  const textarea = editor.querySelector('textarea');
  textarea.value = cards[0].body;
  host.sourceMap.attachEditorSource(textarea,cards[0]);
  const next = createCardEditor(cards[1]);
  editor.after(next);
  renumberCards();
  afterEditorStructureChange();
  if(textarea.classList.contains('isAutoExpanded')){
    requestAnimationFrame(cardEditorState.autoExpandedResizers.get(textarea));
  }
  if(next.classList.contains('isCollapsed')) next.querySelector('.collapseCtl').click();
  const nextTextarea = next.querySelector('textarea');
  nextTextarea.setSelectionRange(0,0);
  cardEditorState.activeTextarea = nextTextarea;
  nextTextarea.focus();
  next.scrollIntoView({block:'nearest',behavior:'smooth'});
  host.showUndoToast('커서 위치에서 카드 나눔.');
}

function bodyCardTextareas(){
  return Array.from(document.querySelectorAll('#cardEditors .cardEditor:not(.commentEditor) textarea'));
}

function bindCardEditorDelegatedEvents(){
  if(cardEditorState.delegatedEventsBound) return;
  const root = host.uiElements.cardEditors;
  if(!root) return;
  cardEditorState.delegatedEventsBound = true;

  root.addEventListener('mousedown', event => {
    if(event.target.closest('.fmtBtn[data-card-format]')) event.preventDefault();
  });

  root.addEventListener('click', event => {
    const editor = event.target.closest('.cardEditor');
    if(!editor) return;
    // 개별·전체 최소화 모두 같은 헤더를 쓴다. 버튼과 순서 변경 드래그는 별개다.
    if(editor.classList.contains('isCollapsed') && event.target.closest('.cardEditorHead')
      && !event.target.closest('button, input, label, a, select, textarea')){
      if(!cardEditorDragState.editor) activateCardEditorHeader(editor);
      return;
    }
    if(editor.classList.contains('commentEditor')) return;
    const menuTrigger = event.target.closest('.cardMenuBtn');
    if(menuTrigger){
      if(cardEditorState.actionMenuEditor === editor) closeCardActionMenu();
      else openCardActionMenu(editor);
      return;
    }
    // 실제 버튼의 기존 동작이 먼저 실행된다. 복제/삭제가 옮긴 포커스는 건드리지 않는다.
    const menuAction = event.target.closest('.cardActionMenu button');
    if(menuAction){
      if(menuAction.matches('.itemMoveBtn, .autoExpandBtn, .cardBodyCenterBtn')){
        // 반복 조작은 열어 둔다. DOM 순서 이동 중 잃은 버튼 포커스도 복구한다.
        if(cardEditorState.actionMenuEditor === editor && menuAction.isConnected){
          menuAction.focus({preventScroll:true});
        }
      } else closeCardActionMenu(true);
    } else if(cardEditorState.actionMenuEditor !== editor) closeCardActionMenu();
    const textarea = editor.querySelector('textarea');
    const formatButton = event.target.closest('.fmtBtn[data-card-format]');
    if(formatButton && textarea){
      host.applyTextareaFormat(textarea, formatButton.dataset.cardFormat);
      return;
    }
    if(event.target.closest('.foldTitleInput')){
      host.scrollPreviewToCardEditor(editor);
      return;
    }
    const actionButton = event.target.closest('[data-card-action]');
    if(!actionButton || !textarea) return;
    if(actionButton.dataset.cardAction === 'show-preview') activateCardEditorHeader(editor);
    if(actionButton.dataset.cardAction === 'toggle-preview-fold') host.toggleEditorPreviewFold(editor);
    if(actionButton.dataset.cardAction === 'toggle-body-center') toggleCardBodyCenter(editor);
    if(actionButton.dataset.cardAction === 'fullscreen'){
      const number = editor.querySelector('.cardNum');
      host.openFullscreen(textarea, number?.textContent || '본문', editor);
    }
  });

  root.addEventListener('keydown', event => {
    const editor = event.target.closest('.cardEditor:not(.commentEditor)');
    if(editor && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)){
      const trigger = event.target.closest('.cardMenuBtn');
      const inPanel = event.target.closest('.cardActionMenu');
      if(trigger && ['ArrowDown', 'ArrowUp'].includes(event.key)){
        event.preventDefault();
        openCardActionMenu(editor);
        const buttons = cardActionMenuButtons(editor);
        (event.key === 'ArrowUp' ? buttons.at(-1) : buttons[0])?.focus();
        return;
      }
      if(inPanel){
        const buttons = cardActionMenuButtons(editor);
        const index = buttons.indexOf(event.target.closest('button'));
        if(index >= 0){
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
            : (index + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next].focus();
        }
        return;
      }
    }
    const positionLink = event.target.closest('.cardNum[role="button"]');
    if(!positionLink || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    activateCardEditorHeader(positionLink.closest('.cardEditor'));
  });

  root.addEventListener('focusin', event => {
    syncBodyOnlyToolbarAvailability(event);
    const titleInput = event.target.closest('.foldTitleInput');
    if(!titleInput) return;
    const editor = titleInput.closest('.cardEditor:not(.commentEditor)');
    if(!editor) return;
    host.scrollPreviewToCardEditor(editor);
    editor.querySelector('.cardFoldRow')?.classList.add('isTitleEditing');
  });

  root.addEventListener('focusout', event => {
    const titleInput = event.target.closest('.foldTitleInput');
    if(!titleInput) return;
    titleInput.closest('.cardFoldRow')?.classList.remove('isTitleEditing');
  });

  root.addEventListener('input', event => {
    const titleInput = event.target.closest('.foldTitleInput');
    if(!titleInput) return;
    const editor = titleInput.closest('.cardEditor:not(.commentEditor)');
    if(!editor) return;
    syncCardEditorHeader(editor);
    host.focusPreviewOn(() => host.previewCardStartForEditor(editor));
    afterEditorLiveInput();
  });
  const outsideMenu = target => {
    const editor = cardEditorState.actionMenuEditor;
    // 다른 카드 메뉴는 click에서 전환한다. pointerdown에서 접으면 대상 버튼이 위로 움직인다.
    return editor && !editor.contains(target) && !target.closest('.cardMenuBtn');
  };
  document.addEventListener('pointerdown', event => { if(outsideMenu(event.target)) closeCardActionMenu(); });
  document.addEventListener('focusin', event => { if(outsideMenu(event.target)) closeCardActionMenu(); });
  document.addEventListener('keydown', event => {
    if(event.key !== 'Escape' || !cardEditorState.actionMenuEditor) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const trigger = cardEditorState.actionMenuEditor.querySelector('.cardMenuBtn');
    closeCardActionMenu();
    trigger?.focus({preventScroll:true});
  }, true);
}

const BODY_ONLY_TOOL_IDS = ['tidyBtn','insertHrBtn','insertCommentBtn','insertQuoteBtn','insertFoldBtn'];

function syncBodyOnlyToolbarAvailability(event){
  const focused = event && event.target && event.target.matches('#cardEditors textarea')
    ? event.target
    : cardEditorState.activeTextarea;
  const commentActive = !!(focused && focused.closest && focused.closest('.commentEditor'));
  const toolbar = document.getElementById('bodyEditorToolbar');
  // 이미지는 코멘트에서도 쓸 수 있으므로 도구모음 전체를 비활성으로 표시하지 않는다.
  if(toolbar) toolbar.setAttribute('aria-disabled', 'false');
  BODY_ONLY_TOOL_IDS.forEach(id => {
    const button = document.getElementById(id);
    if(button) button.disabled = commentActive;
  });
  const imageButton = document.getElementById('insertImgBtn');
  if(imageButton) imageButton.disabled = false;
}

// 일반 본문·대사·인용문·메모 안에서 Shift+Enter를 누르면 저장 원문에 [BR]을 남긴다.
// 인용문도 다음 원문 줄에 `>`를 자동으로 붙이지 않는다. MosaicRenderer.combineSoftBreakPair가
// 앞줄의 인용 문맥을 이어받으므로 [C]와 함께 써도 한 인용 블록으로 안전하게 출력된다.
// 구조 문법 줄과 빈 줄에서는 브라우저 기본 줄바꿈을 유지한다.
function handleSoftBreakKeydown(e){
  if(e.isComposing || e.keyCode === 229 || e.key !== 'Enter' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  const ta = e.currentTarget;
  if(!ta || typeof ta.selectionStart !== 'number') return;
  const value = ta.value;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  // 여러 원문 줄을 한 번에 선택한 경우에는 구조 문법까지 지울 수 있으므로
  // 자동 [BR] 치환을 하지 않고 브라우저의 일반 줄바꿈 동작을 유지한다.
  if(value.slice(start, end).includes('\n')) return;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = value.indexOf('\n', end);
  if(lineEnd < 0) lineEnd = value.length;
  const currentLine = value.slice(lineStart, lineEnd).replace(/\[BR\]\s*$/i, '');
  const semanticCurrentLine = currentLine.replace(/^\s*\[C\]\s*/i, '');
  const isQuoteLine = /^\s*>(?!>)\s?\S/.test(semanticCurrentLine);
  const raw = value.slice(0,lineStart).split('\n').length-1;
  const isMemoLine = !!MosaicParser.bodyCommentLineContexts(value)[raw]?.content.replace(/\[BR\]\s*$/i,'').trim();
  if(!currentLine.trim() || (MosaicRenderer.isStructuralBodyLine(currentLine) && !isQuoteLine && !isMemoLine)) return;
  e.preventDefault();
  ta.focus();
  ta.setSelectionRange(start, end);
  const insertion = '[BR]\n';
  let inserted = false;
  try { inserted = document.execCommand('insertText', false, insertion); } catch(err){ inserted = false; }
  if(!inserted){
    ta.setRangeText(insertion, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles:true }));
  }
}

// 코멘트에는 카드 구조 문법이 없으므로 구조 줄 판별 없이 [BR] 줄바꿈만 허용한다.
// 빈 줄과 여러 줄 선택은 일반 Enter 동작을 유지해 예기치 않은 범위 치환을 막는다.
function handleCommentSoftBreakKeydown(e){
  if(e.isComposing || e.keyCode === 229 || e.key !== 'Enter' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  const ta = e.currentTarget;
  if(!ta || typeof ta.selectionStart !== 'number') return;
  const value = ta.value;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  if(value.slice(start, end).includes('\n')) return;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const currentLine = value.slice(lineStart, start).replace(/\[BR\]\s*$/i, '');
  if(!currentLine.trim()) return;
  e.preventDefault();
  ta.focus();
  ta.setSelectionRange(start, end);
  let inserted = false;
  try { inserted = document.execCommand('insertText', false, '[BR]\n'); } catch(err){ inserted = false; }
  if(!inserted){
    ta.setRangeText('[BR]\n', start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles:true }));
  }
}

// 카드 입력창에 붙인 관찰자를 정리한 뒤 DOM을 비워, 반복 불러오기·초기화 시
// 제거된 카드가 메모리에 남거나 뒤늦은 크기 콜백이 실행되지 않게 한다.
function disposeCardEditor(ed){
  if(!ed) return;
  if(cardEditorState.actionMenuEditor === ed) closeCardActionMenu();
  const observer = ed._widthObserver;
  if(observer && typeof observer.disconnect === 'function') observer.disconnect();
  delete ed._widthObserver;
}

function clearCardEditors(){
  const container = host.uiElements.cardEditors;
  Array.from(container.children).forEach(disposeCardEditor);
  container.replaceChildren();
  syncBodyInputCount(0, 0);
  syncBriefViewButton();
}

// 상단 탭 헤더의 실제 높이를 따라가 툴바가 그 아래에 정확히 붙도록 한다.
function syncBodyToolbarStickyOffset(){
  const sidebar = document.getElementById('sidebar');
  const sidebarTop = document.getElementById('sidebarTop');
  if(!sidebar || !sidebarTop) return;
  // 상단 탭과 편집 도크를 바로 이어 붙여, 스크롤된 본문이 틈 사이로 비치지 않게 한다.
  sidebar.style.setProperty('--body-toolbar-sticky-top', `${Math.round(sidebarTop.getBoundingClientRect().height)}px`);
}

function bindCardToolbarLayoutEvents(){
  host.bindUIFeatureEvents('card-toolbar-layout', () => {
    if(typeof ResizeObserver === 'function'){
      cardEditorState.toolbarHeaderObserver = new ResizeObserver(syncBodyToolbarStickyOffset);
      cardEditorState.toolbarHeaderObserver.observe(document.getElementById('sidebarTop'));
    }
    window.addEventListener('resize', syncBodyToolbarStickyOffset);
  });
}

function readEditorCard(ed){
  const textarea = ed.querySelector('textarea');
  const body = textarea.value;
  const visible = ed.dataset.outputVisible !== 'false';
  if(ed.dataset.blockType === 'comment') return { type:'comment', body, visible };
  const fold = ed.querySelector('.cardFoldChk');
  const title = ed.querySelector('.foldTitleInput');
  const outputRuleExclusions = host.sourceMap.editorOutputRuleExclusions(textarea);
  const parallelExclusions = host.sourceMap.editorParallelExclusions(textarea);
  return {
    type:'card',body,
    folded:!!(fold && fold.checked),
    foldTitle:title ? title.value : '',
    cardTitle:title ? title.value : '',
    visible,
    ...(ed.dataset.bodyCenter === 'true' ? {bodyCenter:true} : {}),
    ...(outputRuleExclusions.length ? {outputRuleExclusions:outputRuleExclusions.map(item => ({...item}))} : {}),
    ...(parallelExclusions.length ? {parallelExclusions:parallelExclusions.map(item => ({...item}))} : {})
  };
}

function getCards(){
  return Array.from(document.querySelectorAll('#cardEditors .cardEditor')).map(readEditorCard);
}

function syncBodyInputCount(cardCount, commentCount){
  const summary = document.getElementById('bodyInputSummary');
  const text = `카드 ${cardCount}개${commentCount ? ` · 코멘트 ${commentCount}개` : ''}`;
  if(summary && summary.textContent !== text) summary.textContent = text;
}

function renumberCards(){
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  const cardEditors = editors.filter(ed => ed.dataset.blockType !== 'comment');
  let cardNumber = 0;
  let commentNumber = 0;
  editors.forEach(ed => {
    const isComment = ed.dataset.blockType === 'comment';
    const index = isComment ? ++commentNumber : ++cardNumber;
    ed.dataset.inputLabel = (isComment ? '코멘트 ' : '카드 ') + index;
    syncCardEditorHeader(ed);
    const ta = ed.querySelector('textarea');
    if(ta) ta.setAttribute('aria-label', `${isComment ? '코멘트' : '카드'} ${index} 본문`);
    // 카드가 1장뿐이면 삭제 버튼 숨김
    const deleteButton = ed.querySelector('.delCardBtn');
    if(deleteButton) deleteButton.style.display = isComment || cardEditors.length > 1 ? '' : 'none';
  });
  // 카드 구조가 바뀐 시점에만 코멘트 배치 버튼의 활성 여부를 갱신한다.
  syncBodyInputCount(cardNumber, commentNumber);
  host.syncParagraphSettingsUI();
  syncBriefViewButton();
}

function syncCardEditorHeader(editor){
  const number = editor.querySelector('.cardNum');
  const isComment = editor.dataset.blockType === 'comment';
  const compact = editor.classList.contains('isCollapsed');
  const title = compact && !isComment ? editor.querySelector('.foldTitleInput').value.trim() : '';
  const label = title || editor.dataset.inputLabel || (isComment ? '코멘트' : '카드');
  number.textContent = label + (editor.dataset.outputVisible === 'false' ? ' · 숨김' : '');
  const noun = isComment ? '코멘트' : '카드';
  const collapse = editor.querySelector('.collapseCtl');
  collapse.setAttribute('aria-label', `${noun} 입력창 ${compact ? '펼치기' : '최소화'}`);
  collapse.title = `${noun} 입력창 ${compact ? '펼치기' : '최소화'} (출력에는 영향 없음)`;
  editor.querySelector('.cardEditorHead').title = compact
    ? `제목 줄을 누르면 입력 ${noun} 펼치기 · 끌어서 순서 변경` : '헤더를 끌어서 카드·코멘트 순서 변경';
  if(isComment && !compact){
    ['role','tabindex','title','aria-label','aria-expanded'].forEach(attribute => number.removeAttribute(attribute));
    return;
  }
  number.setAttribute('role', 'button');
  number.tabIndex = 0;
  const action = compact ? `${number.textContent} · 입력 ${noun} 펼치기` : '미리보기에서 이 카드 위치 보기';
  number.title = action;
  number.setAttribute('aria-label', action);
  if(compact) number.setAttribute('aria-expanded', 'false');
  else number.removeAttribute('aria-expanded');
}

function activateCardEditorHeader(editor){
  if(editor.classList.contains('isCollapsed')){
    if(cardEditorDragState.editor) return;
    closeCardActionMenu();
    editor.querySelector('.collapseCtl').click();
    return;
  }
  if(editor.dataset.blockType !== 'comment') host.scrollPreviewToCardEditor(editor);
}

// 입력창만 정리하는 임시 보기다. 출력·접기 카드 설정과 저장/실행 취소는 바꾸지 않는다.
function syncBriefViewButton(){
  if(cardEditorState.briefViewBatching) return;
  const button = document.getElementById('briefViewBtn');
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  const compact = editors.length > 0 && editors.every(editor => editor.classList.contains('isCollapsed'));
  button.disabled = editors.length === 0;
  button.textContent = compact ? '펼치기' : '최소화';
  button.setAttribute('aria-pressed', String(compact));
  button.setAttribute('aria-label', compact ? '입력 카드와 코멘트 모두 펼치기' : '입력 카드와 코멘트 모두 최소화');
  button.title = compact ? '입력 카드와 코멘트를 모두 펼치기 (출력에는 영향 없음)'
    : '입력 카드와 코멘트를 모두 최소화 (출력에는 영향 없음)';
}

function toggleBriefView(){
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  const expand = editors.length > 0 && editors.every(editor => editor.classList.contains('isCollapsed'));
  closeCardActionMenu();
  cardEditorState.briefViewBatching = true;
  try{
    editors.forEach(editor => {
      if(editor.classList.contains('isCollapsed') === expand) editor.querySelector('.collapseCtl').click();
    });
  }finally{
    cardEditorState.briefViewBatching = false;
    syncBriefViewButton();
  }
}

// 카드와 코멘트가 섞인 실제 편집 순서를 헤더 드래그로 바꾼다.
// 입력창과 헤더의 버튼은 드래그 시작점에서 제외해 편집·클릭 오작동을 막는다.
const cardEditorDragState = {
  editor:null,
  marker:null,
  blockedByControl:false,
  clientY:null,
  autoScrollFrame:null
};

function cardEditorElements(container){
  return Array.from(container.children).filter(child => child.classList && child.classList.contains('cardEditor'));
}

function cardEditorOrderAtMarker(container, dragged, marker){
  const remaining = cardEditorElements(container).filter(editor => editor !== dragged);
  const children = Array.from(container.children);
  const childrenBeforeMarker = children.slice(0, children.indexOf(marker));
  const insertIndex = childrenBeforeMarker.filter(child => child !== dragged && child.classList && child.classList.contains('cardEditor')).length;
  const ordered = remaining.slice();
  ordered.splice(insertIndex, 0, dragged);
  return ordered;
}

function stopCardEditorAutoScroll(){
  if(cardEditorDragState.autoScrollFrame !== null){
    cancelAnimationFrame(cardEditorDragState.autoScrollFrame);
    cardEditorDragState.autoScrollFrame = null;
  }
  cardEditorDragState.clientY = null;
}

function cleanupCardEditorDrag(){
  stopCardEditorAutoScroll();
  if(cardEditorDragState.editor) cardEditorDragState.editor.classList.remove('isEditorDragging');
  if(cardEditorDragState.marker) cardEditorDragState.marker.remove();
  cardEditorDragState.editor = null;
  cardEditorDragState.marker = null;
  cardEditorDragState.blockedByControl = false;
}

function prepareCardEditorDragHandle(head){
  head.draggable = true;
  head.title = '헤더를 끌어서 카드·코멘트 순서 변경';
}

function positionCardEditorDropMarker(clientY){
  const dragged = cardEditorDragState.editor;
  const marker = cardEditorDragState.marker;
  if(!dragged || !marker) return;
  const candidates = cardEditorElements(cardEditorContainer).filter(editor => editor !== dragged);
  const nextEditor = candidates.find(editor => {
    // 본문이 길어도 헤더를 지나면 다음 위치로 이동할 수 있게 한다.
    const head = editor.querySelector('.cardEditorHead') || editor;
    const rect = head.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  if(nextEditor) cardEditorContainer.insertBefore(marker, nextEditor);
  else cardEditorContainer.appendChild(marker);
}

function cardEditorAutoScrollStep(){
  cardEditorDragState.autoScrollFrame = null;
  if(!cardEditorDragState.editor || cardEditorDragState.clientY === null) return;
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;

  const rect = sidebar.getBoundingClientRect();
  const stickyHeader = document.getElementById('sidebarTop');
  const stickyBottom = stickyHeader
    ? Math.max(rect.top, Math.min(rect.bottom, stickyHeader.getBoundingClientRect().bottom))
    : rect.top;
  const edge = Math.min(110, Math.max(68, rect.height * .14));
  const y = cardEditorDragState.clientY;
  let delta = 0;
  if(y < stickyBottom + edge){
    const strength = Math.min(1, Math.max(0, (stickyBottom + edge - y) / edge));
    delta = -Math.ceil(8 + 24 * strength);
  }else if(y > rect.bottom - edge){
    const strength = Math.min(1, Math.max(0, (y - (rect.bottom - edge)) / edge));
    delta = Math.ceil(8 + 24 * strength);
  }

  if(delta){
    const before = sidebar.scrollTop;
    sidebar.scrollTop += delta;
    // 스크롤하는 동안 카드의 화면 좌표가 계속 바뀌므로 표시선도 매 프레임 다시 계산한다.
    if(sidebar.scrollTop !== before) positionCardEditorDropMarker(y);
    cardEditorDragState.autoScrollFrame = requestAnimationFrame(cardEditorAutoScrollStep);
  }
}

function updateCardEditorAutoScroll(clientY){
  cardEditorDragState.clientY = clientY;
  if(cardEditorDragState.autoScrollFrame === null){
    cardEditorDragState.autoScrollFrame = requestAnimationFrame(cardEditorAutoScrollStep);
  }
}

const cardEditorContainer = host.uiElements.cardEditors;

function trackCardEditorDragPointer(event){
  // 헤더 버튼을 누른 채 포인터를 바깥에서 놓아도 draggable 속성이 고착되지 않도록
  // 카드별 속성을 바꾸지 않고 이번 포인터 동작만 컨테이너 상태로 차단한다.
  cardEditorDragState.blockedByControl = !!event.target.closest('.cardEditorHead button, .cardEditorHead input, .cardEditorHead label, .cardEditorHead a, .cardEditorHead select');
}

function startCardEditorDrag(event){
  const head = event.target.closest('.cardEditorHead');
  const editor = head && head.closest('.cardEditor');
  if(!editor || cardEditorDragState.blockedByControl){
    event.preventDefault();
    return;
  }
  // 브라우저가 직전 dragend를 누락했어도 표시선과 흐림 상태를 남기지 않는다.
  closeCardActionMenu();
  cleanupCardEditorDrag();
  cardEditorDragState.editor = editor;
  cardEditorDragState.marker = document.createElement('div');
  cardEditorDragState.marker.className = 'cardEditorDropMarker';
  cardEditorDragState.marker.setAttribute('aria-hidden', 'true');
  editor.classList.add('isEditorDragging');
  if(event.dataTransfer){
    event.dataTransfer.effectAllowed = 'move';
    // Safari는 데이터가 없는 dragstart를 취소할 수 있다.
    event.dataTransfer.setData('text/plain', 'mosaic-log-editor-order');
  }
}

// 카드 목록 위의 고정 헤더까지 포인터를 올려도 dragover를 계속 받아야 위쪽으로
// 자동 스크롤할 수 있다. 컨테이너가 아닌 문서에서 받아 사이드바 내부 동작만 처리한다.
function moveCardEditorDrag(event){
  const dragged = cardEditorDragState.editor;
  const marker = cardEditorDragState.marker;
  if(!dragged || !marker) return;
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;
  const rect = sidebar.getBoundingClientRect();
  const insideSidebar = event.clientX >= rect.left && event.clientX <= rect.right
    && event.clientY >= rect.top && event.clientY <= rect.bottom;
  if(!insideSidebar){
    stopCardEditorAutoScroll();
    return;
  }
  event.preventDefault();
  if(event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  positionCardEditorDropMarker(event.clientY);
  updateCardEditorAutoScroll(event.clientY);
}

function finishCardEditorDrop(event){
  const dragged = cardEditorDragState.editor;
  const marker = cardEditorDragState.marker;
  if(!dragged || !marker || !marker.isConnected){
    cleanupCardEditorDrag();
    return;
  }
  event.preventDefault();

  const before = cardEditorElements(cardEditorContainer);
  const intended = cardEditorOrderAtMarker(cardEditorContainer, dragged, marker);
  const changed = before.length === intended.length && before.some((editor, index) => editor !== intended[index]);
  if(changed){
    host.snapshotCards();
    const anchor = marker.nextElementSibling;
    cardEditorContainer.insertBefore(dragged, anchor);
    renumberCards();
    host.uiUpdateEffects.committedChange();
    const kind = dragged.dataset.blockType === 'comment' ? '코멘트' : '카드';
    host.showUndoToast(`${kind} 순서 변경.`);
  }
  cleanupCardEditorDrag();
}

function bindCardEditorDragEvents(){
  host.bindUIFeatureEvents('card-editor-drag', () => {
    cardEditorContainer.addEventListener('pointerdown', trackCardEditorDragPointer);
    document.addEventListener('pointerup', () => { cardEditorDragState.blockedByControl = false; });
    document.addEventListener('pointercancel', () => { cardEditorDragState.blockedByControl = false; });
    cardEditorContainer.addEventListener('dragstart', startCardEditorDrag);
    document.addEventListener('dragover', moveCardEditorDrag);
    cardEditorContainer.addEventListener('drop', finishCardEditorDrop);
    // 위쪽 자동 스크롤 구역이 카드 컨테이너 밖의 고정 헤더까지 확장되므로,
    // 그 위치에서 놓아도 현재 표시선에 정상적으로 정렬을 확정한다.
    document.getElementById('sidebar').addEventListener('drop', finishCardEditorDrop);
    cardEditorContainer.addEventListener('dragend', cleanupCardEditorDrag);
  });
}

const AUTO_EXPAND_ICON_MARKUP = '<svg class="autoExpandIcon" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="M4 2.75h10M4 15.25h10M9 5.5v7M6.75 7.75 9 5.5l2.25 2.25M6.75 10.25 9 12.5l2.25-2.25"/></svg>';

function afterEditorLiveInput(){
  host.uiUpdateEffects.liveInput();
}

function afterEditorControlChange(){
  host.uiUpdateEffects.controlChange();
}

function afterEditorStructureChange(){
  host.uiUpdateEffects.committedChange();
}

function setupAutoExpandTextarea(editor, textarea, button, minimumHeight, accessibleName = '입력창'){
  const resize = () => {
    if(!textarea.classList.contains('isAutoExpanded') || getComputedStyle(textarea).display === 'none') return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(minimumHeight, textarea.scrollHeight) + 'px';
    textarea.scrollTop = 0;
  };
  const setExpanded = enabled => {
    textarea.classList.toggle('isAutoExpanded', enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? `${accessibleName} 원래 높이로 되돌리기` : `${accessibleName} 전체 펼치기`);
    button.title = enabled
      ? '입력창을 원래 높이로 되돌리기'
      : '입력창을 본문 전체 높이로 펼쳐 내부 스크롤 없애기';
    if(enabled) requestAnimationFrame(resize);
    else {
      textarea.style.height = '';
      textarea.scrollTop = 0;
    }
  };
  cardEditorState.autoExpandedResizers.set(textarea,resize);
  button.addEventListener('click', () => setExpanded(!textarea.classList.contains('isAutoExpanded')));
  if(typeof ResizeObserver === 'function'){
    let lastWidth = 0;
    const widthObserver = new ResizeObserver(entries => {
      const width = entries[0] ? entries[0].contentRect.width : 0;
      if(Math.abs(width - lastWidth) < 0.5) return;
      lastWidth = width;
      if(textarea.classList.contains('isAutoExpanded')) requestAnimationFrame(resize);
    });
    widthObserver.observe(textarea);
    editor._widthObserver = widthObserver;
  }
  return resize;
}

function createEditorShell(type, visible){
  const isComment = type === 'comment';
  const noun = isComment ? '코멘트' : '카드';
  const ed = document.createElement('div');
  ed.className = isComment ? 'cardEditor commentEditor' : 'cardEditor';
  ed.dataset.blockType = type;
  ed.dataset.outputVisible = String(visible);

  const head = document.createElement('div');
  head.className = 'cardEditorHead';
  prepareCardEditorDragHandle(head);
  const left = document.createElement('div');
  left.className = 'headLeft';
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'miniCtl collapseCtl';
  collapseBtn.title = `${noun} 입력창 최소화 (출력에는 영향 없음)`;
  collapseBtn.setAttribute('aria-expanded', 'true');
  collapseBtn.setAttribute('aria-label', `${noun} 입력창 최소화`);
  const visibilityBtn = document.createElement('button');
  visibilityBtn.type = 'button';
  visibilityBtn.className = 'miniCtl visibilityCtl';
  visibilityBtn.innerHTML = '<span class="visibilityIcon visibilityVisibleIcon" aria-hidden="true">○</span><span class="visibilityIcon visibilityHiddenIcon" aria-hidden="true">⊘</span>';
  const num = document.createElement('span');
  num.className = 'cardNum';
  if(!isComment){
    num.dataset.positionLink = 'true';
    num.dataset.cardAction = 'show-preview';
    num.tabIndex = 0;
    num.setAttribute('role', 'button');
    num.title = '미리보기에서 이 카드 위치 보기';
    num.setAttribute('aria-label', '미리보기에서 이 카드 위치 보기');
  }
  left.append(collapseBtn, visibilityBtn, num);

  const right = document.createElement('div');
  right.className = 'headRight';
  const arrowGroup = document.createElement('span');
  arrowGroup.className = 'arrowGroup';
  const upBtn = document.createElement('button');
  upBtn.type = 'button';
  upBtn.className = 'miniCtl itemMoveBtn';
  upBtn.textContent = '↑';
  upBtn.title = `${noun}를 위로`;
  upBtn.setAttribute('aria-label', `${noun}를 위로 이동`);
  const downBtn = document.createElement('button');
  downBtn.type = 'button';
  downBtn.className = 'miniCtl itemMoveBtn';
  downBtn.textContent = '↓';
  downBtn.title = `${noun}를 아래로`;
  downBtn.setAttribute('aria-label', `${noun}를 아래로 이동`);
  arrowGroup.append(upBtn, downBtn);

  const autoExpandBtn = document.createElement('button');
  autoExpandBtn.type = 'button';
  autoExpandBtn.className = 'miniCtl autoExpandBtn';
  autoExpandBtn.innerHTML = AUTO_EXPAND_ICON_MARKUP;
  autoExpandBtn.title = '입력창을 본문 전체 높이로 펼쳐 내부 스크롤 없애기';
  autoExpandBtn.setAttribute('aria-label', `${isComment ? '코멘트 ' : ''}입력창 전체 펼치기`);
  autoExpandBtn.setAttribute('aria-pressed', 'false');
  right.append(arrowGroup, autoExpandBtn);

  let fsBtn = null;
  if(!isComment){
    fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.className = 'miniCtl fsBtn';
    fsBtn.innerHTML = '<svg class="cardFullscreenIcon" viewBox="0 0 16 16" fill="none" focusable="false"><path d="M6 2H2v4 M10 2h4v4 M14 10v4h-4 M6 14H2v-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="square" stroke-linejoin="miter"/></svg>';
    fsBtn.title = '이 카드를 전체 화면으로 크게 편집';
    fsBtn.setAttribute('aria-label', '카드 전체 화면 편집');
    fsBtn.dataset.cardAction = 'fullscreen';
    right.appendChild(fsBtn);
  }
  head.append(left, right);
  return { ed, head, right, collapseBtn, visibilityBtn, num, upBtn, downBtn, autoExpandBtn, fsBtn };
}

function createEditorDeleteButton(type){
  const isComment = type === 'comment';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'delCardBtn';
  button.title = `이 ${isComment ? '코멘트' : '카드'} 삭제`;
  button.setAttribute('aria-label', `${isComment ? '코멘트' : '카드'} 삭제`);
  return button;
}

function syncEditorVisibilityUI(editor, button, type){
  const visible = editor.dataset.outputVisible !== 'false';
  const noun = type === 'comment' ? '코멘트' : '카드';
  editor.classList.toggle('isOutputHidden', !visible);
  button.classList.toggle('isHidden', !visible);
  button.setAttribute('aria-pressed', String(!visible));
  button.setAttribute('aria-label', visible ? `${noun} 출력 숨기기` : `${noun} 출력 다시 표시`);
  button.title = visible
    ? (type === 'comment' ? '미리보기와 출력 HTML에서 숨기기' : '이 카드를 미리보기와 출력 HTML에서 숨기기')
    : (type === 'comment' ? '출력 다시 표시' : '숨긴 카드를 미리보기와 출력 HTML에 다시 표시');
}

function moveEditorBySibling(editor, direction, message){
  const sibling = direction < 0 ? editor.previousElementSibling : editor.nextElementSibling;
  if(!sibling) return;
  host.snapshotCards();
  if(direction < 0) editor.parentNode.insertBefore(editor, sibling);
  else editor.parentNode.insertBefore(sibling, editor);
  renumberCards();
  afterEditorControlChange();
  host.scrollCardIntoSidebar(editor, null, {alignStart:true});
  host.showUndoToast(message);
}

function deleteEditor(editor, textarea, message){
  host.snapshotCards();
  const focusEditor = editor.nextElementSibling || editor.previousElementSibling;
  if(cardEditorState.activeTextarea === textarea) cardEditorState.activeTextarea = null;
  disposeCardEditor(editor);
  editor.remove();
  renumberCards();
  afterEditorControlChange();
  if(focusEditor){
    cardEditorState.activeTextarea = focusEditor.querySelector('textarea');
    if(cardEditorState.activeTextarea) cardEditorState.activeTextarea.focus();
  }
  host.showUndoToast(message);
}

function createCardEditor(value){
  // value: 문자열(본문만) 또는 {body, folded, foldTitle/cardTitle, visible, bodyCenter} 객체
  const source = (typeof value === 'object' && value !== null) ? value : { body: value || '', folded: false, foldTitle: '' };
  const data = {
    ...source,
    foldTitle:source.cardTitle !== undefined ? source.cardTitle : (source.foldTitle || ''),
    body:MosaicParser.normalizeBodyHrMarkers(source.body || ''),
    visible:source.visible === undefined ? true : MosaicState.settingFlagOn(source.visible)
  };

  const {
    ed, head, right, collapseBtn, visibilityBtn, upBtn, downBtn, autoExpandBtn, fsBtn
  } = createEditorShell('card', data.visible);
  ed.dataset.editorIdentity = cardIdentity(source);
  ed.dataset.bodyCenter = String(MosaicState.settingFlagOn(data.bodyCenter));
  const duplicateBtn = document.createElement('button');
  duplicateBtn.type = 'button';
  duplicateBtn.className = 'duplicateCardBtn uiButton';
  duplicateBtn.title = '이 카드를 바로 아래에 복제';
  duplicateBtn.setAttribute('aria-label', '카드 복제');
  const foldLabel = document.createElement('label');
  foldLabel.className = 'foldChk';
  const foldChk = document.createElement('input');
  foldChk.type = 'checkbox';
  foldChk.className = 'cardFoldChk';
  foldChk.checked = MosaicState.settingFlagOn(data.folded);
  const foldCheckMark = document.createElement('span');
  foldCheckMark.className = 'cardFoldCheck';
  foldCheckMark.setAttribute('aria-hidden', 'true');
  foldLabel.appendChild(document.createTextNode('카드 접기'));
  foldLabel.append(foldChk, foldCheckMark);
  const del = createEditorDeleteButton('card');

  const actionMenu = document.createElement('div');
  actionMenu.className = 'cardActionMenu';
  actionMenu.id = `cardActionMenu-${++cardEditorState.actionMenuSerial}`;
  actionMenu.hidden = true;
  actionMenu.setAttribute('role', 'group');
  actionMenu.setAttribute('aria-label', '카드 보조 조작');
  const splitButton = document.createElement('button');
  splitButton.type = 'button';
  splitButton.className = 'splitCardBtn uiButton';
  splitButton.setAttribute('aria-label','커서에서 카드 나누기');
  splitButton.innerHTML = '<span class="cardActionIcon" aria-hidden="true"><svg class="cardSplitIcon" viewBox="0 0 16 16" fill="none" focusable="false"><path d="M3 2h10v4H3z M3 10h10v4H3z M1 8h2m3 0h4m3 0h2" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/></svg></span>';
  splitButton.addEventListener('click',() => splitCardAtCursor(ed));
  const centerButton = document.createElement('button');
  centerButton.type = 'button';
  centerButton.className = 'cardBodyCenterBtn uiButton';
  centerButton.dataset.cardAction = 'toggle-body-center';
  centerButton.innerHTML = '<span class="cardActionIcon" aria-hidden="true"><svg class="cardBodyCenterIcon" viewBox="0 0 14 14" fill="none" focusable="false"><path d="M1 3h12 M4 7h6 M1 11h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></span>';
  // 아이콘만 한 줄로 배치한다. 기존 title·aria-label은 안내와 접근성을 위해 유지한다.
  [[upBtn, '↑'], [downBtn, '↓'], [autoExpandBtn, ''],
   [fsBtn, ''], [duplicateBtn, '⧉'], [del, '']].forEach(([button, glyph]) => {
    const icon = document.createElement('span');
    icon.className = 'cardActionIcon';
    icon.setAttribute('aria-hidden', 'true');
    if(button === autoExpandBtn || button === fsBtn) icon.appendChild(button.querySelector('svg'));
    else if(button === del) icon.classList.add('cardDeleteIcon');
    else if(button === upBtn || button === downBtn){
      const path = button === upBtn ? 'M10 17V3 M5 8l5-5 5 5' : 'M10 3v14 M5 12l5 5 5-5';
      icon.innerHTML = `<span class="cardMoveGlyph">${glyph}</span><svg class="cardMoveIcon" viewBox="0 0 20 20" focusable="false"><path d="${path}"/></svg>`;
    }
    else icon.textContent = glyph;
    button.replaceChildren(icon);
  });
  const moveGroup = upBtn.parentElement;
  moveGroup.setAttribute('role', 'group');
  moveGroup.setAttribute('aria-label', '카드 순서 이동');
  actionMenu.append(moveGroup, splitButton, centerButton, autoExpandBtn, fsBtn, duplicateBtn, del);
  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.className = 'miniCtl cardMenuBtn';
  menuButton.textContent = '⋯';
  menuButton.title = '카드 보조 조작';
  menuButton.setAttribute('aria-label', '카드 보조 조작');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-controls', actionMenu.id);
  right.replaceChildren(menuButton);

  // 카드 제목: 접기 여부와 관계없이 항상 표시하며, 접기 카드에서는 summary 제목으로 사용한다.
  const foldTitleInput = document.createElement('input');
  foldTitleInput.type = 'text';
  foldTitleInput.className = 'foldTitleInput';
  foldTitleInput.maxLength = 200;
  foldTitleInput.placeholder = '카드 제목';
  foldTitleInput.setAttribute('aria-label', '카드 제목');
  foldTitleInput.value = data.foldTitle || '';

  const previewFoldButton = document.createElement('button');
  previewFoldButton.type = 'button';
  previewFoldButton.className = 'cardPreviewFoldBtn';
  previewFoldButton.dataset.cardAction = 'toggle-preview-fold';
  previewFoldButton.textContent = '열기';
  previewFoldButton.setAttribute('aria-expanded', 'false');
  previewFoldButton.setAttribute('aria-controls', 'preview');
  previewFoldButton.hidden = true;
  right.prepend(previewFoldButton);

  const ta = document.createElement('textarea');
  ta.value = data.body || '';
  host.sourceMap.attachEditorSource(ta,source);
  ta.placeholder = '이 카드의 본문을 입력...';
  const resizeAutoExpanded = setupAutoExpandTextarea(ed, ta, autoExpandBtn, 200);
  const syncSplitIfOpen = () => {
    if(cardEditorState.actionMenuEditor === ed) syncCardSplitButton(ed);
  };

  const syncVisibilityUi = () => syncEditorVisibilityUI(ed, visibilityBtn, 'card');
  visibilityBtn.addEventListener('click', () => {
    host.snapshotCards();
    const visible = ed.dataset.outputVisible !== 'false';
    ed.dataset.outputVisible = String(!visible);
    syncHiddenEditorCollapse(ed, collapseBtn, visible);
    syncVisibilityUi();
    renumberCards();
    afterEditorControlChange();
    host.buildDocumentNavigator();
    host.showUndoToast(visible ? '카드 출력 숨김.' : '카드 출력 다시 표시.');
  });
  syncVisibilityUi();
  duplicateBtn.addEventListener('click', () => {
    if(!hasEditorCapacity(true)) return;
    host.snapshotCards();
    const clone = createCardEditor({
      body: ta.value,
      folded: foldChk.checked,
      cardTitle: foldTitleInput.value,
      visible: ed.dataset.outputVisible !== 'false',
      bodyCenter: ed.dataset.bodyCenter === 'true',
      outputRuleExclusions:host.sourceMap.editorOutputRuleExclusions(ta),parallelExclusions:host.sourceMap.editorParallelExclusions(ta)
    });
    ed.after(clone);
    renumberCards();
    afterEditorStructureChange();
    const cloneTa = clone.querySelector('textarea');
    if(cloneTa){
      cardEditorState.activeTextarea = cloneTa;
      cloneTa.focus();
      clone.scrollIntoView({ block:'nearest', behavior:'smooth' });
    }
    host.showUndoToast('카드 복제됨.');
  });
  ta.addEventListener('input', () => {
    host.normalizeStandaloneHrInput(ta);
    syncSplitIfOpen();
    // 미리보기 직접 편집이 원문 입력창으로 반영되는 동안에는 현재 미리보기 위치를
    // 유지한다. 왼쪽 입력창에서 직접 타이핑할 때만 기존 위치 연동을 실행한다.
    host.focusPreviewAfterEditorInput(ta);
    afterEditorLiveInput();
    if(ta.classList.contains('isAutoExpanded')) requestAnimationFrame(resizeAutoExpanded);
  });
  ta.addEventListener('keydown', handleSoftBreakKeydown);
  ['select','keyup','pointerup'].forEach(event => ta.addEventListener(event,syncSplitIfOpen));
  ta.addEventListener('compositionstart',() => {
    cardEditorState.composingTextareas.add(ta);
    syncSplitIfOpen();
  });
  ta.addEventListener('compositionend',() => {
    cardEditorState.composingTextareas.delete(ta);
    syncSplitIfOpen();
  });
  ta.addEventListener('focus', () => {
    cardEditorState.activeTextarea = ta;
    syncSplitIfOpen();
    host.decoratePreviewDirectEditors();
  });
  host.bindEditorPositionSyncEvents(ta);

  collapseBtn.addEventListener('click', () => {
    const collapsed = !ed.classList.contains('isCollapsed');
    ta.style.display = collapsed ? 'none' : '';
    ed.classList.toggle('isCollapsed', collapsed);
    collapseBtn.classList.toggle('isCollapsed', collapsed);
    collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    syncCardEditorHeader(ed);
    syncBriefViewButton();
    if(!collapsed && ta.classList.contains('isAutoExpanded')) requestAnimationFrame(resizeAutoExpanded);
  });

  upBtn.addEventListener('click', () => moveEditorBySibling(ed, -1, '카드 순서 변경.'));
  downBtn.addEventListener('click', () => moveEditorBySibling(ed, 1, '카드 순서 변경.'));
  const syncFoldUi = () => {
    ed.classList.toggle('isFolded', foldChk.checked);
    renumberCards();
  };
  let foldUndoPrepared = false;
  const prepareFoldUndo = () => {
    if(foldUndoPrepared) return;
    host.snapshotCards();
    foldUndoPrepared = true;
  };
  foldChk.addEventListener('pointerdown', prepareFoldUndo);
  foldChk.addEventListener('keydown', (e) => { if(e.key === ' ' || e.key === 'Enter') prepareFoldUndo(); });
  foldChk.addEventListener('change', () => {
    syncFoldUi();
    afterEditorControlChange();
    if(foldUndoPrepared) host.showUndoToast(foldChk.checked ? '접기 카드 설정.' : '접기 카드 해제.');
    foldUndoPrepared = false;
  });
  requestAnimationFrame(syncFoldUi);
  del.addEventListener('click', () => {
    const cardCount = document.querySelectorAll('#cardEditors .cardEditor:not(.commentEditor)').length;
    if(cardCount <= 1) return;
    deleteEditor(ed, ta, '카드 삭제됨.');
  });

  // 헤더 아래 회색 줄: 왼쪽=서식 도구(입력창 바로 위), 오른쪽=접기 카드 설정
  const fmt = document.createElement('div');
  fmt.className = 'cardFoldRow cardToolRow';

  const fmtGroup = document.createElement('div');
  fmtGroup.className = 'cardFmtBar';
  [['bold',`선택 부분 굵게 (**…**)  ·  ${host.MOD_KEY}+B`],
   ['emphasis',`선택 부분 강조 (*…*)  ·  ${host.MOD_KEY}+I`],
   ['center',`이 줄 가운데 정렬 ([C])  ·  ${host.MOD_KEY}+E`]].forEach(([f, tip]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fmtBtn';
    btn.dataset.cardFormat = f;
    btn.title = tip;
    btn.innerHTML = f === 'bold' ? '<b>B</b>' : (f === 'emphasis' ? '<i>I</i>' : 'C');
    fmtGroup.appendChild(btn);
  });

  const foldGroup = document.createElement('div');
  foldGroup.className = 'cardFoldGroup';
  foldGroup.appendChild(foldTitleInput);   // 제목이 왼쪽
  foldGroup.appendChild(foldLabel);        // 체크박스가 오른쪽

  fmt.appendChild(fmtGroup);
  fmt.appendChild(foldGroup);

  ed.appendChild(head);
  ed.appendChild(actionMenu);
  syncCardBodyCenterButton(ed);
  ed.appendChild(fmt);
  ed.appendChild(ta);
  if(ed.dataset.outputVisible === 'false') syncHiddenEditorCollapse(ed, collapseBtn, true);
  return ed;
}

function createCommentEditor(value){
  const source = (typeof value === 'object' && value !== null) ? value : { body:value || '' };
  const {
    ed, head, right, collapseBtn, visibilityBtn, upBtn, downBtn, autoExpandBtn
  } = createEditorShell(
    'comment',
    source.visible === undefined ? true : MosaicState.settingFlagOn(source.visible)
  );

  ed.dataset.editorIdentity = cardIdentity(source);
  const ta = document.createElement('textarea');
  ta.value = String(source.body || '');
  ta.placeholder = '카드 사이에 덧붙일 코멘트를 입력...';
  const resizeAutoExpanded = setupAutoExpandTextarea(ed, ta, autoExpandBtn, 96, '코멘트 입력창');
  const del = createEditorDeleteButton('comment');
  right.append(del);
  ed.append(head, ta);

  const syncVisibility = () => syncEditorVisibilityUI(ed, visibilityBtn, 'comment');
  syncVisibility();
  visibilityBtn.addEventListener('click', () => {
    host.snapshotCards();
    ed.dataset.outputVisible = String(ed.dataset.outputVisible === 'false');
    syncHiddenEditorCollapse(ed, collapseBtn, ed.dataset.outputVisible === 'false');
    syncVisibility(); renumberCards(); afterEditorControlChange(); host.buildDocumentNavigator();
    host.showUndoToast(ed.dataset.outputVisible === 'false' ? '코멘트 출력 숨김.' : '코멘트 출력 다시 표시.');
  });
  ta.addEventListener('input', () => {
    host.focusPreviewAfterEditorInput(ta);
    afterEditorLiveInput();
    if(ta.classList.contains('isAutoExpanded')) requestAnimationFrame(resizeAutoExpanded);
  });
  ta.addEventListener('keydown', handleCommentSoftBreakKeydown);
  host.bindEditorPositionSyncEvents(ta);
  ta.addEventListener('focus', () => { cardEditorState.activeTextarea = ta; });
  collapseBtn.addEventListener('click', () => {
    const collapse = !ed.classList.contains('isCollapsed');
    ta.style.display = collapse ? 'none' : '';
    ed.classList.toggle('isCollapsed', collapse);
    collapseBtn.classList.toggle('isCollapsed', collapse);
    collapseBtn.setAttribute('aria-expanded', String(!collapse));
    syncCardEditorHeader(ed);
    syncBriefViewButton();
    if(!collapse && ta.classList.contains('isAutoExpanded')) requestAnimationFrame(resizeAutoExpanded);
  });
  upBtn.addEventListener('click', () => moveEditorBySibling(ed, -1, '코멘트 순서 변경.'));
  downBtn.addEventListener('click', () => moveEditorBySibling(ed, 1, '코멘트 순서 변경.'));
  del.addEventListener('click', () => deleteEditor(ed, ta, '코멘트 삭제됨.'));
  if(ed.dataset.outputVisible === 'false') syncHiddenEditorCollapse(ed, collapseBtn, true);
  return ed;
}

function addCard(value, focus){
  const isComment = value && typeof value === 'object' && value.type === 'comment';
  const ed = isComment ? createCommentEditor(value) : createCardEditor(value);
  host.uiElements.cardEditors.appendChild(ed);
  renumberCards();
  const ta = ed.querySelector('textarea');
  if(focus){ ta.focus(); cardEditorState.activeTextarea = ta; }
  return ta;
}

function bindCardCreationEvents(){
  host.bindUIFeatureEvents('card-creation', () => {
    document.getElementById('briefViewBtn').addEventListener('click', toggleBriefView);
    document.getElementById('addCardBtn').addEventListener('click', () => {
      if(!hasEditorCapacity(true)) return;
      host.snapshotCards();
      addCard('', true);
      afterEditorStructureChange();
      host.showUndoToast('카드 추가됨.');
    });

    document.getElementById('addCommentBtn').addEventListener('click', () => {
      if(!hasEditorCapacity(true)) return;
      host.snapshotCards();
      const activeTextarea = cardEditorState.activeTextarea;
      const activeEditor = activeTextarea && activeTextarea.closest
        ? activeTextarea.closest('#cardEditors .cardEditor')
        : null;
      const editor = createCommentEditor({ type:'comment', body:'', visible:true });
      if(activeEditor) activeEditor.after(editor);
      else host.uiElements.cardEditors.appendChild(editor);
      renumberCards();
      const ta = editor.querySelector('textarea');
      cardEditorState.activeTextarea = ta;
      ta.focus();
      afterEditorStructureChange();
      if(ta) ta.closest('.cardEditor').scrollIntoView({ block:'nearest', behavior:'smooth' });
      host.showUndoToast('코멘트 추가됨.');
    });
  });
}

function activeTextarea(){ return cardEditorState.activeTextarea; }

function setActiveTextarea(textarea){ return cardEditorState.activeTextarea = textarea || null; }

// Editor identity is scoped to the current runtime; it never changes the exported work schema.
let editorIdentitySerial = 0;

function cardIdentity(card){
  return 'editor-' + (++editorIdentitySerial);
}

function captureEditorIdentities(){ return Array.from(host.uiElements.cardEditors.children).map(ed=>ed.dataset.editorIdentity); }

function restoreEditorIdentities(ids){ Array.from(host.uiElements.cardEditors.children).forEach((ed,index)=>{if(ids?.[index])ed.dataset.editorIdentity=ids[index];}); }
return Object.freeze({
EXAMPLE_BODY,
activeTextarea,
addCard,
bindCardCreationEvents,
bindCardEditorDelegatedEvents,
bindCardEditorDragEvents,
bindCardToolbarLayoutEvents,
bodyCardTextareas,
captureEditorIdentities,
clearCardEditors,
closeCardActionMenu,
getCards,
handleSoftBreakKeydown,
restoreEditorIdentities,
setActiveTextarea,
syncBodyOnlyToolbarAvailability,
syncBodyToolbarStickyOffset
});
}

function createFullscreenEditor(host){
// 전체 화면 편집기의 서식 바 (입력창 바로 위)
function bindFullscreenFormatEvents(){
  host.bindUIFeatureEvents('fullscreen-format', () => {
    document.querySelectorAll('.fmtBar[data-scope="fs"] .fmtBtn').forEach(btn => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());  // 선택 유지
      btn.addEventListener('click', () => {
        host.applyTextareaFormat(document.getElementById('fsTextarea'), btn.dataset.tfmt);
      });
    });
  });
}

// ---------- 전체 화면 본문 편집 ----------
// 오버레이의 입력창은 실제 카드 입력창의 '거울'이다. 값이 바뀌면 원본에 그대로 옮기고
// input 이벤트를 흘려보내 미리보기·카운터·자동저장이 평소처럼 동작하게 한다.
function syncMirror(ta){
  if(ta && ta.__mirror && ta.__mirror.isConnected){
    const real = ta.__mirror;
    real.value = ta.value;
    const s = Math.min(ta.selectionStart, real.value.length);
    const e = Math.min(ta.selectionEnd, real.value.length);
    real.setSelectionRange(s, e);
    real.dispatchEvent(new Event('input', { bubbles: true }));
    // 실제 카드의 input 처리에서 구분선 문법 정돈이 일어나면
    // 전체 화면 거울에도 즉시 되비쳐 두 입력창의 값과 커서가 갈라지지 않게 한다.
    if(ta.value !== real.value){
      ta.value = real.value;
      ta.setSelectionRange(real.selectionStart, real.selectionEnd);
    }
  }
}

const fullscreenEditorState = {
  previousActive:null,
  scrollY:0,
  editor:null,
  searchQuery:'',
  searchCurrent:-1,
  searchAt:-1,
  bound:false
};

function setWorkspaceInert(on){
  ['sidebar','previewArea','sidebarResizer'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.inert = !!on;
  });
}

// 전체 화면의 접기 컨트롤과 카드 제목을 실제 카드의 컨트롤과 맞춰줌
function syncFsFold(){
  const titleInput = document.getElementById('fsFoldTitle');
  titleInput.style.display = '';
}

function openFullscreen(realTa, title, editor){
  const fsTa = document.getElementById('fsTextarea');
  fsTa.value = realTa.value;
  fsTa.__mirror = realTa;
  fullscreenEditorState.editor = editor || null;

  // 접기 카드 여부·카드 제목을 그대로 가져옴
  const chk = document.getElementById('fsFoldChk');
  const titleInput = document.getElementById('fsFoldTitle');
  const realChk = fullscreenEditorState.editor && fullscreenEditorState.editor.querySelector('.cardFoldChk');
  const realTitle = fullscreenEditorState.editor && fullscreenEditorState.editor.querySelector('.foldTitleInput');
  chk.checked = !!(realChk && realChk.checked);
  titleInput.value = realTitle ? realTitle.value : '';
  syncFsFold();

  document.getElementById('fsTitle').textContent = title;
  setFsSearchOpen(false);   // 이전 카드의 검색 결과·강조를 지우고 검색 도구는 접힌 상태로 시작
  document.getElementById('fsCheat').open = false;
  const overlay = document.getElementById('fsOverlay');
  overlay.style.display = 'block';
  overlay.setAttribute('aria-hidden', 'false');
  setWorkspaceInert(true);
  // 배경 스크롤 잠금 (위치를 기억했다가 닫을 때 그대로 복원)
  fullscreenEditorState.scrollY = window.scrollY;
  document.body.classList.add('fsLock');
  host.cancelPendingPositionSync();
  // 열기 직전 시작된 부드러운 이동도 현재 위치에서 멈춘다.
  const previewArea = host.uiElements.previewArea;
  previewArea.scrollTo({top:previewArea.scrollTop, left:previewArea.scrollLeft, behavior:'instant'});
  fullscreenEditorState.previousActive = host.cardEditors.activeTextarea();
  host.cardEditors.setActiveTextarea(fsTa); // 툴바 삽입이 전체 화면 입력창을 향하게 함
  fsTa.focus();
  fsTa.setSelectionRange(realTa.selectionStart, realTa.selectionEnd);
  fsTa.scrollTop = realTa.scrollTop;
}

function closeFullscreen(){
  const fsTa = document.getElementById('fsTextarea');
  const overlay = document.getElementById('fsOverlay');
  host.cancelPendingPositionSync();
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden', 'true');
  fullscreenEditorState.editor = null;
  document.body.classList.remove('fsLock');
  setWorkspaceInert(false);
  window.scrollTo(0, fullscreenEditorState.scrollY);
  const previousMirror = fsTa.__mirror;
  const real = previousMirror?.isConnected ? previousMirror : host.cardEditors.bodyCardTextareas()[0] || null;
  fsTa.__mirror = null;
  host.cardEditors.setActiveTextarea(real || fullscreenEditorState.previousActive);
  if(real){
    try { real.focus({ preventScroll: true }); }
    catch(e){ real.focus(); }
  }
}

// 전체 화면 툴바: 사이드바 툴바와 같은 동작을 그대로 호출
const FS_ACTIONS = {
  fold:   () => host.insertIntoBody('[접기 제목]\n\n', '\n\n[/접기]', '접힐 내용', '접기 삽입.'),
  hr:     () => host.insertIntoBody('[HR]', '', '', '구분선 삽입.'),
  hr2:    () => host.insertIntoBody('[HR2]', '', '', '장면 전환 삽입.'),
  hr3:    () => host.insertIntoBody('[HR3]', '', '', '호흡 구분 삽입.'),
  hr4:    () => host.insertIntoBody('[HR4]', '', '', '여백 삽입.'),
  img:    () => host.insertBodyImage(),
  comment:() => host.insertIntoBody(': ', '', '', '메모 삽입.'),
  quote:  () => host.insertIntoBody('> ', '', '인용할 내용', '인용 삽입.'),
  tidy:   () => document.getElementById('tidyBtn').click(),
};

// ---------- 전체 화면 본문 검색 ----------
// textarea가 포커스를 잃으면 selection 색이 사라지는 브라우저가 있어,
// 입력창 뒤 미러 레이어(#fsHl)에 전체 결과와 현재 결과를 직접 칠한다.
function fsScrollToIndex(ta, idx){
  const { top } = host.caretOffsetTop(ta, idx);
  ta.scrollTop = Math.max(0, top - ta.clientHeight / 2);
}

function fsFindHits(q){
  return host.normalizedLiteralOffsets(document.getElementById('fsTextarea').value, q);
}

function fsHlPaint(query, current){
  const ta = document.getElementById('fsTextarea');
  const bd = document.getElementById('fsHl');
  if(!query){
    bd.innerHTML = '';
    ta.classList.remove('fsHlOn');
    return 0;
  }
  // textarea와 미러의 글꼴·자간·패딩을 매번 정확히 맞춰 한글 두 글자 이상도 어긋나지 않게 함
  const cs = getComputedStyle(ta);
  host.SEARCH_HL_PROPS.forEach(p => { bd.style[p] = cs[p]; });
  const r = host.searchHlMarkup(ta.value, query, 0, current);
  bd.innerHTML = r.html;
  bd.scrollTop = ta.scrollTop;
  bd.scrollLeft = ta.scrollLeft;
  ta.classList.add('fsHlOn');
  return r.count;
}

function fsClearSearch(){
  fullscreenEditorState.searchQuery = '';
  fullscreenEditorState.searchCurrent = -1;
  fullscreenEditorState.searchAt = -1;
  const find = document.getElementById('fsFindInput');
  if(find) find.value = '';
  const count = document.getElementById('fsFindCount');
  if(count) count.textContent = '';
  const hl = document.getElementById('fsHl');
  if(hl) fsHlPaint('', -1);
}

// 검색어 입력 직후에는 전체 결과를 회색으로 표시하고, 이동할 때만 현재 결과를 연두로 표시.
function fsFindApply(){
  const ta = document.getElementById('fsTextarea');
  const q = document.getElementById('fsFindInput').value;
  const counter = document.getElementById('fsFindCount');
  fullscreenEditorState.searchQuery = q;
  fullscreenEditorState.searchCurrent = -1;
  fullscreenEditorState.searchAt = -1;
  // 검색창에 포커스가 있을 때 남는 파란 네이티브 선택 영역은 접어 미러 강조와 겹치지 않게 함
  ta.setSelectionRange(ta.selectionStart, ta.selectionStart);
  const hits = fsFindHits(q);
  fsHlPaint(q, -1);
  counter.textContent = !q ? '' : (hits.length ? hits.length + '곳' : '0 / 0');
}

// dir: 1 다음 / -1 이전. 현재 위치는 selection이 아니라 fsHlAt으로 관리해 파란 선택 영역을 만들지 않음.
function fsFindStep(dir, fromIndex){
  const ta = document.getElementById('fsTextarea');
  const counter = document.getElementById('fsFindCount');
  const q = document.getElementById('fsFindInput').value;
  if(!q){ fsClearSearch(); return; }
  const hits = fsFindHits(q);
  if(!hits.length){ fsHlPaint(q, -1); counter.textContent = '0 / 0'; return; }
  const old = hits.indexOf(fullscreenEditorState.searchAt);
  let next;
  if(old < 0 && Number.isFinite(fromIndex)){
    if(dir >= 0){
      next = hits.findIndex(h => h >= fromIndex);
      if(next < 0) next = 0;
    } else {
      next = hits.length - 1;
      while(next >= 0 && hits[next] >= fromIndex) next--;
      if(next < 0) next = hits.length - 1;
    }
  } else {
    next = old < 0 ? (dir >= 0 ? 0 : hits.length - 1)
                   : (old + dir + hits.length) % hits.length;
  }
  const idx = hits[next];
  fsScrollToIndex(ta, idx);
  fullscreenEditorState.searchQuery = q;
  fullscreenEditorState.searchCurrent = next;
  fullscreenEditorState.searchAt = idx;
  fsHlPaint(q, fullscreenEditorState.searchCurrent);
  counter.textContent = (fullscreenEditorState.searchCurrent + 1) + ' / ' + hits.length;
}

// 현재 선택된 일치를 대치하고 다음 일치로 이동.
// execCommand('insertText')를 쓰면 브라우저 기본 되돌리기(Ctrl+Z)가 살아 있고,
// input 이벤트가 자연 발생해 미러 동기화(syncMirror)·미리보기·저장이 평소처럼 동작함.
function fsReplaceCurrent(){
  const ta = document.getElementById('fsTextarea');
  const q = document.getElementById('fsFindInput').value;
  if(!q) return;
  const r = document.getElementById('fsReplInput').value;
  const searchAt = fullscreenEditorState.searchAt;
  const match = MosaicParser.literalMatchRanges(ta.value,q).find(range => range.start === searchAt);
  if(!match){ fsFindStep(1); return; }  // 먼저 현재 항목 표시
  const s = match.start;
  host.snapshotCards();
  ta.focus();
  ta.setSelectionRange(s, match.end);  // 실제 대치 순간에만 잠깐 선택해 브라우저 되돌리기를 유지
  let ok = false;
  try { ok = document.execCommand('insertText', false, r); } catch(e){ ok = false; }
  if(!ok){
    ta.value = ta.value.slice(0, s) + r + ta.value.slice(match.end);
    ta.setSelectionRange(s + r.length, s + r.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  } else syncMirror(ta);
  fullscreenEditorState.searchAt = -1;
  fsFindStep(1, s + r.length);
  host.showUndoToast('1곳 변경.');
}

// 이 카드 전체 대치 (대소문자 무시 — 검색과 동일 기준)
function fsReplaceAll(){
  const ta = document.getElementById('fsTextarea');
  const counter = document.getElementById('fsFindCount');
  const q = document.getElementById('fsFindInput').value;
  if(!q) return;
  const r = document.getElementById('fsReplInput').value;
  const matches = MosaicParser.literalMatchRanges(ta.value,q);
  if(!matches.length){ counter.textContent = '0 / 0'; return; }
  host.snapshotCards();
  let newVal = '', from = 0;
  matches.forEach(match => {
    newVal += ta.value.slice(from,match.start) + r;
    from = match.end;
  });
  newVal += ta.value.slice(from);
  ta.focus();
  ta.setSelectionRange(0, ta.value.length);
  let ok = false;
  try { ok = document.execCommand('insertText', false, newVal); } catch(e){ ok = false; }
  if(!ok || ta.value !== newVal){
    ta.value = newVal;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  } else syncMirror(ta);
  ta.setSelectionRange(0, 0);
  ta.scrollTop = 0;
  fullscreenEditorState.searchAt = -1;
  fullscreenEditorState.searchCurrent = -1;
  fsHlPaint(q, -1);
  counter.textContent = matches.length + '곳 변경';
  host.showUndoToast(matches.length + '곳 변경.');
}

function setFsSearchOpen(open, focusInput){
  const panel = document.getElementById('fsPanel');
  const toggle = document.getElementById('fsSearchToggle');
  panel.classList.toggle('fsSearchOpen', !!open);
  toggle.setAttribute('aria-expanded', String(!!open));
  document.getElementById('fsSearchBar').setAttribute('aria-hidden', String(!open));
  toggle.setAttribute('aria-label', open ? '검색·대치 닫기' : '검색·대치 열기');
  toggle.title = open ? '검색·대치 닫기 (Esc)' : '검색·대치 열기 (Ctrl+F)';
  if(!open){ fsClearSearch(); return; }
  if(focusInput){
    const input = document.getElementById('fsFindInput');
    input.focus(); input.select();
  }
}

function bindFullscreenTextareaEvents(overlay, textarea){
  // 입력창이 아닌 곳의 휠은 뒤쪽 작업 화면까지 전달하지 않는다.
  overlay.addEventListener('wheel', event => {
    if(!event.target.closest('#fsTextarea')) event.preventDefault();
  }, { passive:false });

  textarea.addEventListener('input', function(){
    host.normalizeStandaloneHrInput(this);
    syncMirror(this);
    if(fullscreenEditorState.searchQuery){
      fsHlPaint(fullscreenEditorState.searchQuery, fullscreenEditorState.searchCurrent);
    }
  });
  textarea.addEventListener('keydown', host.cardEditors.handleSoftBreakKeydown);
  textarea.addEventListener('scroll', function(){
    const highlight = document.getElementById('fsHl');
    highlight.scrollTop = this.scrollTop;
    highlight.scrollLeft = this.scrollLeft;
  });
  host.bindEditorPositionSyncEvents(textarea);
}

function bindFullscreenFoldEvents(foldCheckbox, foldTitle){
  // 접기 카드 설정을 실제 카드 컨트롤에 옮기고 기존 change/input 흐름을 유지한다.
  foldCheckbox.addEventListener('change', function(){
    syncFsFold();
    if(!fullscreenEditorState.editor) return;
    host.snapshotCards();
    const realCheckbox = fullscreenEditorState.editor.querySelector('.cardFoldChk');
    realCheckbox.checked = this.checked;
    realCheckbox.dispatchEvent(new Event('change', { bubbles:true }));
    host.showUndoToast(this.checked ? '접기 카드 설정.' : '접기 카드 해제.');
  });
  foldTitle.addEventListener('input', function(){
    if(!fullscreenEditorState.editor) return;
    const realTitle = fullscreenEditorState.editor.querySelector('.foldTitleInput');
    realTitle.value = this.value;
    realTitle.dispatchEvent(new Event('input', { bubbles:true }));
  });
}

function bindFullscreenOverlayEvents(overlay){
  document.getElementById('fsCloseBtn').addEventListener('click', closeFullscreen);
  overlay.addEventListener('mousedown', event => {
    if(event.target === overlay) closeFullscreen();
  });
  document.addEventListener('keydown', event => {
    if(event.isComposing || event.keyCode === 229) return;
    if(event.key === 'Escape' && overlay.style.display === 'block'){
      event.preventDefault();
      closeFullscreen();
    }
  });
}

function bindFullscreenToolbarEvents(textarea){
  document.getElementById('fsToolbar').addEventListener('mousedown', event => {
    if(event.target.closest('button[data-fs]')) event.preventDefault();
  });
  document.getElementById('fsToolbar').addEventListener('click', event => {
    const button = event.target.closest('button[data-fs]');
    if(!button) return;
    const action = FS_ACTIONS[button.dataset.fs];
    if(action) action();
    if(button.dataset.fs === 'tidy' && textarea.__mirror) textarea.value = textarea.__mirror.value;
    textarea.focus();
  });
}

function bindFullscreenSearchEvents(){
  const input = document.getElementById('fsFindInput');
  const repl = document.getElementById('fsReplInput');
  input.addEventListener('input', fsFindApply);
  input.addEventListener('compositionend', fsFindApply);
  const onEsc = (e) => {
    // 검색만 닫고 전체 화면 편집기는 유지
    e.preventDefault(); e.stopPropagation();
    setFsSearchOpen(false);
    document.getElementById('fsTextarea').focus();
  };
  input.addEventListener('keydown', (e) => {
    if(e.isComposing || e.keyCode === 229) return;
    if(e.key === 'Enter'){ e.preventDefault(); fsFindStep(e.shiftKey ? -1 : 1); }
    else if(e.key === 'Escape') onEsc(e);
  });
  repl.addEventListener('keydown', (e) => {
    if(e.isComposing || e.keyCode === 229) return;
    if(e.key === 'Enter'){ e.preventDefault(); fsReplaceCurrent(); }
    else if(e.key === 'Escape') onEsc(e);
  });
  const prev = document.getElementById('fsFindPrevBtn');
  const next = document.getElementById('fsFindNextBtn');
  [prev, next].forEach(b => b.addEventListener('mousedown', (e) => e.preventDefault()));  // 포커스 유지
  prev.addEventListener('click', () => fsFindStep(-1));
  next.addEventListener('click', () => fsFindStep(1));
  document.getElementById('fsReplBtn').addEventListener('click', fsReplaceCurrent);
  document.getElementById('fsReplAllBtn').addEventListener('click', fsReplaceAll);
  document.getElementById('fsSearchToggle').addEventListener('click', () => {
    const open = document.getElementById('fsPanel').classList.contains('fsSearchOpen');
    setFsSearchOpen(!open, !open);
  });
}

function bindFullscreenEditorEvents(){
  if(fullscreenEditorState.bound) return;
  fullscreenEditorState.bound = true;

  const overlay = document.getElementById('fsOverlay');
  const textarea = document.getElementById('fsTextarea');
  bindFullscreenTextareaEvents(overlay, textarea);
  bindFullscreenFoldEvents(
    document.getElementById('fsFoldChk'),
    document.getElementById('fsFoldTitle')
  );
  bindFullscreenOverlayEvents(overlay);
  bindFullscreenToolbarEvents(textarea);
  bindFullscreenSearchEvents();
}

function captureFullscreenContext(){
  const textarea = document.getElementById('fsTextarea');
  const overlay = document.getElementById('fsOverlay');
  if(overlay.style.display !== 'block' || !textarea.__mirror) return null;
  const active = overlay.contains(document.activeElement) ? document.activeElement : null;
  return {id:textarea.__mirror.closest('.cardEditor')?.dataset.editorIdentity,
    start:textarea.selectionStart, end:textarea.selectionEnd, scrollTop:textarea.scrollTop,
    searchOpen:document.getElementById('fsPanel').classList.contains('fsSearchOpen'),
    focusId:active?.id, focusStart:active?.selectionStart, focusEnd:active?.selectionEnd};
}

function restoreFullscreenContext(context){
  if(!context) return;
  const editor = Array.from(host.uiElements.cardEditors.children).find(ed => ed.dataset.editorIdentity === context.id);
  if(!editor || editor.dataset.blockType === 'comment'){ closeFullscreen(); return; }
  const textarea = document.getElementById('fsTextarea'), real = editor.querySelector('textarea');
  textarea.__mirror = real; fullscreenEditorState.editor = editor;
  textarea.value = real.value;
  textarea.setSelectionRange(Math.min(context.start,real.value.length), Math.min(context.end,real.value.length));
  textarea.scrollTop = context.scrollTop;
  document.getElementById('fsFoldChk').checked = editor.querySelector('.cardFoldChk').checked;
  document.getElementById('fsFoldTitle').value = editor.querySelector('.foldTitleInput').value;
  document.getElementById('fsTitle').textContent = editor.querySelector('.cardNum')?.textContent || '본문';
  setFsSearchOpen(context.searchOpen);
  if(context.searchOpen) fsFindApply();
  const previousFocus = document.getElementById(context.focusId);
  const focus = previousFocus && document.getElementById('fsOverlay').contains(previousFocus)
    && previousFocus.getClientRects().length ? previousFocus : textarea;
  focus.focus({preventScroll:true});
  if(Number.isInteger(context.focusStart) && typeof focus.setSelectionRange === 'function'){
    focus.setSelectionRange(Math.min(context.focusStart,focus.value.length), Math.min(context.focusEnd,focus.value.length));
  }
  host.cardEditors.setActiveTextarea(textarea);
}
return Object.freeze({
bindFullscreenEditorEvents,
bindFullscreenFormatEvents,
captureFullscreenContext,
closeFullscreen,
fsClearSearch,
openFullscreen,
restoreFullscreenContext,
setFsSearchOpen,
setWorkspaceInert,
syncMirror
});
}

return Object.freeze({createCardEditors,createFullscreenEditor});
})();
