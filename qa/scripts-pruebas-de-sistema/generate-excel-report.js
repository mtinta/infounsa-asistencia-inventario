const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

async function generateExcelReport() {
  const jsonPath = path.join(__dirname, 'evidencias', 'results.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('⚠️ No se encontró el archivo evidencias/results.json. Ejecuta primero las pruebas.');
    process.exit(1);
  }

  const rawData = fs.readFileSync(jsonPath, 'utf8');
  const testResults = JSON.parse(rawData);

  const tests = [];

  // Recorrer los resultados de Playwright
  function processSuite(suite) {
    if (suite.specs) {
      suite.specs.forEach(spec => {
        const title = spec.title;
        const testCase = spec.tests[0];
        const result = testCase ? testCase.results[testCase.results.length - 1] : null;

        // Extraer Código CPS
        const cpsMatch = title.match(/(CPS-(?:RF|RNF)-(?:AST|INV|WEB)-\d+-\d+)/i);
        const cpsCode = cpsMatch ? cpsMatch[1].toUpperCase() : 'N/A';

        // Determinar Módulo
        let moduleName = 'Otros';
        const fileLoc = spec.file || '';
        if (fileLoc.includes('asistencia') || title.includes('AST')) {
          moduleName = 'Asistencia';
        } else if (fileLoc.includes('inventario') || title.includes('INV')) {
          moduleName = 'Inventario';
        } else if (fileLoc.includes('portal') || title.includes('WEB')) {
          moduleName = 'Portal Web';
        }

        // Determinar Tipo (RF vs RNF)
        let typeName = 'RF (Funcional)';
        if (title.toUpperCase().includes('RNF') || cpsCode.includes('RNF')) {
          typeName = 'RNF (No Funcional)';
        }

        const status = result ? result.status.toUpperCase() : 'UNKNOWN';
        const durationSec = result ? (result.duration / 1000).toFixed(2) : '0.00';
        const errorMsg = result && result.error ? (result.error.message || '').split('\n')[0] : '';

        tests.push({
          cpsCode,
          module: moduleName,
          type: typeName,
          title,
          status: status === 'PASSED' ? 'PASSED' : status === 'FAILED' ? 'FAILED' : status,
          duration: parseFloat(durationSec),
          error: errorMsg
        });
      });
    }

    if (suite.suites) {
      suite.suites.forEach(childSuite => processSuite(childSuite));
    }
  }

  if (testResults.suites) {
    testResults.suites.forEach(suite => processSuite(suite));
  }

  // Crear Libro de Trabajo Excel
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'InfoUNSA QA Automation Bot';
  workbook.created = new Date();

  // -------------------------------------------------------------
  // HOJA 1: 📊 Dashboard Ejecutivo & Métricas
  // -------------------------------------------------------------
  const dashSheet = workbook.addWorksheet('📊 Dashboard Resumen', { views: [{ showGridLines: true }] });

  // Título Principal
  dashSheet.mergeCells('B2:H2');
  const titleCell = dashSheet.getCell('B2');
  titleCell.value = 'PLATAFORMA INFOUNSA - REPORTES DE PRUEBAS DE SISTEMA';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Subtítulo / Fecha
  dashSheet.mergeCells('B3:H3');
  const subCell = dashSheet.getCell('B3');
  subCell.value = `Fecha de Generación: ${new Date().toLocaleString('es-PE')}`;
  subCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: '64748B' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Calcular Resumen Global
  const totalTests = tests.length;
  const passedTests = tests.filter(t => t.status === 'PASSED').length;
  const failedTests = tests.filter(t => t.status === 'FAILED').length;
  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : '0';
  const totalDuration = tests.reduce((acc, t) => acc + t.duration, 0).toFixed(1);

  // Tarjetas KPI
  const kpis = [
    { cell: 'B5:C5', valCell: 'B6:C6', label: 'TOTAL DE PRUEBAS', value: totalTests, color: '2563EB' },
    { cell: 'D5:E5', valCell: 'D6:E6', label: 'PRUEBAS PASADAS', value: passedTests, color: '16A34A' },
    { cell: 'F5:G5', valCell: 'F6:G6', label: 'PRUEBAS FALLADAS', value: failedTests, color: 'DC2626' },
    { cell: 'H5:H5', valCell: 'H6:H6', label: '% ÉXITO GLOBAL', value: `${passRate}%`, color: '0EA5E9' }
  ];

  kpis.forEach(kpi => {
    dashSheet.mergeCells(kpi.cell);
    const lbl = dashSheet.getCell(kpi.cell.split(':')[0]);
    lbl.value = kpi.label;
    lbl.font = { size: 9, bold: true, color: { argb: '64748B' } };
    lbl.alignment = { horizontal: 'center', vertical: 'middle' };

    dashSheet.mergeCells(kpi.valCell);
    const val = dashSheet.getCell(kpi.valCell.split(':')[0]);
    val.value = kpi.value;
    val.font = { size: 18, bold: true, color: { argb: kpi.color } };
    val.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Tabla de Resumen por Módulo y Tipo (RF vs RNF)
  dashSheet.mergeCells('B9:H9');
  const sectionTitle = dashSheet.getCell('B9');
  sectionTitle.value = 'RESUMEN DETALLADO POR MÓDULO Y TIPO (RF / RNF)';
  sectionTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: '1E293B' } };

  const tableHeaders = ['Módulo', 'Tipo de Requerimiento', 'Pruebas Totales', 'Pasadas (PASSED)', 'Falladas (FAILED)', '% Éxito', 'Tiempo Total (s)'];
  const headerRow = dashSheet.getRow(10);
  tableHeaders.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 2);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '334155' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Agrupar métricas
  const modulesList = ['Inventario', 'Asistencia', 'Portal Web'];
  const typesList = ['RF (Funcional)', 'RNF (No Funcional)'];

  let currentRowIdx = 11;

  modulesList.forEach(mod => {
    typesList.forEach(type => {
      const filtered = tests.filter(t => t.module === mod && t.type === type);
      const total = filtered.length;
      if (total === 0) return;

      const passed = filtered.filter(t => t.status === 'PASSED').length;
      const failed = filtered.filter(t => t.status === 'FAILED').length;
      const pct = ((passed / total) * 100).toFixed(1) + '%';
      const timeSec = filtered.reduce((acc, t) => acc + t.duration, 0).toFixed(2);

      const row = dashSheet.getRow(currentRowIdx);
      row.getCell(2).value = mod;
      row.getCell(3).value = type;
      row.getCell(4).value = total;
      row.getCell(5).value = passed;
      row.getCell(6).value = failed;
      row.getCell(7).value = pct;
      row.getCell(8).value = parseFloat(timeSec);

      for (let c = 2; c <= 8; c++) {
        row.getCell(c).alignment = { horizontal: c <= 3 ? 'left' : 'center' };
        row.getCell(c).border = {
          top: { style: 'thin', color: { argb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'E2E8F0' } }
        };
      }
      currentRowIdx++;
    });
  });

  // Fila de Totales
  const totalRow = dashSheet.getRow(currentRowIdx);
  totalRow.getCell(2).value = 'TOTAL GENERAL';
  totalRow.getCell(3).value = '-';
  totalRow.getCell(4).value = totalTests;
  totalRow.getCell(5).value = passedTests;
  totalRow.getCell(6).value = failedTests;
  totalRow.getCell(7).value = passRate + '%';
  totalRow.getCell(8).value = parseFloat(totalDuration);

  for (let c = 2; c <= 8; c++) {
    totalRow.getCell(c).font = { bold: true };
    totalRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
    totalRow.getCell(c).alignment = { horizontal: c <= 3 ? 'left' : 'center' };
  }

  // Autoajuste de columnas en Dashboard
  dashSheet.columns = [
    { width: 4 },
    { width: 18 },
    { width: 22 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 14 },
    { width: 16 }
  ];

  // -------------------------------------------------------------
  // HOJA 2: 📋 Detalle Individual de Casos de Prueba
  // -------------------------------------------------------------
  const detailSheet = workbook.addWorksheet('📋 Detalle de Pruebas', { views: [{ showGridLines: true }] });

  const detailHeaders = ['Código CPS', 'Módulo', 'Tipo', 'Título del Caso de Prueba', 'Estado', 'Duración (s)', 'Detalle de Error'];
  const dHeaderRow = detailSheet.getRow(1);
  detailHeaders.forEach((h, idx) => {
    const cell = dHeaderRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  tests.forEach((t, idx) => {
    const row = detailSheet.getRow(idx + 2);
    row.getCell(1).value = t.cpsCode;
    row.getCell(2).value = t.module;
    row.getCell(3).value = t.type;
    row.getCell(4).value = t.title;
    row.getCell(5).value = t.status;
    row.getCell(6).value = t.duration;
    row.getCell(7).value = t.error || '-';

    // Formato condicional de Estado
    const statusCell = row.getCell(5);
    statusCell.alignment = { horizontal: 'center' };
    if (t.status === 'PASSED') {
      statusCell.font = { bold: true, color: { argb: '15803D' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DCFCE7' } };
    } else if (t.status === 'FAILED') {
      statusCell.font = { bold: true, color: { argb: 'B91C1C' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
    }
  });

  detailSheet.columns = [
    { width: 22 },
    { width: 16 },
    { width: 20 },
    { width: 65 },
    { width: 14 },
    { width: 14 },
    { width: 45 }
  ];

  // Guardar archivo Excel
  const outputPath = path.join(__dirname, 'evidencias', 'Reporte_Pruebas_InfoUNSA.xlsx');
  await workbook.xlsx.writeFile(outputPath);

  console.log(`\n✅ Reporte Excel generado exitosamente en:`);
  console.log(`👉 ${outputPath}\n`);
}

generateExcelReport().catch(err => {
  console.error('Error generando reporte Excel:', err);
});
