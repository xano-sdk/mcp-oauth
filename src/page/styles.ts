/**
 * The page's stylesheet. LF line endings only: browsers hash inline content
 * after turning CRLF into LF, so a CR here would break the CSP hash (verified
 * live, see AGENTS.md). `test/page-template.test.ts` asserts there is none.
 *
 * The accent colour is appended per render as a `:root` custom property, so
 * this constant never changes with branding.
 */
export const BASE_STYLES = String.raw`
:root { color-scheme: light dark; --bg: #f4f4f5; --card: #ffffff; --text: #18181b; --muted: #52525b; --line: #e4e4e7; --warn-bg: #fef3c7; --warn-text: #78350f; --error: #b91c1c; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #09090b; --card: #18181b; --text: #fafafa; --muted: #a1a1aa; --line: #27272a; --warn-bg: #422006; --warn-text: #fde68a; --error: #fca5a5; }
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 48px 16px; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { width: 100%; max-width: 400px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 28px 24px; }
.brand { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-weight: 600; }
.brand img { width: 32px; height: 32px; border-radius: 6px; object-fit: contain; }
h1 { font-size: 1.25rem; line-height: 1.3; margin: 0 0 16px; outline: none; }
p { margin: 0 0 12px; }
.request { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin-bottom: 20px; }
.request .client { display: flex; align-items: center; gap: 10px; font-weight: 600; }
.request .client img { width: 28px; height: 28px; border-radius: 6px; object-fit: contain; }
.request dl { margin: 10px 0 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 0.875rem; }
.request dt { color: var(--muted); }
.request dd { margin: 0; overflow-wrap: anywhere; }
.warning { background: var(--warn-bg); color: var(--warn-text); border-radius: 6px; padding: 8px 10px; margin-top: 10px; font-size: 0.875rem; }
label { display: block; font-size: 0.875rem; font-weight: 500; margin: 0 0 4px; }
input { width: 100%; min-height: 44px; padding: 10px 12px; margin: 0 0 14px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; font: inherit; }
input:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.actions { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
button { min-height: 44px; padding: 10px 16px; border-radius: 8px; font: inherit; font-weight: 600; cursor: pointer; border: 1px solid var(--line); background: transparent; color: inherit; }
button.primary { background: var(--accent); border-color: var(--accent); color: #ffffff; }
button[disabled] { opacity: 0.6; cursor: progress; }
button.link { border: 0; min-height: 44px; padding: 0; background: none; color: var(--muted); font-weight: 500; text-decoration: underline; }
.error { color: var(--error); font-size: 0.875rem; min-height: 1.25rem; margin: 8px 0 0; }
.muted { color: var(--muted); font-size: 0.875rem; }
.notice { margin: 20px 0 0; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.75rem; }
[hidden] { display: none !important; }
`;

export const stylesFor = (accent: string): string => `${BASE_STYLES}:root { --accent: ${accent}; }\n`;
