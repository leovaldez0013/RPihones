// PDF de relatório (tabela + resumo) com @react-pdf/renderer, em A4 paisagem quando há muitas colunas.
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Report } from "@/domain/reports";
import { formatCell, isNumeric } from "@/lib/report-format";
import { formatDate, formatDateTime } from "@/lib/format";

const s = StyleSheet.create({
  page: { paddingVertical: 30, paddingHorizontal: 32, fontSize: 8, fontFamily: "Helvetica", color: "#18181b" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 1, borderBottomColor: "#e4e4e7", paddingBottom: 8, marginBottom: 10 },
  store: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  muted: { color: "#71717a", fontSize: 7.5 },
  summary: { flexDirection: "row", gap: 8, marginBottom: 10 },
  box: { flex: 1, borderWidth: 0.6, borderColor: "#e4e4e7", borderRadius: 4, padding: 6 },
  boxValue: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 2 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e4e4e7" },
  th: { padding: 4, fontFamily: "Helvetica-Bold", backgroundColor: "#f4f4f5" },
  td: { padding: 4 },
  footer: { position: "absolute", bottom: 16, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", color: "#a1a1aa", fontSize: 7 },
});

export async function renderReportPdf(report: Report, opts: { storeName: string; from: Date; toInclusive: Date }) {
  const landscape = report.columns.length > 6;
  // colunas de texto ganham mais espaço
  const weights = report.columns.map((c) => (c.format === "text" ? 2.2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const width = (i: number) => `${(weights[i] / total) * 100}%`;

  const doc = (
    <Document title={report.title} author={opts.storeName}>
      <Page size="A4" orientation={landscape ? "landscape" : "portrait"} style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.store}>{opts.storeName}</Text>
            <Text style={s.title}>{report.title}</Text>
            <Text style={s.muted}>
              Período: {formatDate(opts.from)} a {formatDate(opts.toInclusive)}
            </Text>
          </View>
          <Text style={s.muted}>Gerado em {formatDateTime(new Date())}</Text>
        </View>
        <Text style={[s.muted, { marginBottom: 8 }]}>{report.description}</Text>
        <View style={s.summary}>
          {report.summary.map((x) => (
            <View key={x.label} style={s.box}>
              <Text style={s.muted}>{x.label}</Text>
              <Text style={s.boxValue}>{formatCell(x.value, x.format)}</Text>
            </View>
          ))}
        </View>
        <View style={s.tr} fixed>
          {report.columns.map((c, i) => (
            <Text key={c.key} style={[s.th, { width: width(i), textAlign: isNumeric(c.format) ? "right" : "left" }]}>
              {c.label}
            </Text>
          ))}
        </View>
        {report.rows.length === 0 && <Text style={[s.td, s.muted]}>Sem dados no período.</Text>}
        {report.rows.map((r, ri) => (
          <View key={ri} style={[s.tr, ri % 2 ? { backgroundColor: "#fafafa" } : {}]} wrap={false}>
            {report.columns.map((c, i) => (
              <Text key={c.key} style={[s.td, { width: width(i), textAlign: isNumeric(c.format) ? "right" : "left" }]}>
                {formatCell(r[c.key], c.format)}
              </Text>
            ))}
          </View>
        ))}
        <View style={s.footer} fixed>
          <Text>{opts.storeName} · {report.title}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
