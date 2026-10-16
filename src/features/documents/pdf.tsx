// Geração de PDF dos documentos com @react-pdf/renderer (mesmos blocos do HTML).
import path from "node:path";
import { existsSync } from "node:fs";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { parseMarkdown, type Block, type Inline } from "@/domain/template";
import type { DocHeader } from "@/components/documents/doc-body";

const s = StyleSheet.create({
  page: { paddingVertical: 36, paddingHorizontal: 42, fontSize: 9.5, fontFamily: "Helvetica", color: "#18181b", lineHeight: 1.45 },
  header: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#e4e4e7", paddingBottom: 10, marginBottom: 14 },
  logo: { width: 40, height: 40, marginRight: 10, objectFit: "contain" },
  logoBox: { width: 40, height: 40, marginRight: 10, borderRadius: 8, backgroundColor: "#18181b", color: "#fff", fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "center", paddingTop: 12 },
  storeName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#18181b" },
  storeInfo: { fontSize: 7.5, color: "#52525b" },
  h1: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 12, marginTop: 4 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 5 },
  h3: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 3 },
  p: { marginBottom: 7 },
  li: { flexDirection: "row", marginBottom: 2 },
  bullet: { width: 10 },
  table: { borderWidth: 0.6, borderColor: "#d4d4d8", marginBottom: 9 },
  tr: { flexDirection: "row" },
  th: { flex: 1, padding: 4, backgroundColor: "#f4f4f5", fontFamily: "Helvetica-Bold", borderRightWidth: 0.6, borderRightColor: "#d4d4d8", borderBottomWidth: 0.6, borderBottomColor: "#d4d4d8" },
  td: { flex: 1, padding: 4, borderRightWidth: 0.6, borderRightColor: "#d4d4d8", borderBottomWidth: 0.6, borderBottomColor: "#d4d4d8" },
  hr: { borderBottomWidth: 0.6, borderBottomColor: "#d4d4d8", marginVertical: 8 },
  sig: { marginTop: 28, alignSelf: "center", width: 220, alignItems: "center" },
  sigImg: { height: 44, objectFit: "contain", marginBottom: -4 },
  sigLine: { borderTopWidth: 0.8, borderTopColor: "#27272a", width: "100%", marginTop: 36 },
  sigLineAfterImg: { borderTopWidth: 0.8, borderTopColor: "#27272a", width: "100%" },
  sigName: { fontSize: 8.5, marginTop: 3 },
  sigLabel: { fontSize: 7, color: "#71717a" },
});

function runs(parts: Inline[]) {
  return parts.map((p, i) => (
    <Text key={i} style={p.bold ? { fontFamily: "Helvetica-Bold" } : p.italic ? { fontFamily: "Helvetica-Oblique" } : undefined}>
      {p.text}
    </Text>
  ));
}

/** Logo: URL absoluta ou caminho de /public. */
function resolveImage(src?: string): string | null {
  if (!src) return null;
  if (/^https?:\/\//.test(src) || src.startsWith("data:")) return src;
  const file = path.join(process.cwd(), "public", src.replace(/^\//, ""));
  return existsSync(file) ? file : null;
}

function PdfBlock({ b, signature, signerName, storeName }: { b: Block; signature?: string | null; signerName: string; storeName: string }) {
  switch (b.type) {
    case "h1":
      return <Text style={s.h1}>{runs(b.inline)}</Text>;
    case "h2":
      return <Text style={s.h2}>{runs(b.inline)}</Text>;
    case "h3":
      return <Text style={s.h3}>{runs(b.inline)}</Text>;
    case "p":
      return <Text style={[s.p, b.align ? { textAlign: b.align } : {}]}>{runs(b.inline)}</Text>;
    case "ul":
      return (
        <View style={{ marginBottom: 6 }}>
          {b.items.map((it, i) => (
            <View key={i} style={s.li}>
              <Text style={s.bullet}>•</Text>
              <Text style={{ flex: 1 }}>{runs(it)}</Text>
            </View>
          ))}
        </View>
      );
    case "table":
      return (
        <View style={s.table} wrap={false}>
          <View style={s.tr}>
            {b.header.map((h, i) => (
              <Text key={i} style={s.th}>
                {runs(h)}
              </Text>
            ))}
          </View>
          {b.rows.map((r, i) => (
            <View key={i} style={s.tr}>
              {r.map((c, j) => (
                <Text key={j} style={s.td}>
                  {runs(c)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    case "hr":
      return <View style={s.hr} />;
    case "signature": {
      const img = b.who === "cliente" && signature ? signature : null;
      return (
        <View style={s.sig} wrap={false}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {img && <Image src={img} style={s.sigImg} />}
          <View style={img ? s.sigLineAfterImg : s.sigLine} />
          <Text style={s.sigName}>{b.who === "cliente" ? signerName : storeName}</Text>
          <Text style={s.sigLabel}>{b.who === "cliente" ? "Assinatura do cliente" : "Pela loja"}</Text>
        </View>
      );
    }
  }
}

export async function renderDocumentPdf(doc: { title: string; content: string; signature?: string | null }, header: DocHeader, signerName: string) {
  const blocks = parseMarkdown(doc.content);
  const logo = resolveImage(header.logo);
  const info = [header.telefone, header.whatsapp && header.whatsapp !== header.telefone ? `WhatsApp ${header.whatsapp}` : null, header.instagram, header.email].filter(Boolean).join(" · ");
  return renderToBuffer(
    <Document title={doc.title} author={header.nome} language="pt-BR">
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {logo ? <Image src={logo} style={s.logo} /> : <Text style={s.logoBox}>{header.nome.slice(0, 2).toUpperCase()}</Text>}
          <View>
            <Text style={s.storeName}>{header.nome}</Text>
            {header.cnpj ? <Text style={s.storeInfo}>CNPJ {header.cnpj}</Text> : null}
            {header.endereco ? <Text style={s.storeInfo}>{header.endereco}</Text> : null}
            {info ? <Text style={s.storeInfo}>{info}</Text> : null}
          </View>
        </View>
        {blocks.map((b, i) => (
          <PdfBlock key={i} b={b} signature={doc.signature} signerName={signerName} storeName={header.nome} />
        ))}
        <Text style={{ position: "absolute", bottom: 18, left: 42, right: 42, fontSize: 7, color: "#a1a1aa", textAlign: "center" }} render={({ pageNumber, totalPages }) => `${doc.title} · página ${pageNumber} de ${totalPages}`} fixed />
      </Page>
    </Document>,
  );
}
