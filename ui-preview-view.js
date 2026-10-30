// 조각로그 UI · 미리보기 배치·도구모음·검색
// 생성 함수만 등록하며, 실행 상태와 기능 연결은 ui.js에서 구성한다.
globalThis.MosaicUIParts.previewView = (() => {
'use strict';

function createPreviewLayout(host){
const previewLayoutState = {fullscreenScrollTop:0,toolbarSyncFrame:null,observers:[]};

// 임시 도구모음은 출력·저장 상태와 분리한다. 기존 DOM을 그대로 띄우며,
// 원래 자리의 높이만 남겨 읽던 본문과 스크롤 위치를 유지한다.
const previewToolbarRevealState = {
  frame:null, entryFrame:null, closeTimer:null, hideTimer:null,
  available:false, open:false, closing:false, pinned:false,
  overHandle:false, overToolbar:false,
  naturalHeight:0, margin:0, padding:0, fitWidth:null, fit:null
};

// 화면에 장식·편집 기능을 붙이기 전의 순수 출력 HTML은 previewRenderState가 보관한다.
// 카드별 복사는 이 문자열에서 꺼내므로 미리보기 전용 버튼이나 편집 속성이 섞이지 않는다.

function copyPreviewCardText(text){
  // file:// 미리보기에서도 동작하도록 동기 복사를 우선하고 Clipboard API를 보조로 쓴다.
  try {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.cssText = 'position:fixed; left:-9999px; top:0; opacity:0; pointer-events:none;';
    document.body.appendChild(temp);
    temp.select();
    temp.setSelectionRange(0, temp.value.length);
    let done = false;
    try { done = document.execCommand('copy'); } catch(e){ done = false; }
    temp.remove();
    if(done){
      if(window.getSelection) window.getSelection().removeAllRanges();
      return Promise.resolve(true);
    }
  } catch(e){ /* Clipboard API로 한 번 더 시도 */ }

  if(navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  return Promise.resolve(false);
}

const PREVIEW_CONTROL_INSET = 8;

const PREVIEW_CONTROL_GAP = 6;

const PREVIEW_CONTROL_SIZE = 27;

const PREVIEW_CONTROL_ICONS = Object.freeze({
  copy:'<path d="M10 5V2H2v8h3"/><rect x="5" y="5" width="8" height="8" rx=".5"/>',
  check:'<path d="m3 8 3 3 7-7"/>',
  error:'<path d="M8 3v6 M8 12h.01"/>',
  up:'<path d="M8 13V3 M4.5 6.5 8 3l3.5 3.5"/>',
  down:'<path d="M8 3v10 M4.5 9.5 8 13l3.5-3.5"/>',
  divider:'<path d="M3 8h10"/>',
  dividerOmitted:'<path d="M3 8h10 M5 12l6-8"/>',
  circle:'<circle cx="8" cy="8" r="4.5"/>',
  circleSlash:'<circle cx="8" cy="8" r="4.5"/><path d="m4.8 11.2 6.4-6.4"/>'
});

function setPreviewControlIcon(button, icon){
  const size = icon === 'divider' || icon === 'dividerOmitted' ? 12 : 14;
  const className = `previewControlIcon${icon === 'dividerOmitted' ? ' previewDividerOmittedIcon' : ''}`;
  button.dataset.previewIcon = icon;
  button.innerHTML = `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PREVIEW_CONTROL_ICONS[icon]}</svg>`;
}

function createPreviewControlButton(className, icon, title){
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `${className} previewFloatingControl`;
  setPreviewControlIcon(button, icon);
  button.title = title;
  button.setAttribute('aria-label', title);
  return button;
}

function createPreviewDividerToggleButton(visible, title){
  return createPreviewControlButton('previewOptionToggleBtn', visible ? 'divider' : 'dividerOmitted', title);
}

function previewElementRect(element, positioningRoot){
  const root = positioningRoot || document.getElementById('previewWrap');
  const rootRect = root.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top - rootRect.top - root.clientTop + root.scrollTop,
    left: rect.left - rootRect.left - root.clientLeft + root.scrollLeft,
    width: rect.width,
    height: rect.height
  };
}

function previewControlGeometry(button, positioningRoot){
  const target = button._mosaicCopyTarget || button._mosaicProfileTarget || button._mosaicOptionTarget;
  const anchor = button._mosaicOptionAnchor || target;
  if(!target || !anchor || !target.isConnected || !anchor.isConnected) return null;
  if(button._mosaicHideWhenCardClosed){
    const closed = anchor.tagName === 'DETAILS' && !anchor.open;
    button.style.display = closed ? 'none' : '';
    if(closed) return null;
  }
  const targetRect = previewElementRect(target, positioningRoot);
  const anchorRect = previewElementRect(anchor, positioningRoot);
  const buttonWidth = button.offsetWidth || PREVIEW_CONTROL_SIZE;
  const buttonHeight = button.offsetHeight || PREVIEW_CONTROL_SIZE;
  const mirrored = host.isDesktopLayoutMirrored();
  const priority = button.classList.contains('previewBlockCopyBtn')
    ? 0
    : (button.classList.contains('previewProfilePlacementBtn') ? 1 : 2);
  let desiredTop = targetRect.top + PREVIEW_CONTROL_INSET;
  if(button._mosaicDividerAtBottom){
    desiredTop = targetRect.top + targetRect.height - buttonHeight / 2;
  }else if(button._mosaicFooterAtCardEnd){
    desiredTop = anchorRect.top + anchorRect.height - PREVIEW_CONTROL_INSET - buttonHeight;
  }else if(button._mosaicFooterTextCenter){
    const style = getComputedStyle(target);
    const topInset = parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth);
    const bottomInset = parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth);
    desiredTop = targetRect.top + (targetRect.height + topInset - bottomInset - buttonHeight) / 2;
  }
  return {
    button,
    priority,
    atDivider:button._mosaicDividerAtBottom === true,
    desiredTop,
    // 왼쪽/오른쪽 카드 조작 버튼은 대상 카드의 가장자리를 따라간다.
    left:mirrored
      ? anchorRect.left + anchorRect.width + PREVIEW_CONTROL_INSET
      : anchorRect.left - PREVIEW_CONTROL_INSET - buttonWidth,
    height:buttonHeight
  };
}

// 구분선 버튼의 위치를 먼저 확보하고 다른 조작 버튼을 겹치지 않게 배치한다.
function positionPreviewControls(controls, minTop){
  const sameColumn = (a, b) => Math.abs(a.left - b.left) < 2;
  const placeDown = (control, obstacles) => {
    let top = Math.max(control.desiredTop, minTop);
    obstacles.filter(previous => sameColumn(previous, control))
      .sort((a, b) => a.top - b.top).forEach(previous => {
        const overlaps = top < previous.bottom + PREVIEW_CONTROL_GAP
          && top + control.height + PREVIEW_CONTROL_GAP > previous.top;
        if(overlaps) top = previous.bottom + PREVIEW_CONTROL_GAP;
      });
    return {...control, top, bottom:top + control.height};
  };
  const fixed = controls.filter(control => control.atDivider)
    .map(control => ({...control, top:control.desiredTop, bottom:control.desiredTop + control.height}));
  const flow = [];
  controls.filter(control => !control.atDivider).forEach(control => flow.push(placeDown(control, fixed.concat(flow))));
  return fixed.concat(flow);
}

function layoutPreviewFloatingButtons(){
  const root = document.getElementById('previewWrap');
  if(!root) return;
  syncPreviewCommentOutset();
  const controls = Array.from(root.querySelectorAll(':scope > .previewFloatingControl'))
    .map(button => previewControlGeometry(button, root))
    .filter(Boolean)
    .sort((a, b) => a.desiredTop - b.desiredTop || a.priority - b.priority);
  const minTop = previewElementRect(host.uiElements.preview, root).top - PREVIEW_CONTROL_INSET;
  positionPreviewControls(controls, minTop).forEach(control => {
    control.button.style.top = `${Math.round(control.top)}px`;
    control.button.style.left = `${Math.round(control.left)}px`;
  });
  host.previewInteractions.layoutOutputRuleMarkers();
}

// 검색창처럼 미리보기 위쪽 형제가 나타나거나 사라지면 대상 카드의 실제 좌표가
// 즉시 달라진다. 현재 프레임과 브라우저가 레이아웃을 확정한 다음 프레임에 한 번씩
// 다시 계산해 외곽 조작 버튼이 이전 좌표에 남지 않도록 한다.
function refreshPreviewFloatingButtonLayout(){
  layoutPreviewFloatingButtons();
  requestAnimationFrame(layoutPreviewFloatingButtons);
}

// 일반 미리보기에서는 카드보다 넓은 게시글 영역을 계산해 기본 코멘트가
// 왼쪽 설정 패널 쪽부터 시작하도록 한다. 전체화면의 모바일 380 미리보기는
// 그 폭 자체가 게시글 viewport이므로 바깥 확장을 적용하지 않는다.
function syncPreviewCommentOutset(){
  const previewArea = host.uiElements.previewArea;
  const previewWrap = document.getElementById('previewWrap');
  const preview = host.uiElements.preview;
  const mobileButton = document.getElementById('widthMobileBtn');
  if(!previewArea || !previewWrap || !preview) return;
  if(document.body.classList.contains('previewFullscreen') && mobileButton && mobileButton.classList.contains('active')){
    preview.style.setProperty('--preview-comment-outset', '0px');
    return;
  }
  const areaRect = previewArea.getBoundingClientRect();
  const wrapRect = previewWrap.getBoundingClientRect();
  const areaStyle = getComputedStyle(previewArea);
  const contentLeft = areaRect.left + (parseFloat(areaStyle.paddingLeft) || 0);
  const contentRight = areaRect.right - (parseFloat(areaStyle.paddingRight) || 0);
  const leftSpace = Math.max(0, wrapRect.left - contentLeft);
  const rightSpace = Math.max(0, contentRight - wrapRect.right);
  const outset = Math.max(0, Math.min(leftSpace, rightSpace));
  preview.style.setProperty('--preview-comment-outset', `${Math.round(outset)}px`);
}

function previewCopySuccessMessage(label){
  const compact = String(label).replace(/카드\s+(\d+)/g, '카드$1');
  return `${compact}의 HTML을 복사했습니다.`;
}

const PREVIEW_COPY_JOIN_TOLERANCE = 2;

// 기능상의 종류가 아니라 화면에서 실제로 맞닿은지를 복사 단위의 기준으로 삼는다.
// 소수점 렌더링 오차는 허용하되, 옆에 놓인 요소나 폭이 크게 다른 요소는 합치지 않는다.
function previewCopyElementsAreAttached(previousElement, nextElement){
  if(!previousElement || !nextElement) return false;
  const previousRect = previousElement.getBoundingClientRect();
  const nextRect = nextElement.getBoundingClientRect();
  const verticalGap = nextRect.top - previousRect.bottom;
  const overlapWidth = Math.max(0,
    Math.min(previousRect.right, nextRect.right) - Math.max(previousRect.left, nextRect.left));
  const narrowerWidth = Math.min(previousRect.width, nextRect.width);
  return verticalGap >= -PREVIEW_COPY_JOIN_TOLERANCE
    && verticalGap <= PREVIEW_COPY_JOIN_TOLERANCE
    && narrowerWidth > 0
    && overlapWidth >= narrowerWidth * 0.8;
}

function previewCopyLabel(labels){
  return labels.filter((label, index, all) => label && all.indexOf(label) === index).join('와 ');
}

function previewTopLevelCopyLabel(element, visibleCardNumbers, visibleCommentNumbers){
  if(element.dataset.mosaicProfile === 'true') return '프로필';
  if(element.dataset.mosaicCoverImage === 'true' || element.dataset.mosaicTitle === 'true') return '표지';
  if(element.dataset.mosaicCredit === 'true') return '크레딧';
  if(element.hasAttribute('data-mosaic-comment-index')){
    const sourceIndex = Number(element.dataset.mosaicCommentIndex);
    return `코멘트 ${visibleCommentNumbers.get(sourceIndex) || 1}`;
  }
  if(element.hasAttribute('data-mosaic-card-index')){
    const sourceIndex = Number(element.dataset.mosaicCardIndex);
    const visibleNumber = visibleCardNumbers.get(sourceIndex);
    return `카드 ${visibleNumber || 1}`;
  }
  return '카드';
}

// previewSourceHTML과 화면의 #preview는 렌더 직후 같은 최상위 자식 순서를 가진다.
// 검색 강조·직접 편집용 속성이 들어간 화면 DOM은 복사하지 않고, 같은 순서의 순수 출력
// 노드를 복사한다. 대표 이미지 인식용 숨김 노드는 최상단 프로필을 건너뛰고
// 실제 대표 이미지 블록과 함께 보존한다.
function previewCopySegments(){
  const preview = host.uiElements.preview;
  if(!host.currentPreviewSourceHTML() || !preview) return [];
  const sourceDocument = new DOMParser().parseFromString(host.currentPreviewSourceHTML(), 'text/html');
  const sourceChildren = Array.from(sourceDocument.body.children);
  const previewChildren = Array.from(preview.children);
  const visibleCardNumbers = new Map(
    host.previewInteractions.previewCardContexts().map((context, index) => [context.sourceIndex, index + 1])
  );
  const visibleCommentNumbers = new Map(
    Array.from(preview.querySelectorAll(':scope > [data-mosaic-comment-index]'))
      .map((element, index) => [Number(element.dataset.mosaicCommentIndex), index + 1])
  );
  const coverImageIndex = sourceChildren.findIndex(element => element.dataset.mosaicCoverImage === 'true');
  const segments = [];
  let pendingHiddenElements = [];
  sourceChildren.forEach((sourceElement, index) => {
    const previewElement = previewChildren[index];
    const hidden = sourceElement.hidden
      || sourceElement.getAttribute('aria-hidden') === 'true'
      || !previewElement
      || previewElement.hidden
      || previewElement.getAttribute('aria-hidden') === 'true';
    if(hidden){
      pendingHiddenElements.push(sourceElement);
      return;
    }
    const keepHiddenForCoverImage = pendingHiddenElements.length
      && coverImageIndex >= 0
      && index < coverImageIndex;
    const sourceHTML = keepHiddenForCoverImage
      ? sourceElement.outerHTML
      : [...pendingHiddenElements.map(element => element.outerHTML), sourceElement.outerHTML].join('\n');
    const html = MosaicRenderer.stripEditorOutputMetadata(
      sourceHTML
    );
    if(!keepHiddenForCoverImage) pendingHiddenElements = [];
    segments.push({
      startElement:previewElement,
      endElement:previewElement,
      labels:[previewTopLevelCopyLabel(sourceElement, visibleCardNumbers, visibleCommentNumbers)],
      html
    });
  });
  if(pendingHiddenElements.length && segments.length){
    const lastSegment = segments[segments.length - 1];
    lastSegment.html += `\n${MosaicRenderer.stripEditorOutputMetadata(pendingHiddenElements.map(element => element.outerHTML).join('\n'))}`;
  }
  return segments;
}

function previewCopyGroups(){
  const groups = [];
  previewCopySegments().forEach(segment => {
    const previous = groups[groups.length - 1];
    if(previous && previewCopyElementsAreAttached(previous.endElement, segment.startElement)){
      previous.endElement = segment.endElement;
      previous.labels.push(...segment.labels);
      previous.htmlParts.push(segment.html);
      return;
    }
    groups.push({
      startElement:segment.startElement,
      endElement:segment.endElement,
      labels:[...segment.labels],
      htmlParts:[segment.html]
    });
  });
  return groups;
}

function addPreviewCopyButton(target, label, getHTML, successMessage){
  if(!target) return;
  const previewWrap = document.getElementById('previewWrap');
  const button = createPreviewControlButton('previewBlockCopyBtn', 'copy', `${label} HTML 복사`);
  button._mosaicCopyTarget = target;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const html = getHTML();
    if(!html){
      setPreviewControlIcon(button, 'error');
      button.classList.add('isError');
      host.showNoticeToast(`${label} HTML을 찾지 못했습니다.`);
      return;
    }
    copyPreviewCardText(html).then(done => {
      button.classList.toggle('isCopied', done);
      button.classList.toggle('isError', !done);
      setPreviewControlIcon(button, done ? 'check' : 'error');
      button.title = done ? `${label} HTML 복사 완료` : '클립보드 권한을 확인해 주세요';
      host.showNoticeToast(done
        ? successMessage
        : '자동 복사가 차단됐습니다. 브라우저의 클립보드 권한을 확인해 주세요.');
      setTimeout(() => {
        if(!button.isConnected) return;
        button.classList.remove('isCopied', 'isError');
        setPreviewControlIcon(button, 'copy');
        button.title = `${label} HTML 복사`;
      }, 1600);
    });
  });
  previewWrap.appendChild(button);
}

function decoratePreviewCopyButtons(){
  previewCopyGroups().forEach(group => {
    const unified = group.startElement.dataset.mosaicUnifiedItem === 'true'
      && group.endElement.dataset.mosaicUnifiedItem === 'true';
    const label = unified ? '이어진 카드' : previewCopyLabel(group.labels);
    addPreviewCopyButton(
      group.startElement,
      label,
      () => {
        const html = group.htmlParts.filter(Boolean).join('\n');
        return html ? `${html}\n<br>` : '';
      },
      previewCopySuccessMessage(label)
    );
  });
  // 접기 상태가 바뀌면 아래 카드의 위치도 달라지므로 외곽 버튼을 다시 맞춘다.
  document.querySelectorAll('#preview details').forEach(detail => {
    detail.addEventListener('toggle', () => requestAnimationFrame(layoutPreviewFloatingButtons));
  });
}

function decoratePreviewProfilePlacementButton(){
  const profile = previewParts().profile;
  if(!profile) return;
  const placement = document.getElementById('profilePlacement');
  if(!placement) return;
  const atTop = placement.value === 'top';
  const title = atTop ? '프로필을 표지 아래로 이동' : '프로필을 최상단 독립으로 이동';
  const button = createPreviewControlButton('previewProfilePlacementBtn', atTop ? 'down' : 'up', title);
  button._mosaicProfileTarget = profile;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    host.snapshotCards();
    const next = placement.value === 'top' ? 'below' : 'top';
    placement.value = next;
    placement.dispatchEvent(new Event('input', { bubbles:true }));
    host.showUndoToast(next === 'top'
      ? '프로필을 최상단 독립으로 이동했습니다.'
      : '프로필을 표지 아래로 이동했습니다.');
  });
  document.getElementById('previewWrap').appendChild(button);
}

function decoratePreviewCreditPlacementButton(){
  const credit = previewParts().credit;
  if(!credit) return;
  const placement = document.getElementById('creditPlacement');
  if(!placement || placement.disabled) return;
  const atTop = MosaicState.normalizeCreditPlacement(placement.value) === 'top';
  const title = atTop ? '크레딧을 최하단으로 이동' : '크레딧을 최상단으로 이동';
  const button = createPreviewControlButton('previewProfilePlacementBtn', atTop ? 'down' : 'up', title);
  button._mosaicProfileTarget = credit;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    host.snapshotCards();
    const next = atTop ? 'bottom' : 'top';
    placement.value = next;
    placement.dispatchEvent(new Event('input', { bubbles:true }));
    host.showUndoToast(next === 'top'
      ? '크레딧을 최상단으로 이동했습니다.'
      : '크레딧을 최하단으로 이동했습니다.');
  });
  document.getElementById('previewWrap').appendChild(button);
}

function addPreviewOptionToggleButton(target, anchor, inputId, label){
  const input = document.getElementById(inputId);
  if(!target || !input) return;
  const title = `${label} 구분선 ${input.checked ? '표시' : '숨김'}`;
  const button = createPreviewDividerToggleButton(!input.checked, title);
  button.setAttribute('aria-pressed', String(input.checked));
  button.dataset.previewOption = inputId;
  button._mosaicOptionTarget = target;
  button._mosaicOptionAnchor = anchor || target;
  button._mosaicDividerAtBottom = true;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    host.snapshotCards();
    const enabled = !input.checked;
    input.checked = enabled;
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
    host.showUndoToast(`${label} 구분선을 ${enabled ? '숨겼습니다.' : '표시했습니다.'}`);
  });
  document.getElementById('previewWrap').appendChild(button);
}

function addPreviewFooterVisibilityButton(){
  const input = document.getElementById('footerOn');
  if(!input) return;
  const cards = previewParts().cards;
  const lastCard = cards[cards.length - 1] || null;
  // 닫힌 카드에서는 버튼을 숨긴다. 펼친 뒤에는 같은 꼬리말 DOM으로 위치를 계산한다.
  const footer = lastCard?.querySelector('[data-mosaic-footer="true"]') || null;
  const anchor = footer ? (footer.closest('[data-mosaic-card-index]') || lastCard) : lastCard;
  if(!anchor) return;

  const visible = input.checked;
  const title = visible ? '꼬리말 숨기기' : '꼬리말 다시 표시';
  const button = createPreviewControlButton(
    'previewOptionToggleBtn',
    visible ? 'circle' : 'circleSlash',
    title
  );
  button.setAttribute('aria-pressed', String(!visible));
  button._mosaicOptionTarget = footer || anchor;
  button._mosaicOptionAnchor = anchor;
  button._mosaicFooterAtCardEnd = !footer;
  button._mosaicFooterTextCenter = Boolean(footer);
  button._mosaicHideWhenCardClosed = true;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    host.snapshotCards();
    input.checked = !visible;
    host.syncCoverControlState();
    input.dispatchEvent(new Event('input', { bubbles:true }));
    host.showUndoToast(input.checked ? '꼬리말을 표시했습니다.' : '꼬리말을 숨겼습니다.');
  });
  document.getElementById('previewWrap').appendChild(button);
}

function addPreviewCardDividerToggleButton(cardEl, titleEl){
  const divider = document.getElementById('foldDividerOn');
  if(!cardEl || !titleEl || !divider) return;
  const title = divider.checked
    ? '모든 카드 제목 구분선 숨기기'
    : '모든 카드 제목 구분선 표시';
  const button = createPreviewDividerToggleButton(divider.checked, title);
  button.setAttribute('aria-pressed', String(!divider.checked));
  button._mosaicOptionTarget = titleEl;
  button._mosaicOptionAnchor = cardEl;
  button._mosaicDividerAtBottom = true;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    host.snapshotCards();
    divider.checked = !divider.checked;
    host.syncDesignSummaries();
    host.uiUpdateEffects.renderedDraftChange();
    host.showUndoToast(divider.checked
      ? '모든 카드 제목 구분선을 표시했습니다.'
      : '모든 카드 제목 구분선을 숨겼습니다.');
  });
  document.getElementById('previewWrap').appendChild(button);
}

function decoratePreviewOptionButtons(){
  const parts = previewParts();
  if(parts.title && !parts.title.hasAttribute('data-mosaic-image-background')
    && parts.title.dataset.mosaicTitleDividerAvailable !== 'false'){
    addPreviewOptionToggleButton(parts.title, parts.title, 'titleMinimal', '표제');
  }
  const nextProfileSection = parts.profile?.nextElementSibling;
  if(parts.profile?.dataset.mosaicProfileDividerAvailable !== 'false'
    && nextProfileSection?.matches('[data-mosaic-title], [data-mosaic-cover-image], [data-mosaic-profile], [data-mosaic-card-index], [data-mosaic-comment-index]')){
    addPreviewOptionToggleButton(parts.profile, parts.profile, 'profileDividerMinimal', '프로필');
  }
  addPreviewFooterVisibilityButton();
  for(const { cardEl } of host.previewInteractions.previewCardContexts()){
    const titleEl = cardEl.tagName === 'DETAILS'
      ? cardEl.querySelector(':scope > summary')
      : cardEl.querySelector(':scope > [data-mosaic-card-title="true"]');
    if(!titleEl) continue;
    addPreviewCardDividerToggleButton(cardEl, titleEl);
    break;
  }
}

function bindPreviewLayoutEvents(){
  host.bindUIFeatureEvents('preview-layout', () => {
    window.addEventListener('resize', () => requestAnimationFrame(layoutPreviewFloatingButtons));
    // 웹폰트 적용, 프로필 줄바꿈, 본문 편집처럼 창 크기 변화 없이 미리보기 높이가
    // 달라지는 경우에도 외곽 복사 버튼을 해당 카드 바깥쪽에 다시 맞춘다.
    if(typeof ResizeObserver === 'function'){
      const observer = new ResizeObserver(() => requestAnimationFrame(layoutPreviewFloatingButtons));
      observer.observe(host.uiElements.preview);
      observer.observe(document.getElementById('pvSearchBox'));
      previewLayoutState.observers.push(observer);
    }
  });
}

// 접기 카드 자체와 카드 안의 일부 접기를 같은 순서로 다룬다.
function previewDetailsForCard(cardEl){
  return [
    ...(cardEl.tagName === 'DETAILS' ? [cardEl] : []),
    ...cardEl.querySelectorAll('details')
  ];
}

function previewFoldDetails(){
  return host.previewInteractions.previewCardContexts().flatMap(ctx => previewDetailsForCard(ctx.cardEl));
}

function syncPreviewFoldControls(){
  const contexts = host.previewInteractions.previewCardContexts();
  const foldCards = contexts.filter(ctx => ctx.cardEl.tagName === 'DETAILS');
  const details = contexts.flatMap(ctx => previewDetailsForCard(ctx.cardEl));
  // 본문 내부의 부분 접기만으로 버튼을 켜지 않는다. 출력되는 접기 카드가 있어야 한다.
  const hasFolds = foldCards.length > 0;
  const visibilityChanged = host.uiElements.previewFoldControls.hidden !== !hasFolds;
  host.uiElements.previewFoldControls.hidden = !hasFolds;
  host.uiElements.previewExpandAll.disabled = !hasFolds || details.every(detail => detail.open);
  host.uiElements.previewCollapseAll.disabled = !hasFolds || details.every(detail => !detail.open);
  document.getElementById('previewToolbar').classList.toggle('previewToolbarHasFolds', hasFolds);
  syncEditorPreviewFoldButtons(foldCards);
  syncPreviewCardNavigator(foldCards);
  if(visibilityChanged) schedulePreviewToolbarSync();
}

// 접기 종류 설정과 입력창 접기는 그대로 두고, 출력되는 카드의 현재 열림만 조작한다.
function syncEditorPreviewFoldButtons(foldCards){
  const cardsByEditor = new Map(foldCards.map(ctx => [ctx.ed, ctx.cardEl]));
  host.uiElements.cardEditors.querySelectorAll('.cardPreviewFoldBtn').forEach(button => {
    const card = cardsByEditor.get(button.closest('.cardEditor'));
    button.hidden = !card;
    button.disabled = !card;
    button.textContent = card?.open ? '접기' : '열기';
    button.setAttribute('aria-expanded', String(!!card?.open));
    const description = `이 카드 미리보기 ${card?.open ? '접기' : '펼치기'}`;
    button.setAttribute('aria-label', description);
    button.title = description;
  });
}

function renderedPreviewFoldForEditor(editor){
  // 입력 직후 같은 프레임에 눌러도 최신 카드 순서·내용을 대상으로 한다.
  if(host.previewRenderPending()) host.uiUpdateEffects.renderNow();
  return host.previewInteractions.previewCardContexts().find(ctx => ctx.ed === editor && ctx.cardEl.tagName === 'DETAILS');
}

function toggleEditorPreviewFold(editor){
  const ctx = renderedPreviewFoldForEditor(editor);
  if(!ctx) return;
  ctx.cardEl.open = !ctx.cardEl.open;
  syncPreviewFoldControls();
  refreshPreviewFloatingButtonLayout();
  if(ctx.cardEl.open && host.positionSyncEnabled()){
    host.scrollPreviewIfNeeded(ctx.cardEl.querySelector(':scope > summary'), true);
  }
}

function closePreviewCardNavigator(restoreFocus = false){
  const wasOpen = !host.uiElements.previewCardNavPanel.hidden;
  host.uiElements.previewCardNavPanel.hidden = true;
  host.uiElements.previewCardNavButton.setAttribute('aria-expanded', 'false');
  if(wasOpen && restoreFocus && !host.uiElements.previewCardNavigator.hidden){
    host.uiElements.previewCardNavButton.focus({preventScroll:true});
  }
  if(wasOpen) schedulePreviewToolbarHide();
}

function syncPreviewCardNavigator(foldCards){
  const root = host.uiElements.previewCardNavigator;
  root.hidden = foldCards.length === 0;
  if(root.hidden) closePreviewCardNavigator();
  const list = host.uiElements.previewCardNavList;
  const previous = new Map(Array.from(list.children).map(item => [item.firstElementChild._mosaicFoldEditor, item]));
  const editors = Array.from(host.uiElements.cardEditors.children).filter(editor => editor.dataset.blockType === 'card');
  foldCards.forEach((ctx, index) => {
    let item = previous.get(ctx.ed);
    previous.delete(ctx.ed);
    if(!item){
      item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button._mosaicFoldEditor = ctx.ed;
      button.append(document.createElement('span'), document.createElement('span'));
      button.firstElementChild.className = 'previewCardNavTitle';
      button.lastElementChild.className = 'previewCardNavState';
      item.appendChild(button);
    }
    const button = item.firstElementChild;
    const number = editors.indexOf(ctx.ed) + 1;
    const sourceTitle = ctx.ed.querySelector('.foldTitleInput').value.trim();
    const title = sourceTitle
      ? host.previewInteractions.previewEditableText(ctx.cardEl.querySelector(':scope > summary')) || `접기 카드 ${number}`
      : `접기 카드 ${number}`;
    button.dataset.previewCardIndex = String(ctx.sourceIndex);
    button.firstElementChild.textContent = title;
    button.lastElementChild.textContent = ctx.cardEl.open ? '펼침' : '접힘';
    button.title = `카드 ${number} · ${title}`;
    button.setAttribute('aria-label', `${title} · 카드 ${number}로 이동`);
    button.dataset.open = String(ctx.cardEl.open);
    // 제목 입력·개별 toggle 중에도 기존 목록 항목의 포커스와 클릭 대상을 보존한다.
    if(list.children[index] !== item) list.insertBefore(item, list.children[index] || null);
  });
  previous.forEach(item => {
    const hadFocus = item.contains(document.activeElement);
    item.remove();
    if(hadFocus && !root.hidden) host.uiElements.previewCardNavButton.focus({preventScroll:true});
  });
}

function jumpToPreviewFoldCard(editor){
  const ctx = renderedPreviewFoldForEditor(editor);
  if(!ctx) return;
  ctx.cardEl.open = true; // 다른 카드와 본문 안의 부분 접기 상태는 바꾸지 않는다.
  syncPreviewFoldControls();
  closePreviewCardNavigator();
  refreshPreviewFloatingButtonLayout();
  const target = ctx.cardEl.querySelector(':scope > summary');
  if(!target) return;
  target.focus({preventScroll:true});
  // 명시적으로 고른 이동은 자동 위치 연동 OFF에서도 동작한다.
  if(isStackedLayout() && !document.body.classList.contains('previewFullscreen')){
    target.scrollIntoView({block:'start', behavior:'smooth'});
  } else {
    const area = host.uiElements.previewArea;
    const top = target.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop - 40;
    area.scrollTo({top:Math.max(0, Math.min(Math.max(0, area.scrollHeight - area.clientHeight), top)), behavior:'smooth'});
  }
}

function setPreviewFoldsOpen(open){
  // 미리보기 DOM만 변경한다. 원문·접기 카드 설정·출력/복사 HTML은 그대로 둔다.
  if(host.uiElements.previewFoldControls.hidden) return;
  previewFoldDetails().forEach(detail => { detail.open = open; });
  syncPreviewFoldControls();
  refreshPreviewFloatingButtonLayout();
}

function bindPreviewFoldEvents(){
  host.bindUIFeatureEvents('preview-fold-controls', () => {
    host.uiElements.previewExpandAll.addEventListener('click', () => setPreviewFoldsOpen(true));
    host.uiElements.previewCollapseAll.addEventListener('click', () => setPreviewFoldsOpen(false));
    const root = host.uiElements.previewCardNavigator;
    const button = host.uiElements.previewCardNavButton;
    const openList = () => {
      if(host.previewRenderPending()) host.uiUpdateEffects.renderNow();
      syncPreviewFoldControls();
      if(root.hidden) return;
      host.cardEditors.closeCardActionMenu();
      host.uiElements.previewCardNavPanel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
    };
    button.addEventListener('click', () => {
      if(host.uiElements.previewCardNavPanel.hidden) openList();
      else closePreviewCardNavigator();
    });
    button.addEventListener('keydown', event => {
      if(!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      openList();
      const items = host.uiElements.previewCardNavList.querySelectorAll('button');
      (event.key === 'ArrowUp' ? items[items.length - 1] : items[0])?.focus();
    });
    host.uiElements.previewCardNavList.addEventListener('click', event => {
      const item = event.target.closest('button');
      if(item) jumpToPreviewFoldCard(item._mosaicFoldEditor);
    });
    host.uiElements.previewCardNavList.addEventListener('keydown', event => {
      if(!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const items = Array.from(host.uiElements.previewCardNavList.querySelectorAll('button'));
      const index = items.indexOf(event.target.closest('button'));
      if(index < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    });
    root.addEventListener('focusout', event => {
      if(event.relatedTarget && !root.contains(event.relatedTarget)) closePreviewCardNavigator();
    });
    document.addEventListener('pointerdown', event => {
      if(!root.contains(event.target)) closePreviewCardNavigator();
    });
    document.addEventListener('keydown', event => {
      if(event.key !== 'Escape' || host.uiElements.previewCardNavPanel.hidden) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closePreviewCardNavigator(true);
    }, true);
    // toggle은 버블링하지 않으므로 루트의 캡처 단계에서 개별 조작도 함께 동기화한다.
    host.uiElements.preview.addEventListener('toggle', event => {
      if(event.target.isConnected && host.uiElements.preview.contains(event.target) && event.target.tagName === 'DETAILS'){
        syncPreviewFoldControls();
        refreshPreviewFloatingButtonLayout();
      }
    }, true);
  });
}

function capturePreviewFoldState(){
  // 입력 카드의 DOM 정체성으로 보관해 순서 변경·삭제 후 다른 카드에 상태가 옮겨가지 않는다.
  const states = new Map();
  host.uiElements.preview.querySelectorAll(':scope > [data-mosaic-card-index]').forEach(card => {
    if(card._mosaicFoldEditor?.isConnected){
      states.set(card._mosaicFoldEditor, {
        cardOpen:card.tagName === 'DETAILS' && card.open,
        inner:Array.from(card.querySelectorAll('details')).map(detail => detail.open)
      });
    }
  });
  return states;
}

function restorePreviewFoldState(states){
  host.previewInteractions.previewCardContexts().forEach(ctx => {
    ctx.cardEl._mosaicFoldEditor = ctx.ed;
    const state = states.get(ctx.ed);
    if(ctx.cardEl.tagName === 'DETAILS' && state?.cardOpen) ctx.cardEl.open = true;
    ctx.cardEl.querySelectorAll('details').forEach((detail, index) => {
      if(state?.inner[index] === true) detail.open = true;
    });
  });
}

function decoratePreviewControls(){
  decoratePreviewCopyButtons();
  decoratePreviewProfilePlacementButton();
  decoratePreviewCreditPlacementButton();
  decoratePreviewOptionButtons();
}

function finishPreviewLayout(preview){
  // 즉시 배치한 뒤 다음 프레임에 한 번 더 보정한다.
  layoutPreviewFloatingButtons();
  requestAnimationFrame(() => {
    layoutPreviewFloatingButtons();
    preview.classList.remove('previewRefreshing');
  });
}

function syncPreviewOuterBreaks(){
  const preview = host.uiElements.preview;
  const option = document.getElementById('copyWithOuterBreaks');
  if(!preview || !option) return;
  preview.classList.toggle('previewOuterBreaks', option.checked);
}

// 미리보기 전체화면: 설정 패널을 숨기고 작업 화면 색상에 맞는 캔버스에서 확인한다.
const previewFullscreenBtn = document.getElementById('previewFullscreenBtn');

function setPreviewFullscreen(on){
  const previewArea = host.uiElements.previewArea;
  if(on) resetPreviewToolbarReveal();
  if(on){
    host.setPreviewArcaTheme(document.documentElement.classList.contains('uiNight') ? 'dark' : 'light');
    previewLayoutState.fullscreenScrollTop = previewArea.scrollTop;
    previewArea.scrollTop = 0;
  }
  document.body.classList.toggle('previewFullscreen', !!on);
  if(on && document.getElementById('widthMobileBtn').classList.contains('active')){
    document.getElementById('previewWrap').style.maxWidth = '380px';
  } else {
    syncDesktopPreviewWidth();
  }
  previewFullscreenBtn.setAttribute('aria-pressed', String(!!on));
  previewFullscreenBtn.querySelector('.fullscreenIcon path')?.setAttribute('d',
    on ? 'M3 3l10 10 M13 3 3 13' : 'M6 2H2v4 M10 2h4v4 M14 10v4h-4 M6 14H2v-4');
  previewFullscreenBtn.title = on ? '전체화면 미리보기 닫기 (Esc)' : '전체화면 미리보기';
  previewFullscreenBtn.setAttribute('aria-label', previewFullscreenBtn.title);
  // 폭 전환이나 출력 HTML의 인라인 효과가 이미 시작됐더라도 즉시 정지시킨다.
  if(typeof previewArea.getAnimations === 'function'){
    try { previewArea.getAnimations({ subtree:true }).forEach(animation => animation.cancel()); }
    catch(e){ /* 구형 브라우저에서는 위 CSS 차단만 적용한다. */ }
  }
  syncPreviewToolbarLabel();
  requestAnimationFrame(() => {
    syncPreviewCommentOutset();
    layoutPreviewFloatingButtons();
  });
  if(!on) requestAnimationFrame(() => {
    previewArea.scrollTop = previewLayoutState.fullscreenScrollTop;
    schedulePreviewToolbarRevealSync();
  });
}

function bindPreviewFullscreenEvents(){
  host.bindUIFeatureEvents('preview-fullscreen', () => {
    previewFullscreenBtn.addEventListener('click', () => {
      setPreviewFullscreen(!document.body.classList.contains('previewFullscreen'));
    });
    document.addEventListener('keydown', (event) => {
      if(event.key === 'Escape' && document.body.classList.contains('previewFullscreen')){
        event.preventDefault();
        setPreviewFullscreen(false);
      }
    });
  });
}

// 미리보기 최상위 구성요소 분류: 이미지 밴드 / 표제 밴드 / 프로필 / 카드들
function previewParts(){
  const preview = host.uiElements.preview;
  const parts = { image: null, title: null, profile: null, credit: null, cards: [], comments: [] };
  Array.from(preview.children).forEach(el => {
    // 대표 이미지 목록 인식용 숨김 썸네일을 표제 밴드로 오인하지 않는다.
    if(el.hidden || el.getAttribute('aria-hidden') === 'true') return;
    if(el.hasAttribute('data-mosaic-comment-index')){ parts.comments.push(el); return; }
    if(el.hasAttribute('data-mosaic-card-index')){ parts.cards.push(el); return; }
    if(el.tagName === 'DETAILS'){ parts.cards.push(el); return; }
    if(el.tagName !== 'DIV') return;                       // 숨김 썸네일 <p>
    if(el.dataset.mosaicProfile === 'true'){ parts.profile = el; return; }
    if(el.dataset.mosaicCredit === 'true'){ parts.credit = el; return; }
    if(el.dataset.mosaicCoverImage === 'true'){ parts.image = el; return; }
    if(el.dataset.mosaicTitle === 'true'){ parts.title = el; return; }
    if(el.style.backgroundImage){ parts.image = el; return; }
    const first = el.firstElementChild;
    if(first && first.tagName === 'DIV') parts.cards.push(el);   // 카드(안쪽 패딩 div)
    else if(!parts.title) parts.title = el;                      // 표제 밴드(<p>들만 가짐)
  });
  return parts;
}

// 세로 배치(모바일)에서는 미리보기로 스크롤하면 입력창이 화면 밖으로 밀려 편집이 불가능해짐.
// CSS의 680px 분기와 같은 기준으로 판단.
function isStackedLayout(){
  return window.matchMedia('(max-width: 680px)').matches;
}

function syncDesktopPreviewWidth(){
  const desktopButton = document.getElementById('widthDesktopBtn');
  if(document.body.classList.contains('previewFullscreen') && (!desktopButton || !desktopButton.classList.contains('active'))) return;
  const cardWidth = parseInt(document.getElementById('cardWidth').value, 10) || 750;
  document.getElementById('previewWrap').style.maxWidth = `${cardWidth}px`;
}

function syncPreviewToolbarRows(toolbar){
  // 현재 줄 배치와 무관하게 같은 한 줄 상태를 측정한다. 글꼴·버튼·접기 표시가
  // 바뀌어도 고정 폭 기준 없이 판단하고, 두 줄 상태의 축소된 폭을 다시 재지 않는다.
  const wasStacked = toolbar.classList.contains('previewToolbarStacked');
  toolbar.classList.remove('previewToolbarStacked');
  const style = getComputedStyle(toolbar);
  const availableWidth = toolbar.clientWidth
    - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  const headerWidth = toolbar.querySelector('.previewHeaderLeft').getBoundingClientRect().width;
  const toolsWidth = toolbar.querySelector('.previewTools').getBoundingClientRect().width;
  const requiredWidth = Math.ceil(headerWidth + toolsWidth + (parseFloat(style.columnGap) || 0));
  // 숨겨진 창처럼 아직 치수를 얻을 수 없는 상태에서는 기존 배치를 유지한다.
  const stacked = availableWidth > 0 && headerWidth > 0 && toolsWidth > 0
    ? requiredWidth > availableWidth : wasStacked;
  toolbar.classList.toggle('previewToolbarStacked', stacked);
  return {requiredWidth, measurable:availableWidth > 0 && headerWidth > 0 && toolsWidth > 0};
}

function syncPreviewToolbarLabel({immediate = false} = {}){
  if(immediate){
    // 좌우반전은 크기가 같아도 좌표가 바뀐다. 다음 프레임을 기다리지 않고
    // 새 배치를 측정하며, 이미 예약된 같은 갱신은 여기서 소비한다.
    if(previewLayoutState.toolbarSyncFrame !== null) cancelAnimationFrame(previewLayoutState.toolbarSyncFrame);
    previewLayoutState.toolbarSyncFrame = null;
    if(previewToolbarRevealState.frame !== null) cancelAnimationFrame(previewToolbarRevealState.frame);
    previewToolbarRevealState.frame = null;
  }
  previewToolbarRevealState.fitWidth = null;
  const toolbar = document.getElementById('previewToolbar');
  const previewArea = host.uiElements.previewArea;
  const areaStyle = getComputedStyle(previewArea);
  const availableWidth = previewArea.clientWidth
    - (parseFloat(areaStyle.paddingLeft) || 0)
    - (parseFloat(areaStyle.paddingRight) || 0);
  // 위쪽 도구모음은 카드 폭 대신 미리보기 영역 폭을 따른다. 카드 폭을 순환해도
  // 버튼의 가로 위치가 바뀌지 않고, 영역 자체가 좁아질 때에만 함께 줄어든다.
  toolbar.style.setProperty('--preview-toolbar-width', `${Math.min(900, Math.max(0, availableWidth))}px`);
  const desktopButton = document.getElementById('widthDesktopBtn');
  const mobileButton = document.getElementById('widthMobileBtn');
  const cycleButton = document.getElementById('previewWidthCycleBtn');
  const cardWidthSelect = document.getElementById('cardWidth');
  const cardWidth = parseInt(cardWidthSelect.value, 10) || 750;
  const desktopLabel = `데스크톱 ${cardWidth}`;
  const mobileLabel = '모바일 380';
  const setLabel = (button, label) => {
    if(button.textContent !== label) button.textContent = label;
  };
  desktopButton.setAttribute('aria-label', desktopLabel);
  mobileButton.setAttribute('aria-label', mobileLabel);
  const fullscreen = document.body.classList.contains('previewFullscreen');
  const toolbarWidth = toolbar.clientWidth;
  if(!fullscreen){
    const widths = Array.from(cardWidthSelect.options).filter(option => !option.disabled);
    const currentIndex = widths.findIndex(option => option.value === cardWidthSelect.value);
    const nextWidth = widths[(currentIndex + 1) % widths.length]?.value || '620';
    setLabel(cycleButton, `${cardWidth}px`);
    cycleButton.setAttribute('aria-label', `본문 폭 ${cardWidth}px, 누르면 ${nextWidth}px로 변경`);
    cycleButton.title = `다음 본문 폭 ${nextWidth}px`;
  } else {
    // 전체화면 폭 표기는 영역 폭으로 결정한 뒤, 해당 표기의 실제 한 줄 폭을 잰다.
    const fullLabels = toolbarWidth >= 830;
    setLabel(desktopButton, fullLabels ? desktopLabel : String(cardWidth));
    setLabel(mobileButton, fullLabels ? mobileLabel : '380');
  }
  syncPreviewToolbarRows(toolbar);
  if(immediate) syncPreviewToolbarReveal();
  else schedulePreviewToolbarRevealSync();
}

function schedulePreviewToolbarSync(){
  if(previewLayoutState.toolbarSyncFrame !== null) return;
  previewLayoutState.toolbarSyncFrame = requestAnimationFrame(() => {
    previewLayoutState.toolbarSyncFrame = null;
    syncPreviewToolbarLabel();
  });
}

function bindPreviewToolbarLayoutEvents(){
  host.bindUIFeatureEvents('preview-toolbar-layout', () => {
    if(typeof ResizeObserver === 'function'){
      const observer = new ResizeObserver(schedulePreviewToolbarSync);
      observer.observe(host.uiElements.previewArea);
      observer.observe(document.getElementById('previewWrap'));
      observer.observe(document.querySelector('#previewToolbar .previewTools'));
      // 두 줄에서는 부모가 display:contents이므로, 글꼴·문구 변화는 버튼도 관찰한다.
      document.querySelectorAll('#previewToolbar button, #previewLabel').forEach(element => observer.observe(element));
      previewLayoutState.observers.push(observer);
    }
    // 전체화면에서 본문은 380px로 고정되어 있어도 도구모음은 창 폭을 따른다.
    // 관찰 중인 본문·도구 폭이 그대로인 채 창만 넓어지는 경우도 다시 계산한다.
    window.addEventListener('resize', schedulePreviewToolbarSync);
  });
}

// ---------- 스크롤로 가려진 미리보기 도구모음 ----------
function clearPreviewToolbarTimer(key){
  const state = previewToolbarRevealState;
  if(state[key] !== null) clearTimeout(state[key]);
  state[key] = null;
}

function finishPreviewToolbarHide(){
  const state = previewToolbarRevealState;
  const toolbar = host.uiElements.previewToolbar;
  clearPreviewToolbarTimer('hideTimer');
  if(state.entryFrame !== null) cancelAnimationFrame(state.entryFrame);
  state.entryFrame = null;
  state.closing = false;
  const wasFloating = toolbar.classList.contains('previewToolbarRevealed');
  toolbar.classList.remove('previewToolbarRevealed', 'previewToolbarEntering', 'previewToolbarClosing');
  if(wasFloating) syncPreviewToolbarRows(toolbar);
  host.uiElements.previewToolbarAnchor.style.removeProperty('height');
}

function closePreviewToolbarReveal(restoreFocus = false, immediate = false){
  const state = previewToolbarRevealState;
  const wasOpen = state.open;
  clearPreviewToolbarTimer('closeTimer');
  if(state.entryFrame !== null) cancelAnimationFrame(state.entryFrame);
  state.entryFrame = null;
  state.open = state.pinned = state.overToolbar = false;
  const handle = host.uiElements.previewToolbarHandle;
  handle.setAttribute('aria-expanded', 'false');
  handle.setAttribute('aria-label', '미리보기 도구 열기');
  if(immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    finishPreviewToolbarHide();
  } else if(wasOpen && !state.closing){
    // 페이드가 끝날 때까지 고정 위치·빈 자리를 유지한다. 다시 열면 취소한다.
    state.closing = true;
    host.uiElements.previewToolbar.classList.remove('previewToolbarEntering');
    host.uiElements.previewToolbar.classList.add('previewToolbarClosing');
    state.hideTimer = setTimeout(() => {
      state.hideTimer = null;
      if(state.closing) finishPreviewToolbarHide();
    }, 180); // transitionend가 오지 않는 숨겨진 창에서도 복귀를 보장한다.
  }
  if(restoreFocus && !handle.hidden) handle.focus({preventScroll:true});
}

function resetPreviewToolbarReveal(){
  closePreviewToolbarReveal(false, true);
  previewToolbarRevealState.available = previewToolbarRevealState.overHandle = false;
  host.uiElements.previewToolbarHandle.hidden = true;
}

function syncPreviewToolbarReveal(){
  const state = previewToolbarRevealState;
  const {previewArea:area, previewToolbar:toolbar, previewToolbarAnchor:anchor,
    previewToolbarHandle:handle} = host.uiElements;
  if(document.body.classList.contains('previewFullscreen') || area.inert){
    resetPreviewToolbarReveal();
    return;
  }
  const viewport = window.visualViewport;
  const viewTop = viewport?.offsetTop || 0, viewLeft = viewport?.offsetLeft || 0;
  const viewBottom = viewTop + (viewport?.height || window.innerHeight);
  const viewRight = viewLeft + (viewport?.width || window.innerWidth);
  const areaRect = area.getBoundingClientRect();
  const top = Math.max(viewTop, areaRect.top + area.clientTop);
  const bottom = Math.min(viewBottom, areaRect.bottom);
  const toolbarRect = toolbar.getBoundingClientRect();
  const floating = state.open || state.closing;
  const originBottom = floating
    ? anchor.getBoundingClientRect().top + state.naturalHeight : toolbarRect.bottom;
  const areaStyle = getComputedStyle(area);
  const left = Math.max(viewLeft, areaRect.left + area.clientLeft + (parseFloat(areaStyle.paddingLeft) || 0));
  const right = Math.min(viewRight, areaRect.left + area.clientLeft + area.clientWidth
    - (parseFloat(areaStyle.paddingRight) || 0));
  const width = Math.min(900, right - left);
  // 일부만 가려진 툴바나 화면 밖의 미리보기에는 손잡이를 띄우지 않는다.
  state.available = width > 0 && toolbarRect.height > 0 && bottom - top >= 80
    && Number.isFinite(originBottom) && originBottom <= top;
  if(!state.available){
    resetPreviewToolbarReveal();
    return;
  }
  const center = (left + right) / 2;
  handle.hidden = false;
  handle.style.left = `${center}px`;
  handle.style.top = `${top}px`;
  // 손잡이와 툴바의 클릭 영역을 맞붙여 포인터 이동 중 닫히지 않게 한다.
  const handleHeight = handle.getBoundingClientRect().height || 24;
  toolbar.style.setProperty('--preview-reveal-top', `${top + handleHeight - 2}px`);
  toolbar.style.setProperty('--preview-reveal-left', `${center}px`);
  toolbar.style.setProperty('--preview-reveal-width', `${width}px`);
  if(floating){
    // 스크롤마다 줄 배치를 다시 뜯지 않는다. 폭·버튼 문구가 바뀔 때만 잰다.
    if(state.fitWidth !== width){
      state.fit = syncPreviewToolbarRows(toolbar);
      state.fitWidth = width;
    }
    const popupStacked = toolbar.classList.contains('previewToolbarStacked');
    const flowWidth = parseFloat(toolbar.style.getPropertyValue('--preview-toolbar-width')) || width;
    const flowStacked = state.fit.measurable ? state.fit.requiredWidth > flowWidth : popupStacked;
    // 확대된 화면에서는 임시 툴바만 더 좁을 수 있다. 빈 자리는 임시 툴바가
    // 아닌 원래 툴바의 줄 배치 높이로 유지해 본문이 밀리지 않게 한다.
    if(flowStacked !== popupStacked) toolbar.classList.toggle('previewToolbarStacked', flowStacked);
    const style = getComputedStyle(toolbar);
    state.naturalHeight = toolbar.getBoundingClientRect().height - (parseFloat(style.paddingTop) || 0)
      - (parseFloat(style.paddingBottom) || 0) + state.padding;
    if(flowStacked !== popupStacked) toolbar.classList.toggle('previewToolbarStacked', popupStacked);
    const flowMargin = parseFloat(style.getPropertyValue('--preview-toolbar-flow-margin'));
    if(Number.isFinite(flowMargin)) state.margin = flowMargin;
    anchor.style.height = `${Math.max(0, state.naturalHeight + state.margin)}px`;
  }
}

function schedulePreviewToolbarRevealSync(){
  const state = previewToolbarRevealState;
  if(state.frame !== null) return;
  state.frame = requestAnimationFrame(() => {
    state.frame = null;
    syncPreviewToolbarReveal();
  });
}

function openPreviewToolbarReveal(pin = false, focus = false){
  syncPreviewToolbarReveal();
  const state = previewToolbarRevealState, toolbar = host.uiElements.previewToolbar;
  if(!state.available) return;
  clearPreviewToolbarTimer('closeTimer');
  clearPreviewToolbarTimer('hideTimer');
  if(state.closing){
    state.closing = false;
    toolbar.classList.remove('previewToolbarClosing');
    state.open = true;
  }
  if(!state.open){
    const style = getComputedStyle(toolbar);
    state.naturalHeight = toolbar.getBoundingClientRect().height;
    state.margin = (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
    state.padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    host.uiElements.previewToolbarAnchor.style.height = `${state.naturalHeight + state.margin}px`;
    toolbar.classList.add('previewToolbarRevealed', 'previewToolbarEntering');
    state.open = true;
    state.fitWidth = null;
    syncPreviewToolbarReveal();
    state.entryFrame = requestAnimationFrame(() => {
      state.entryFrame = null;
      if(state.open) toolbar.classList.remove('previewToolbarEntering');
    });
  }
  state.pinned = state.pinned || pin;
  host.uiElements.previewToolbarHandle.setAttribute('aria-expanded', 'true');
  host.uiElements.previewToolbarHandle.setAttribute('aria-label', '미리보기 도구 닫기');
  if(focus) toolbar.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
}

function previewToolbarHasInteraction(){
  const state = previewToolbarRevealState, active = document.activeElement;
  return state.pinned || state.overHandle || state.overToolbar
    || host.uiElements.previewToolbar.contains(active) || active === host.uiElements.previewToolbarHandle
    || (!host.uiElements.previewCardNavigator.hidden && !host.uiElements.previewCardNavPanel.hidden);
}

function schedulePreviewToolbarHide(){
  clearPreviewToolbarTimer('closeTimer');
  if(!previewToolbarRevealState.open) return;
  previewToolbarRevealState.closeTimer = setTimeout(() => {
    previewToolbarRevealState.closeTimer = null;
    if(!previewToolbarHasInteraction()) closePreviewToolbarReveal();
  }, 280);
}

function bindPreviewToolbarRevealEvents(){
  host.bindUIFeatureEvents('preview-toolbar-reveal', () => {
    const state = previewToolbarRevealState;
    const {previewToolbar:toolbar, previewToolbarHandle:handle, previewArea:area} = host.uiElements;
    handle.addEventListener('pointerenter', event => {
      if(event.pointerType === 'touch') return;
      state.overHandle = true;
      clearPreviewToolbarTimer('closeTimer');
      if(!state.open) openPreviewToolbarReveal();
    });
    handle.addEventListener('pointerleave', () => {
      state.overHandle = false;
      schedulePreviewToolbarHide();
    });
    handle.addEventListener('click', event => {
      if(state.open) closePreviewToolbarReveal();
      else openPreviewToolbarReveal(true, event.detail === 0);
    });
    handle.addEventListener('keydown', event => {
      if(event.key !== 'ArrowDown') return;
      event.preventDefault();
      openPreviewToolbarReveal(true, true);
    });
    toolbar.addEventListener('pointerenter', event => {
      if(event.pointerType === 'touch') return;
      state.overToolbar = true;
      clearPreviewToolbarTimer('closeTimer');
    });
    toolbar.addEventListener('pointerleave', () => {
      state.overToolbar = false;
      schedulePreviewToolbarHide();
    });
    toolbar.addEventListener('transitionend', event => {
      if(event.target === toolbar && event.propertyName === 'opacity' && state.closing){
        finishPreviewToolbarHide();
      }
    });
    document.addEventListener('focusin', event => {
      if(toolbar.contains(event.target) || event.target === handle){
        clearPreviewToolbarTimer('closeTimer');
        if(state.closing && toolbar.contains(event.target)) openPreviewToolbarReveal(true);
      } else {
        state.pinned = false;
        schedulePreviewToolbarHide();
      }
    });
    document.addEventListener('pointerdown', event => {
      if(toolbar.contains(event.target) || handle.contains(event.target)
        || host.uiElements.previewCardNavigator.contains(event.target)) return;
      closePreviewToolbarReveal();
    });
    document.addEventListener('keydown', event => {
      if(event.key !== 'Escape' || !state.open) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closePreviewToolbarReveal(true);
    }, true);
    area.addEventListener('scroll', schedulePreviewToolbarRevealSync, {passive:true});
    window.addEventListener('scroll', schedulePreviewToolbarRevealSync, {passive:true});
    window.addEventListener('resize', schedulePreviewToolbarRevealSync);
    window.visualViewport?.addEventListener('resize', schedulePreviewToolbarRevealSync);
    window.visualViewport?.addEventListener('scroll', schedulePreviewToolbarRevealSync);
    schedulePreviewToolbarRevealSync();
  });
}

function previewVisibleFooterElement(){
  const footer = document.querySelector('#preview [data-mosaic-footer="true"]');
  return footer && footer.getClientRects().length ? footer : null;
}
return Object.freeze({
bindPreviewFoldEvents,
bindPreviewFullscreenEvents,
bindPreviewLayoutEvents,
bindPreviewToolbarLayoutEvents,
bindPreviewToolbarRevealEvents,
capturePreviewFoldState,
closePreviewCardNavigator,
decoratePreviewControls,
finishPreviewLayout,
isStackedLayout,
layoutPreviewFloatingButtons,
previewParts,
previewVisibleFooterElement,
refreshPreviewFloatingButtonLayout,
restorePreviewFoldState,
syncDesktopPreviewWidth,
syncPreviewCommentOutset,
syncPreviewFoldControls,
syncPreviewOuterBreaks,
syncPreviewToolbarLabel,
toggleEditorPreviewFold
});
}

// 세로 배치의 화면 이동만 담당한다. 작업 데이터와 위치 연동 설정은 바꾸지 않는다.
function createMobilePanelNavigation(host){
const button = document.getElementById('mobilePanelSwitch');
const sidebar = document.getElementById('sidebar');
const state = {editorOffset:0,previewOffset:0,frame:null,jumpFrame:null};
const documentTop = element => window.scrollY + element.getBoundingClientRect().top;

function currentPanel(){
  const rect = host.uiElements.previewArea.getBoundingClientRect();
  const page = document.scrollingElement || document.documentElement;
  const atBottom = window.scrollY + window.innerHeight >= page.scrollHeight - 2;
  // 짧은 미리보기는 페이지 끝에서도 화면 위까지 올라오지 못할 수 있다.
  return rect.top <= window.innerHeight / 2 || (atBottom && rect.top < window.innerHeight)
    ? 'preview' : 'editor';
}

function syncButton(){
  state.frame = null;
  button.hidden = !host.isStackedLayout();
  if(button.hidden) return;
  const target = currentPanel() === 'preview' ? 'editor' : 'preview';
  button.dataset.target = target;
  button.setAttribute('aria-label',target === 'preview' ? '미리보기로 이동' : '편집 화면으로 이동');
  button.setAttribute('aria-controls',target === 'preview' ? 'previewArea' : 'sidebar');
}

function scheduleSync(){
  if(state.frame === null) state.frame = requestAnimationFrame(syncButton);
}

function switchPanel(){
  if(!host.isStackedLayout() || state.jumpFrame !== null
    || document.body.classList.contains('previewFullscreen') || document.body.classList.contains('fsLock')) return;
  const target = currentPanel() === 'preview' ? 'editor' : 'preview';
  // 탭과 접힘 상태는 유지하고, 떠나는 구역에서 보던 위치만 기억한다.
  if(target === 'preview') state.editorOffset = window.scrollY - documentTop(sidebar);
  else state.previewOffset = window.scrollY - documentTop(host.uiElements.previewArea);
  const active = document.activeElement;
  if(active && (document.getElementById('sidebar').contains(active) || host.uiElements.preview.contains(active))){
    active.blur(); // 미리보기 편집을 확정하고 모바일 키보드를 닫는다.
  }
  host.flushPreview();
  state.jumpFrame = requestAnimationFrame(() => {
    state.jumpFrame = null;
    if(!host.isStackedLayout()) return;
    const area = target === 'preview' ? host.uiElements.previewArea : sidebar;
    const offset = target === 'preview' ? state.previewOffset : state.editorOffset;
    window.scrollTo({top:Math.max(0,documentTop(area) + offset),behavior:'auto'});
    syncButton();
  });
}

function reset(){
  if(state.jumpFrame !== null) cancelAnimationFrame(state.jumpFrame);
  state.jumpFrame = null;
  state.editorOffset = 0;
  state.previewOffset = 0;
  scheduleSync();
}

function bindEvents(){
  host.bindUIFeatureEvents('mobile-panel-navigation',() => {
    button.addEventListener('click',switchPanel);
    window.addEventListener('scroll',scheduleSync,{passive:true});
    window.addEventListener('resize',scheduleSync);
    window.visualViewport?.addEventListener('resize',scheduleSync);
    window.visualViewport?.addEventListener('scroll',scheduleSync,{passive:true});
    if(typeof ResizeObserver === 'function'){
      const observer = new ResizeObserver(scheduleSync);
      observer.observe(document.getElementById('sidebar'));
      observer.observe(host.uiElements.previewArea);
    }
    syncButton();
  });
}
return Object.freeze({bindEvents,reset});
}

function createPreviewSearch(host){
// ---------- 미리보기 검색 (Ctrl/⌘+F) ----------
// 미리보기 DOM 의 텍스트 노드에만 강조 span(.pvHit)을 끼워 넣는다.
// 출력물(MosaicRenderer.generateHTML)은 항상 입력값에서 새로 만들어지므로 강조가 결과물에 섞일 일은 없음.
// 리렌더(renderPreview)가 innerHTML 을 갈아엎으므로, 검색이 켜져 있으면 끝에서 다시 칠한다.
const previewSearchState = {
  open:false,
  hits:[],
  current:-1,
  // 삭제로 검색 결과가 잠시 없어져도 되돌리기 후 선택 결과를 다시 펼칠 수 있게 기억한다.
  lastActiveIndex:-1,
  statusTimer:null,
  bound:false
};

function pvScopeTextarea(){
  const scope = document.getElementById('pvScopeSelect').value;
  if(scope === 'all') return null;
  const match = scope.match(/^card:(\d+)$/);
  if(match) return host.cardEditors.bodyCardTextareas()[Number(match[1])] || null;
  const activeTextarea = host.cardEditors.activeTextarea();
  if(activeTextarea && activeTextarea.matches('#cardEditors .cardEditor:not(.commentEditor) textarea')){
    return activeTextarea;
  }
  if(previewSearchState.current >= 0 && previewSearchState.hits[previewSearchState.current]){
    const src = host.findBlockSource(previewSearchState.hits[previewSearchState.current]);
    if(src && src.ta) return src.ta;
  }
  return host.cardEditors.bodyCardTextareas()[0] || null;
}

function pvScopeTextareas(){
  const ta = pvScopeTextarea();
  return ta ? [ta] : host.cardEditors.bodyCardTextareas();
}

function pvScopePreviewRoots(){
  const ta = pvScopeTextarea();
  if(!ta) return host.previewCardContexts().map(ctx => ctx.cardEl);
  const ctx = host.previewCardContexts().find(item => item.ta === ta);
  return ctx ? [ctx.cardEl] : [];
}

function pvRefreshScopeOptions(resetToAll){
  const select = document.getElementById('pvScopeSelect');
  const previous = select.value;
  const textareas = host.cardEditors.bodyCardTextareas();
  select.innerHTML = '';
  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = '전체 카드';
  select.appendChild(all);
  textareas.forEach((ta, index) => {
    const option = document.createElement('option');
    option.value = `card:${index}`;
    option.textContent = `카드 ${index + 1}`;
    select.appendChild(option);
  });
  const values = Array.from(select.options).map(option => option.value);
  if(resetToAll) select.value = 'all';
  else select.value = values.includes(previous) ? previous : 'all';
}

function pvClearHits(){
  document.querySelectorAll('#preview .pvHit').forEach(sp => {
    const parent = sp.parentNode;
    if(!parent) return;
    // 검색어가 굵게·강조 span 경계를 가로질러도 원래 미리보기 구조를 보존한다.
    while(sp.firstChild) parent.insertBefore(sp.firstChild, sp);
    sp.remove();
    parent.normalize();
  });
  previewSearchState.hits = [];
  previewSearchState.current = -1;
}

// 한 출력 문단의 여러 텍스트 노드를 하나의 문자열처럼 검색한다.
// 굵게·강조·원문 병행 span 경계를 가로지르는 검색어도 한 항목으로 표시하되,
// 화자 이름표와 자동 장식은 원문 입력에 없는 글자이므로 검색에서 제외한다.
function pvHighlightBlock(block, query){
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while(walker.nextNode()){
    node = walker.currentNode;
    const parent = node.parentElement;
    if(!node.data || (parent && parent.closest('[data-mosaic-speaker-label="true"], [data-mosaic-generated="true"], [data-mosaic-footer="true"], [data-mosaic-credit="true"], [data-mosaic-card-title="true"]'))) continue;
    nodes.push(node);
  }
  if(!nodes.length) return [];
  const text = nodes.map(item => item.data).join('');
  const matches = host.normalizedLiteralOffsets(text, query)
    .map(start => ({ start, end:start + query.length }));
  if(!matches.length) return [];

  const boundaries = [];
  let cursor = 0;
  nodes.forEach(textNode => {
    boundaries.push({ node:textNode, start:cursor, end:cursor + textNode.data.length });
    cursor += textNode.data.length;
  });
  const locate = (position, startBoundary) => {
    for(let i = 0; i < boundaries.length; i++){
      const item = boundaries[i];
      if(position < item.end || (position === item.end && (!startBoundary || i === boundaries.length - 1))){
        return { node:item.node, offset:Math.max(0, Math.min(item.node.data.length, position - item.start)) };
      }
    }
    const last = boundaries[boundaries.length - 1];
    return { node:last.node, offset:last.node.data.length };
  };

  const hits = [];
  // 뒤에서부터 감싸야 앞쪽 원본 텍스트 노드의 오프셋이 바뀌지 않는다.
  matches.slice().reverse().forEach(match => {
    const start = locate(match.start, true);
    const end = locate(match.end, false);
    if(!start || !end) return;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const span = document.createElement('span');
    span.className = 'pvHit';
    span.appendChild(range.extractContents());
    range.insertNode(span);
    hits.unshift(span);
  });
  return hits;
}

function pvUpdateCount(){
  const q = document.getElementById('pvFindInput').value;
  document.getElementById('pvFindCount').textContent =
    !q ? '' : (previewSearchState.hits.length
      ? (previewSearchState.current >= 0
          ? (previewSearchState.current + 1) + ' / ' + previewSearchState.hits.length
          : previewSearchState.hits.length + '곳')
      : '0 / 0');
}

// keepPos: 리렌더 후 재적용 시 현재 위치를 유지하고 스크롤하지 않음 (타이핑이 화면을 끌고 다니지 않게)
function pvApplySearch(keepPos){
  const previous = keepPos
    ? (previewSearchState.current >= 0 ? previewSearchState.current : previewSearchState.lastActiveIndex)
    : -1;
  previewSearchState.lastActiveIndex = previous;
  pvRefreshScopeOptions(false);
  pvClearHits();
  const q = document.getElementById('pvFindInput').value;
  if(!previewSearchState.open || !q){ pvUpdateCount(); return; }
  const roots = pvScopePreviewRoots();
  if(!roots.length){ pvUpdateCount(); return; }
  roots.forEach(root => {
    host.previewSourceBlocks(root).forEach(block => {
      previewSearchState.hits.push(...pvHighlightBlock(block, q));
    });
  });
  if(previewSearchState.hits.length){
    previewSearchState.current = keepPos && previous >= 0
      ? Math.min(previous, previewSearchState.hits.length - 1)
      : -1;
    if(previewSearchState.current >= 0) pvMarkCurrent(false);
  }
  pvUpdateCount();
}

function pvMarkCurrent(scroll){
  previewSearchState.hits.forEach(sp => sp.classList.remove('pvHitCur'));
  const cur = previewSearchState.hits[previewSearchState.current];
  if(!cur) return;
  previewSearchState.lastActiveIndex = previewSearchState.current;
  cur.classList.add('pvHitCur');
  // 닫힌 접기(details) 안의 일치는 조상을 열어서 보이게 함
  let el = cur.parentElement;
  while(el){
    if(el.tagName === 'DETAILS') el.open = true;
    el = el.parentElement;
  }
  if(scroll) cur.scrollIntoView({ block: 'center' });
  pvUpdateCount();
}

function pvGo(dir){
  if(!previewSearchState.hits.length) return;
  previewSearchState.current = previewSearchState.current < 0
    ? (dir >= 0 ? 0 : previewSearchState.hits.length - 1)
    : (previewSearchState.current + dir + previewSearchState.hits.length) % previewSearchState.hits.length;
  pvMarkCurrent(true);
}

function openPreviewSearch(){
  previewSearchState.open = true;
  document.getElementById('pvSearchBox').style.display = 'flex';
  pvRefreshScopeOptions(true);
  const input = document.getElementById('pvFindInput');
  input.focus();
  input.select();
  pvApplySearch(false);
  host.refreshPreviewFloatingButtonLayout();
}

function closePreviewSearch(){
  previewSearchState.open = false;
  previewSearchState.lastActiveIndex = -1;
  const box = document.getElementById('pvSearchBox');
  box.style.display = 'none';
  pvClearHits();
  document.getElementById('pvFindCount').textContent = '';
  host.refreshPreviewFloatingButtonLayout();
}

// ---------- 미리보기 대치 ----------
// 현재 항목 대치: 강조 span(findBlockSource)으로 원본 카드·줄을 역추적하고,
// 그 줄 안에서 몇 번째 일치인지(같은 줄에 속한 앞선 강조 수)를 세어 원본의 해당 위치만 바꾼다.
// 미리보기 텍스트는 마커 제거·따옴표 정규화를 거치므로, 검색어가 그 변형에 걸치면
// 원본에서 위치를 찾지 못할 수 있음 → 상태 메시지로 알리고 아무것도 바꾸지 않는다.
function pvReplaceCurrent(){
  const q = document.getElementById('pvFindInput').value;
  if(!q || !previewSearchState.hits.length) return;
  if(previewSearchState.current < 0){ pvGo(1); return; }
  const r = document.getElementById('pvReplInput').value;
  const hit = previewSearchState.hits[previewSearchState.current];
  if(!hit) return;
  const src = host.findBlockSource(hit);
  if(!src){ pvStatusFlash('본문 밖 — 대치 불가'); return; }
  let k = 0;
  for(let i = 0; i < previewSearchState.current; i++){
    const s = host.findBlockSource(previewSearchState.hits[i]);
    if(s && s.ta === src.ta && s.raw === src.raw) k++;
  }
  const lines = src.ta.value.split('\n');
  const line = lines[src.raw] || '';
  const settings = host.sourceMap.outputRuleLineSettings(src.ta,src.raw);
  const sourceRange = host.sourceMap.findSourceRange(line, q, k, true, settings);
  if(!sourceRange){ pvStatusFlash('원본 위치 확인 실패'); return; }
  host.snapshotCards();
  lines[src.raw] = host.sourceMap.replaceSourceRange(line, sourceRange, r, settings);
  src.ta.value = lines.join('\n');
  src.ta.dispatchEvent(new Event('input', { bubbles: true }));  // 리렌더 + 저장 + 강조 재적용
  host.showUndoToast('1곳 변경.');
  if(previewSearchState.hits.length) pvMarkCurrent(true);
}

// 선택한 범위 안의 모든 일치 대치 (대소문자 무시 — 검색 강조와 동일 기준)
function pvReplaceAll(){
  const q = document.getElementById('pvFindInput').value;
  if(!q) return;
  const r = document.getElementById('pvReplInput').value;
  const perTextarea = new Map();

  // DOM 강조 위치가 아니라 원문의 '화면에 보이는 투영'을 직접 검색한다.
  // 그래서 접기 내부도 빠지지 않고, 표제·꼬리말·화자 이름표와 문법 기호는 건드리지 않는다.
  pvScopeTextareas().forEach(ta => {
    const rows = new Map();
    ta.value.split('\n').forEach((line, raw) => {
      const matches = host.sourceMap.findAllSourceRanges(line, q, true, host.sourceMap.outputRuleLineSettings(ta,raw));
      if(matches.length) rows.set(raw, matches);
    });
    if(rows.size) perTextarea.set(ta, rows);
  });

  let n = 0;
  perTextarea.forEach(rows => rows.forEach(atList => { n += atList.length; }));
  if(!n){ pvStatusFlash('0 / 0'); return; }
  host.snapshotCards();
  perTextarea.forEach((rows, ta) => {
    const lines = ta.value.split('\n');
    rows.forEach((rangeList, raw) => {
      let line = lines[raw] || '';
      rangeList.sort((a, b) => b.start - a.start).forEach(range => {
        line = host.sourceMap.replaceSourceRange(line, range, r, host.sourceMap.outputRuleLineSettings(ta,raw));
      });
      lines[raw] = line;
    });
    ta.value = lines.join('\n');
  });
  host.uiUpdateEffects.committedChange();
  host.showUndoToast(n + '곳 변경.');
  if(previewSearchState.hits.length) pvMarkCurrent(true);
}

// 카운터 자리에 상태를 잠깐 보여주고 원래 카운트로 복귀
function pvStatusFlash(msg){
  document.getElementById('pvFindCount').textContent = msg;
  clearTimeout(previewSearchState.statusTimer);
  previewSearchState.statusTimer = setTimeout(pvUpdateCount, 2200);
}

function bindPreviewSearchInputEvents(){
  const input = document.getElementById('pvFindInput');
  const repl = document.getElementById('pvReplInput');
  const scope = document.getElementById('pvScopeSelect');
  input.addEventListener('input', () => pvApplySearch(false));
  scope.addEventListener('change', () => {
    pvApplySearch(false);
  });
  input.addEventListener('keydown', (e) => {
    if(e.isComposing || e.keyCode === 229) return;
    if(e.key === 'Enter'){
      e.preventDefault();
      pvGo(e.shiftKey ? -1 : 1);
    } else if(e.key === 'Escape'){
      e.preventDefault(); e.stopPropagation();
      closePreviewSearch();
    }
  });
  repl.addEventListener('keydown', (e) => {
    if(e.isComposing || e.keyCode === 229) return;
    if(e.key === 'Enter'){ e.preventDefault(); pvReplaceCurrent(); }
    else if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closePreviewSearch(); }
  });
}

function bindPreviewSearchControlEvents(){
  document.getElementById('pvReplBtn').addEventListener('click', pvReplaceCurrent);
  document.getElementById('pvReplAllBtn').addEventListener('click', pvReplaceAll);
  const prev = document.getElementById('pvFindPrevBtn');
  const next = document.getElementById('pvFindNextBtn');
  [prev, next].forEach(b => b.addEventListener('mousedown', (e) => e.preventDefault()));
  prev.addEventListener('click', () => pvGo(-1));
  next.addEventListener('click', () => pvGo(1));
  document.getElementById('pvFindCloseBtn').addEventListener('click', closePreviewSearch);
}

function bindPreviewSearchEscapeEvent(){
  // 입력창 밖의 Esc도 검색을 닫되, 전체 화면·코드 화면이 열렸으면 그쪽을 우선한다.
  document.addEventListener('keydown', event => {
    if(event.isComposing || event.keyCode === 229 || event.key !== 'Escape') return;
    if(document.getElementById('fsOverlay').style.display === 'block') return;
    if(document.getElementById('codeOverlay').style.display === 'block') return;
    if(previewSearchState.open) closePreviewSearch();
  });
}

function bindPreviewSearchEvents(){
  if(previewSearchState.bound) return;
  previewSearchState.bound = true;
  bindPreviewSearchInputEvents();
  bindPreviewSearchControlEvents();
  bindPreviewSearchEscapeEvent();
}

function isOpen(){ return previewSearchState.open; }
return Object.freeze({
bindPreviewSearchEvents,
closePreviewSearch,
isOpen,
openPreviewSearch,
pvApplySearch
});
}

return Object.freeze({createPreviewLayout,createPreviewSearch,createMobilePanelNavigation});
})();
