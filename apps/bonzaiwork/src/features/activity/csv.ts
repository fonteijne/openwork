/** CSV for the Activity export: RFC 4180 quoting, a BOM so spreadsheet apps read UTF-8, CRLF lines. */

export function toCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  const cell = (value: string) => (/[",\r\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return `﻿${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}

/** "activiteit-2026-11-05.csv" */
export function csvFileName(base: string, now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${base}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}

/** Hands the CSV to the browser (or the desktop shell) as a download. */
export function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
