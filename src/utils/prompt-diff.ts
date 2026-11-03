/** Lossless token diff with bounded alignment work. It never interprets HTML. */
export interface DiffPart { text: string; kind: 'equal' | 'added' | 'removed' | 'weight'; from?: number; to?: number }
interface Token { text: string; key: string; weight: number }
export interface PromptDiff { left: DiffPart[]; right: DiffPart[]; coarse: boolean; changed: boolean }
const WORD = /^[\p{L}\p{M}\p{N}_]+$/u;
function tokens(source: string): Token[] {
  const closing = new Map<number, number>(), stack: number[] = [];
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '(') stack.push(i);
    else if (c === ')' && stack.length) closing.set(stack.pop()!, i);
  }
  const result: Token[] = [];
  const ordinary = /[\p{L}\p{M}\p{N}_]+|\s+|[^]/uy;
  for (let i = 0; i < source.length;) {
    const end = closing.get(i);
    // Scan each weighted candidate only once: nested candidates are treated as
    // literal text unless the outer group itself carries an explicit weight.
    if (end !== undefined) {
      const body = source.slice(i + 1, end);
      const match = /^(.*):([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)$/is.exec(body);
      if (match && Number.isFinite(Number(match[2]))) {
        result.push({text: source.slice(i, end + 1), key: 'word:' + match[1], weight: Number(match[2])});
        i = end + 1; continue;
      }
      // Avoid repeated slicing of deeply nested unweighted parentheses.
      if (body.includes('(')) {
        result.push({text: source.slice(i, end + 1), key: 'literal:' + source.slice(i, end + 1), weight: 1});
        i = end + 1; continue;
      }
    }
    ordinary.lastIndex = i;
    const text = ordinary.exec(source)![0];
    result.push({text, key: (WORD.test(text) ? 'word:' : 'literal:') + text, weight: 1});
    i += text.length;
  }
  return result;
}
function append(parts: DiffPart[], part: DiffPart) {
  if (!part.text) return;
  const last = parts.at(-1);
  if (last && last.kind === part.kind && part.kind !== 'weight') last.text += part.text;
  else parts.push(part);
}
function coarseDiff(a: string, b: string): PromptDiff {
  let prefix = 0, suffix = 0;
  while (prefix < Math.min(a.length, b.length, 50000) && a[prefix] === b[prefix]) prefix++;
  if (prefix && /[\uD800-\uDBFF]/.test(a[prefix - 1])) prefix--;
  while (suffix < Math.min(a.length - prefix, b.length - prefix, 50000)
    && a[a.length - suffix - 1] === b[b.length - suffix - 1]) suffix++;
  if (suffix && /[\uDC00-\uDFFF]/.test(a[a.length - suffix])) suffix--;
  const side = (s: string, kind: 'removed' | 'added'): DiffPart[] => [
    {text: s.slice(0, prefix), kind: 'equal'},
    {text: s.slice(prefix, s.length - suffix), kind},
    {text: suffix ? s.slice(-suffix) : '', kind: 'equal'},
  ].filter(p => p.text) as DiffPart[];
  return {left: side(a, 'removed'), right: side(b, 'added'), coarse: true, changed: true};
}
export function diffPrompts(a: string, b: string): PromptDiff {
  if (a === b) return {left: [{text: a, kind: 'equal'}], right: [{text: b, kind: 'equal'}], coarse: false, changed: false};
  if (Math.max(a.length, b.length) > 32768) return coarseDiff(a, b);
  const left = tokens(a), right = tokens(b), width = right.length + 1;
  if (left.length > 1500 || right.length > 1500 || left.length * right.length > 400000) return coarseDiff(a, b);
  const dp = new Uint16Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--)
    dp[i * width + j] = left[i].key === right[j].key ? dp[(i + 1) * width + j + 1] + 1
      : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
  const result: PromptDiff = {left: [], right: [], coarse: false, changed: true};
  let i = 0, j = 0;
  while (i < left.length || j < right.length) {
    const l = left[i], r = right[j];
    if (l && r && l.key === r.key) {
      if (l.text === r.text) {
        append(result.left, {text: l.text, kind: 'equal'}); append(result.right, {text: r.text, kind: 'equal'});
      } else if (l.weight !== r.weight) {
        append(result.left, {text: l.text, kind: 'weight', from: l.weight, to: r.weight});
        append(result.right, {text: r.text, kind: 'weight', from: l.weight, to: r.weight});
      } else {
        append(result.left, {text: l.text, kind: 'removed'}); append(result.right, {text: r.text, kind: 'added'});
      }
      i++; j++;
    } else if (l && (!r || dp[(i + 1) * width + j] >= dp[i * width + j + 1])) {
      append(result.left, {text: l.text, kind: 'removed'}); i++;
    } else { append(result.right, {text: r.text, kind: 'added'}); j++; }
  }
  return result;
}

/** Bound rendered spans and characters while retaining complete originals for copy. */
export function visibleDiff(parts: DiffPart[], limit = 20000): DiffPart[] {
  const result: DiffPart[] = [];
  for (const part of parts) {
    if (limit <= 0) break;
    let length = Math.min(limit, part.text.length);
    if (length < part.text.length && /[\uD800-\uDBFF]/.test(part.text[length - 1])) length--;
    result.push({...part, text: part.text.slice(0, length)}); limit -= length;
  }
  return result;
}
