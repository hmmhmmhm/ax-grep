# How ax-grep Works

ax-grep의 핵심은 브라우저가 내부적으로 만드는 접근성 트리와 비슷한 구조를
브라우저를 열기 전에 재현하는 것입니다. HTML을 파싱해 DOM과 유사한 트리로
만들고, 역할(role), 이름(name), 상태(state), 포커스 가능 여부, 조작 가능
여부를 계산한 뒤, 에이전트가 바로 읽을 수 있는 `agent`, `pageCheck`,
`verification`, `handoff` 출력으로 다시 정리합니다.

## 1. HTML을 의미 트리로 바꿉니다

라이브러리 진입점인 [`extract()`](../src/index.ts#L107)는 정적 HTML 추출기인
[`extractStaticSemanticTree()`](../src/static.ts#L99)로 위임합니다. 이 함수는
`htmlparser2`로 HTML을 파싱하고, 옵션을 정한 뒤, `id`, `aria-*` 참조,
`label for`, 접힌 컨트롤 관계를 먼저 색인합니다
([`indexDocument()`](../src/static.ts#L175)).

그 다음 [`walkElement()`](../src/static.ts#L221)가 각 요소를 순회하면서
브라우저 접근성 트리에 가까운 `SemanticNode`를 만듭니다. 여기서
[`getRole()`](../src/static.ts#L678)는 태그와 명시적 `role`을 접근성 역할로
매핑하고, [`computeName()`](../src/static.ts#L723)은 `aria-labelledby`,
`aria-label`, `<label>`, `alt`, 본문 텍스트 순서로 접근성 이름을 계산합니다.
[`getState()`](../src/static.ts#L791)는 `checked`, `selected`, `expanded`,
`disabled`, `aria-current` 같은 상태를 옮기고,
[`isFocusable()`](../src/static.ts#L857)와
[`isInteractive()`](../src/static.ts#L851)는 에이전트가 클릭하거나 입력할 수
있는 대상을 표시합니다.

## 2. 에이전트에 불필요한 노이즈를 줄입니다

정적 HTML에는 레이아웃용 wrapper, 닫힌 메뉴, 반복 카드, 광고, 푸터처럼
에이전트 판단에 덜 중요한 노드가 많습니다. `walkElement()`는 이런 노드를
그대로 모두 넘기지 않고, 접힌 서브트리는
[`shouldSkipChildrenForCollapsedElement()`](../src/static.ts#L550)에서 줄이며,
닫힌 overlay는 [`isLikelyClosedOverlay()`](../src/static.ts#L564)에서 제외합니다.
일반 wrapper는 [`shouldPrune()`](../src/static.ts#L612)에서 자식만 남기거나
제거합니다.

이 단계의 목적은 원본 HTML 전체를 요약하는 것이 아니라, 에이전트가 실제로
읽고 조작할 가능성이 높은 구조를 남기는 것입니다.

## 3. 브라우저 안에서도 같은 모델을 씁니다

WebView나 이미 열린 페이지에서는 정적 파서 대신
[`extractSemanticTree()`](../src/browser.ts#L89)가 현재 `document`를 직접
순회합니다. 브라우저 DOM 경로의 [`walkElement()`](../src/browser.ts#L168)도
정적 경로와 같은 필드(role, name, state, selector, xpath, children)를 채우며,
필요하면 bounds, shadow DOM, iframe 정보를 덧붙입니다.

실시간 페이지 변화는 [`observeSemanticTree()`](../src/browser.ts#L123)가
`MutationObserver`로 감지합니다. 그래서 모바일 WebView나 브라우저 확장처럼
“현재 페이지를 즉시 에이전트가 읽을 구조로 바꾸는” 용도에도 같은 추출 모델을
사용할 수 있습니다.

## 4. CLI는 의미 트리를 agent handoff로 재구성합니다

CLI는 의미 트리를 그대로 출력하는 데서 끝나지 않습니다.
[`jsonEnvelope()`](../src/cli.ts#L21445)가 링크, outline, action, content,
검색 결과를 뽑고, [`summarizePageCheck()`](../src/cli.ts#L8414)가 본문 증거,
폼, 액션 타깃, hydration/API 힌트, barrier를 정리합니다.

그 후 [`summarizeAgent()`](../src/cli.ts#L14754)가 에이전트가 다음에 할 일을
정합니다. 예를 들어 현재 HTML만 읽어도 되는지, 검색 결과 중 어떤 항목을 열어야
하는지, 브라우저 HTML 캡처가 필요한지, 답변에 쓸 citation 후보가 충분한지를
`agent.executor`, `agent.handoff`, `agent.readTargets`, `pageCheck`,
`verification` 형태로 만듭니다. `--agent-brief`에서는
[`compactAgentBrief()`](../src/cli.ts#L24329)와
[`compactAgentBriefHandoff()`](../src/cli.ts#L26406)이 이 결과를 더 짧게
압축합니다.

## 5. 첼린지와 검색 실패는 브라우저 handoff로 돌립니다

정적 HTML로 충분하지 않은 페이지도 있습니다. hCaptcha, reCAPTCHA,
Cloudflare, Akamai, DataDome, PerimeterX, Kasada 같은 challenge 흔적은
[`detectBarrierDiagnostics()`](../src/cli.ts#L21157)에서 감지합니다. 이런 경우
CLI는 무리하게 HTML을 읽었다고 주장하지 않고, 에이전트에게 브라우저 사용이나
추가 캡처가 필요하다는 `handoff`를 반환합니다.

검색 모드에서도 같은 원칙을 씁니다. `--search --engine auto`는
[`resolveAutoSearch()`](../src/cli.ts#L3683)에서 DuckDuckGo, Bing, StartPage,
Google을 순차적으로 시도하고, 막혔거나 빈 결과인 엔진을 건너뛰며 가장 쓸 만한
결과 세트를 고릅니다.

## 6. 브라우저 접근성 스냅샷과 대조합니다

재현률은 감으로만 맞추지 않습니다.
[`scripts/compare.ts`](../scripts/compare.ts#L123)는 같은 URL을 대상으로
ax-grep 추출 결과와 `agent-browser snapshot` 결과를 함께 만들고, named role
overlap과 agent readiness를 계산합니다. 비교 후에는
[`closeAgentBrowserSession()`](../scripts/compare.ts#L237)로 세션을 닫고,
[`withAgentBrowserLock()`](../scripts/compare.ts#L247)으로 동시 실행을 막아
서버 과부하를 피합니다.

릴리즈 전 smoke 기준은
[`scripts/check-agent-browser-smoke.ts`](../scripts/check-agent-browser-smoke.ts#L36)에
사이트별로 정의되어 있습니다. 예를 들어 단순 페이지는 100% overlap을 요구하고,
복잡한 페이지는 target별로 0.75에서 0.90 이상의 overlap/recall/readiness
기준을 통과해야 합니다. 즉 “브라우저가 보는 접근성 트리를 그대로 베끼는” 것이
아니라, 에이전트에게 필요한 구조를 브라우저 기준과 계속 대조하면서 충분한
재현률까지 끌어올리는 방식입니다.
