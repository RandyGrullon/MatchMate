/**
 * Va en lugar de html2canvas, dompurify y canvg (el alias de vite.config.ts): jsPDF los carga solo para `doc.html()` y
 * los SVG, que el reporte del torneo no usa. Así no salen en la app ni en lo que el teléfono guarda sin conexión.
 */
export default undefined;
