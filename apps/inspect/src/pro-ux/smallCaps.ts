// Mirror every upstream `text-transform: uppercase` rule as small caps, so new
// or renamed upstream label classes are covered without a hand-kept list.

const kCapsStyle =
  "text-transform: none !important; font-variant-caps: all-small-caps; letter-spacing: 0.04em;";

const seen = new Set<string>();
let sheet: CSSStyleSheet | null = null;

const collect = (rules: CSSRuleList, out: string[]): void => {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      if (rule.style.textTransform === "uppercase") out.push(rule.selectorText);
    } else if (rule instanceof CSSGroupingRule) {
      collect(rule.cssRules, out);
    }
  }
};

const scan = (): void => {
  const selectors: string[] = [];
  for (const styleSheet of Array.from(document.styleSheets)) {
    if (styleSheet === sheet) continue;
    try {
      collect(styleSheet.cssRules, selectors);
    } catch {
      // Cross-origin sheet: nothing of ours to mirror.
    }
  }
  if (!sheet) {
    sheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  for (const selector of selectors) {
    for (const part of selector.split(",")) {
      const trimmed = part.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      try {
        sheet.insertRule(`:root[data-pro-ux] ${trimmed} { ${kCapsStyle} }`);
      } catch {
        // Selector this engine can't re-parse in a descendant position.
      }
    }
  }
};

export const installSmallCaps = (): void => {
  let pending = false;
  const schedule = (): void => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      scan();
    });
  };
  scan();
  new MutationObserver(schedule).observe(document.head, {
    childList: true,
    subtree: true,
  });
  // A lazily added <link> has no cssRules until it loads.
  document.addEventListener(
    "load",
    (e) => {
      if (e.target instanceof HTMLLinkElement) schedule();
    },
    true
  );
};
