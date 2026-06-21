# WebView and In-Page Usage

Use `createExtractorScript()` when the current page already exists in a mobile
WebView, Playwright page, Puppeteer page, browser extension, or in-app browser.
It builds an accessibility-style semantic tree from the live DOM without
opening a separate browser.

## Playwright

```ts
import { createExtractorScript } from "ax-grep";

const text = await page.evaluate(createExtractorScript({
  format: "text",
  mode: "interactive",
  includeBounds: false,
  includeAttributes: false,
}));
```

## Android WebView

```kotlin
webView.evaluateJavascript(scriptFromServer) { jsonEncodedResult ->
  // scriptFromServer is createExtractorScript({ format: "text" }).
  // jsonEncodedResult contains the semantic tree text.
}
```

Generate the script in your JavaScript bundle or server:

```ts
import { createExtractorScript } from "ax-grep";

export const scriptFromServer = createExtractorScript({
  format: "text",
  mode: "interactive",
});
```

## iOS WKWebView

```swift
webView.evaluateJavaScript(scriptFromServer) { result, error in
  if let text = result as? String {
    // Send text to the local model or agent parser.
  }
}
```

## In-Page Bundle

When your code already runs inside the page, use the browser entry point:

```ts
import { extract, formatSemanticTreeText } from "ax-grep/browser";

const tree = extract({
  mode: "interactive",
  includeBounds: false,
});

console.log(formatSemanticTreeText(tree));
```

## Mobile Agent Policy

For local sLLM search or parsing, run extraction in the current WebView first.
Escalate to network search or remote browser automation only when the semantic
tree lacks the target evidence, login state, or post-interaction content.
