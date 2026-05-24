/**
 * Exportadores CSV (RFC 4180) — zero dependências.
 *
 * O CSV é em UTF-8 COM BOM para que o Excel pt-BR abra direto com acentuação
 * correta. Datas em ISO-8601, números com ponto decimal (compatível Excel/Sheets
 * em qualquer locale via "Texto para colunas").
 */

const BOM = '﻿';

function escape(value) {
  if (value == null) return '';
  let str = String(value);
  if (str.includes('"')) str = str.replace(/"/g, '""');
  if (/[",\r\n]/.test(str)) str = `"${str}"`;
  return str;
}

/**
 * @param {Array<{header:string, get:(row)=>any}>} columns
 * @param {Array<object>} rows
 */
function toCSV(columns, rows) {
  const head = columns.map((c) => escape(c.header)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escape(c.get(row))).join(',')
  );
  return BOM + [head, ...lines].join('\r\n');
}

/** Nome de arquivo: `villa-vip-{slug}-{YYYY-MM-DD}.csv` */
function filename(slug) {
  const today = new Date().toISOString().slice(0, 10);
  return `villa-vip-${slug}-${today}.csv`;
}

/** Helpers de Express: seta headers e envia o CSV. */
function sendCSV(res, slug, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename(slug)}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(csv);
}

module.exports = { toCSV, sendCSV, filename };
