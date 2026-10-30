// 조각로그 UI · 미리보기 직접 편집·선택·드래그
// 생성 함수만 등록하며, 실행 상태와 기능 연결은 ui.js에서 구성한다.
globalThis.MosaicUIParts.previewEdit = (() => {
'use strict';

function createPreviewInteractions(host){
const previewEditState = {
  drag:null,
  selection:null,
  block:null,
  ready:false,
  committing:false
};

// ---------- 미리보기에서 선택해 서식 적용 ----------
// 미리보기 글자를 드래그하면 작은 도구막대가 뜨고, 굵게/강조를 본문에 바로 적용함.
// 이미 서식이 걸린 부분을 고르면 해당 버튼이 켜지고, 다시 누르면 서식이 해제된다.
// 최상위 문단(접기 블록 밖)만 대상으로 하며, 선택한 글자를 원본 줄에서 찾아 마커로 감싼다.
const FMT_WRAP = { bold: '**', emphasis: '*' };

const FMT_TAG = { bold: 'STRONG', emphasis: 'EM' };

// 기존 공개 정규식은 지원 엔진에서 유지한다. 앱의 서식 범위 계산은
// formatMatches를 사용하며 구형 Safari의 시작을 막는 정규식 리터럴을 두지 않는다.
let legacyEmphasisPattern;
try {
  legacyEmphasisPattern = new RegExp(String.raw`\*\*\*([^*\n]+?)\*\*\*|(?<!\*)\*([^*\n]+?)\*(?!\*)`, 'g');
} catch(e){
  legacyEmphasisPattern = /\*\*\*([^*\n]+?)\*\*\*|\*([^*\n]+?)\*(?!\*)/g;
}
const FMT_RE = {
  // 새 입력은 **만 만들지만, 기존 로그의 __ 굵기도 읽고 해제할 수 있게 남긴다.
  bold: /__(.+?)__|\*\*(.+?)\*\*/g,
  emphasis: legacyEmphasisPattern
};

const CENTER_RE = /^(>\s?)?\[C\]\s*/i;

// 줄 맨 앞 또는 인용 뒤의 [C]
const previewDirectEditDescriptors = new WeakMap();

const outputRulePreviewState = {spans:new WeakMap(),blocks:new WeakMap(),markers:[],selection:[],menu:null};

const parallelPreviewState = {spans:new WeakMap(),selection:[]};

function changeParallelOccurrences(targets,exclude){
  const valid=targets.filter(target=>target.ta.isConnected && target.ta.value===target.body && target.revision===host.currentPreviewRevision() && !target.block?.dataset.previewEditChanged);
  if(!valid.length){hideOutputRulePopover();hideSelToolbar();return;}
  const perCard=new Map();
  valid.forEach(target=>{
    const current=host.sourceMap.parallelCardCandidates(target.ta).find(item=>item.sourceStart===target.item.start && item.sourceEnd===target.item.end && item.kind===target.item.kind && item.text===target.item.text);
    if(!current)return;
    const items=(perCard.get(target.ta) || host.sourceMap.editorParallelExclusions(target.ta)).filter(item=>item.start!==target.item.start || item.end!==target.item.end || item.kind!==target.item.kind);
    if(exclude)items.push({...target.item});perCard.set(target.ta,items);
  });
  if(!perCard.size)return;
  if([...perCard.values()].some(items=>items.length>1000)){host.showNoticeToast('카드당 병행 예외는 최대 1,000개까지 저장할 수 있습니다.');return;}
  host.snapshotCards();
  perCard.forEach((items,ta)=>host.sourceMap.setParallelExclusions(ta,MosaicState.normalizeParallelExclusions(items,ta.value)));
  hideOutputRulePopover();hideSelToolbar();previewEditState.committing=true;
  try{host.uiUpdateEffects.committedChange();}finally{previewEditState.committing=false;}
  host.showUndoToast(exclude?'선택한 부분만 병행 제외.':'선택한 부분에 병행 다시 적용.');
}

function hideOutputRulePopover(){
  const menu = document.getElementById('outputRulePopover');
  if(menu){ menu.hidden = true; menu.replaceChildren(); }
  outputRulePreviewState.menu = null;
}

function outputRuleOccurrenceKey(item){
  return JSON.stringify([item.kind,item.ruleId,item.from,item.to,item.start,item.end,item.text]);
}

function changeOutputRuleOccurrences(targets, exclude){
  const valid = targets.filter(target => target.ta.isConnected && target.ta.value === target.body
    && target.revision === host.currentPreviewRevision()
    && !target.block?.dataset.previewEditChanged);
  const settings = host.getSettings();
  const current = valid.filter(target => (settings[target.item.kind === 'name' ? 'nameRules' : 'keywordRules'] || [])
    .some(rule => rule.enabled !== false && rule.id === target.item.ruleId
      && rule.from === target.item.from && rule.to === target.item.to));
  if(!current.length){ hideOutputRulePopover(); hideSelToolbar(); return; }
  const perCard = new Map();
  current.forEach(target => {
    if(!perCard.has(target.ta)) perCard.set(target.ta,host.sourceMap.editorOutputRuleExclusions(target.ta).slice());
    let items = perCard.get(target.ta);
    const key = outputRuleOccurrenceKey(target.item);
    items = items.filter(item => outputRuleOccurrenceKey(item) !== key);
    if(exclude){
      const {kind,ruleId,from,to,start,end,text} = target.item;
      items.push({kind,ruleId,from,to,start,end,text});
    }
    perCard.set(target.ta,items);
  });
  if(Array.from(perCard.values()).some(items => items.length > 1000)){
    hideOutputRulePopover(); hideSelToolbar();
    host.showNoticeToast('카드당 치환 예외는 최대 1,000개까지 저장할 수 있습니다.');
    return;
  }
  host.snapshotCards();
  perCard.forEach((items,ta) => host.sourceMap.setOutputRuleExclusions(ta,MosaicState.normalizeOutputRuleExclusions(items,ta.value)));
  hideOutputRulePopover(); hideSelToolbar();
  previewEditState.committing = true;
  try { host.uiUpdateEffects.committedChange(); }
  finally { previewEditState.committing = false; }
  host.showUndoToast(exclude ? '선택한 부분만 치환 제외.' : '선택한 부분에 규칙 다시 적용.');
}

function showOutputRulePopover(targets, rect){
  const menu = document.getElementById('outputRulePopover');
  hideOutputRulePopover();
  if(!menu || !targets.length || targets.some(target => target.block?.dataset.previewEditChanged)) return;
  hideSelToolbar(); hideBlockToolbar();
  outputRulePreviewState.menu = targets;
  targets.forEach(target => {
    const row = document.createElement('div'); row.className = 'outputRuleChoice';
    const text = document.createElement('span');
    text.textContent = target.item.deleted ? target.item.text
      : `${target.item.from} → ${target.item.to || '삭제'}`;
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = target.item.excluded ? '다시 적용' : target.item.deleted ? '이 부분 삭제 제외' : '이 부분 치환 제외';
    button.addEventListener('click', () => changeOutputRuleOccurrences([target],!target.item.excluded));
    row.append(text,button); menu.append(row);
  });
  menu.hidden = false;
  menu.style.left = Math.max(8,Math.min(window.innerWidth-menu.offsetWidth-8,rect.left))+'px';
  menu.style.top = Math.max(8,Math.min(window.innerHeight-menu.offsetHeight-8,rect.bottom+6))+'px';
}

// 출력 DOM에만 얹는 글자 연결이다. 원본 HTML·복사·저장에는 이 표식을 넣지 않는다.
function outputRuleBlockCharacters(block){
  let text = ''; const points = [];
  const visit = node => {
    if(node.nodeType === 3){
      for(let i=0;i<node.data.length;i++){ text += node.data[i]; points.push({node,offset:i}); }
    }else if(node.nodeType === 1){
      if(node.matches('[data-mosaic-speaker-label="true"], [data-mosaic-generated="true"]')) return;
      if(node.matches('[data-mosaic-parallel-translation-mode="stack"]')){ text += ' '; points.push(null); }
      if(node.tagName === 'BR'){ text += '\n'; points.push(null); }
      else node.childNodes.forEach(visit);
    }
  };
  visit(block);
  const start = text.length-text.trimStart().length, end = text.trimEnd().length;
  return {text:MosaicParser.normalizeQuotes(text.slice(start,end).replace(/\u00a0/g,' ')),points:points.slice(start,end)};
}

function layoutOutputRuleMarkers(){
  const root = document.getElementById('previewWrap');
  if(!root) return;
  const base = root.getBoundingClientRect();
  outputRulePreviewState.markers.forEach(({button,block,after}) => {
    let hidden = !block.isConnected;
    for(let parent = block; parent; parent = parent.parentElement){
      if(parent.tagName === 'DETAILS' && !parent.open && !parent.querySelector(':scope > summary')?.contains(block)) hidden = true;
    }
    button.hidden = hidden || !block.getClientRects().length;
    const rect = block.getBoundingClientRect();
    button.style.top = `${(after ? rect.bottom : rect.top)-base.top+root.scrollTop}px`;
    button.style.left = `${Math.max(0,rect.left-base.left+root.scrollLeft-25)}px`;
  });
}

function decorateOutputRuleOccurrences(){
  document.querySelectorAll('#preview .previewRuleText').forEach(span => span.replaceWith(...span.childNodes));
  outputRulePreviewState.markers.forEach(({button}) => button.remove());
  outputRulePreviewState.markers = [];
  outputRulePreviewState.spans = new WeakMap(); outputRulePreviewState.blocks = new WeakMap();
  const settings = host.getSettings();
  if(![...(settings.nameRules || []),...(settings.keywordRules || [])].some(rule => rule.enabled !== false)) return;
  const revision = host.currentPreviewRevision();
  const preview = host.uiElements.preview;
  const deletionGroups = new Map();
  const contexts = previewCardContexts();
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  document.querySelectorAll('#cardEditors .cardEditor:not([data-block-type="comment"]) textarea').forEach(ta => {
    if(ta.closest('.cardEditor').dataset.outputVisible === 'false') return;
    const body = ta.value, lines = body.split('\n'), offsets = []; let offset = 0;
    lines.forEach(line => { offsets.push(offset); offset += line.length+1; });
    const currentSettings = {...settings,outputRuleExclusions:host.sourceMap.editorOutputRuleExclusions(ta),trackOutputRuleOccurrences:true};
    const projections = lines.map((line,raw) => MosaicParser.outputTextProjection(line,
      {...host.sourceMap.outputRuleLineSettings(ta,raw,0,currentSettings),outputRuleSourceOffset:offsets[raw]}));
    const items = projections.flatMap(projection => projection.occurrences);
    if(!items.length) return;
    const blocks = Array.from(preview.querySelectorAll('[data-preview-edit-type="body"]'))
      .filter(block => previewDirectEditDescriptors.get(block)?.ta === ta);
    const targets = items.map(item => ({ta,body,revision,item,block:null}));
    const ordered = targets.filter(target => !target.item.deleted).sort((a,b) => a.item.start-b.item.start);
    const maxEnds = []; ordered.forEach((target,index) => maxEnds.push(Math.max(index ? maxEnds[index-1] : 0,target.item.end)));
    const overlapping = range => {
      let low = 0, high = ordered.length;
      while(low < high){ const mid = (low+high) >>> 1; if(ordered[mid].item.start < range.end) low = mid+1; else high = mid; }
      const result = [];
      for(let i=low-1;i>=0 && maxEnds[i] > range.start;i--) if(ordered[i].item.end > range.start) result.push(ordered[i]);
      return result.reverse();
    };
    blocks.forEach(block => {
      const descriptor = previewDirectEditDescriptors.get(block);
      const rawLines = descriptor.rawLines || [descriptor.raw];
      let text = '', ranges = [];
      rawLines.forEach((raw,index) => {
        const projection = projections[raw]; if(!projection) return;
        const display = host.sourceMap.outputSourceDisplayProjectionMap(lines[raw].replace(/\[BR\]\s*$/i,''),{...host.sourceMap.outputRuleLineSettings(ta,raw,0,currentSettings),
          parallelExclusions:host.sourceMap.editorParallelExclusions(ta),outputRuleSourceOffset:offsets[raw]});
        const start = display.text.length-display.text.trimStart().length, end = display.text.trimEnd().length;
        if(index){ text += '\n'; ranges.push(null); }
        text += display.text.slice(start,end);
        display.map.slice(start,end).forEach((at,index) => ranges.push(!display.protected?.[start+index]
          ? {start:offsets[raw]+at,end:offsets[raw]+display.ends[start+index]} : null));
      });
      const chars = outputRuleBlockCharacters(block);
      let at = text.indexOf(chars.text);
      const firstSegment = descriptor.sourceSegments?.[0];
      const bounds = firstSegment || descriptor.sourceBounds;
      if(descriptor.segmented && bounds){
        const raw = firstSegment ? firstSegment.raw : descriptor.raw;
        while(at >= 0 && ranges[at] && ranges[at].start < offsets[raw]+bounds.start) at = text.indexOf(chars.text,at+1);
      }
      if(!chars.text || at < 0 || chars.text !== previewEditableText(block,true)) return;
      ranges = ranges.slice(at,at+chars.text.length);
      const perNode = new Map(), blockTargets = new Set();
      chars.points.forEach((point,index) => {
        const range = ranges[index]; if(!point || !range) return;
        const matched = overlapping(range);
        if(!matched.length) return;
        matched.forEach(target => { target.block = block; blockTargets.add(target); });
        if(!perNode.has(point.node)) perNode.set(point.node,[]);
        perNode.get(point.node).push({offset:point.offset,targets:matched});
      });
      outputRulePreviewState.blocks.set(block,Array.from(blockTargets));
      perNode.forEach((chars,node) => {
        const runs = [];
        chars.forEach(char => {
          const previous = runs[runs.length-1];
          if(previous && previous.end === char.offset && previous.targets.length === char.targets.length
            && previous.targets.every((target,i) => target === char.targets[i])) previous.end++;
          else runs.push({start:char.offset,end:char.offset+1,targets:char.targets});
        });
        let tail = node.data.length; const fragment = document.createDocumentFragment();
        runs.reverse().forEach(run => {
          fragment.prepend(document.createTextNode(node.data.slice(run.end,tail)));
          const span = document.createElement('span'); span.className = 'previewRuleText';
          span.dataset.ruleExcluded = String(run.targets.every(target => target.item.excluded));
          span.textContent = node.data.slice(run.start,run.end);
          outputRulePreviewState.spans.set(span,run.targets); fragment.prepend(span); tail = run.start;
        });
        fragment.prepend(document.createTextNode(node.data.slice(0,tail))); node.replaceWith(fragment);
      });
    });
    targets.filter(target => target.item.deleted).forEach(target => {
      const raw = offsets.findLastIndex(start => start <= target.item.start);
      let block = blocks.find(block => { const d = previewDirectEditDescriptors.get(block); return d.raw <= raw && d.rawEnd >= raw; })
        || blocks.find(block => previewDirectEditDescriptors.get(block).raw > raw);
      let after = false;
      if(!block && blocks.length){ block = blocks[blocks.length-1]; after = true; }
      if(!block){
        const sourceIndex = editors.indexOf(ta.closest('.cardEditor'));
        block = contexts.find(ctx => ctx.sourceIndex >= sourceIndex)?.cardEl;
        if(!block && contexts.length){ block = contexts[contexts.length-1].cardEl; after = true; }
        block ||= preview;
      }
      target.block = block;
      if(!deletionGroups.has(block)) deletionGroups.set(block,new Map());
      const positions = deletionGroups.get(block);
      if(!positions.has(after)) positions.set(after,[]);
      positions.get(after).push(target);
    });
  });
  deletionGroups.forEach((positions,block) => positions.forEach((group,after) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'previewRuleDeletion';
      button.textContent = '⋯'; button.setAttribute('aria-label',`삭제된 문구 ${group.length}개 보기`);
      button.title = '삭제된 문구 보기';
      button.addEventListener('mousedown',event => event.preventDefault());
      button.addEventListener('click',event => {
        showOutputRulePopover(group,button.getBoundingClientRect());
        if(event.detail === 0) document.querySelector('#outputRulePopover button')?.focus();
      });
      // 갱신 때 소멸하는 블록에만 이벤트를 묶는다. 영구 preview 루트는 별도로 처리한다.
      if(block !== preview){
        block.addEventListener('pointerenter',() => button.classList.add('isVisible'));
        block.addEventListener('pointerleave',() => button.classList.remove('isVisible'));
        block.addEventListener('focusin',() => button.classList.add('isVisible'));
        block.addEventListener('focusout',() => button.classList.remove('isVisible'));
      }else button.classList.add('isVisible');
      document.getElementById('previewWrap').append(button);
      outputRulePreviewState.markers.push({button,block,after});
  }));
  layoutOutputRuleMarkers();
}

function decorateParallelOccurrences(){
  parallelPreviewState.spans=new WeakMap();
  const settings=host.getSettings(),revision=host.currentPreviewRevision();
  previewCardContexts().forEach(({ta})=>{
    const body=ta.value,candidates=host.sourceMap.parallelCardCandidates(ta,settings);if(!candidates.length)return;
    const targets=candidates.map(candidate=>({parallel:true,ta,body,revision,excluded:candidate.excluded,
      item:{kind:candidate.kind,start:candidate.sourceStart,end:candidate.sourceEnd,text:candidate.text},block:null}));
    const lines=body.split('\n'),offsets=[];let offset=0;lines.forEach(line=>{offsets.push(offset);offset+=line.length+1;});
    host.uiElements.preview.querySelectorAll('[data-preview-edit-type="body"]').forEach(block=>{
      const descriptor=previewDirectEditDescriptors.get(block);if(descriptor?.ta!==ta)return;
      let text='',ranges=[];
      (descriptor.rawLines || [descriptor.raw]).forEach((raw,index)=>{
        const display=host.sourceMap.outputSourceDisplayProjectionMap((lines[raw] || '').replace(/\[BR\]\s*$/i,''),host.sourceMap.outputRuleLineSettings(ta,raw));
        const start=display.text.length-display.text.trimStart().length,end=display.text.trimEnd().length;
        if(index){text+='\n';ranges.push(null);}text+=display.text.slice(start,end);
        for(let i=start;i<end;i++)ranges.push({start:offsets[raw]+display.map[i],end:offsets[raw]+display.ends[i]});
      });
      const chars=outputRuleBlockCharacters(block);let at=text.indexOf(chars.text);
      const first=descriptor.sourceSegments?.[0],bounds=first || descriptor.sourceBounds;
      if(descriptor.segmented && bounds){const raw=first ? first.raw : descriptor.raw;while(at>=0 && ranges[at]?.start<offsets[raw]+bounds.start)at=text.indexOf(chars.text,at+1);}
      if(!chars.text || at<0 || chars.text!==previewEditableText(block,true))return;
      const ownedTargets=targets.map(target=>({...target,block}));
      const perNode=new Map();
      chars.points.forEach((point,index)=>{
        const range=ranges[at+index];if(!point || !range)return;
        const matched=ownedTargets.filter(target=>range.start<target.item.end && range.end>target.item.start);
        if(!matched.length)return;
        if(!perNode.has(point.node))perNode.set(point.node,[]);perNode.get(point.node).push({offset:point.offset,targets:matched});
      });
      perNode.forEach((points,node)=>{
        const runs=[];points.forEach(point=>{
          const previous=runs.at(-1);
          if(previous && previous.end===point.offset && previous.targets.every((target,i)=>target.item===point.targets[i]?.item) && previous.targets.length===point.targets.length)previous.end++;
          else runs.push({start:point.offset,end:point.offset+1,targets:point.targets});
        });
        const fragment=document.createDocumentFragment();let tail=node.data.length;
        runs.reverse().forEach(run=>{
          fragment.prepend(document.createTextNode(node.data.slice(run.end,tail)));
          const span=document.createElement('span');span.className='previewParallelText';span.textContent=node.data.slice(run.start,run.end);
          span.dataset.parallelExcluded=String(run.targets.every(target=>target.excluded));
          parallelPreviewState.spans.set(span,run.targets);fragment.prepend(span);tail=run.start;
        });
        fragment.prepend(document.createTextNode(node.data.slice(0,tail)));node.replaceWith(fragment);
      });
    });
  });
}

function syncSelectionOutputRuleActions(range, block){
  const targets = new Set();
  if(!block.dataset.previewEditChanged) block.querySelectorAll('.previewRuleText').forEach(span => {
    // intersectsNode만 쓰면 선택 경계에 닿은 옆 단어까지 포함하므로 실제 글자 교집합을 검사한다.
    const spanRange = document.createRange(); spanRange.selectNodeContents(span);
    if(range.compareBoundaryPoints(Range.END_TO_START,spanRange) < 0
      && range.compareBoundaryPoints(Range.START_TO_END,spanRange) > 0){
      (outputRulePreviewState.spans.get(span) || []).forEach(target => targets.add(target));
    }
  });
  outputRulePreviewState.selection = Array.from(targets);
  document.querySelectorAll('#selToolbar [data-rule-action]').forEach(button => {
    button.hidden = !outputRulePreviewState.selection.some(target => target.item.excluded === (button.dataset.ruleAction === 'apply'));
  });
  const pairs=new Set();
  if(!block.dataset.previewEditChanged)block.querySelectorAll('.previewParallelText').forEach(span=>{
    const r=document.createRange();r.selectNodeContents(span);
    if(range.compareBoundaryPoints(Range.END_TO_START,r)<0 && range.compareBoundaryPoints(Range.START_TO_END,r)>0)(parallelPreviewState.spans.get(span) || []).forEach(target=>pairs.add(target));
  });
  parallelPreviewState.selection=[...pairs];
  document.querySelectorAll('#selToolbar [data-parallel-action]').forEach(button=>{button.hidden=!parallelPreviewState.selection.some(target=>target.excluded===(button.dataset.parallelAction==='apply'));});
}

function bindOutputRuleInteractions(){
  host.bindUIFeatureEvents('output-rule-occurrences',() => {
    const menu = document.getElementById('outputRulePopover');
    menu.addEventListener('mousedown',event => event.preventDefault());
    host.uiElements.preview.addEventListener('click',event => {
      const selection = window.getSelection();
      if(selection && !selection.isCollapsed) return;
      const span = event.target.closest('.previewRuleText');
      // 병행 제외·다시 적용은 선택 도구막대에서만 처리하고, 클릭 팝업은 치환에만 쓴다.
      if(span){
        const anchor = event.target.closest('.previewParallelText') || span;
        showOutputRulePopover(outputRulePreviewState.spans.get(span) || [],anchor.getBoundingClientRect());
      }
    });
    document.addEventListener('mousedown',event => {
      if(!event.target.closest('#outputRulePopover, #selToolbar, .previewRuleDeletion')) hideOutputRulePopover();
    });
    ['beforeinput','input','compositionstart'].forEach(type => host.uiElements.preview.addEventListener(type,() => {
      hideOutputRulePopover(); hideSelToolbar();
    },true));
    document.addEventListener('keydown',event => { if(event.key === 'Escape') hideOutputRulePopover(); });
    document.addEventListener('scroll',event => {
      if(event.target === document || event.target === document.documentElement
        || event.target === document.body || host.uiElements.previewArea.contains(event.target)) hideOutputRulePopover();
    },true);
    window.addEventListener('resize',hideOutputRulePopover);
    document.querySelectorAll('#selToolbar [data-rule-action]').forEach(button => {
      button.addEventListener('mousedown',event => event.preventDefault());
      button.addEventListener('click',() => changeOutputRuleOccurrences(outputRulePreviewState.selection
        .filter(target => target.item.excluded === (button.dataset.ruleAction === 'apply')),button.dataset.ruleAction === 'exclude'));
    });
    document.querySelectorAll('#selToolbar [data-parallel-action]').forEach(button=>{
      button.addEventListener('mousedown',event=>event.preventDefault());
      button.addEventListener('click',()=>changeParallelOccurrences(parallelPreviewState.selection.filter(target=>target.excluded===(button.dataset.parallelAction==='apply')),button.dataset.parallelAction==='exclude'));
    });
  });
}

function hideSelToolbar(){
  const bar = document.getElementById('selToolbar');
  bar.style.display = 'none';
  bar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  previewEditState.selection = null;
  outputRulePreviewState.selection = [];
  parallelPreviewState.selection = [];
}

function hideBlockToolbar(){
  const bar = document.getElementById('blockToolbar');
  bar.style.display = 'none';
  previewEditState.block = null;
}

function previewBlockContextCurrent(ctx){
  return ctx && (ctx.sourceValue === undefined || (ctx.block.isConnected
    && ctx.ta.isConnected && ctx.ta.value === ctx.sourceValue));
}

function showBlockToolbar(ctx){
  hideSelToolbar();
  // 구분선·이미지의 mousedown은 기본 포커스 이동을 막는다. 왼쪽 입력창 포커스가
  // 남아 도구막대가 숨겨지지 않도록 미리보기 메뉴를 열기 전에 해제한다.
  const active = document.activeElement;
  if(active && active.closest && active.closest('#sidebar')) active.blur();
  document.body.classList.remove('sidebarFieldActive');
  if(!previewBlockContextCurrent(ctx)){ hideBlockToolbar(); return; }
  previewEditState.block = ctx;
  const bar = document.getElementById('blockToolbar');
  const isImage = ctx.type === 'img';
  const isHeading = ctx.type === 'heading';
  bar.setAttribute('aria-label', isHeading ? '마크다운 소제목 단계 변경' : (isImage ? `${ctx.comment ? '코멘트' : '본문'} 이미지 편집` : '문단 구분 요소 편집'));
  bar.querySelectorAll('[data-separator-type]').forEach(button => {
    const isSeparator = !isImage && !isHeading;
    const isCurrent = isSeparator && button.dataset.separatorType === ctx.type;
    button.hidden = !isSeparator;
    button.classList.toggle('active', isCurrent);
    button.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
  });
  bar.querySelector('[data-block-action="ratio"]').hidden = !isImage;
  bar.querySelector('[data-block-action="caption"]').hidden = !isImage;
  bar.querySelector('[data-block-action="delete"]').hidden = isHeading;
  bar.querySelectorAll('[data-heading-level]').forEach(button => {
    const level = Number(button.dataset.headingLevel);
    button.hidden = !isHeading;
    button.classList.toggle('active', isHeading && level === ctx.level);
    button.setAttribute('aria-pressed', isHeading && level === ctx.level ? 'true' : 'false');
  });
  let r = ctx.block.getBoundingClientRect();
  if(isHeading){
    // 전체 너비의 문단 박스 대신 실제 소제목 글자 영역을 기준으로 배치한다.
    const range = document.createRange();
    range.selectNodeContents(ctx.block);
    const textRect = range.getBoundingClientRect();
    if(textRect.width && textRect.height) r = textRect;
  }
  bar.style.display = 'flex';
  const bw = bar.offsetWidth || 100;
  const above = r.top - bar.offsetHeight - 8;
  // 소제목은 글자 중앙 위에, 이미지·구분선은 블록 중앙 위에 배치한다.
  const preferredLeft = r.left + r.width / 2 - bw / 2;
  bar.style.left = Math.max(8, Math.min(window.innerWidth - bw - 8, preferredLeft)) + 'px';
  bar.style.top = Math.max(8, Math.min(window.innerHeight - bar.offsetHeight - 8, above > 8 ? above : r.bottom + 8)) + 'px';
}

function editSeparatorText(text, raw, type, action){
  const lines = text.split('\n');
  if(lines[raw] === undefined) return null;
  const token = lines[raw].match(/^(\s*)\[(?:HR(?:[2-4])?|GAP)\](\s*)$/i);
  if(!token) return null;
  const variants = [
    { type:'hr', token:'[HR]', label:'구분선' },
    { type:'hr2', token:'[HR2]', label:'장면 전환' },
    { type:'hr3', token:'[HR3]', label:'호흡 구분' },
    { type:'hr4', token:'[HR4]', label:'여백' }
  ];
  const current = variants.findIndex(item => item.type === type);
  if(current < 0) return null;
  let message;
  if(String(action).startsWith('separator-')){
    const targetType = String(action).slice('separator-'.length);
    const next = variants.find(item => item.type === targetType);
    const legacyGap = /^\s*\[GAP\]\s*$/i.test(lines[raw]);
    if(!next || (next.type === variants[current].type && !(legacyGap && targetType === 'hr4'))) return null;
    lines[raw] = token[1] + next.token + token[2];
    message = legacyGap && targetType === 'hr4'
      ? '여백 문법을 [HR4]로 변경.'
      : `${variants[current].label}을 ${next.label}으로 변경.`;
  }else if(action === 'delete'){
    lines.splice(raw, 1);
    message = `${variants[current].label} 삭제.`;
  }else return null;
  return {
    text: lines.join('\n'),
    message
  };
}

function editHeadingLevelText(text, raw, action){
  const levelMatch = String(action).match(/^heading-([1-4])$/);
  if(!levelMatch) return null;
  const nextLevel = Number(levelMatch[1]);
  const lines = text.split('\n');
  if(lines[raw] === undefined) return null;
  // 정렬·일부 접기 표시는 그대로 두고 제목의 # 개수만 바꾼다.
  const token = lines[raw].match(/^(\s*(?:\[C\]\s*)?(?:>(?!>)\s*(?:\[C\]\s*)?)?(?:\[접기\s+)?)(#{1,4})(\s+)(.+?)(\s*)$/i);
  if(!token) return null;
  const currentLevel = token[2].length;
  if(currentLevel === nextLevel){
    lines[raw] = token[1] + token[4] + token[5];
    return { text:lines.join('\n'), message:'소제목 표시 해제.' };
  }
  lines[raw] = token[1] + '#'.repeat(nextLevel) + token[3] + token[4] + token[5];
  return {
    text:lines.join('\n'),
    message:`소제목 단계를 ${'#'.repeat(nextLevel)}로 변경.`
  };
}

function buildBodyImageLine(parsed, width, caption){
  const sizeMarker = width === 100 ? '' : ` @${width}`;
  const captionMarker = caption ? ` | ${caption}` : '';
  return `${parsed.leading}[IMG ${parsed.src}${sizeMarker}${captionMarker}]${parsed.trailing}`;
}

function clearCommentImageLine(lines, raw){
  lines[raw] = '';
  // 사진 줄에서 원래 끊겼던 연결 표시만 걷어내, 새 빈 줄이 여분의 <br>가 되지 않게 한다.
  if(raw > 0) lines[raw - 1] = lines[raw - 1].replace(/\[BR\](\s*)$/i, '$1');
}

function editBodyImageText(text, raw, action, comment = false){
  const lines = text.split('\n');
  if(lines[raw] === undefined) return null;
  const parsed = MosaicRenderer.parseBodyImageLine(lines[raw]);
  if(!parsed) return null;

  if(action === 'delete'){
    // 코멘트는 사진 위 [BR]이 아래의 다른 문단과 합쳐지지 않도록 빈 줄을 남긴다.
    if(comment) clearCommentImageLine(lines, raw);
    else lines.splice(raw, 1);
    return { text:lines.join('\n'), message:`${comment ? '코멘트' : '본문'} 이미지 삭제.` };
  }

  if(action === 'ratio'){
    const input = prompt('이미지 가로 비율 (10~100%)\n세로 크기는 원본 비율에 맞춰 자동 조절됩니다.', String(parsed.width));
    if(input === null) return null;
    const width = Number(String(input).replace('%', '').trim());
    if(!Number.isInteger(width) || width < 10 || width > 100){
      host.showNoticeToast('비율은 10~100 사이의 정수로 입력하세요.');
      return null;
    }
    lines[raw] = buildBodyImageLine(parsed, width, parsed.caption);
    return { text:lines.join('\n'), message:`이미지 비율을 ${width}%로 변경.` };
  }

  if(action === 'caption'){
    const input = prompt('이미지 캡션\n빈칸으로 저장하면 캡션이 삭제됩니다.', parsed.caption);
    if(input === null) return null;
    const caption = input.replace(/[\r\n]+/g, ' ').trim();
    lines[raw] = buildBodyImageLine(parsed, parsed.width, caption);
    return { text:lines.join('\n'), message:caption ? '이미지 캡션 수정.' : '이미지 캡션 삭제.' };
  }

  return null;
}

function finishBlockToolbarAction(action){
  if(!previewEditState.block) return;
  const ctx = previewEditState.block;
  if(!previewBlockContextCurrent(ctx)){ hideBlockToolbar(); return; }
  const { ta, raw, type, comment } = ctx;
  const result = type === 'heading'
    ? editHeadingLevelText(ta.value, raw, action)
    : (type === 'img'
        ? editBodyImageText(ta.value, raw, action, comment)
        : editSeparatorText(ta.value, raw, type, action));
  if(!result || !previewBlockContextCurrent(ctx)){ hideBlockToolbar(); return; }
  host.snapshotCards();
  ta.value = result.text;
  hideBlockToolbar();
  host.uiUpdateEffects.committedChange();
  host.showUndoToast(result.message);
}

function bindBlockToolbarEvents(){
  host.bindUIFeatureEvents('block-toolbar', () => {
    document.querySelectorAll('#blockToolbar button').forEach(btn => {
      btn.addEventListener('mousedown', e => e.preventDefault());
      btn.addEventListener('click', () => finishBlockToolbarAction(btn.dataset.blockAction));
    });
  });
}

// 선택 영역을 감싸고 있는 서식 태그(<strong>/<em>)를 블록 안에서 찾음
function activeFormatEl(node, tagName, block){
  let el = node.nodeType === 3 ? node.parentElement : node;
  while(el && el !== block){
    if(el.tagName === tagName) return el;
    el = el.parentElement;
  }
  return null;
}

function previewCardContexts(){
  const preview = host.uiElements.preview;
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  // 출력 순서를 추측하지 않고 MosaicRenderer.buildCard가 기록한 원래 카드 번호로 직접 연결한다.
  // 빈 카드·접기·카드 제목이 중간에 섞여도 다른 카드 textarea로 밀리지 않는다.
  return Array.from(preview.querySelectorAll(':scope > [data-mosaic-card-index]')).map(cardEl => {
    const sourceIndex = Number(cardEl.dataset.mosaicCardIndex);
    const ed = Number.isInteger(sourceIndex) ? editors[sourceIndex] : null;
    return {
      cardEl,
      sourceIndex,
      ed:ed || null,
      ta:ed ? ed.querySelector('textarea') : null
    };
  }).filter(ctx => ctx.ta);
}

function previewCommentContexts(){
  const preview = host.uiElements.preview;
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  return Array.from(preview.querySelectorAll(':scope > [data-mosaic-comment-index]')).map(commentEl => {
    const sourceIndex = Number(commentEl.dataset.mosaicCommentIndex);
    const ed = Number.isInteger(sourceIndex) ? editors[sourceIndex] : null;
    const validEditor = ed && ed.dataset.blockType === 'comment' ? ed : null;
    return {
      commentEl,
      sourceIndex,
      ed:validEditor,
      ta:validEditor ? validEditor.querySelector('textarea') : null
    };
  }).filter(ctx => ctx.ta);
}

// 코멘트의 [BR] 연결 구간은 미리보기에서 하나의 <p>가 되므로 같은 원문 범위와 연결한다.
function commentDisplayEntries(ta){
  return MosaicRenderer.commentParagraphEntries(ta.value);
}

function previewCardBody(cardEl){
  if(!cardEl) return null;
  if(cardEl.tagName === 'DETAILS') return cardEl.querySelector(':scope > div');
  return cardEl.querySelector(':scope > div:not([data-mosaic-card-title="true"])');
}

// 미리보기에서 실제 본문 글자를 가진 최소 블록만 수집한다.
// 바깥 카드·접기 컨테이너와 화자 이름표·꼬리말·장식은 원문 줄과 대응하지 않는다.
function previewSourceBlocks(cardEl){
  const cardSummary = cardEl.tagName === 'DETAILS' && cardEl.firstElementChild
    && cardEl.firstElementChild.tagName === 'SUMMARY' ? cardEl.firstElementChild : null;
  return Array.from(cardEl.querySelectorAll('p, summary, div')).filter(el => {
    if(el === cardSummary) return false;
    if(el.matches('[data-mosaic-quote="true"]')) return true;
    if(el.closest('[data-mosaic-quote="true"]')) return false;
    if(el.matches('[data-mosaic-card-title="true"], [data-mosaic-speaker-label="true"], [data-mosaic-footer="true"], [data-mosaic-credit="true"], [data-mosaic-generated="true"]')) return false;
    if(el.closest('[data-mosaic-card-title="true"], [data-mosaic-speaker-label="true"], [data-mosaic-footer="true"], [data-mosaic-credit="true"], [data-mosaic-generated="true"]')) return false;
    if(el.tagName === 'DIV' && el.querySelector('p, summary, div')) return false;
    return el.textContent.trim() !== '';
  });
}

// 원문 연결을 확신할 수 없는 블록에는 쓰기 권한을 주지 않는다. 새 문법이나
// 출력 변환이 문단 수·글자를 바꿔도 인접 원문을 덮어쓰는 폴백은 사용하지 않는다.
function previewSourceMatches(block, entry){
  return entry && entry.editable
    && MosaicParser.normalizeQuotes(previewEditableText(block, true)) === entry.projection;
}

// 미리보기 최소 글자 블록과 원문 줄은 렌더 순서가 같다.
// 이 순서 매핑은 접기 내부·접기 제목까지 포함해 최상위 블록만 보던 누락을 피한다.
function findBlockSource(node){
  const originEl = node && node.nodeType === 1 ? node : node && node.parentElement;
  if(!originEl || originEl.closest('[data-mosaic-speaker-label="true"], [data-mosaic-footer="true"], [data-mosaic-credit="true"], [data-mosaic-generated="true"]')) return null;
  const ctx = previewCardContexts().find(item => item.cardEl.contains(node));
  if(!ctx) return null;
  const blocks = previewSourceBlocks(ctx.cardEl);
  const block = blocks.find(item => item.contains(node));
  if(!block) return null;
  const entries = host.sourceMap.sourceDisplayEntries(ctx.ta);
  if(blocks.length !== entries.length) return null;
  const entry = entries[blocks.indexOf(block)];
  if(!previewSourceMatches(block, entry)) return null;
  return {
    ta:ctx.ta,
    block,
    raw:entry.raw,
    rawEnd:entry.rawEnd === undefined ? entry.raw : entry.rawEnd,
    rawLines:entry.rawLines,
    sourceSegments:entry.sourceSegments,
    softBreak:!!entry.softBreak,
    segmented:!!entry.segmented,
    sourceBounds:entry.sourceBounds || null
  };
}

function previewEditableText(el, preserveLineBreaks, trim = true){
  const clone = el.cloneNode(true);
  clone.querySelectorAll('[data-mosaic-speaker-label="true"], [data-mosaic-generated="true"]')
    .forEach(node => node.remove());
  // 아래쓰기로 표시되는 병행 번역은 DOM상 인접 span이라 textContent에서 두 문장이
  // 붙어 버린다. 원문의 두 내용 사이 공백과 동일하게 한 칸을 보존한다.
  clone.querySelectorAll('[data-mosaic-parallel-translation-mode="stack"]')
    .forEach(node => node.before(document.createTextNode(' ')));
  if(preserveLineBreaks){
    clone.querySelectorAll('br').forEach(node => node.replaceWith(document.createTextNode('\n')));
    const text = clone.textContent
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]*\n[ \t]*/g, '\n');
    const keepsBlankLines = el.hasAttribute('data-mosaic-inline-comment') || el.hasAttribute('data-mosaic-quote');
    const result=keepsBlankLines ? text : text.replace(/\n{2,}/g, '\n');
    return trim ? result.trim() : result;
  }
  const result=clone.textContent.replace(/\u00a0/g, ' ').replace(/\s*\n\s*/g, ' ');
  return trim ? result.trim() : result;
}

// CSS 아래쓰기는 실제 줄바꿈이 아니므로 Range의 일반 글자 수와 다르다.
// 편집 시작 때 병행 span의 경계를 같은 읽기 규칙으로 기록하고 저장 때 다시 잰다.
// 이 정보는 미리보기 메모리에만 두며 원문·저장 자료·출력 HTML에는 넣지 않는다.
function previewParallelEditSnapshot(el, nodes = null){
  const current=Array.from(el.querySelectorAll('[data-mosaic-parallel-translation]'));
  if(!nodes)nodes=current;
  else if(nodes.some(node=>!el.contains(node))){
    // insertText 붙여넣기는 오른쪽 서식 구획을 같은 속성의 새 노드로 만들 수 있다.
    // 개수·배치 방식과 남은 노드의 순서가 같을 때만 경계를 다시 연결한다.
    // 노드 참조가 바뀌었다고 전체 문자열 비교로 돌아가면 반복 문구가 반대쪽에 저장된다.
    if(current.length!==nodes.length || nodes.some((node,index)=>
      (el.contains(node) && node!==current[index])
      || node.dataset.mosaicParallelTranslationMode!==current[index].dataset.mosaicParallelTranslationMode))return null;
    nodes=current;
  }
  if(!nodes.length || nodes.some(node=>!el.contains(node)))return null;
  const full=previewEditableText(el,true,false),left=full.length-full.trimStart().length;
  const text=MosaicParser.normalizeQuotes(full.trim());
  const offset=(node,after)=>{
    const range=document.createRange();range.selectNodeContents(el);
    if(after)range.setEndAfter(node);else range.setEndBefore(node);
    const fragment=el.cloneNode(false);fragment.append(range.cloneContents());
    let previous=node.previousSibling;
    while(previous && !previous.textContent)previous=previous.previousSibling;
    const preceding=previous?.textContent || '';
    const gap=!after && node.dataset.mosaicParallelTranslationMode!=='stack'
      ? preceding.length-preceding.trimEnd().length : 0;
    return Math.max(0,Math.min(text.length,previewEditableText(fragment,true,false).length-left-gap));
  };
  return {text,anchors:nodes.map(node=>({node,start:offset(node,false),end:offset(node,true)}))};
}

function previewParallelEditHints(el,before){
  const after=previewParallelEditSnapshot(el,before.anchors.map(anchor=>anchor.node));
  if(!after)return null; // 전체 붙여넣기로 구획이 사라지면 기존의 경계 보호 경로를 쓴다.
  const boundaries=[[0,0]];
  before.anchors.forEach((anchor,index)=>{
    boundaries.push([anchor.start,after.anchors[index].start],[anchor.end,after.anchors[index].end]);
  });
  boundaries.push([before.text.length,after.text.length]);
  const hunks=[];
  for(let index=1;index<boundaries.length;index++){
    const [start,nextStart]=boundaries[index-1],[end,nextEnd]=boundaries[index];
    if(end<start || nextEnd<nextStart)return null;
    const old=before.text.slice(start,end),next=after.text.slice(nextStart,nextEnd);
    if(old===next)continue;
    let left=0,right=old.length,nextRight=next.length;
    while(left<right && left<nextRight && old[left]===next[left])left++;
    while(right>left && nextRight>left && old[right-1]===next[nextRight-1]){right--;nextRight--;}
    const changes=host.sourceMap.parallelEditHunks(old.slice(left,right),next.slice(left,nextRight),start+left);
    if(!changes)return null;
    hunks.push(...changes);
  }
  const oldLines=before.text.split('\n'),nextLines=after.text.split('\n');
  if(oldLines.length!==nextLines.length)return null;
  const result=[];let offset=0,used=0;
  for(let index=0;index<oldLines.length;index++){
    const line=oldLines[index],left=line.length-line.trimStart().length;
    const changes=hunks.filter(hunk=>hunk.start>=offset && hunk.end<=offset+line.length)
      .map(hunk=>({...hunk,start:hunk.start-offset-left,end:hunk.end-offset-left}));
    const old=line.trim(),next=nextLines[index].trim();
    if(changes.some(hunk=>hunk.start<0 || hunk.end>old.length || hunk.text.includes('\n')))return null;
    const applied=changes.slice().reverse().reduce((text,hunk)=>text.slice(0,hunk.start)+hunk.text+text.slice(hunk.end),old);
    if(applied!==next)return null;
    result.push({before:old,after:next,hunks:changes});used+=changes.length;offset+=line.length+1;
  }
  return used===hunks.length ? result : null;
}

function revealCoverControl(ids){
  const list = Array.isArray(ids) ? ids : [ids];
  const input = list.map(id => document.getElementById(id)).find(Boolean);
  if(!input) return;
  const btn = document.querySelector('.tabBtn[data-tab="tabCover"]');
  if(btn && !btn.classList.contains('active')) btn.click();
  const group = input.closest('details');
  if(group) group.open = true;
  requestAnimationFrame(() => {
    if(!host.positionSyncEnabled() || !input.isConnected) return;
    const sidebar = document.getElementById('sidebar');
    const sidebarTop = document.getElementById('sidebarTop');
    const target = input.closest('.row') || input;
    const targetRect = target.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    const headerBottom = sidebarTop ? sidebarTop.getBoundingClientRect().bottom : sidebarRect.top;
    const desiredTop = Math.max(sidebarRect.top + 12, headerBottom + 20);
    if(targetRect.top < desiredTop || targetRect.bottom > sidebarRect.bottom - 12){
      sidebar.scrollTop += targetRect.top - desiredTop;
    }
    target.style.boxShadow = '0 0 0 2px var(--accent)';
    setTimeout(() => { if(target.isConnected) target.style.boxShadow = ''; }, 900);
    // URL 입력에는 setSelectionRange 메서드가 있어도 호출하면 예외가 난다.
    // 기존 글씨 편집의 선택만 유지하고 이미지 링크는 표시·강조만 한다.
    if(typeof input.selectionStart === 'number' && typeof input.setSelectionRange === 'function'){
      input.setSelectionRange(0, input.value.length);
    }
  });
}

function revealProfileControl(id){
  const input = document.getElementById(id);
  if(!input) return;
  const coverTab = document.getElementById('tabBtnCover');
  if(coverTab && !coverTab.classList.contains('active')) coverTab.click();
  const profileGroup = document.getElementById('profileGroup');
  if(profileGroup) profileGroup.open = true;
  const extraSlot = String(id).match(/^profileExtra([3-6])/);
  const subgroupId = extraSlot ? `profileExtra${extraSlot[1]}Group` : id.startsWith('profileChar')
    ? 'profileCharGroup'
    : (id.startsWith('profileUser') ? 'profileUserGroup' : 'profileCommonGroup');
  const subgroup = document.getElementById(subgroupId);
  if(subgroup) subgroup.open = true;
  requestAnimationFrame(() => {
    if(!host.positionSyncEnabled() || !input.isConnected) return;
    const sidebar = document.getElementById('sidebar');
    const sidebarTop = document.getElementById('sidebarTop');
    const target = input.closest('.row') || input;
    const targetRect = target.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    const headerBottom = sidebarTop ? sidebarTop.getBoundingClientRect().bottom : sidebarRect.top;
    const desiredTop = Math.max(sidebarRect.top + 12, headerBottom + 20);
    if(targetRect.top < desiredTop || targetRect.bottom > sidebarRect.bottom - 12){
      sidebar.scrollTop += targetRect.top - desiredTop;
    }
    target.style.boxShadow = '0 0 0 2px var(--accent)';
    setTimeout(() => { if(target.isConnected) target.style.boxShadow = ''; }, 900);
  });
}

function creditEditorInput(index, field){
  if(!Number.isInteger(index) || index < 0) return null;
  const row = document.querySelector(`#creditEditorList .creditEditorRow[data-credit-index="${index}"]`);
  if(!row) return null;
  const selector = field === 'label' ? '.creditLabelInput'
    : (field === 'url' ? '.creditUrlInput' : '.creditValueInput');
  return row.querySelector(selector);
}

function revealCreditControl(index, field){
  const input = creditEditorInput(index, field);
  if(!input) return;
  const coverTab = document.getElementById('tabBtnCover');
  if(coverTab && !coverTab.classList.contains('active')) coverTab.click();
  const creditGroup = document.getElementById('creditGroup');
  if(creditGroup) creditGroup.open = true;
  requestAnimationFrame(() => {
    if(!host.positionSyncEnabled() || !input.isConnected) return;
    const sidebar = document.getElementById('sidebar');
    const sidebarTop = document.getElementById('sidebarTop');
    const row = input.closest('.creditEditorRow');
    const target = row || input;
    const targetRect = target.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    const headerBottom = sidebarTop ? sidebarTop.getBoundingClientRect().bottom : sidebarRect.top;
    const desiredTop = Math.max(sidebarRect.top + 12, headerBottom + 20);
    if(targetRect.top < desiredTop || targetRect.bottom > sidebarRect.bottom - 12){
      sidebar.scrollTop += targetRect.top - desiredTop;
    }
    input.style.boxShadow = '0 0 0 2px var(--accent)';
    setTimeout(() => { if(input.isConnected) input.style.boxShadow = ''; }, 900);
  });
}

// 위치 맞추기가 켜져 있으면 미리보기 직접 편집도 기존 양방향 연결에 참여한다.
// 포커스는 미리보기에 둔 채 왼쪽 탭·카드·원문 줄만 찾아 보여준다.
function syncDirectEditPosition(el, descriptor){
  if(descriptor.type === 'body' || descriptor.type === 'comment'){
    host.cardEditors.setActiveTextarea(descriptor.ta);
    host.cardEditors.syncBodyOnlyToolbarAvailability({ target:descriptor.ta });
  }
  if(!host.positionSyncEnabled()) return;
  if(descriptor.type === 'cover' || descriptor.type === 'footer'){
    revealCoverControl(descriptor.id);
    return;
  }
  if(descriptor.type === 'coverSubtitle'){
    revealCoverControl(descriptor.ids);
    return;
  }
  if(descriptor.type === 'profile'){
    revealProfileControl(descriptor.id);
    return;
  }
  if(descriptor.type === 'credit'){
    revealCreditControl(descriptor.index, descriptor.field);
    return;
  }
  if(descriptor.type === 'body'){
    const first = descriptor.sourceSegments?.[0];
    host.revealInEditor(
      descriptor.ta,
      first ? first.raw : descriptor.raw,
      first ? previewEditableText(el,true).split('\n')[0] : previewEditableText(el, true),
      0,
      first ? {start:first.start,end:first.end} : descriptor.sourceBounds,
      descriptor.segmented
    );
    return;
  }
  if(descriptor.type === 'comment'){
    host.revealCommentInEditor(descriptor.ta, descriptor.raw, descriptor.rawEnd);
  }
}

function commitPreviewCoverEdit(el, descriptor, next){
  const input = document.getElementById(descriptor.id);
  if(!input) return;
  const updated = host.sourceMap.replaceVisibleUsingProjection(input.value, next, subtitleEditProjection(descriptor.id, input.value));
  if(updated === input.value) return;
  previewEditState.committing = true;
  host.snapshotCards();
  input.value = updated;
  input.dispatchEvent(new Event('input', { bubbles:true }));
  host.showUndoToast('미리보기에서 표지 수정.');
  previewEditState.committing = false;
  return;
}

function subtitleEditProjection(id, value){
  if(id !== 'subChar' && id !== 'subUser') return host.sourceMap.inlineEditProjection(value);
  const settings = host.getSettings();
  const output = MosaicParser.outputRuleSettings(settings)[id];
  if(output === value) return host.sourceMap.inlineEditProjection(value);
  const masked = host.sourceMap.inlineEditProjection(output);
  const text = masked.replace(/\u0000/g, '');
  const start = value.indexOf(value.trim()), end = start + value.trim().length;
  return {text,map:Array(text.length).fill(start),ends:Array(text.length).fill(end)};
}

function commitPreviewSubtitleEdit(el, descriptor, next){
  const ids = descriptor.ids || [];
  const values = {};
  const hasCouple = ids.includes('subChar') || ids.includes('subUser');
  const hasFree = ids.includes('logSubtitle');
  let coupleText = hasCouple ? next : '';
  let freeText = hasFree ? next : '';
  if(hasCouple && hasFree){
    // 이름 구분 기호도 ·일 수 있으므로 자유 부제 앞의 마지막 구분점을 사용한다.
    const spacedDividerAt = next.lastIndexOf(' · ');
    const dividerAt = spacedDividerAt >= 0 ? spacedDividerAt : next.lastIndexOf('·');
    if(dividerAt >= 0){
      const dividerLength = spacedDividerAt >= 0 ? 3 : 1;
      coupleText = next.slice(0, dividerAt).trim();
      freeText = next.slice(dividerAt + dividerLength).trim();
    }else{
      // 보호 기호를 우회해 ·가 사라져도 이름과 자유 부제를 한 값으로 합치지 않는다.
      const currentNames = [
        MosaicParser.outputRuleSettings(host.getSettings()).subChar,
        MosaicParser.outputRuleSettings(host.getSettings()).subUser
      ];
      const separator = MosaicState.normalizeSubtitleCoupleSeparator(document.getElementById('subtitleCoupleSeparator').value);
      coupleText = currentNames
        .filter(value => value.trim()).join(` ${separator} `);
      freeText = document.getElementById('logSubtitle').value;
    }
  }
  if(ids.includes('subChar') && ids.includes('subUser')){
    const separator = MosaicState.normalizeSubtitleCoupleSeparator(document.getElementById('subtitleCoupleSeparator').value);
    const divider = coupleText.match(new RegExp(`\\s+${host.escRe(separator)}\\s+|${host.escRe(separator)}`));
    if(divider){
      const at = divider.index;
      const first = coupleText.slice(0, at).trim();
      const second = coupleText.slice(at + divider[0].length).trim();
      values.subChar = first;
      values.subUser = second;
    }else{
      // 보호 기호를 우회해 구분 기호가 사라져도 두 입력값을 합치지 않는다.
      // 기존 값을 그대로 보존해 두 이름이 중복되는 회귀를 막는다.
      values.subChar = document.getElementById('subChar').value;
      values.subUser = document.getElementById('subUser').value;
    }
  }else if(ids.includes('subChar')){
    values.subChar = coupleText;
  }else if(ids.includes('subUser')){
    values.subUser = coupleText;
  }
  if(hasFree) values.logSubtitle = freeText;
  Object.keys(values).forEach(id => {
    const input = document.getElementById(id);
    values[id] = host.sourceMap.replaceVisibleUsingProjection(input.value, values[id], subtitleEditProjection(id, input.value));
  });
  const changed = Object.entries(values).some(([id, value]) => document.getElementById(id).value !== value);
  if(!changed) return;
  previewEditState.committing = true;
  host.snapshotCards();
  Object.entries(values).forEach(([id, value]) => { document.getElementById(id).value = value; });
  const trigger = document.getElementById(Object.keys(values)[0]);
  if(trigger) trigger.dispatchEvent(new Event('input', { bubbles:true }));
  host.showUndoToast('미리보기에서 부제 수정.');
  previewEditState.committing = false;
  return;
}

function commitPreviewInlineFieldEdit(el, descriptor, next){
  const input = document.getElementById(descriptor.id);
  if(!input) return;
  const visible = descriptor.normalizeTag ? host.normalizeProfileTag(next) : next;
  const updated = host.sourceMap.replaceVisibleUsingProjection(
    input.value,
    visible,
    host.sourceMap.inlineEditProjection(input.value),
    descriptor.multiline === true
  );
  if(updated === input.value) return;
  previewEditState.committing = true;
  try {
    host.snapshotCards();
    input.value = updated;
    input.dispatchEvent(new Event('input', { bubbles:true }));
    host.showUndoToast(descriptor.type === 'footer' ? '미리보기에서 꼬리말 수정.' : '미리보기에서 프로필 수정.');
  } finally {
    previewEditState.committing = false;
  }
  return;
}

function commitPreviewCreditEdit(el, descriptor, next){
  const input = creditEditorInput(descriptor.index, descriptor.field);
  if(!input) return;
  const updated = String(next).slice(0, Number(input.maxLength) > 0 ? Number(input.maxLength) : 500);
  const staged = el.dataset.previewCreditStaged === 'true';
  if(updated === input.value && !staged) return;
  previewEditState.committing = true;
  try {
    // 입력 중 이미 원본 필드에 임시 동기화했다면 그때 만든 수정 전 스냅샷을 보존한다.
    // blur에서 다시 스냅샷을 만들면 실행 취소 기준도 수정 후 값으로 덮일 수 있다.
    if(!staged) host.snapshotCards();
    input.value = updated;
    host.setCreditItems(host.readCreditItems(), true);
    host.showUndoToast(`미리보기에서 크레딧 ${descriptor.field === 'label' ? '항목명' : '내용'} 수정.`);
  } finally {
    delete el.dataset.previewCreditStaged;
    previewEditState.committing = false;
  }
  return;
}

// One commit path applies a planned source change and records its before/after state.
function applyPreviewSourceChange(ta, change){
  if(!change) return;
  if(ta.value !== change.before){ host.uiUpdateEffects.renderNow(); return; }
  previewEditState.committing = true;
  try {
    host.snapshotCards();
    ta.value = change.after;
    host.cardEditors.setActiveTextarea(ta);
    ta.dispatchEvent(new Event('input', { bubbles:true }));
    host.showUndoToast(change.message);
  } finally { previewEditState.committing = false; }
}

function commitPreviewCommentEdit(el, descriptor, next){
  const context = previewCommentContexts().find(ctx => ctx.commentEl.contains(el));
  if(!context || context.ta !== descriptor.ta){ host.uiUpdateEffects.renderNow(); return; }
  const {ta, ...source} = descriptor;
  if(ta) applyPreviewSourceChange(ta,host.sourceEdits.planCommentChange(ta.value,source,next));
}


function commitPreviewBodyEdit(el, descriptor, next){
  const context = previewCardContexts().find(ctx => ctx.cardEl.contains(el));
  if(!context || context.ta !== descriptor.ta
    || (descriptor.sourceValue !== undefined && descriptor.sourceValue !== descriptor.ta.value)){
    host.uiUpdateEffects.renderNow();
    return;
  }
  const {ta, ...source} = descriptor;
  if(!ta) return;
  const change = host.sourceEdits.planBodyChange(ta.value,source,next,{
    inlineComment:el.hasAttribute?.('data-mosaic-inline-comment'),
    dialogue:el.matches?.('[data-mosaic-dialogue="true"]'),
    settings:host.getSettings(),
    lineSettings:(raw,column)=>host.sourceMap.outputRuleLineSettings(ta,raw,column)
  });
  applyPreviewSourceChange(ta,change);
}

function commitPreviewDirectEdit(el, descriptor){
  if(previewEditState.committing) return;
  const preservesLineBreaks = descriptor.type === 'body' || descriptor.type === 'comment' || descriptor.multiline === true;
  const next = previewEditableText(el, preservesLineBreaks);
  switch(descriptor.type){
    case 'cover': return commitPreviewCoverEdit(el, descriptor, next);
    case 'coverSubtitle': return commitPreviewSubtitleEdit(el, descriptor, next);
    case 'profile':
    case 'footer': return commitPreviewInlineFieldEdit(el, descriptor, next);
    case 'credit': return commitPreviewCreditEdit(el, descriptor, next);
    case 'comment': return commitPreviewCommentEdit(el, descriptor, next);
    default: {
      const before=descriptor.ta?.value;
      const result=commitPreviewBodyEdit(el, descriptor, next);
      const settings=host.getSettings();
      if(descriptor.ta?.value===before && descriptor.projection!==undefined && next!==descriptor.projection
        && (settings.parallelTranslationOrder==='translation' || settings.parallelTranslationBrackets==='hide')){
        host.uiUpdateEffects.renderNow();
        host.showNoticeToast('원문·번역 경계를 바꾸는 편집은 본문 입력에서 해주세요.');
      }
      return result;
    }
  }
}

function previewRangeText(range){
  const fragment = range.cloneContents();
  fragment.querySelectorAll('[data-mosaic-speaker-label="true"], [data-mosaic-generated="true"]')
    .forEach(node => node.remove());
  // 아래쓰기 번역은 DOM 글자가 붙어 있어도 원문에서는 공백으로 구분된다.
  fragment.querySelectorAll('[data-mosaic-parallel-translation-mode="stack"]')
    .forEach(node => node.before(document.createTextNode(' ')));
  return fragment.textContent.replace(/\u00a0/g, ' ');
}

// 문장 전체를 잡으면 Range 끝점이 부모의 자식 경계나 다음 문단의 0번 위치에
// 걸릴 수 있다. 실제 선택된 글자로 좁히되, 다른 문단의 글자는 버리지 않고 검증한다.
function previewTextSelectionRange(range){
  if(range.collapsed || !range.intersectsNode(host.uiElements.preview)) return null;
  const selected = [];
  const collect = node => {
    if(!range.intersectsNode(node)) return;
    const start = range.startContainer === node ? range.startOffset : 0;
    const end = range.endContainer === node ? range.endOffset : node.nodeValue.length;
    const text = node.nodeValue.slice(start, end);
    if(!text.trim()) return;
    selected.push({
      node,
      start:start + text.length - text.trimStart().length,
      end:end - text.length + text.trimEnd().length
    });
  };
  const root = range.commonAncestorContainer;
  if(root.nodeType === Node.TEXT_NODE) collect(root);
  else{
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while((node = walker.nextNode())) collect(node);
  }
  if(!selected.length || selected.some(item => !host.uiElements.preview.contains(item.node))) return null;
  const editable = selected.filter(item => !item.node.parentElement.closest(
    '[data-mosaic-speaker-label="true"], [data-mosaic-generated="true"]'));
  if(!editable.length) return null;
  const normalized = range.cloneRange();
  normalized.setStart(editable[0].node, editable[0].start);
  const last = editable[editable.length - 1];
  normalized.setEnd(last.node, last.end);
  return { range:normalized, selected, text:previewRangeText(normalized).trim() };
}

function previewSelectionDetails(el, formatNode){
  let text = '';
  let before = '';
  if(formatNode){
    text = formatNode.textContent || '';
    const pre = document.createRange();
    pre.selectNodeContents(el);
    try { pre.setEndBefore(formatNode); } catch(e){ return null; }
    before = previewRangeText(pre);
  }else{
    const sel = window.getSelection();
    if(!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const picked = previewTextSelectionRange(sel.getRangeAt(0));
    if(!picked || picked.selected.some(item => !el.contains(item.node))) return null;
    const range = picked.range;
    text = picked.text;
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    before = previewRangeText(pre);
  }
  text = text.replace(/\u00a0/g, ' ').trim();
  if(!text) return null;
  let occurrence = 0;
  let from = 0;
  let at = before.indexOf(text, from);
  while(at !== -1){
    occurrence++;
    from = at + Math.max(1, text.length);
    at = before.indexOf(text, from);
  }
  return { text, occurrence };
}

// 브라우저가 contenteditable 내부에 자체 <b>/<i>를 넣더라도 DOM에만 남겨두지 않고
// 반드시 대응하는 본문 원문 줄의 **...** / *...* 문법으로 변환한다.
function applyPreviewFormatToSource(el, descriptor, fmt, details){
  if(previewEditState.committing || !descriptor || descriptor.type !== 'body' || !details) return false;
  if(el?.hasAttribute?.('data-mosaic-inline-comment')) return false;
  const owningContext = previewCardContexts().find(ctx => ctx.cardEl.contains(el));
  if(!owningContext || owningContext.ta !== descriptor.ta) return false;
  const ta = descriptor.ta;
  const lines = ta ? ta.value.split('\n') : [];
  const resolved = host.sourceMap.descriptorSelectionSource(descriptor, details.text, details.occurrence);
  if(!resolved) return false;
  const raw = resolved.raw;
  const line = lines[raw];
  if(line === undefined) return false;
  const sourceRange = resolved.range;
  const wrap = FMT_WRAP[fmt];
  if(!wrap) return false;

  let nextLine = '';
  let removed = false;
  for(const match of MosaicParser.formatMatches(fmt, line)){
    const innerStart = match.index + wrap.length;
    const innerEnd = match.index + match[0].length - wrap.length;
    if(sourceRange.start >= innerStart && sourceRange.end <= innerEnd){
      nextLine = line.slice(0, match.index) + MosaicParser.formatMatchContent(fmt, match) + line.slice(match.index + match[0].length);
      removed = true;
      break;
    }
  }
  if(!nextLine){
    const selectedSource = line.slice(sourceRange.start, sourceRange.end);
    nextLine = line.slice(0, sourceRange.start) + wrap + selectedSource + wrap + line.slice(sourceRange.end);
  }
  if(nextLine === line) return false;

  previewEditState.committing = true;
  try {
    host.snapshotCards();
    lines[raw] = nextLine;
    ta.value = lines.join('\n');
    host.cardEditors.setActiveTextarea(ta);
    ta.dispatchEvent(new Event('input', { bubbles:true }));
    host.showUndoToast(`${fmt === 'bold' ? '굵게' : '강조'} 서식 ${removed ? '해제' : '적용'}.`);
  } finally {
    previewEditState.committing = false;
  }
  return true;
}

function wrapPreviewTextTokenAt(el, offset, token, key, label){
  if(offset < 0 || el.querySelector(`[data-preview-protected-token="${key}"]`)) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  let consumed = 0;
  while((node = walker.nextNode())){
    const end = consumed + node.nodeValue.length;
    if(offset < consumed || offset >= end){
      consumed = end;
      continue;
    }
    const at = offset - consumed;
    if(node.nodeValue.slice(at, at + token.length) !== token) return;
    const before = node.nodeValue.slice(0, at);
    const after = node.nodeValue.slice(at + token.length);
    const divider = document.createElement('span');
    divider.dataset.previewProtectedToken = key;
    divider.setAttribute('contenteditable', 'false');
    divider.setAttribute('aria-label', label);
    divider.textContent = token;
    const fragment = document.createDocumentFragment();
    if(before) fragment.appendChild(document.createTextNode(before));
    fragment.appendChild(divider);
    if(after) fragment.appendChild(document.createTextNode(after));
    node.parentNode.replaceChild(fragment, node);
    return;
  }
}

function protectPreviewSubtitleDividers(el, keys){
  if(!el || !Array.isArray(keys) || !keys.length) return;
  let text = el.textContent;
  if(keys.includes('subtitle-couple-divider')){
    const token = MosaicState.normalizeSubtitleCoupleSeparator(document.getElementById('subtitleCoupleSeparator').value);
    const spacedAt = text.indexOf(` ${token} `);
    const offset = spacedAt >= 0 ? spacedAt + 1 : text.indexOf(token);
    wrapPreviewTextTokenAt(el, offset, token, 'subtitle-couple-divider', '이름 구분 기호');
  }
  if(keys.includes('subtitle-free-divider')){
    text = el.textContent;
    // 이름 사이에도 ·를 선택할 수 있으므로 자유 부제 앞의 마지막 점을 보호한다.
    const spacedAt = text.lastIndexOf(' · ');
    const offset = spacedAt >= 0 ? spacedAt + 1 : text.lastIndexOf('·');
    wrapPreviewTextTokenAt(el, offset, '·', 'subtitle-free-divider', '자유 부제 구분 기호');
  }
}

function previewSelectionOffsets(el){
  const selection = window.getSelection();
  if(!selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if(!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;
  const beforeStart = document.createRange();
  beforeStart.selectNodeContents(el);
  beforeStart.setEnd(range.startContainer, range.startOffset);
  const beforeEnd = document.createRange();
  beforeEnd.selectNodeContents(el);
  beforeEnd.setEnd(range.endContainer, range.endOffset);
  return { start:beforeStart.toString().length, end:beforeEnd.toString().length };
}

// contenteditable 문단의 시작에서 Backspace, 끝에서 Delete를 누르면 브라우저가
// 이웃 문단 DOM을 합칠 수 있다. 그 상태에서 blur 저장이 실행되면 현재 문단이 아닌
// 인용문의 마지막 줄이나 구분선 너머 문단까지 수정 범위로 오인할 수 있으므로,
// 문단 경계를 넘는 삭제만 막고 문단 내부 선택 삭제는 그대로 허용한다.
function previewBoundaryDeleteBlocked(el, inputType){
  // 모바일 편집기와 단어·행 단위 삭제도 같은 경계를 넘을 수 있다.
  const direction = String(inputType).match(/^delete(?:Content|Word|SoftLine|HardLine)(Backward|Forward)$/i);
  if(!direction) return false;
  const selection = previewSelectionOffsets(el);
  if(!selection || selection.start !== selection.end) return false;
  const fullRange = document.createRange();
  fullRange.selectNodeContents(el);
  const length = fullRange.toString().length;
  if(direction[1].toLowerCase() === 'backward') return selection.start === 0;
  return selection.start === length;
}

function subtitleDividerEditBlocked(el, inputType){
  const dividers = Array.from(el.querySelectorAll('[data-preview-protected-token]'));
  const selection = previewSelectionOffsets(el);
  if(!dividers.length || !selection) return false;
  return dividers.some(divider => {
    const beforeDivider = document.createRange();
    beforeDivider.selectNodeContents(el);
    beforeDivider.setEndBefore(divider);
    const dividerStart = beforeDivider.toString().length;
    const dividerEnd = dividerStart + divider.textContent.length;
    if(selection.start !== selection.end){
      return selection.start < dividerEnd && selection.end > dividerStart;
    }
    if(/^delete.*Backward$/i.test(inputType)) return selection.start === dividerEnd;
    if(/^delete.*Forward$/i.test(inputType)) return selection.start === dividerStart;
    return false;
  });
}

// 키보드와 beforeinput의 줄바꿈을 같은 DOM 경로로 처리한다. 문단 끝에서도
// 다음 입력이 새 줄에 놓이도록, 원문에 저장되지 않는 보조 br을 둔다.
function insertPreviewSoftBreak(el){
  const selection = window.getSelection();
  if(!selection || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if(!el.contains(range.startContainer) || !el.contains(range.endContainer)) return false;
  range.deleteContents();
  const br = document.createElement('br');
  range.insertNode(br);
  if(!el.querySelector('[data-preview-soft-break-placeholder]')){
    const after = document.createRange();
    after.selectNodeContents(el);after.setStartAfter(br);
    const remaining = after.cloneContents();
    remaining.querySelectorAll('[data-mosaic-generated="true"]').forEach(node => node.remove());
    if(!remaining.textContent && !remaining.querySelector('br')){
      const placeholder = document.createElement('br');
      placeholder.dataset.mosaicGenerated = 'true';
      placeholder.dataset.previewSoftBreakPlaceholder = 'true';
      placeholder.setAttribute('aria-hidden', 'true');
      el.append(placeholder);
    }
  }
  range.setStartAfter(br);range.collapse(true);
  selection.removeAllRanges();selection.addRange(range);
  return true;
}

// 병행 쌍의 한쪽은 원문 한 줄 안의 문구다. 외부 복사의 CR/LF가 그 쌍을
// 별도 본문 줄로 쪼개지 않도록 해당 문구 안에서 붙여넣을 때만 공백으로 정리한다.
function previewPasteWithinParallelPart(el){
  const selection=window.getSelection();
  if(!selection?.rangeCount)return false;
  const range=selection.getRangeAt(0);
  const part=node=>(node.nodeType===Node.ELEMENT_NODE ? node : node.parentElement)?.closest('.previewParallelText');
  const start=part(range.startContainer),end=part(range.endContainer);
  return !!start && start===end && el.contains(start) && start.dataset.parallelExcluded!=='true';
}

// A restored work replaces the pending preview edit. End it before changing its
// source so blur cannot commit into the new work or reenter HTML replacement.
function discardActiveDirectEdit(){
  const active = document.activeElement;
  const descriptor = previewDirectEditDescriptors.get(active);
  if(!descriptor) return;
  descriptor.discardOnBlur = true;
  try { active.blur(); }
  finally { delete descriptor.discardOnBlur; }
}

function enablePreviewDirectEditor(el, descriptor, label){
  if(!el) return;
  if(el.dataset.previewDirectEdit === 'true'){
    const current = previewDirectEditDescriptors.get(el);
    if(current) Object.assign(current, descriptor);
    return;
  }
  const preservesLineBreaks = descriptor.type === 'body' || descriptor.type === 'comment' || descriptor.multiline === true;
  el.dataset.previewDirectEdit = 'true';
  el.dataset.previewEditType = descriptor.type;
  previewDirectEditDescriptors.set(el, descriptor);
  el.setAttribute('contenteditable', 'plaintext-only');
  el.setAttribute('role', 'textbox');
  el.setAttribute('aria-label', label);
  el.setAttribute('title', preservesLineBreaks
    ? '미리보기에서 수정 · Enter 저장 · Shift+Enter 같은 문단 줄바꿈 · Esc 취소'
    : '미리보기에서 수정 · Enter 저장 · Esc 취소');
  // 미리보기는 교정 화면이 아니므로 브라우저·확장 프로그램의 빨간 맞춤법 밑줄을 표시하지 않는다.
  el.spellcheck = false;
  el.setAttribute('spellcheck', 'false');
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('autocapitalize', 'off');
  el.setAttribute('data-gramm', 'false');
  el.setAttribute('data-gramm_editor', 'false');
  el.setAttribute('data-enable-grammarly', 'false');
  el.querySelectorAll('[data-mosaic-speaker-label="true"], [data-mosaic-generated="true"]')
    .forEach(node => node.setAttribute('contenteditable', 'false'));
  if(descriptor.protectedSubtitleTokens) protectPreviewSubtitleDividers(el, descriptor.protectedSubtitleTokens);

  el.addEventListener('focus', () => {
  let cancelled = false;
  let focusValue = '';
  let parallelSnapshot = null;
  let parallelPastePending = false;
  const syncChangedHighlight = () => {
    if(previewEditableText(el, preservesLineBreaks) !== focusValue){
      el.dataset.previewEditChanged = 'true';
    }else{
      delete el.dataset.previewEditChanged;
    }
  };
  const onFocus = () => {
    focusValue = previewEditableText(el, preservesLineBreaks);
    parallelSnapshot = descriptor.type==='body' ? previewParallelEditSnapshot(el) : null;
    parallelPastePending = false;
    delete el.dataset.previewEditChanged;
    syncDirectEditPosition(el, descriptor);
  };
  el.addEventListener('focus', onFocus);
  el.addEventListener('beforeinput', e => {
    if(previewBoundaryDeleteBlocked(el, e.inputType || '')){
      e.preventDefault();
      return;
    }
    if(descriptor.protectedSubtitleTokens && subtitleDividerEditBlocked(el, e.inputType || '')){
      e.preventDefault();
      return;
    }
    const fmt = e.inputType === 'formatBold' ? 'bold'
      : (e.inputType === 'formatItalic' ? 'emphasis' : null);
    if(fmt){
      e.preventDefault();
      applyPreviewFormatToSource(el, descriptor, fmt, previewSelectionDetails(el));
      return;
    }
    if(e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak'){
      if(e.isComposing) return;
      e.preventDefault();
      if(e.inputType === 'insertLineBreak' && preservesLineBreaks && insertPreviewSoftBreak(el)){
        syncChangedHighlight();
      }
    }
  });
  el.addEventListener('paste', e => {
    e.preventDefault();
    if(descriptor.protectedSubtitleTokens && subtitleDividerEditBlocked(el, 'insertFromPaste')) return;
    const pasted = (e.clipboardData || window.clipboardData).getData('text/plain');
    let plain = preservesLineBreaks
      ? pasted.replace(/\r\n?/g, '\n')
      : pasted.replace(/\s*\n\s*/g, ' ');
    if(parallelSnapshot && previewPasteWithinParallelPart(el)){
      parallelPastePending = true;
      plain=plain.replace(/[ \t]*\n\s*$/u,'').replace(/[ \t]*\n[ \t]*/g,' ');
    }
    document.execCommand('insertText', false, plain);
  });
  el.addEventListener('cut', e => {
    if(descriptor.protectedSubtitleTokens && subtitleDividerEditBlocked(el, 'deleteByCut')) e.preventDefault();
  });
  el.addEventListener('input', e => {
    if(descriptor.protectedSubtitleTokens && descriptor.protectedSubtitleTokens.some(key =>
      !el.querySelector(`[data-preview-protected-token="${key}"]`))){
      // 일부 브라우저의 편집 명령이 beforeinput을 건너뛰면 원본 필드로 즉시 복구한다.
      host.uiUpdateEffects.renderNow();
      return;
    }
    const fmt = e.inputType === 'formatBold' ? 'bold'
      : (e.inputType === 'formatItalic' ? 'emphasis' : null);
    if(fmt) applyPreviewFormatToSource(el, descriptor, fmt, previewSelectionDetails(el));
    syncChangedHighlight();
    if(descriptor.type === 'credit'){
      const input = creditEditorInput(descriptor.index, descriptor.field);
      if(!input) return;
      const staged = previewEditableText(el, false)
        .slice(0, Number(input.maxLength) > 0 ? Number(input.maxLength) : 500);
      if(staged === input.value) return;
      // 다음 크레딧 입력이 전체 항목을 직렬화하기 전에 현재 미리보기 수정값을
      // 원본 입력과 숨은 저장 필드에 함께 반영한다. 렌더는 blur까지 미뤄 포커스를 지킨다.
      if(el.dataset.previewCreditStaged !== 'true') host.snapshotCards();
      input.value = staged;
      host.setCreditItems(host.readCreditItems(), false);
      el.dataset.previewCreditStaged = 'true';
    }
  });
  el.addEventListener('keydown', e => {
    if(e.isComposing || e.keyCode === 229) return;
    if(e.key === 'Backspace' || e.key === 'Delete'){
      const inputType = e.key === 'Backspace' ? 'deleteContentBackward' : 'deleteContentForward';
      if(previewBoundaryDeleteBlocked(el, inputType)){
        e.preventDefault();
        return;
      }
    }
    const shortcut = (e.metaKey || e.ctrlKey) && !e.altKey ? e.key.toLowerCase() : '';
    if(shortcut === 'b' || shortcut === 'i'){
      e.preventDefault();
      if(descriptor.type === 'body'){
        const fmt = shortcut === 'b' ? 'bold' : 'emphasis';
        const button = document.querySelector(`#selToolbar button[data-fmt="${fmt}"]`);
        if(previewEditState.selection && button) button.click();
      }
      return;
    }
    if(e.key === 'Enter'){
      e.preventDefault();
      if(e.shiftKey && preservesLineBreaks){
        if(insertPreviewSoftBreak(el)) syncChangedHighlight();
        return;
      }
      el.blur();
    } else if(e.key === 'Escape'){
      e.preventDefault();
      cancelled = true;
      if(descriptor.type === 'credit' && el.dataset.previewCreditStaged === 'true'){
        const input = creditEditorInput(descriptor.index, descriptor.field);
        if(input){
          input.value = focusValue;
          host.setCreditItems(host.readCreditItems(), false);
        }
        delete el.dataset.previewCreditStaged;
        host.discardUndoSnapshot();
      }
      el.blur();
      host.uiUpdateEffects.renderNow();
    }
  });
  el.addEventListener('blur', () => {
    if(cancelled || descriptor.discardOnBlur) return;
    const editHints=parallelSnapshot ? previewParallelEditHints(el,parallelSnapshot) : null;
    if(parallelPastePending && !editHints && parallelSnapshot.anchors.some(anchor=>!el.contains(anchor.node))){
      // 구획 자체가 지워져 재연결도 실패하면 원문·번역 위치를 문자열로 추측하지 않는다.
      host.uiUpdateEffects.renderNow();
      host.showNoticeToast('원문·번역 구획이 사라져 저장하지 않았습니다. 다시 붙여넣거나 본문 입력에서 수정해 주세요.');
      return;
    }
    // 클릭·선택·위치 연동만으로는 원문을 다시 쓰지 않는다. 실제 입력이나 삭제로
    // 보이는 내용이 달라진 경우에만 저장해 문장 복제와 잘못된 덮어쓰기를 막는다.
    if(previewEditableText(el, preservesLineBreaks) === focusValue && !editHints?.some(hint=>hint.hunks.length)){
      if(descriptor.type === 'credit' && el.dataset.previewCreditStaged === 'true') host.discardUndoSnapshot();
      delete el.dataset.previewCreditStaged;
      delete el.dataset.previewEditChanged;
      return;
    }
    descriptor.parallelEditHints = editHints;
    try{commitPreviewDirectEdit(el, descriptor);}
    finally{delete descriptor.parallelEditHints;}
    delete el.dataset.previewEditChanged;
  });

  // 일부 브라우저의 선택 메뉴는 beforeinput/input 없이 DOM 태그만 삽입한다.
  // 새로 생긴 서식 요소를 감시해 같은 원문 변환 경로로 보낸다.
  if(descriptor.type === 'body' && typeof MutationObserver === 'function'){
    const knownNodes = new WeakSet([el, ...el.querySelectorAll('*')]);
    const observer = new MutationObserver(() => {
      if(previewEditState.committing || !el.isConnected) return;
      const candidates = Array.from(el.querySelectorAll('b, strong, i, em, span[style]'));
      const added = candidates.find(node => !knownNodes.has(node));
      candidates.forEach(node => knownNodes.add(node));
      if(!added) return;
      const tag = added.tagName;
      const weight = (added.style && added.style.fontWeight) || '';
      const italic = (added.style && added.style.fontStyle) === 'italic';
      const fmt = (tag === 'B' || tag === 'STRONG' || /^(?:bold|[7-9]00)$/.test(weight))
        ? 'bold'
        : ((tag === 'I' || tag === 'EM' || italic) ? 'emphasis' : null);
      if(fmt) applyPreviewFormatToSource(el, descriptor, fmt, previewSelectionDetails(el, added));
    });
    observer.observe(el, { childList:true, subtree:true, attributes:true, attributeFilter:['style'] });
  }
  onFocus();
  }, {once:true, capture:true});
}

// 소제목을 한 번 클릭하면 # 단계 선택 메뉴를 연다.
function bindHeadingLevelInteraction(block, ctx){
  if(!block || block.dataset.mosaicHeadingLevelBound === 'true') return;
  block.dataset.mosaicHeadingLevelBound = 'true';
  block.title = '클릭해서 # 단계 변경 · 글자는 미리보기에서 직접 수정';
  block.addEventListener('click', () => {
    if(block.isConnected) showBlockToolbar(ctx);
  });
  block.addEventListener('contextmenu', e => e.preventDefault());
}

const PROFILE_DIRECT_EDIT_LABELS = Object.freeze({
  profileCharRole:'BOT 라벨 수정',
  profileCharName:'BOT 이름 수정',
  profileCharDesc:'BOT 소개 수정',
  profileUserRole:'USER 라벨 수정',
  profileUserName:'USER 이름 수정',
  profileUserDesc:'USER 소개 수정',
  profileRelationship1:'관계·키워드 1 수정',
  profileRelationship2:'관계·키워드 2 수정',
  profileRelationship3:'관계·키워드 3 수정',
  profileSituation:'상황·요약 수정'
});

// 대표 이미지와 사진 배경 표제의 빈 부분은 같은 이미지 URL 설정으로 연결한다.
// 글씨 영역은 기존 직접 편집이 담당하며, 이 탐색 속성은 미리보기 DOM에만 붙인다.
function decoratePreviewCoverImageNavigation(){
  if(!previewEditState.ready) return;
  const { image, title } = host.previewParts();
  const targets = [image, title && title.hasAttribute('data-mosaic-image-background') ? title : null];
  targets.filter(Boolean).forEach(target => {
    if(target.dataset.previewCoverImageNavigation === 'true') return;
    target.dataset.previewCoverImageNavigation = 'true';
    target.tabIndex = 0;
    target.setAttribute('role', 'button');
    target.setAttribute('aria-label', '대표 이미지 URL 설정으로 이동');
    target.title = '클릭하면 대표 이미지 URL 설정으로 이동';
    target.style.cursor = 'pointer';
    const reveal = event => {
      if(event.target.closest('[data-preview-direct-edit="true"]')) return;
      if(host.positionSyncEnabled() && target.isConnected) revealCoverControl('imgUrl');
    };
    target.addEventListener('click', reveal);
    target.addEventListener('keydown', event => {
      // 표제 글씨에서 Enter 저장·Space 입력이 부모의 버튼 동작으로 번지지 않게 한다.
      if(event.target !== target || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      reveal(event);
    });
  });
}

function decoratePreviewProfileEditors(){
  if(!previewEditState.ready) return;
  const profile = host.previewParts().profile;
  if(!profile) return;
  profile.querySelectorAll('[data-mosaic-profile-field]').forEach(field => {
    const id = field.dataset.mosaicProfileField;
    const input = document.getElementById(id);
    if(!input) return;
    const isTag = /(?:Tag|Relationship)\d$/.test(id);
    const multiline = input.tagName === 'TEXTAREA';
    enablePreviewDirectEditor(field, {
      type:'profile',
      id,
      multiline,
      normalizeTag:isTag
    }, PROFILE_DIRECT_EDIT_LABELS[id] || (isTag ? '프로필 태그 수정' : '프로필 내용 수정'));
    // 이름에 연결 URL이 있어도 미리보기에서는 편집을 우선하고 페이지를 이탈하지 않는다.
    field.querySelectorAll('a').forEach(link => {
      link.removeAttribute('href');
      link.removeAttribute('target');
      link.tabIndex = -1;
      link.addEventListener('click', event => event.preventDefault());
    });
  });

  profile.querySelectorAll('[data-mosaic-profile-image-field]').forEach(image => {
    const id = image.dataset.mosaicProfileImageField;
    image.removeAttribute('aria-hidden');
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', '왼쪽의 프로필 이미지 설정으로 이동');
    image.title = '클릭하면 왼쪽의 프로필 이미지 설정으로 이동';
    image.style.cursor = 'pointer';
    const reveal = event => {
      if(event?.target.closest('[data-mosaic-profile-field]')) return;
      if(host.positionSyncEnabled()) revealProfileControl(id);
    };
    image.addEventListener('click', reveal);
    image.addEventListener('keydown', event => {
      if(event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      reveal(event);
    });
  });

  // 역할명이나 카드의 빈 부분을 눌러도 해당 BOT/USER 설정 묶음을 찾을 수 있게 한다.
  profile.querySelectorAll('[data-mosaic-profile-role]').forEach(item => {
    item.addEventListener('click', event => {
      if(event.target.closest('[data-mosaic-profile-field], [data-mosaic-profile-image-field]')) return;
      const role = item.dataset.mosaicProfileRole;
      const id = /^extra[3-5]$/.test(role) ? `profileExtra${role.slice(-1)}Name`
        : role === 'user' ? 'profileUserName' : 'profileCharName';
      if(host.positionSyncEnabled()) revealProfileControl(id);
    });
  });
}

// 표시된 작성자 이름만 편집한다. 도구 링크·©와 꼬리말 여백은 편집 영역에서 제외한다.
function decoratePreviewFooterEditor(){
  if(!previewEditState.ready) return;
  const footer = host.uiElements.preview.querySelector('[data-mosaic-footer="true"]');
  if(!footer) return;
  // 게시용 링크는 유지하고, 미리보기 DOM에서만 도구 링크의 이동을 막는다.
  const toolLink = footer.querySelector(':scope > a');
  if(toolLink){
    toolLink.removeAttribute('href');
    toolLink.removeAttribute('target');
    toolLink.tabIndex = -1;
  }
  if(footer.querySelector('[data-preview-footer-field]')) return;
  const author = footer.querySelector('[data-mosaic-footer-author="true"]');
  if(!author) return;
  const field = document.createElement('span');
  field.dataset.previewFooterField = 'footerAuthor';
  const prefix = author.firstChild;
  if(prefix?.nodeType === Node.TEXT_NODE && prefix.data.startsWith('©')) prefix.deleteData(0, 1);
  while(author.firstChild) field.append(author.firstChild);
  author.append(document.createTextNode('©'), field);
  const syncEmptyState = () => {
    const empty = !previewEditableText(field, false);
    field.dataset.previewFooterEmpty = String(empty);
  };
  syncEmptyState();
  field.addEventListener('input', syncEmptyState);
  enablePreviewDirectEditor(field, { type:'footer', id:'footerAuthor' }, '꼬리말 작성자 수정');
  field.querySelectorAll('a').forEach(link => {
    link.removeAttribute('href');
    link.removeAttribute('target');
    link.tabIndex = -1;
    link.addEventListener('click', event => event.preventDefault());
  });
}

function decoratePreviewCreditEditors(){
  if(!previewEditState.ready) return;
  const credit = host.previewParts().credit;
  if(!credit) return;
  const fields = Array.from(credit.querySelectorAll('[data-mosaic-credit-index][data-mosaic-credit-field]'));
  fields.forEach(field => {
    const index = Number(field.dataset.mosaicCreditIndex);
    const fieldName = field.dataset.mosaicCreditField;
    if(!Number.isInteger(index) || !['label','value'].includes(fieldName)) return;
    if(!creditEditorInput(index, fieldName)) return;
    enablePreviewDirectEditor(field, {
      type:'credit',
      index,
      field:fieldName
    }, `크레딧 ${index + 1} ${fieldName === 'label' ? '항목명' : '내용'} 수정`);
    // 연결 URL은 왼쪽에서 관리하고, 미리보기에서는 항목 내용 편집을 우선한다.
    field.querySelectorAll('a').forEach(link => {
      link.removeAttribute('href');
      link.removeAttribute('target');
      link.tabIndex = -1;
      link.addEventListener('click', event => event.preventDefault());
    });
  });

  // 항목의 여백을 눌러도 대응하는 왼쪽 입력 묶음을 찾을 수 있게 한다.
  credit.addEventListener('click', event => {
    if(event.target.closest('[data-mosaic-credit-index][data-mosaic-credit-field]')) return;
    if(!host.positionSyncEnabled()) return;
    const row = event.target.closest('[data-mosaic-credit-row]');
    const divider = event.target.closest('[data-mosaic-credit-divider-before]');
    const index = divider
      ? Number(divider.dataset.mosaicCreditDividerBefore)
      : (row ? Number(row.dataset.mosaicCreditRow) : Number(fields[0] && fields[0].dataset.mosaicCreditIndex));
    if(Number.isInteger(index)) revealCreditControl(index, 'label');
  });
}

function decoratePreviewDirectEditors(){
  if(!previewEditState.ready) return;
  const title = host.previewParts().title;
  if(title){
    const settings = host.getSettings();
    const rows = [];
    if((settings.logNumber || '').trim()) rows.push({ id:'logNumber', label:'표지 메모 수정' });
    if((settings.logTitle || '').trim()) rows.push({ id:'logTitle', label:'표지 제목 수정' });
    const subIds = ['subChar','subUser','logSubtitle'].filter(id => (settings[id] || '').trim());
    if(subIds.length === 1) rows.push({ id:subIds[0], label:'표지 부제 수정' });
    else if(subIds.length > 1) rows.push({ type:'coverSubtitle', ids:subIds, label:'표지 부제 수정' });
    // 사진을 표제 배경으로 쓰면 문단이 가운데 정렬용 div 두 겹 안에 들어간다.
    const paragraphs = Array.from(title.querySelectorAll('p'));
    rows.forEach((row, index) => {
      const descriptor = row.type === 'coverSubtitle'
        ? {
            type:'coverSubtitle',
            ids:row.ids,
            protectedSubtitleTokens:[
              ...(row.ids.includes('subChar') && row.ids.includes('subUser') ? ['subtitle-couple-divider'] : []),
              ...(row.ids.includes('logSubtitle') && (row.ids.includes('subChar') || row.ids.includes('subUser'))
                ? ['subtitle-free-divider'] : [])
            ]
          }
        : { type:'cover', id:row.id };
      enablePreviewDirectEditor(paragraphs[index], descriptor, row.label);
    });
  }

  // 현재 탭이나 마지막으로 선택한 카드와 관계없이, 출력 중인 모든 카드의 원문을 연결한다.
  previewCardContexts().forEach(ctx => {
    const blocks = previewSourceBlocks(ctx.cardEl);
    const entries = host.sourceMap.sourceDisplayEntries(ctx.ta);
    const sourceLines = host.sourceMap.editorTextSnapshot(ctx.ta).lines;
    if(blocks.length !== entries.length) return;
    blocks.forEach((block, index) => {
      const entry = entries[index];
      if(previewSourceMatches(block, entry)){
        // 분할된 출력 조각은 원문 속 정확한 범위를 찾았을 때만 직접 편집을 허용한다.
        // 범위를 모르는 상태에서 줄 전체를 덮어쓰면 인접 문장이 복제될 수 있다.
        if(entry.segmented && !entry.sourceBounds && !entry.sourceSegments?.length) return;
        enablePreviewDirectEditor(block, host.sourceMap.bodyEditDescriptor(ctx.ta,entry), '본문 문단 수정');
        // 인용 전체는 하나의 원문 문단으로 유지하고 내부 소제목만 기존 단계 메뉴에 연결한다.
        if(block.matches('[data-mosaic-quote="true"]')){
          block.querySelectorAll('[data-mosaic-quote-heading]').forEach(heading => {
            const raw = entry.raw + Number(heading.dataset.mosaicQuoteLine || 0);
            const source = sourceLines[raw] || '';
            if(!/^\s*(?:\[C\]\s*)?(?:>(?!>)\s*(?:\[C\]\s*)?)?#{1,4}\s+/.test(source)) return;
            bindHeadingLevelInteraction(heading, {
              block:heading, ta:ctx.ta, raw, type:'heading',
              level:Number(heading.dataset.mosaicQuoteHeading)
            });
          });
        }
        const sourceLine = (sourceLines[entry.raw] || '').trim();
        const headingMatch = sourceLine.match(/^(?:\[C\]\s*)?(?:\[접기\s+)?(#{1,4})\s+/i);
        if(headingMatch){
          bindHeadingLevelInteraction(block, {
            block,
            ta:ctx.ta,
            raw:entry.raw,
            type:'heading',
            level:headingMatch[1].length
          });
        }
      }
    });

  });

  // 코멘트도 미리보기 문단을 원문 범위와 연결해 직접 수정한다. 본문 서식·문법
  // 도구는 연결하지 않으며, 편집 속성은 복사 HTML이 아닌 미리보기 DOM에만 붙는다.
  previewCommentContexts().forEach(ctx => {
    const paragraphs = Array.from(ctx.commentEl.querySelectorAll(':scope > p'));
    const entries = commentDisplayEntries(ctx.ta).filter(entry => !entry.image);
    paragraphs.forEach((paragraph, index) => {
      const entry = entries[index];
      if(!entry) return;
      enablePreviewDirectEditor(paragraph, {
        type:'comment',
        ta:ctx.ta,
        raw:entry.raw,
        rawEnd:entry.rawEnd
      }, '코멘트 문단 수정');
    });
  });
}

// 미리보기의 카드 제목을 누르면 왼쪽의 원본 카드 편집기를 보여준다.
// summary의 기본 접기/펼치기 동작은 막지 않으며, 미리보기 쪽 포커스도 빼앗지 않는다.
function revealPreviewCardTitleEditor(ctx){
  if(!host.positionSyncEnabled() || !ctx || !ctx.ed) return;
  const editor = ctx.ed;
  const ta = ctx.ta;
  const bodyTab = document.getElementById('tabBtnBody');
  if(bodyTab && !bodyTab.classList.contains('active')) bodyTab.click();
  host.ensureBodyInputGroupOpen();
  if(editor.classList.contains('isCollapsed')){
    const collapse = editor.querySelector('.collapseCtl');
    if(collapse) collapse.click();
  }
  if(ta){
    host.cardEditors.setActiveTextarea(ta);
    host.cardEditors.syncBodyOnlyToolbarAvailability({ target:ta });
  }
  requestAnimationFrame(() => {
    if(!host.positionSyncEnabled() || !editor.isConnected) return;
    host.scrollCardIntoSidebar(editor);
    editor.style.boxShadow = '0 0 0 2px var(--accent)';
    setTimeout(() => {
      if(editor.isConnected) editor.style.boxShadow = '';
    }, 900);
  });
}

function decoratePreviewCardTitlePositionLinks(){
  previewCardContexts().forEach(ctx => {
    const titleEl = ctx.cardEl.tagName === 'DETAILS'
      ? ctx.cardEl.querySelector(':scope > summary')
      : ctx.cardEl.querySelector(':scope > [data-mosaic-card-title="true"]');
    if(!titleEl) return;
    titleEl.dataset.mosaicCardTitlePositionLink = 'true';
    titleEl.title = '클릭하면 왼쪽의 해당 카드로 이동';
    const activate = event => {
      if(event.target.closest('a, button, input, select, textarea')) return;
      revealPreviewCardTitleEditor(ctx);
    };
    titleEl.addEventListener('click', activate);
    // summary는 자체 키보드 동작을 유지하고, 일반 카드 제목에만 같은 접근성을 더한다.
    if(titleEl.tagName !== 'SUMMARY'){
      titleEl.tabIndex = 0;
      titleEl.setAttribute('role', 'button');
      titleEl.setAttribute('aria-label', '왼쪽의 해당 카드로 이동');
      titleEl.addEventListener('keydown', event => {
        if(event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        revealPreviewCardTitleEditor(ctx);
      });
    }
  });
}

function bindPreviewSelectionEvents(){
  host.bindUIFeatureEvents('preview-selection', () => {
document.addEventListener('mouseup', event => {
  if(event.target.closest && event.target.closest('#selToolbar, #blockToolbar, #outputRulePopover, .previewRuleDeletion')) return;
  // 블록 드래그 이동 중에는 무시
  if(previewEditState.drag) return;
  // 문장 끝의 바깥 여백에서 놓아도 처리한다. 대상은 포커스가 아닌 실제 선택 글자다.
  setTimeout(() => {
    const sel = window.getSelection();
    if(!sel || sel.isCollapsed || !sel.rangeCount){ hideSelToolbar(); return; }
    const picked = previewTextSelectionRange(sel.getRangeAt(0));
    if(!picked || !picked.text){ hideSelToolbar(); return; }
    const { range, text } = picked;
    const directEditor = range.startContainer.parentElement.closest('[data-preview-direct-edit="true"]');
    const directDescriptor = directEditor ? previewDirectEditDescriptors.get(directEditor) : null;
    // 직접 편집 본문은 렌더 순서를 다시 추정하지 않고, 편집 요소에 저장한 정확한 카드·원문 줄을 사용한다.
    const src = directDescriptor && directDescriptor.type === 'body'
      ? { ta:directDescriptor.ta, raw:directDescriptor.raw, block:directEditor }
      : findBlockSource(range.startContainer);
    if(!src || picked.selected.some(item => !src.block.contains(item.node))){ hideSelToolbar(); return; }
    if(src.block.hasAttribute('data-mosaic-inline-comment')){ hideSelToolbar(); return; }
    // 블록 안에서 선택 앞쪽 글자 수를 세어, 같은 글자가 여러 번 나올 때 몇 번째인지 판별
    let occurrenceRoot = src.block;
    if(src.block.querySelector(':scope > [data-mosaic-speaker-label="true"]')){
      let child = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      while(child && child.parentElement !== src.block) child = child.parentElement;
      if(child && child.parentElement === src.block && child.contains(range.endContainer)) occurrenceRoot = child;
    }
    const pre = range.cloneRange();
    pre.selectNodeContents(occurrenceRoot);
    pre.setEnd(range.startContainer, range.startOffset);
    const occurrence = previewRangeText(pre).split(text).length - 1;

    // 이미 걸려 있는 서식 감지 (선택 지점을 감싸는 <strong>/<em> 찾기)
    const active = {};
    Object.keys(FMT_TAG).forEach(fmt => {
      const el = activeFormatEl(range.startContainer, FMT_TAG[fmt], src.block);
      active[fmt] = el && el.contains(range.endContainer) ? el.textContent : null;
    });
    const sourceDescriptor = directDescriptor && directDescriptor.type === 'body'
      ? directDescriptor
      : src;
    const resolved = host.sourceMap.descriptorSelectionSource(sourceDescriptor, text, occurrence);
    if(!resolved){ hideSelToolbar(); return; }
    // [BR] 문단의 가운데 정렬은 결합 문단 전체를 제어하므로 첫 원문 줄을 기준으로 한다.
    const centerRaw = sourceDescriptor.softBreak ? sourceDescriptor.raw : resolved.raw;
    const centerLine = src.ta.value.split('\n')[centerRaw] || '';
    active.center = CENTER_RE.test(centerLine) ? 'on' : null;

    // 문단 바깥에서 선택을 시작하면 입력칸 포커스가 남을 수 있다. 유효한 본문
    // 선택만 포커스를 해제해 sidebarFieldActive의 도구막대 숨김 규칙을 걷어낸다.
    const focused = document.activeElement;
    if(focused && focused.closest && focused.closest('#sidebar')) focused.blur();
    document.body.classList.remove('sidebarFieldActive');
    previewEditState.selection = { ta:src.ta, raw:resolved.raw, centerRaw, text, occurrence, active, sourceRange:resolved.range };
    if(host.positionSyncEnabled()) host.revealInEditor(
      src.ta,
      resolved.raw,
      text,
      resolved.occurrence,
      resolved.sourceBounds,
      resolved.segmented
    );
    const bar = document.getElementById('selToolbar');
    syncSelectionOutputRuleActions(range,src.block);
    bar.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', !!active[b.dataset.fmt]);
    });
    const r = range.getBoundingClientRect();
    bar.style.display = 'flex';
    const bw = bar.offsetWidth || 100;
    bar.style.left = Math.max(8, Math.min(window.innerWidth - bw - 8, r.left + r.width / 2 - bw / 2)) + 'px';
    const above = r.top - bar.offsetHeight - 8;
    const vertical = above > 8 ? above : r.bottom + 8;
    bar.style.top = Math.max(8, Math.min(window.innerHeight - bar.offsetHeight - 8, vertical)) + 'px';
  }, 0);
});

document.addEventListener('mousedown', (e) => {
  if(e.target.closest && e.target.closest('#selToolbar, #blockToolbar, #outputRulePopover')) return;
  hideSelToolbar();
  hideBlockToolbar();
});

document.querySelectorAll('#selToolbar button[data-fmt]').forEach(btn => {
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    if(!previewEditState.selection) return;
    const { ta, raw, centerRaw = raw, text, occurrence, active, sourceRange:capturedRange } = previewEditState.selection;
    const fmt = btn.dataset.fmt;
    const wrap = FMT_WRAP[fmt];
    const lines = ta.value.split('\n');
    const line = lines[raw];
    if(line === undefined){ hideSelToolbar(); return; }

    const fail = (msg) => {
      const st = document.getElementById('copyStatus');
      st.textContent = msg;
      setTimeout(() => { st.textContent = ''; }, 3500);
      hideSelToolbar();
    };
    const finish = (newLine, label, targetRaw = raw) => {
      // 미리보기를 다시 그릴 때 기존 contenteditable이 blur되며 평문을 재저장하면
      // 방금 넣은 **...** / *...* 마커가 지워진다. 서식 작업 동안 blur 저장을 잠근다.
      previewEditState.committing = true;
      try {
        host.snapshotCards();
        lines[targetRaw] = newLine;
        ta.value = lines.join('\n');
        hideSelToolbar();
        window.getSelection().removeAllRanges();
        host.uiUpdateEffects.committedChange();
        host.showUndoToast(label);
      } finally {
        previewEditState.committing = false;
      }
    };
    const name = { bold: '굵게', emphasis: '강조', center: '가운데 정렬' }[fmt];

    // 가운데 정렬: 줄 단위로 [C] 붙이기/떼기 (인용 `> ` 뒤에 삽입)
    if(fmt === 'center'){
      const centerLine = lines[centerRaw];
      if(centerLine === undefined){ hideSelToolbar(); return; }
      let newLine;
      if(active.center){
        newLine = centerLine.replace(CENTER_RE, (m, q) => (q || ''));
        return finish(newLine, '가운데 정렬 해제.', centerRaw);
      }
      const qm = centerLine.match(/^>(?!>)\s?/);
      newLine = qm ? qm[0] + '[C] ' + centerLine.slice(qm[0].length) : '[C] ' + centerLine;
      return finish(newLine, '가운데 정렬 적용.', centerRaw);
    }

    // 이미 서식이 걸린 부분 → 해제
    if(active[fmt]){
      const targetPlain = active[fmt];
      let found = null;
      const sourceRange = capturedRange || host.sourceMap.findSourceRange(line, text, occurrence, false, host.sourceMap.outputRuleLineSettings(ta,raw));
      for(const m of MosaicParser.formatMatches(fmt, line)){
        const containsSelection = sourceRange && sourceRange.start >= m.index && sourceRange.end <= m.index + m[0].length;
        const content = MosaicParser.formatMatchContent(fmt,m);
        const contentOffset = m.index+m[0].indexOf(content);
        if(containsSelection && host.sourceMap.comparableFormattedText(MosaicParser.applyOutputTextRules(content, host.sourceMap.outputRuleLineSettings(ta,raw,contentOffset))) === host.sourceMap.comparableFormattedText(targetPlain)){
          found = m;
          break;
        }
      }
      if(!found) return fail(`${name} 서식을 찾지 못함. 본문에서 직접 삭제.`);
      const newLine = line.slice(0, found.index) + MosaicParser.formatMatchContent(fmt, found) + line.slice(found.index + found[0].length);
      return finish(newLine, `${name} 서식 해제.`);
    }

    // 원본 줄에서 같은 글자의 occurrence번째 위치를 찾음 (마커가 섞여 있으면 실패할 수 있음)
    const sourceRange = capturedRange || host.sourceMap.findSourceRange(line, text, occurrence, false, host.sourceMap.outputRuleLineSettings(ta,raw));
    if(!sourceRange) return fail('선택한 글자의 원문 위치를 확인하지 못함.');
    const selectedSource = line.slice(sourceRange.start, sourceRange.end);

    finish(line.slice(0, sourceRange.start) + wrap + selectedSource + wrap + line.slice(sourceRange.end), `${name} 서식 적용.`);
  });
});
  });
}

// 원본 텍스트에서 srcRaw 줄을 떼어내 destRaw 줄 앞에 끼워넣음 (destRaw=null이면 맨 끝)
function moveLineInText(text, srcRaw, destRaw, preserveSourceGap = false){
  let lines = text.split('\n');
  const moved = lines[srcRaw];
  if(moved === undefined) return text;
  // 코멘트 사진의 빈 자리는 문단 경계다. [BR] 앞뒤 글자를 새로 합치지 않는다.
  if(preserveSourceGap) clearCommentImageLine(lines, srcRaw);
  else lines.splice(srcRaw, 1);
  let dest = destRaw;
  if(dest === null || dest === undefined){
    if(lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(moved);
  } else {
    if(dest > srcRaw && !preserveSourceGap) dest -= 1;   // 앞쪽을 뺐으니 목적지가 한 칸 당겨짐
    dest = Math.max(0, Math.min(lines.length, dest));
    const insert = [];
    if(dest > 0 && lines[dest - 1].trim() !== '') insert.push('');
    insert.push(moved);
    if(dest < lines.length && lines[dest].trim() !== '') insert.push('');
    lines.splice(dest, 0, ...insert);
  }
  return lines.join('\n');
}

// 대사 옵션 3–5가 한 원문 줄을 여러 출력 블록으로 나눈 경계에 구분 요소를 놓으면,
// 그 원문 줄을 실제 줄들로 분리하고 선택한 경계에 원래 마커를 삽입한다.
function moveSeparatorIntoSplitLine(text, srcRaw, destInfo, settings){
  if(!destInfo || destInfo.kind !== 'line' || destInfo.partCount <= 1 || destInfo.partIndex <= 0) return null;
  const lines = String(text).split('\n');
  const moved = lines[srcRaw];
  const targetRaw = destInfo.startRaw;
  const targetLine = lines[targetRaw];
  if(moved === undefined || targetLine === undefined || srcRaw === targetRaw) return null;
  if(!/^\s*\[(?:HR(?:[2-4])?|GAP)\]\s*$/i.test(moved)) return null;

  const parts = MosaicRenderer.splitDialogueLineForOutput(targetLine, settings)
    .map(part => String(part).trim())
    .filter(Boolean);
  const splitAt = destInfo.partIndex;
  if(parts.length !== destInfo.partCount || splitAt <= 0 || splitAt >= parts.length) return null;

  // 사용자가 원문에 넣었던 바깥쪽 들여쓰기·후행 공백은 첫/마지막 조각에 보존한다.
  const leading = (targetLine.match(/^\s*/) || [''])[0];
  const trailing = (targetLine.match(/\s*$/) || [''])[0];
  parts[0] = leading + parts[0];
  parts[parts.length - 1] += trailing;

  // 먼저 기존 구분선을 떼어낸 뒤 대상 원문 줄의 변경된 인덱스를 계산한다.
  lines.splice(srcRaw, 1);
  const adjustedTarget = targetRaw - (srcRaw < targetRaw ? 1 : 0);
  const replacement = [
    ...parts.slice(0, splitAt),
    moved.trim(),
    ...parts.slice(splitAt)
  ];
  lines.splice(adjustedTarget, 1, ...replacement);
  return lines.join('\n');
}

// 한 번 클릭하면 편집 메뉴를 열고, 일정 거리 이상 움직이면 기존 드래그 이동을 시작한다.
function bindSeparatorInteraction(target, dragCtx, menuCtx, refreshContext = null){
  const MOVE_PX = 7;
  let suppressClick = false;
  const refresh = () => {
    if(!refreshContext) return true;
    const contexts = refreshContext();
    if(!contexts) return false;
    ({dragCtx, menuCtx} = contexts);
    return true;
  };

  target.addEventListener('mousedown', e => {
    if(e.button !== 0) return;
    e.preventDefault();
    if(refreshContext){
      // 코멘트 글을 쓰다 사진을 조작해도 blur 저장을 먼저 마친 뒤 최신 줄에 연결한다.
      const active = document.activeElement;
      if(active && active.matches('[data-preview-direct-edit="true"]')) active.blur();
      if(host.previewRenderPending()) host.uiUpdateEffects.renderNow();
      if(!refresh()) return;
    }
    const sx = e.clientX, sy = e.clientY;
    const cleanup = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    const onMove = ev => {
      if(Math.hypot(ev.clientX - sx, ev.clientY - sy) < MOVE_PX) return;
      cleanup();
      if(dragCtx){
        if(startBlockDrag(dragCtx) === false) return;
        suppressClick = true;
        // 드래그를 시작시킨 첫 이동도 목적지 계산에 포함한다. 다음 mousemove 없이
        // 바로 놓는 빠른 조작에서는 이 좌표를 버리면 moved가 끝내 false로 남는다.
        onBlockDragMove(ev);
      }
    };
    const onUp = () => cleanup();
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  target.addEventListener('click', e => {
    e.preventDefault();
    if(suppressClick){ suppressClick = false; return; }
    if(!refresh()) return;
    showBlockToolbar(menuCtx);
  });
  target.addEventListener('contextmenu', e => e.preventDefault());
}

function previewSeparatorType(block){
  if(!block || block.dataset.mosaicGenerated !== 'true' || block.tagName !== 'DIV') return null;
  if(['hr', 'hr2', 'hr3', 'hr4'].includes(block.dataset.mosaicSeparator)) return block.dataset.mosaicSeparator;
  if(block.style.height === '1px') return 'hr';
  if(block.textContent.trim() === '✦' || (block.textContent.trim() === '✦ ✦ ✦' && block.style.letterSpacing)) return 'hr2';
  if(block.textContent.trim() === '· · ·' && block.style.letterSpacing) return 'hr3';
  return null;
}

function bindSeparatorBlockInteraction(block, type, dragCtx, menuCtx){
  if(!block || block.dataset.mosaicSeparatorEditBound === 'true') return;
  block.dataset.mosaicSeparatorEditBound = 'true';
  if(type === 'hr'){
    // 1px 선 자체 대신 충분히 넓은 투명 클릭 영역을 사용한다.
    block.style.position = 'relative';
    const hit = document.createElement('div');
    hit.dataset.mosaicSeparatorHit = 'true';
    hit.style.cssText = `position:absolute; z-index:2; left:0; right:0; top:-15px; height:32px; cursor:${dragCtx ? 'grab' : 'pointer'}; user-select:none;`;
    hit.title = dragCtx ? '클릭해서 변경/삭제 · 드래그로 이동' : '클릭해서 변경/삭제';
    bindSeparatorInteraction(hit, dragCtx, menuCtx);
    block.appendChild(hit);
    return;
  }
  block.style.cursor = dragCtx ? 'grab' : 'pointer';
  block.style.userSelect = 'none';
  block.title = dragCtx ? '클릭해서 변경/삭제 · 드래그로 이동' : '클릭해서 변경/삭제';
  bindSeparatorInteraction(block, dragCtx, menuCtx);
}

function bindImageBlockInteraction(block, dragCtx, menuCtx, refreshContext = null){
  if(!block || block.dataset.mosaicImageEditBound === 'true') return;
  block.dataset.mosaicImageEditBound = 'true';
  block.style.cursor = dragCtx ? 'grab' : 'pointer';
  block.title = dragCtx ? '클릭해서 삭제/비율/캡션 · 드래그로 이미지 이동' : '클릭해서 이미지 삭제/비율/캡션 편집';
  bindSeparatorInteraction(block, dragCtx, menuCtx, refreshContext);
}

// 이미지의 전체 순서·원문이 그대로일 때만 최신 코멘트의 줄 번호와 문단 경계를 갱신한다.
// 글을 직접 수정해 줄 수가 바뀌어도 이미지 주소가 같은 다른 코멘트로 연결하지 않는다.
function commentImageInteractionContexts(seed){
  const ctx = previewCommentContexts().find(context => context.ta === seed.ta);
  if(!ctx) return null;
  const entries = commentDisplayEntries(ctx.ta), blocks = Array.from(ctx.commentEl.children);
  if(entries.length !== blocks.length) return null;
  const lines = ctx.ta.value.split('\n');
  const images = entries.filter(entry => entry.image);
  if(JSON.stringify(images.map(entry => lines[entry.raw])) !== seed.imageSequence) return null;
  const entry = images[seed.imageIndex];
  if(!entry) return null;
  const index = entries.indexOf(entry), block = blocks[index];
  if(!block.matches('[data-mosaic-comment-image]') || !block.querySelector('img')) return null;
  const sourceValue = ctx.ta.value;
  return {
    menuCtx:{block,ta:ctx.ta,raw:entry.raw,type:'img',comment:true,sourceValue},
    dragCtx:{block,blocks,map:entries.map(item => ({startRaw:item.raw})),ta:ctx.ta,
      srcIndex:index,label:'코멘트 이미지',type:'img',comment:true,sourceValue}
  };
}

function enableCommentImageInteractions(){
  previewCommentContexts().forEach(ctx => {
    const entries = commentDisplayEntries(ctx.ta), lines = ctx.ta.value.split('\n');
    const imageSequence = JSON.stringify(entries.filter(entry => entry.image).map(entry => lines[entry.raw]));
    entries.filter(entry => entry.image).forEach((entry, imageIndex) => {
      const refresh = () => commentImageInteractionContexts({ta:ctx.ta,imageIndex,imageSequence});
      const contexts = refresh();
      if(contexts) bindImageBlockInteraction(contexts.menuCtx.block, contexts.dragCtx, contexts.menuCtx, refresh);
    });
  });
}

// 최상위 이미지·문단 구분 요소는 드래그 이동도 지원한다.
// 접기 안쪽 이미지는 구조를 깨지 않도록 이동은 막고 클릭 편집만 연결한다.
function enableBlockDrag(preview){
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  // 출력에서 빈 카드는 제외되므로, 내용 있는 본문 카드만 순서대로 대응시킨다.
  // 코멘트는 별도 최상위 블록이라 이전 순번 폴백에 섞이면 카드 드래그 대상이 밀릴 수 있다.
  const nonEmpty = editors.filter(ed => ed.dataset.blockType !== 'comment'
    && ed.querySelector('textarea').value.split('\n').some(l => l.trim() !== ''));

  // 미리보기 최상위 자식 중 '카드'만 골라냄 (썸네일 p, 이미지 밴드, 표제 밴드 제외)
  const indexedCardEls = Array.from(preview.querySelectorAll(':scope > [data-mosaic-card-index]'));
  const cardEls = indexedCardEls.length ? indexedCardEls : Array.from(preview.children).filter(el => {
    if(el.hasAttribute('data-mosaic-comment-index')) return false;
    if(el.tagName === 'DETAILS') return true;
    if(el.tagName !== 'DIV') return false;
    if(el.style.backgroundImage) return false;
    const inner = el.firstElementChild;
    return !!(inner && inner.tagName === 'DIV');
  });

  cardEls.forEach((cardEl, cardIdx) => {
    const sourceIndex = Number(cardEl.dataset.mosaicCardIndex);
    const editor = Number.isInteger(sourceIndex) ? editors[sourceIndex] : nonEmpty[cardIdx];
    if(!editor) return;
    const ta = editor.querySelector('textarea');
    const settings = host.getSettings();
    // MosaicRenderer.assembleBody의 [BR] 결합과 대사 분할을 모두 반영해 이미지·구분선의
    // 드래그 대상 수가 실제 미리보기 최상위 블록 수와 항상 같게 한다.
    const entries = host.sourceMap.topLevelSourceEntries(ta.value, {...settings,outputRuleExclusions:host.sourceMap.editorOutputRuleExclusions(ta)});
    const map = host.sourceMap.topLevelMap(entries);

    // 카드 본문 컨테이너: details면 summary 다음, div면 첫 자식
    const bodyDiv = previewCardBody(cardEl);
    if(!bodyDiv) return;

    // 원문과 출력의 이미지 순서는 같으므로, 접기 안쪽 이미지도 원문 줄과 안전하게 연결할 수 있다.
    const bindRemainingBodyImages = () => {
      const sourceImages = [];
      ta.value.split('\n').forEach((line, raw) => {
        if(MosaicRenderer.parseBodyImageLine(line)) sourceImages.push({ raw });
      });
      const previewImages = Array.from(bodyDiv.querySelectorAll('img'));
      if(sourceImages.length !== previewImages.length) return;
      previewImages.forEach((img, index) => {
        const block = img.parentElement;
        bindImageBlockInteraction(block, null, {
          block,
          ta,
          raw: sourceImages[index].raw,
          type: 'img'
        });
      });
    };

    // 접기 내부의 문단 구분 요소도 출력 순서와 원문 순서로 연결한다.
    // 최상위 요소만 대상으로 삼던 기존 매핑에서 빠진 항목은 클릭 편집만 허용하고,
    // 접기 구조를 깨뜨릴 수 있는 드래그 이동은 막는다.
    const bindRemainingBodySeparators = () => {
      const sourceSeparators = [];
      ta.value.split('\n').forEach((line, raw) => {
        const token = line.trim().toUpperCase();
        if(token === '[HR]') sourceSeparators.push({ raw, type:'hr' });
        else if(token === '[HR2]') sourceSeparators.push({ raw, type:'hr2' });
        else if(token === '[HR3]') sourceSeparators.push({ raw, type:'hr3' });
        else if(token === '[HR4]' || token === '[GAP]') sourceSeparators.push({ raw, type:'hr4' });
      });
      const previewSeparators = Array.from(bodyDiv.querySelectorAll('[data-mosaic-generated="true"]'))
        .map(block => ({ block, type:previewSeparatorType(block) }))
        .filter(item => item.type);
      if(sourceSeparators.length !== previewSeparators.length) return;
      previewSeparators.forEach((item, index) => {
        const source = sourceSeparators[index];
        if(source.type !== item.type || item.block.dataset.mosaicSeparatorEditBound === 'true') return;
        bindSeparatorBlockInteraction(item.block, item.type, null, {
          block:item.block,
          ta,
          raw:source.raw,
          type:item.type
        });
      });
    };

    // 꼬리말은 전용 표식으로 제외한다. 문단 수 차이를 꼬리말로 추정하면
    // 출력 전용 삭제가 적용된 카드에서 실제 문단이나 꼬리말을 이동 대상으로 오인한다.
    const blocks = Array.from(bodyDiv.children).filter(block => !block.hasAttribute('data-mosaic-footer'));
    if(blocks.length !== map.length){
      bindRemainingBodyImages();
      bindRemainingBodySeparators();
      return;
    }

    blocks.forEach((block, i) => {
      const info = map[i];
      if(info.kind !== 'line') return;
      const text = info.text;
      const isImg = !!MosaicRenderer.parseBodyImageLine(text);
      const isHr = /^\[HR\]$/i.test(text);
      const isHr2 = /^\[HR2\]$/i.test(text);
      const isHr3 = /^\[HR3\]$/i.test(text);
      const isHr4 = /^\[(?:HR4|GAP)\]$/i.test(text);
      if(!isImg && !isHr && !isHr2 && !isHr3 && !isHr4) return;
      if(isImg && !block.querySelector('img')) return;

      const label = isImg ? '이미지'
        : (isHr ? '구분선' : (isHr2 ? '장면 전환' : (isHr3 ? '호흡 구분' : '여백')));
      const type = isImg ? 'img' : (isHr ? 'hr' : (isHr2 ? 'hr2' : (isHr3 ? 'hr3' : 'hr4')));
      const dragCtx = { block, blocks, map, ta, srcIndex:i, label, type };
      const menuCtx = { block, ta, raw:info.startRaw, type };

      if(isHr || isHr2 || isHr3 || isHr4){
        bindSeparatorBlockInteraction(block, type, dragCtx, menuCtx);
      } else {
        bindImageBlockInteraction(block, dragCtx, menuCtx);
      }
    });
    bindRemainingBodyImages();
    bindRemainingBodySeparators();
  });
  enableCommentImageInteractions();
}

function startBlockDrag(ctx){
  if(!previewBlockContextCurrent(ctx)) return false;
  const { block } = ctx;
  block.style.opacity = '0.45';
  block.style.cursor = 'grabbing';

  const marker = document.createElement('div');
  marker.style.cssText = 'height:3px; background:#111; border-radius:2px; margin:4px 0; pointer-events:none;';
  previewEditState.drag = Object.assign({}, ctx, { marker, destIndex:null, moved:false });

  document.addEventListener('mousemove', onBlockDragMove);
  document.addEventListener('mouseup', onBlockDragEnd);
}

function onBlockDragMove(e){
  if(!previewEditState.drag) return;
  previewEditState.drag.moved = true;
  const { blocks, marker, srcIndex } = previewEditState.drag;
  // 커서와 가장 가까운 삽입 지점(문단 경계)을 찾음
  let dest = blocks.length;
  for(let i = 0; i < blocks.length; i++){
    const r = blocks[i].getBoundingClientRect();
    if(e.clientY < r.top + r.height / 2){ dest = i; break; }
  }
  previewEditState.drag.destIndex = dest;
  // 제자리면 표시 안 함
  if(dest === srcIndex || dest === srcIndex + 1){
    if(marker.parentNode) marker.remove();
    return;
  }
  const ref = blocks[dest];
  if(ref) ref.parentNode.insertBefore(marker, ref);
  else blocks[blocks.length - 1].parentNode.appendChild(marker);
}

function onBlockDragEnd(){
  document.removeEventListener('mousemove', onBlockDragMove);
  document.removeEventListener('mouseup', onBlockDragEnd);
  if(!previewEditState.drag) return;
  const ctx = previewEditState.drag;
  const { block, marker, map, ta, srcIndex, destIndex, moved, label, type, comment } = ctx;
  block.style.opacity = '';
  block.style.cursor = 'grab';
  if(marker.parentNode) marker.remove();
  previewEditState.drag = null;

  if(!previewBlockContextCurrent(ctx)) return;
  if(!moved || destIndex === null) return;
  if(destIndex === srcIndex || destIndex === srcIndex + 1) return; // 제자리

  const srcRaw = map[srcIndex].startRaw;
  const destInfo = destIndex < map.length ? map[destIndex] : null;
  const destRaw = destInfo ? destInfo.startRaw : null;
  const splitMove = (type === 'hr' || type === 'hr2')
    ? moveSeparatorIntoSplitLine(ta.value, srcRaw, destInfo, host.getSettings())
    : null;
  const nextText = splitMove === null
    ? moveLineInText(ta.value, srcRaw, destRaw, comment)
    : splitMove;
  if(nextText === ta.value) return;
  host.snapshotCards();
  ta.value = nextText;
  host.uiUpdateEffects.committedChange();
  host.showUndoToast(splitMove === null ? `${label} 위치 변경.` : `${label} 위치 변경 · 원문 자동 분리.`);
}

function isCommitting(){ return previewEditState.committing; }

function setReady(ready){ previewEditState.ready = !!ready; }
return Object.freeze({
CENTER_RE,
FMT_RE,
FMT_WRAP,
bindBlockToolbarEvents,
bindOutputRuleInteractions,
bindPreviewSelectionEvents,
commentDisplayEntries,
decorateOutputRuleOccurrences,
decorateParallelOccurrences,
decoratePreviewCardTitlePositionLinks,
decoratePreviewCoverImageNavigation,
decoratePreviewCreditEditors,
decoratePreviewFooterEditor,
decoratePreviewDirectEditors,
decoratePreviewProfileEditors,
discardActiveDirectEdit,
enableBlockDrag,
enablePreviewDirectEditor,
findBlockSource,
hideBlockToolbar,
hideOutputRulePopover,
hideSelToolbar,
isCommitting,
layoutOutputRuleMarkers,
previewCardBody,
previewCardContexts,
previewCommentContexts,
previewEditableText,
previewSourceBlocks,
previewSourceMatches,
setReady
});
}

return Object.freeze({createPreviewInteractions});
})();
