import MarkdownIt from "markdown-it";

const repository = "https://github.com/BerryUIKI/Omera";
const markdown = new MarkdownIt({ html: false, linkify: false, maxNesting: 20 });

function releaseLink(href: string, tag = "main"): string | null {
  try {
    const url = new URL(href, `${repository}/blob/${encodeURIComponent(tag)}/`);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href : null;
  } catch {
    return null;
  }
}

// Notes are remote content. Disable raw HTML and non-web links, and never load
// remote images/tracking pixels in the application WebView.
markdown.validateLink = href => releaseLink(href) !== null;
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const href = releaseLink(String(token.attrGet("href") ?? ""), typeof env?.tag === "string" ? env.tag : "main");
  if (href) token.attrSet("href", href);
  token.attrSet("target", "_blank");
  token.attrSet("rel", "noopener noreferrer");
  return renderer.renderToken(tokens, index, options);
};

export function renderReleaseMarkdown(source: string, tag: string): string {
  return markdown.render(source, { tag });
}
