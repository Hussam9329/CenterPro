export interface ReportColumn { key: string; label: string; type?: 'money' | 'number' | 'date' | 'text' }
export type ReportCell = string | number | Date;
export interface ReportSection { title: string; columns: ReportColumn[]; rows: Record<string, ReportCell>[] }
export interface CenterReport { title: string; subtitle: string; period: string; sections: ReportSection[] }

/** Client-only export. Structured numeric values and real dates, never screenshots. */
export async function exportReportExcel(report: CenterReport): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CenterPro — معاينة الواجهة';
  workbook.created = new Date();
  report.sections.forEach((section, index) => {
    const sheet = workbook.addWorksheet(`${index + 1} ${section.title}`.replace(/[\\/*?:[\]]/g, '').slice(0, 31), { views: [{ rightToLeft: true, state: 'frozen', ySplit: 5 }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    sheet.columns = section.columns.map(column => ({ key: column.key, width: column.key === 'reason' ? 48 : column.type === 'money' ? 22 : column.type === 'date' ? 17 : 27 }));
    const end = Math.max(1, section.columns.length);
    sheet.mergeCells(1, 1, 1, end); sheet.getCell(1, 1).value = `CenterPro | ${report.title}`;
    sheet.mergeCells(2, 1, 2, end); sheet.getCell(2, 1).value = `${report.period} · ${report.subtitle}`;
    sheet.mergeCells(3, 1, 3, end); sheet.getCell(3, 1).value = 'بيانات تجريبية للمعاينة فقط — ليست وثيقة مالية معتمدة';
    sheet.getRow(1).font = { name: 'Noto Sans Arabic', size: 18, bold: true, color: { argb: 'FFA51C30' } };
    sheet.getRow(1).height = 32; sheet.getRow(2).height = 24; sheet.getRow(3).height = 24;
    sheet.getRow(3).font = { name: 'Noto Sans Arabic', size: 11, color: { argb: 'FFA51C30' } };
    const header = sheet.getRow(5); header.values = section.columns.map(column => column.label); header.height = 30;
    header.eachCell(cell => { cell.font = { name: 'Noto Sans Arabic', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA51C30' } }; cell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl', wrapText: true }; });
    section.rows.forEach(values => {
      const row = sheet.addRow(section.columns.map(column => values[column.key] ?? ''));
      row.height = Math.min(409, Math.max(28, 12 + Math.max(...section.columns.map(column => typeof values[column.key] === 'string' ? Math.ceil(String(values[column.key]).length / (column.key === 'reason' ? 42 : 23)) : 1)) * 16));
      row.eachCell((cell, columnIndex) => {
        const column = section.columns[columnIndex - 1];
        cell.font = { name: column.type === 'money' || column.type === 'number' ? 'Inter' : 'Noto Sans Arabic', size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true, readingOrder: 'rtl' };
        if(column.type === 'money') cell.numFmt = '#,##0 "د.ع";[Red]-#,##0 "د.ع"';
        if(column.type === 'number') cell.numFmt = '0';
        if(column.type === 'date') cell.numFmt = 'dd/mm/yyyy';
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE9EBEF' } } };
      });
    });
    if(section.rows.length) sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + section.rows.length, column: end } };
    sheet.pageSetup.printTitlesRow = '1:5';
    sheet.headerFooter.oddFooter = '&Rمعاينة CenterPro&C&P / &N';
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer as ArrayBuffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `CenterPro-${report.period}-${report.title}.xlsx`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
