"use client";

export type ExportColumn = { header: string; value: (row: never) => string | number | null | undefined };

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCSV<T>(rows: T[], columns: { header: string; value: (row: T) => unknown }[], filename: string) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // ";" como separador: Excel em pt-BR abre corretamente
  const lines = [columns.map((c) => esc(c.header)).join(";"), ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(";"))];
  download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

export async function exportExcel<T>(
  rows: T[],
  columns: { header: string; value: (row: T) => unknown }[],
  filename: string,
  sheetName = "Dados",
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.header, width: Math.max(12, c.header.length + 4) }));
  for (const r of rows) {
    ws.addRow(Object.fromEntries(columns.map((c) => [c.header, c.value(r) as never])));
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${filename}.xlsx`,
  );
}
