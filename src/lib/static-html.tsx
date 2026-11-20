/**
 * Server-only HTML for the sections of the home (PM decision 2026-11-20, option (a)).
 *
 * The home's sections are server components: nothing in them is interactive through React (the
 * cinema and the evidence dialog work on the DOM). Sent as a React tree, they were still described a
 * second time in the page's RSC payload and walked by React at hydration — two thirds of the HTML's
 * bytes and most of the static page's blocking time on CI. `StaticHtml` renders such a tree to a
 * string here, on the server, and hands React one string instead (the same way the evidence dialog
 * is served): the markup is identical, React neither re-describes nor hydrates it.
 *
 * A small renderer rather than react-dom/server: that package cannot be used from server components,
 * and these trees only need elements, fragments, strings and (async) server components. A client
 * component inside a static tree is an error — keep islands outside (the finale's drawer).
 */
import { Fragment, isValidElement, type ReactNode } from 'react';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RENAMED: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  defaultValue: 'value',
  defaultChecked: 'checked',
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
};
/** SVG attributes that keep their capitals. */
const KEEP_CASE = new Set(['viewBox', 'pathLength', 'preserveAspectRatio']);
const SKIP = new Set(['children', 'key', 'ref', 'dangerouslySetInnerHTML', 'suppressHydrationWarning']);

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');

function styleOf(style: Record<string, unknown>): string {
  return Object.entries(style)
    .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== '')
    .map(([k, v]) => `${k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${String(v)}`)
    .join(';');
}

function attrsOf(props: Record<string, unknown>): string {
  let out = '';
  for (const [key, value] of Object.entries(props)) {
    if (SKIP.has(key) || value === null || value === undefined) continue;
    // Enumerated attributes say "false" out loud; plain booleans are simply absent.
    const enumerated = key.startsWith('aria-') || key === 'spellCheck' || key === 'draggable';
    if (value === false && !enumerated) continue;
    if (typeof value === 'function') throw new Error(`StaticHtml: an event handler (${key}) cannot be rendered to static HTML`);
    const name = RENAMED[key] ?? (KEEP_CASE.has(key) || key.includes('-') ? key : key.toLowerCase());
    if (key === 'style') {
      const css = styleOf(value as Record<string, unknown>);
      if (css) out += ` style="${escapeAttr(css)}"`;
    } else if (typeof value === 'boolean') out += enumerated ? ` ${name}="${value}"` : ` ${name}=""`;
    else out += ` ${name}="${escapeAttr(String(value))}"`;
  }
  return out;
}

/** The HTML of a tree of elements, fragments, text and (async) server components. */
export async function toHtml(node: ReactNode | Promise<ReactNode>): Promise<string> {
  const value = await node;
  if (value === null || value === undefined || typeof value === 'boolean') return '';
  if (typeof value === 'string') return escapeText(value);
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) {
    let out = '';
    for (const child of value) out += await toHtml(child as ReactNode);
    return out;
  }
  if (!isValidElement(value)) throw new Error('StaticHtml: unsupported node');
  const { type } = value;
  const props = value.props as Record<string, unknown> & { children?: ReactNode; dangerouslySetInnerHTML?: { __html: string } };
  if (type === Fragment) return toHtml(props.children);
  if (typeof type === 'function') return toHtml((type as (p: unknown) => ReactNode | Promise<ReactNode>)(props));
  if (typeof type !== 'string') throw new Error('StaticHtml: a client component cannot be rendered to static HTML — keep it outside the static part');
  const open = `<${type}${attrsOf(props)}>`;
  if (VOID.has(type)) return open;
  const inner = props.dangerouslySetInnerHTML ? props.dangerouslySetInnerHTML.__html : await toHtml(props.children);
  return `${open}${inner}</${type}>`;
}

/**
 * `children` rendered to HTML on the server and set as this element's content. Everything inside is
 * plain DOM for the browser: no React props, state or handlers reach it.
 */
export async function StaticHtml({ as: Tag = 'div', children, ...attrs }: { as?: 'div' | 'section' | 'main'; children: ReactNode } & Record<string, unknown>) {
  return <Tag {...attrs} dangerouslySetInnerHTML={{ __html: await toHtml(children) }} />;
}
