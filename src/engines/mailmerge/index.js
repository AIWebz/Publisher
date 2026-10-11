// Mail-merge engine public API (see the individual modules for details).
export { parseCSV, toCSV, detectDelimiter, splitRecords, uniqueColumnNames, DELIMITERS } from './csv.js';
export { parseXLSX, parseODS, columnIndex, columnLetters, excelSerialToString, classifyFormat, formatNumber, displayNumber, isOLE, LEGACY_XLS_MESSAGE } from './xlsx.js';
export { importFile, decodeText } from './import.js';
export { openZip, isZip, crc32, inflateRaw } from './zip.js';
export {
  FILTER_OPS, ADDRESS_FIELDS, createMergeData, normalizeMergeData, cloneMergeData, numericValue, naturalCompare, matchesFilter,
  viewIndices, rowValues, recordAt, currentRecord, recordCount, setCell, addRow, deleteRow, uniqueColumnName, addColumn,
  renameColumn, deleteColumn, moveColumn, toggleExcluded, setFilters, setSort, guessFieldMapping, formatAddressBlock
} from './merge.js';
export {
  recordResolver, mergeHtml, listDocumentFields, mergeDocumentForRecord, buildMergedPublication, findSheetSlots,
  fillSheetFromRecords, renameFieldsInHtml, renameFieldsInDocument
} from './generate.js';
