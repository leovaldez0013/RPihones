// Motor de modelos: {{variaveis}} e um subconjunto de Markdown convertido em blocos
// (renderizados tanto em HTML quanto em PDF).

export type TemplateContext = Record<string, unknown>;

function lookup(ctx: TemplateContext, path: string): unknown {
  return path.split(".").reduce<unknown>((obj, key) => (obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined), ctx);
}

/** Substitui {{caminho.da.variavel}}. Variáveis desconhecidas ficam vazias (e são listadas em `missing`). */
export function renderTemplate(text: string, ctx: TemplateContext): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const out = text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path: string) => {
    if (path === "assinatura_cliente" || path === "assinatura_loja") return match; // tratado como bloco
    const v = lookup(ctx, path);
    if (v === undefined || v === null || v === "") {
      if (v === undefined) missing.add(path);
      return "";
    }
    return String(v);
  });
  return { text: out, missing: [...missing] };
}

/** Lista as variáveis disponíveis num contexto (para o editor). */
export function listVariables(ctx: TemplateContext, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(ctx)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...listVariables(v as TemplateContext, key));
    else out.push(key);
  }
  return out;
}

// ── Markdown simplificado ──

export type Inline = { text: string; bold?: boolean; italic?: boolean };
export type Block =
  | { type: "h1" | "h2" | "h3"; inline: Inline[] }
  | { type: "p"; inline: Inline[]; align?: "center" | "right" }
  | { type: "ul"; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }
  | { type: "hr" }
  | { type: "signature"; who: "cliente" | "loja" };

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    const token = m[0];
    if (token.startsWith("**")) parts.push({ text: token.slice(2, -2), bold: true });
    else parts.push({ text: token.slice(1, -1), italic: true });
    last = m.index + token.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts.length ? parts : [{ text: "" }];
}

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];

  const flush = () => {
    if (!para.length) return;
    let text = para.join("\n");
    let align: "center" | "right" | undefined;
    if (text.startsWith("->") && text.endsWith("<-")) {
      align = "center";
      text = text.slice(2, -2).trim();
    } else if (text.startsWith("->")) {
      align = "right";
      text = text.slice(2).trim();
    }
    blocks.push({ type: "p", inline: parseInline(text), align });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    if (/^\{\{\s*assinatura_(cliente|loja)\s*\}\}$/.test(t)) {
      flush();
      blocks.push({ type: "signature", who: t.includes("cliente") ? "cliente" : "loja" });
      continue;
    }
    if (/^(-{3,}|_{3,})$/.test(t)) {
      flush();
      blocks.push({ type: "hr" });
      continue;
    }
    const h = t.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      blocks.push({ type: (`h${h[1].length}` as "h1"), inline: parseInline(h[2]) });
      continue;
    }
    if (t.startsWith("|")) {
      flush();
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++].trim());
      i--;
      const header = splitRow(rows[0]).map(parseInline);
      const body = rows
        .slice(1)
        .filter((r) => !/^\|?\s*:?-{2,}/.test(r))
        .map((r) => splitRow(r).map(parseInline));
      blocks.push({ type: "table", header, rows: body });
      continue;
    }
    if (/^[-*]\s+/.test(t)) {
      flush();
      const items: Inline[][] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) items.push(parseInline(lines[i++].trim().replace(/^[-*]\s+/, "")));
      i--;
      blocks.push({ type: "ul", items });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

/** Monta uma tabela Markdown a partir de linhas (usada nas variáveis de lista). */
export function mdTable(header: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => String(v).replace(/\|/g, "/").replace(/\n/g, " ");
  return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n");
}

export function mdList(items: string[]): string {
  return items.map((i) => `- ${i}`).join("\n");
}
