# 직접 개조 안내

HTML·CSS·JS를 수정하고 `index.html`을 다시 열면 됩니다. 설치·빌드·번들 생성은 없으며, 저장소의 코드와 실행하는 코드가 같습니다. 구조를 바꿀 때의 유지보수 원칙은 [AGENTS.md](AGENTS.md)를 참고합니다.

## 수정할 파일 찾기

| 바꾸려는 부분 | 파일과 검색할 이름 |
|---|---|
| 디자인 기본값·허용 타입·범위 | `state.js` → `DEFAULT_STYLE`, `STYLE_SCHEMA` |
| 본문 문법 해석 | `parser.js` |
| 표시 글자와 원문 위치의 대응·제외 범위 | `ui-source.js` → `createSourceMapping` |
| 출력 HTML·인용선 등 출력 간격 | `renderer.js` → `buildParagraph`, `buildProfileBlock`, `buildCard` |
| 작업 화면의 모양 | `styles.css`, `index.html` |
| 카드 입력·추가·삭제·이동 | `ui-editor.js` → `createCardEditors` |
| 전체 화면 입력·찾기 | `ui-editor.js` → `createFullscreenEditor` |
| 미리보기 찾기·바꾸기 | `ui-preview-view.js` → `createPreviewSearch` |
| 미리보기 클릭·직접 편집·선택 서식 | `ui-preview-edit.js` → `createPreviewInteractions` |
| 본문·메모·코멘트 편집의 원문 변경안 계산 | `ui-source.js` → `createPreviewSourceEdits` |
| 출력·저장 설정 읽기 | `ui.js` → `createSettingsReader` |
| 컨트롤 표시·활성화·동기화 캐시 | `ui.js` → `createControlSync` |
| 미리보기 도구모음·접기·전체 화면 배치 | `ui-preview-view.js` → `createPreviewLayout` |
| 보관함·테마·프리셋·크레딧 | `ui-library.js` → `createLibrary`, `createCredit` |
| 변경 후 렌더·저장·히스토리 순서 | `app.js` → `changes`, `replaceWork` |
| 저장 키·직렬화·복원 | `storage.js`, `state.js` |

담당 파일의 `create...` 함수가 구현이고, `ui.js`의 같은 이름 호출이 기능 사이의 연결 목록입니다. 예를 들어 카드 입력은 `ui-editor.js`의 `createCardEditors(host)`에서 수정하고, 다른 기능과의 연결은 `ui.js`의 `createCardEditors({...})`에서 수정합니다.

## 파일 로드와 기능 조립

UI 파일 6개와 공통 파일 5개로 구성됩니다. `index.html`의 `defer` 로드 순서는 다음과 같습니다.

```text
state.js → parser.js → renderer.js
→ ui-source.js → ui-editor.js → ui-preview-edit.js → ui-preview-view.js → ui-library.js
→ ui.js → storage.js → app.js
```

UI 부품 5개는 생성 함수 묶음만 `MosaicUIParts`에 등록합니다. `ui-source.js`가 등록 공간을 만들고, `ui.js`가 목록을 고정한 뒤 기능을 조립합니다. `app.js`는 명령 주입과 초기화를 이어갑니다. 등록 시점에는 이벤트를 연결하거나 입력창을 만들지 않습니다.

일반 개조 코드는 `MosaicUI`·`MosaicApp` API를 사용합니다. `MosaicUIParts`에는 편집 데이터·캐시·검색 상태를 넣지 않습니다. 기능 사이의 새 연결은 필요한 동작을 `host` 인자로 전달합니다. 부품 파일에서 `ui.js`의 비공개 변수를 직접 참조하지 않습니다.

기존 기능은 담당 함수에서 수정합니다. 같은 부품 파일에 생성 함수를 추가한다면 파일 끝의 반환 목록과 `ui.js`의 묶음 읽기·생성 호출도 연결합니다.

## 디자인 기본값 바꾸기

`state.js`의 `DEFAULT_STYLE`을 수정합니다. 예를 들어 `narrSize: '14'`를 `'16'`으로 바꾸면 새 시작과 디자인 초기화에서 16px를 사용합니다.

`initializeStyleDefaults`가 초기화 시 HTML 컨트롤과 숫자·색상 입력 미러를 채우므로, HTML에 같은 디자인 기본값을 중복 작성하지 않습니다. 기존 초안이 있으면 저장된 값이 우선합니다. 새 기본값은 별도 브라우저 저장 공간에서 확인하거나, 작업을 백업한 뒤 디자인 초기화로 확인합니다.

허용 범위나 선택지를 바꿀 때는 `STYLE_SCHEMA`와 `index.html`의 컨트롤도 확인합니다. 작업 초기값은 `WORK_FIELD_DEFAULTS`·`WORK_BOOLEAN_DEFAULTS`, 처음 보이는 예제 내용은 별도로 관리합니다.

## 데이터 흐름

```text
카드·설정 입력 → UI 원본 변경 → app.js의 changes
                                ├─ 렌더·카운터 갱신
                                │   └─ settings + cards → renderer → 미리보기·HTML
                                └─ 원본 수집 → storage → 초안 저장

HTML·보관함·작업 히스토리 → replaceWork
                          └─ applyState → 필요한 상태 정리 → 렌더·저장

미리보기 편집 → 연결 확인 → 원문 변경안 계산 → 공통 적용 → input → 작업 기록
```

현재 카드 원문은 카드 입력창이 관리하고, 전체 화면 입력창은 그 원문과 연결된 미러입니다. 별도의 장기 본문 복사본을 만들지 않습니다.

| 읽기 API | 반환값·용도 |
|---|---|
| `MosaicUI.cards.all()` | 카드·코멘트 원본 배열 |
| `MosaicUI.work.collect()` | `{cards, fields}` — 작업 원본 |
| `MosaicUI.work.collectSlot()` | `{cards, fields, style}` — 보관함·HTML 복원·히스토리 |
| `MosaicUI.captureDraftUiState()` | `{fields, booleans, style, cards}` — 초안·복원 실패 시 되돌림 |
| `MosaicUI.currentStyleValues()` | 저장용 디자인 원본 |
| `MosaicUI.getSettings()` | 기본값·정규화·고급 옵션을 적용한 출력용 설정 |

수집 결과는 호출 시점의 새 데이터이며, 객체를 바꿔도 화면에 자동 적용되지 않습니다. 저장에는 원본 값을, 출력에는 `getSettings()`를 사용합니다. 출력용 설정으로 저장 데이터를 대체하면 공백이나 꺼진 고급 설정 등의 값이 달라질 수 있습니다. DOM·검색 포커스·런타임 카드 식별자는 저장 형식에 넣지 않습니다.

## 변경 후 처리 연결하기

값을 바꾼 뒤 아래 공통 경로를 사용합니다. UI 내부는 주입된 `appCommands.changes`, 외부 개조 코드는 `MosaicApp.changes`로 호출합니다.

| 경로 | 처리 |
|---|---|
| `settingsInput(id)` | 렌더·초안 저장 예약, 디자인 필드이면 디자인 히스토리 묶음 예약 |
| `liveInput()` | 렌더·카운터·초안 저장 예약 |
| `controlChange()` | 즉시 렌더·카운터 갱신, 초안 저장 예약 |
| `committedChange()` | 즉시 렌더·카운터 갱신·초안 저장, 저장 성공 여부 반환 |
| `renderedDraftChange()` | 즉시 렌더, 초안 저장 예약 |
| `renderedSavedChange()` | 즉시 렌더·초안 저장, 저장 성공 여부 반환 |
| `styleChange()` | 즉시 렌더·초안 저장·디자인 히스토리 확정, 저장 성공 여부 반환 |

예약된 렌더는 다음 화면 프레임에 실행됩니다. 일반 타이핑의 실행 취소는 브라우저가 관리합니다. 작업 단위 변경은 변경 전 `cards.snapshot()`, 완료 후 `feedback.undo()`로 기록합니다. 기존 `input` 이벤트를 발생시켰다면 이벤트 처리기가 공통 경로를 호출하므로 렌더·저장을 중복 호출하지 않습니다.

### 본문에 구분선 추가

```js
const textarea = MosaicUI.cards.textareas()[0];
if (textarea) {
  MosaicUI.cards.snapshot();
  textarea.setRangeText('\n\n[HR]\n\n', textarea.selectionStart, textarea.selectionEnd, 'end');
  textarea.dispatchEvent(new Event('input', {bubbles: true}));
  MosaicUI.feedback.undo('구분선 추가.');
}
```

### 디자인 값 변경

```js
const style = MosaicUI.currentStyleValues();
MosaicUI.applyStyleValues({...style, narrSize: '15'});
MosaicApp.changes.styleChange();
```

### 카드 추가 후 작업 전체 적용

```js
const work = MosaicUI.work.collectSlot();
work.cards.push({type: 'card', body: '새 카드', visible: true});
MosaicUI.cards.snapshot();
MosaicUI.work.apply(work);
MosaicUI.feedback.undo('새 카드 추가.');
```

`work.apply()`는 `MosaicApp.replaceWork()`를 통해 복원·렌더·저장을 연결합니다. `work.applyState()`는 화면 값만 복원하는 내부용 경로입니다. 시작 시 초안 복원은 검증과 실패 시 되돌림을 포함하는 별도 경로를 유지합니다.

## 미리보기 편집 수정하기

- 병행 대사의 표시와 원문 위치는 `parser.js`의 `parallelDisplayParts`를 공유합니다. 보조 대사를 감싸는 바깥 큰따옴표만 생략하고, 내부 인용·입력 원문·나레이션·속마음은 보존합니다. 표시 순서를 바꿔도 같은 규칙을 적용합니다.
- 자동·이어쓰기·아래쓰기 판정은 `MosaicParser.parallelTranslationPlacement()`를 출력과 편집 투영이 함께 사용합니다. 괄호 안 공백과 숨긴 구분자의 원문 위치도 함께 보존합니다.
- 아카라이브 PC·모바일의 출력 색·크기 보호는 `renderer.js`의 `lockOutputTypographyForArca()`에서 처리합니다. 병행 묶음의 부모 스타일만 믿지 말고 자식에 직접 적용되는 외부 CSS도 검사합니다. 필요한 `!important`와 번역 보조색·축소 크기·내부 강조를 유지합니다.
- `createPreviewSourceEdits`는 `{before, after, message}` 변경안을 계산합니다. 위치·표시 글자 치환은 `createSourceMapping`을 공유합니다.
- `applyPreviewSourceChange`는 연결과 현재 원문을 확인하고 입력창·작업 기록·입력 이벤트를 갱신합니다. 계산 함수에 포커스·렌더·저장 코드를 넣지 않습니다.
- 작업 전체 복원 전에는 `discardActiveDirectEdit()`로 미확정 편집을 종료합니다. 이전 편집기의 `blur`가 복원한 내용을 덮지 않도록 유지합니다.
- 병행 제외·다시 적용은 선택 도구막대에서 `changeParallelOccurrences`로 연결합니다. 글자 일부를 선택해도 원문·번역 묶음 전체가 대상입니다.
- `bindOutputRuleInteractions`의 일반 클릭과 `showOutputRulePopover`는 치환·삭제 예외를 처리합니다. 병행 제외 클릭 팝업을 다시 추가하지 않습니다.
- `parallelExclusions`·`outputRuleExclusions`의 저장 구조와 원문 범위 계산을 공유합니다.
- 컨트롤 동기화 캐시는 `createControlSync`가 관리합니다. 복원 시 `invalidateControlSync()`를 사용하고 캐시 객체를 직접 수정하지 않습니다.

## 설정 추가하기

1. `index.html`에 컨트롤을 추가합니다. 디자인은 `DEFAULT_STYLE`·`STYLE_SCHEMA`, 작업 문자열은 `WORK_FIELDS`·`WORK_FIELD_DEFAULTS`, 작업 체크값은 `WORK_BOOLEAN_DEFAULTS`에 등록합니다.
2. 출력에 쓸 값은 `createSettingsReader`의 `getSettings()`에서 읽어 렌더러에 전달합니다. 저장 수집은 공통 필드 목록을 사용합니다.
3. 세부 프리셋에 포함한다면 스키마의 `detailPreset`도 확인합니다. 기존 저장에 새 필드가 없을 때의 기본값을 정합니다.
4. 필요한 기능 연결은 `host`로 전달합니다. 다른 기능의 비공개 상태나 바깥 클로저를 직접 참조하지 않습니다.

## 수정 후 확인

1. `index.html`을 직접 열고 PC·좁은 화면의 실행 오류와 배치를 확인합니다.
2. 카드·코멘트·숨긴 카드·접기 제목을 수정하고 저장·새로고침을 확인합니다.
3. 관련 입력창에서 직접 편집·검색·치환·한글 조합·기본 실행 취소·작업 실행 취소를 확인합니다.
4. 보관함과 HTML 내보내기·불러오기에서 원문·디자인·규칙 제외가 유지되는지 확인합니다.
5. 영향받는 출력 HTML·화면을 수정 전과 비교합니다. 병행 양쪽 편집, Shift+Enter, 인용선 간격 등 관련 경계도 확인합니다.
6. JS·CSS를 바꿨다면 `index.html`의 해당 `?v=...` 캐시 값을 갱신합니다. 문서만 바꿨다면 실행 파일의 캐시 값은 유지합니다.
7. 배포 ZIP과 폴더의 파일이 일치하는지 확인합니다. GitHub에는 HTML·CSS·JS 13개, `Top_image.png`, 문서를 같은 구조로 올립니다.
