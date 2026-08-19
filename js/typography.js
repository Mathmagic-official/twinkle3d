/**
 * Keeps the closing words of centred copy together.
 *
 * `text-wrap: balance` and `pretty` are both best-effort: browsers cap balancing by
 * line count and disagree on what counts as too short a last line. A non-breaking
 * space is not a hint but a rule, so binding the closing words guarantees a floor
 * no matter what the browser decides.
 */

const SELECTOR = ".lead, .section-lead, .section h2";

/** Shortest last line we will accept, in characters. */
const MIN_TAIL = 14;

/** Binding more than this starts to strand the line above instead. */
const MAX_BIND = 3;

/** Whitespace a line may break at. A non-breaking space deliberately does not count. */
const BREAK = /[ \t\r\n]+([^ \t\r\n]+)$/;

/** The run of text after the last breakable gap, i.e. what would sit on the last line. */
function tailOf(text) {
  const match = text.match(/[ \t\r\n]([^ \t\r\n]*)$/);
  return match ? match[1] : text;
}

function bindClosingWords(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue.trim()) last = node;
  }
  if (!last) return;

  let text = last.nodeValue.replace(/[ \t\r\n]+$/, "");
  for (let bound = 0; bound < MAX_BIND; bound++) {
    if (tailOf(text).length >= MIN_TAIL) break;
    const joined = text.replace(BREAK, "\u00a0$1");
    if (joined === text) break; // Single word, or every gap already bound.
    text = joined;
  }
  last.nodeValue = text;
}

document.querySelectorAll(SELECTOR).forEach(bindClosingWords);
