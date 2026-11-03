import type { ReactNode } from "react";

type Block =
  | { type: "heading"; text: string; level: number }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; text: string };

function parseResult(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: "list", ...list });
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      flushParagraph(); flushList();
      if (code) { blocks.push({ type: "code", text: code.join("\n") }); code = null; }
      else code = [];
      continue;
    }
    if (code) { code.push(raw); continue; }
    if (!line) { flushParagraph(); flushList(); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }
    const item = line.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (item) {
      flushParagraph();
      const ordered = /^\d/.test(line);
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push(item[1]);
      continue;
    }
    flushList(); paragraph.push(line);
  }
  flushParagraph(); flushList();
  if (code) blocks.push({ type: "code", text: code.join("\n") });
  return blocks;
}

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-ink/5 px-1 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  });
}

export default function AgentResult({ content, emptyText = "No text result was recorded for this run." }: { content: string; emptyText?: string }) {
  const blocks = parseResult(content);
  if (!blocks.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return <article className="space-y-4 text-[13px] leading-7 text-ink/80">
    {blocks.map((block, index) => {
      if (block.type === "heading") {
        const Tag = block.level <= 2 ? "h2" : "h3";
        return <Tag key={index} className="pt-2 font-display text-base font-bold leading-snug text-ink">{inline(block.text)}</Tag>;
      }
      if (block.type === "list") {
        const List = block.ordered ? "ol" : "ul";
        return <List key={index} className={`space-y-2 pl-6 marker:text-primary ${block.ordered ? "list-decimal" : "list-disc"}`}>{block.items.map((item, itemIndex) => <li key={itemIndex} className="pl-1">{inline(item)}</li>)}</List>;
      }
      if (block.type === "code") return <pre key={index} className="overflow-x-auto rounded-xl bg-[#171a27] p-4 text-[11px] leading-5 text-slate-100"><code>{block.text}</code></pre>;
      return <p key={index} className="whitespace-pre-wrap">{inline(block.text)}</p>;
    })}
  </article>;
}
