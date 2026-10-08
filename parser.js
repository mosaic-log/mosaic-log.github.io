// 조각로그 v1.8.4 본문 문법과 안전한 인라인 HTML 변환.
function escapeHTML(s){
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeTextHTML(s){
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s){
  return escapeHTML(s);
}

function normalizeSubtitleCoupleSeparator(value){
  return ['×', '&', '·'].includes(value) ? value : '×';
}

function normalizeHttpLinkUrl(value){
  const normalized = normalizeProtocolRelativeUrl(value);
  if(!normalized) return '';
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch(e){
    return '';
  }
}

function escapeCssUrl(s){
  const cssSafe = String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n\f]/g, '');
  return cssSafe.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeQuotes(text){
  return text
    .replace(/[\u201C\u201D\u301D\u301E\u2033]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035\u02BC\uFF07]/g, "'");
}

function stripMarkers(value){
  return String(value).replace(/__|\*/g, '');
}

function formatMatchContent(format, match){
  // ***글***에서 강조만 해제할 때 굵기는 남겨 **글**로 되돌린다.
  if(format === 'emphasis' && match[0].startsWith('***')) return `**${match[1]}**`;
  return match[1] !== undefined ? match[1] : match[2];
}

function parallelDialogueSegments(line){
  const source = normalizeQuotes(String(line));
  const pattern = /((?:"[^"\r\n]*"|'[^'\r\n]*'))([ \t]*)([（(])([ \t]*)([^()（）\r\n]+?)([ \t]*)([)）])/g;
  const segments = [];
  let match;
  while((match = pattern.exec(source))){
    if((match[3] === '(' && match[7] !== ')') || (match[3] === '（' && match[7] !== '）')) continue;
    segments.push({
      start: match.index,
      end: pattern.lastIndex,
      original: match[1],
      betweenOriginalAndGroup: match[2],
      translationGroup: match[3] + match[4] + match[5] + match[6] + match[7]
    });
  }
  return segments;
}

function parallelDialogueParts(line){
  const source = normalizeQuotes(String(line)).trim();
  const segments = parallelDialogueSegments(source);
  return segments.length === 1 && segments[0].start === 0 && segments[0].end === source.length
    ? segments[0]
    : null;
}

function normalizeStandaloneHr(text){
  return String(text).split('\n').map(line =>
    /^[\t ]*---[\t ]*$/.test(line) ? '[HR]' : line
  ).join('\n');
}

function normalizeBodyHrMarkers(text){
  return normalizeStandaloneHr(text).split('\n').map(line =>
    line.replace(/^([\t ]*\[(?:HR(?:[2-4])?|GAP)\])(?=[\t ]*\S)/i, '$1\n')
  ).join('\n');
}

function normalizedBodyHrOffset(text, offset){
  const source = String(text);
  const safeOffset = Math.max(0, Math.min(Number(offset) || 0, source.length));
  const prefix = source.slice(0, safeOffset);
  const normalizedPrefix = normalizeBodyHrMarkers(prefix);
  let mapped = normalizedPrefix.length;
  const lineStart = source.lastIndexOf('\n', Math.max(0, safeOffset - 1)) + 1;
  let lineEnd = source.indexOf('\n', safeOffset);
  if(lineEnd < 0) lineEnd = source.length;
  const line = source.slice(lineStart, lineEnd);
  const marker = line.match(/^([\t ]*\[(?:HR(?:[2-4])?|GAP)\])(?=[\t ]*\S)/i);
  const prefixAlreadySplit = normalizedPrefix.length > normalizeStandaloneHr(prefix).length;
  if(marker && safeOffset >= lineStart + marker[1].length && !prefixAlreadySplit) mapped++;
  return mapped;
}

function normalizeStandaloneHrInput(ta){
  const before = ta.value;
  const after = normalizeBodyHrMarkers(before);
  if(after === before) return false;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  ta.value = after;
  ta.setSelectionRange(normalizedBodyHrOffset(before, start), normalizedBodyHrOffset(before, end));
  return true;
}

function processInline(text, emphasisColor, options){
  const literalSingleQuotes = !!(options && options.literalSingleQuotes);
  const color = /^#[0-9A-Fa-f]{6}$/.test(emphasisColor || '') ? emphasisColor : '#747474';
  const inlineTypographyLock = `font-size:inherit; line-height:inherit; font-family:inherit; -webkit-text-size-adjust:100%; text-size-adjust:100%;`;
  const inheritedColorLock = `color:inherit; -webkit-text-fill-color:inherit;`;
  const emphasisStyle = `color:${color}; -webkit-text-fill-color:${color}; font-style:italic; font-weight:inherit; ${inlineTypographyLock}`;
  const strongStyle = `${inheritedColorLock} font-style:inherit; font-weight:700; ${inlineTypographyLock}`;
  const emphasisOuterStyle = `${emphasisStyle} margin-right:0.08em;`;
  const strongEmphasisOuterStyle = `${emphasisStyle} margin-right:0.12em;`;
  const thoughtStyle = `color:${color}; -webkit-text-fill-color:${color}; font-style:normal; font-weight:inherit; ${inlineTypographyLock}`;
  const em = (content, combined = false) => `<em style='${combined ? strongEmphasisOuterStyle : emphasisOuterStyle}'><span style='${emphasisStyle}'>${content}</span></em>`;
  const strong = content => `<strong style='${strongStyle}'>${content}</strong>`;
  const thought = content => `<span data-mosaic-thought='true' style='${thoughtStyle}'>'${content}'</span>`;
  let content = escapeTextHTML(normalizeQuotes(String(text)));
  if(!literalSingleQuotes){
    content = content.replace(/(^|[^\p{L}\p{N}])'([^'\n]+?)'/gu, (m, prefix, inner) => prefix + thought(inner));
  }
  return content
    .replace(/\*\*\*([^*\n]+?)\*\*\*/g, (m, inner) => strong(em(inner, true)))
    .replace(/\*\*(.+?)\*\*/g, (m, inner) => strong(inner))
    .replace(/__(.+?)__/g, (m, inner) => strong(inner))
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, (m, inner) => em(inner));
}

const SOFT_BREAK_TOKEN = '\uE200';
function processBodyInline(text, emphasisColor, options){
  const mode = normalizeSoftBreakSpacing(options && options.softBreakSpacing);
  if(mode === 'normal') return processInline(text, emphasisColor, options).split(SOFT_BREAK_TOKEN).join('<br>');
  const extra = mode === 'wide' ? 0.55 : 0.2;
  const softBreak = `<br><span data-mosaic-generated='true' aria-hidden='true' style='display:block; width:100%; height:${extra}em; overflow:hidden; font-size:inherit; line-height:0;'></span>`;
  return processInline(text, emphasisColor, options).split(SOFT_BREAK_TOKEN).join(softBreak);
}

// 출력 전용 치환. 원문/저장 모델은 건드리지 않고, 필요할 때만 출력 글자의
// 원문 범위를 함께 만든다. 뒤 규칙은 앞 규칙의 결과에 추가 순서대로 적용한다.
function hasBatchim(word){
  if(/^(?:char|user)$/i.test((word || '').trim())) return false;
  const code = (word || '').trim().slice(-1).charCodeAt(0);
  return code >= 0xAC00 && code <= 0xD7A3 ? (code - 0xAC00) % 28 !== 0 : null;
}
function nameRulePattern(from){
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const combos = hasBatchim(from) === true ? '이가|이는|이를|이와|' : '';
  return new RegExp(escaped + '(?:(' + combos + '은|는|이|가|을|를|과|와)(?=$|[^가-힣]))?', 'g');
}
function nameRuleReplacement(to, josa){
  const forms = {은:['은','는'],는:['은','는'],이:['이','가'],가:['이','가'],을:['을','를'],를:['을','를'],과:['과','와'],와:['과','와']};
  const batchim = hasBatchim(to);
  if(!josa || batchim === null) return to + (josa || '');
  return to + (josa.length === 2 && batchim ? josa : forms[josa.slice(-1)][batchim ? 0 : 1]);
}
function outputTextProjection(value, settings, trackSource = true){
  let text = String(value);
  let spans = trackSource ? Array.from({length:text.length}, (_,i) => ({start:i,end:i+1})) : null;
  const names = (settings.nameRules || []).filter(rule => rule.enabled !== false && rule.from);
  const keywords = (settings.keywordRules || []).filter(rule => rule.enabled !== false && rule.from);
  for(const [rules,name] of [[names,true],[keywords,false]]){
    for(const rule of rules){
      if(!text.includes(rule.from)) continue;
      // 화자 이름표는 원래 인물의 식별자로 남긴다. 표시 이름은 출력 설정에서
      // 바꾸므로 두 인물을 같은 이름으로 바꿔도 각각의 색상을 잃지 않는다.
      const speakers = [];
      if(name && (settings.extraChars || []).length){
        const markers = /\[([^\[\]\n]{1,24})\]\s*(?=["“‘'])/g;
        let marker;
        while((marker = markers.exec(text)) !== null){
          const key = marker[1].trim().toLowerCase();
          if(settings.extraChars.some(char => String(char.sourceName || char.name).trim().toLowerCase() === key)){
            speakers.push({start:marker.index + 1,end:marker.index + 1 + marker[1].length});
          }
        }
      }
      const isSpeaker = (start,end) => speakers.some(span => start < span.end && end > span.start);
      const pattern = name ? nameRulePattern(rule.from)
        : new RegExp(rule.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),'g');
      if(!trackSource){
        text = text.replace(pattern, (match,josa,offset) => name
          ? isSpeaker(offset,offset + match.length) ? match : nameRuleReplacement(rule.to,josa)
          : rule.to);
        continue;
      }
      let nextText = '', nextSpans = [], cursor = 0, match;
      while((match = pattern.exec(text)) !== null){
        if(isSpeaker(match.index,match.index + match[0].length)) continue;
        nextText += text.slice(cursor,match.index);
        for(let i=cursor;i<match.index;i++) nextSpans.push(spans[i]);
        const replacement = name ? nameRuleReplacement(rule.to,match[1]) : rule.to;
        const first = spans[match.index], last = spans[match.index+match[0].length-1];
        const range = {start:first.start,end:last.end,
          editStart:first.editStart ?? first.start,editEnd:last.editEnd ?? last.end};
        const nameEnd = spans[match.index + rule.from.length - 1];
        const nameRange = {...range,end:nameEnd.end};
        const josaStart = spans[match.index + rule.from.length];
        const josaRange = josaStart ? {...range,start:josaStart.start} : range;
        nextText += replacement;
        for(let i=0;i<replacement.length;i++) nextSpans.push(name ? i < rule.to.length ? nameRange : josaRange : range);
        cursor = match.index + match[0].length;
      }
      nextText += text.slice(cursor);
      for(let i=cursor;i<spans.length;i++) nextSpans.push(spans[i]);
      text = nextText;
      spans = nextSpans;
    }
  }
  return {text,spans};
}
function applyOutputTextRules(value, settings){
  return outputTextProjection(value,settings,false).text;
}
function outputRuleSettings(settings){
  if(settings.outputRulesProjected || !(settings.nameRules || []).some(rule => rule.enabled !== false)) return settings;
  const exactName = value => {
    let result = value;
    (settings.nameRules || []).forEach(rule => {
      if(rule.enabled !== false && String(result || '').trim() === rule.from) result = rule.to;
    });
    return result;
  };
  return {...settings,outputRulesProjected:true,
    charName:exactName(settings.charName),userName:exactName(settings.userName),
    subChar:exactName(settings.subChar),subUser:exactName(settings.subUser),
    extraChars:(settings.extraChars || []).map(char => ({...char,sourceName:char.name,name:exactName(char.name) }))};
}

// 본문 문법 소비자는 파서의 공개 계약만 사용한다.
const MosaicParser = Object.freeze({
  applyOutputTextRules,
  outputRuleSettings,
  outputTextProjection,
  SOFT_BREAK_TOKEN,
  formatMatchContent,
  normalizeBodyHrMarkers,
  normalizeQuotes,
  normalizeStandaloneHr,
  normalizeStandaloneHrInput,
  normalizeSubtitleCoupleSeparator,
  stripMarkers
});
