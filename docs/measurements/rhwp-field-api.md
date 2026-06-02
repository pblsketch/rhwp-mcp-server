# rhwp Field API Probe Report

Generated: 2026-06-02T12:30:16.870Z
Resolves: spec Open Q5 (Field API method-name confirmation)

## Load time: 7 ms

## Field API candidates

| Name | typeof | sig hint |
|------|--------|----------|
| `HwpDocument.prototype.applyCharFormat` | method | `(class method)` |
| `HwpDocument.prototype.applyCharFormatInCell` | method | `(class method)` |
| `HwpDocument.prototype.applyParaFormat` | method | `(class method)` |
| `HwpDocument.prototype.applyParaFormatInCell` | method | `(class method)` |
| `HwpDocument.prototype.applyParaFormatInHf` | method | `(class method)` |
| `HwpDocument.prototype.clearActiveField` | method | `(class method)` |
| `HwpDocument.prototype.evaluateTableFormula` | method | `(class method)` |
| `HwpDocument.prototype.getFieldInfoAt` | method | `(class method)` |
| `HwpDocument.prototype.getFieldInfoAtByPath` | method | `(class method)` |
| `HwpDocument.prototype.getFieldInfoAtInCell` | method | `(class method)` |
| `HwpDocument.prototype.getFieldList` | method | `(class method)` |
| `HwpDocument.prototype.getFieldValue` | method | `(class method)` |
| `HwpDocument.prototype.getFieldValueByName` | method | `(class method)` |
| `HwpDocument.prototype.getFormObjectAt` | method | `(class method)` |
| `HwpDocument.prototype.getFormObjectInfo` | method | `(class method)` |
| `HwpDocument.prototype.getFormValue` | method | `(class method)` |
| `HwpDocument.prototype.getSourceFormat` | method | `(class method)` |
| `HwpDocument.prototype.insertFieldInHf` | method | `(class method)` |
| `HwpDocument.prototype.removeFieldAt` | method | `(class method)` |
| `HwpDocument.prototype.removeFieldAtInCell` | method | `(class method)` |
| `HwpDocument.prototype.setActiveField` | method | `(class method)` |
| `HwpDocument.prototype.setActiveFieldByPath` | method | `(class method)` |
| `HwpDocument.prototype.setActiveFieldInCell` | method | `(class method)` |
| `HwpDocument.prototype.setFieldValue` | method | `(class method)` |
| `HwpDocument.prototype.setFieldValueByName` | method | `(class method)` |
| `HwpDocument.prototype.setFormValue` | method | `(class method)` |
| `HwpDocument.prototype.setFormValueInCell` | method | `(class method)` |

## Full export listing

| Name | typeof | async | class | sig hint |
|------|--------|-------|-------|----------|
| `HwpDocument` | function |  | y | `class HwpDocument { static __wrap(ptr) { const obj = Object.create(HwpDocument.prototype); obj.__wbg_ptr = ptr; HwpDocum` |
| `HwpViewer` | function |  | y | `class HwpViewer { __destroy_into_raw() { const ptr = this.__wbg_ptr; this.__wbg_ptr = 0; HwpViewerFinalization.unregiste` |
| `default` | function | y |  | `async function __wbg_init(module_or_path) { if (wasm !== undefined) return wasm; if (module_or_path !== undefined) { if ` |
| `extractThumbnail` | function |  |  | `function extractThumbnail(data) { const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc); const len0 = WASM_VECTOR` |
| `initSync` | function |  |  | `function initSync(module) { if (wasm !== undefined) return wasm; if (module !== undefined) { if (Object.getPrototypeOf(m` |
| `init_panic_hook` | function |  |  | `function init_panic_hook() { wasm.init_panic_hook(); }` |
| `version` | function |  |  | `function version() { let deferred1_0; let deferred1_1; try { const ret = wasm.version(); deferred1_0 = ret[0]; deferred1` |

## Class prototypes

### `HwpDocument`
- `__destroy_into_raw()`
- `addBookmark()`
- `applyCellStyle()`
- `applyCharFormat()`
- `applyCharFormatInCell()`
- `applyHfTemplate()`
- `applyParaFormat()`
- `applyParaFormatInCell()`
- `applyParaFormatInHf()`
- `applyStyle()`
- `beginBatch()`
- `changeShapeZOrder()`
- `clearActiveField()`
- `clearClipboard()`
- `clipboardHasControl()`
- `convertToEditable()`
- `copyControl()`
- `copySelection()`
- `copySelectionInCell()`
- `createBlankDocument()`
- `createHeaderFooter()`
- `createNumbering()`
- `createShapeControl()`
- `createStyle()`
- `createTable()`
- `createTableEx()`
- `deleteBookmark()`
- `deleteEquationControl()`
- `deleteFootnote()`
- `deleteHeaderFooter()`
- `deleteParagraph()`
- `deletePictureControl()`
- `deleteRange()`
- `deleteRangeInCell()`
- `deleteShapeControl()`
- `deleteStyle()`
- `deleteTableColumn()`
- `deleteTableControl()`
- `deleteTableRow()`
- `deleteText()`
- `deleteTextInCell()`
- `deleteTextInCellByPath()`
- `deleteTextInFootnote()`
- `deleteTextInHeaderFooter()`
- `discardSnapshot()`
- `endBatch()`
- `ensureDefaultBullet()`
- `ensureDefaultNumbering()`
- `evaluateTableFormula()`
- `exportControlHtml()`
- `exportHwp()`
- `exportHwpVerify()`
- `exportHwpx()`
- `exportSelectionHtml()`
- `exportSelectionInCellHtml()`
- `findNearestControlBackward()`
- `findNearestControlForward()`
- `findNextEditableControl()`
- `findOrCreateFontId()`
- `findOrCreateFontIdForLang()`
- `free()`
- `getBookmarks()`
- `getBulletList()`
- `getCanvasKitReplayPlan()`
- `getCaretPosition()`
- `getCellCharPropertiesAt()`
- `getCellInfo()`
- `getCellInfoByPath()`
- `getCellParaPropertiesAt()`
- `getCellParagraphCount()`
- `getCellParagraphCountByPath()`
- `getCellParagraphLength()`
- `getCellParagraphLengthByPath()`
- `getCellProperties()`
- `getCellStyleAt()`
- `getCellTextDirection()`
- `getCharPropertiesAt()`
- `getClickHereProps()`
- `getClipboardText()`
- `getColumnDef()`
- `getControlImageData()`
- `getControlImageMime()`
- `getControlTextPositions()`
- `getCursorRect()`
- `getCursorRectByPath()`
- `getCursorRectInCell()`
- `getCursorRectInFootnote()`
- `getCursorRectInHeaderFooter()`
- `getDocumentInfo()`
- `getDpi()`
- `getEquationProperties()`
- `getEventLog()`
- `getExternalImageBasenames()`
- `getFallbackFont()`
- `getFieldInfoAt()`
- `getFieldInfoAtByPath()`
- `getFieldInfoAtInCell()`
- `getFieldList()`
- `getFieldValue()`
- `getFieldValueByName()`
- `getFootnoteAtCursor()`
- `getFootnoteInfo()`
- `getFormObjectAt()`
- `getFormObjectInfo()`
- `getFormValue()`
- `getHeaderFooter()`
- `getHeaderFooterList()`
- `getHeaderFooterParaInfo()`
- `getHeaderFooterPictureProperties()`
- `getLineInfo()`
- `getLineInfoInCell()`
- `getLogicalLength()`
- `getNumberingList()`
- `getPageControlLayout()`
- `getPageDef()`
- `getPageFootnoteInfo()`
- `getPageHide()`
- `getPageInfo()`
- `getPageLayerTree()`
- `getPageOfPosition()`
- `getPageOverlayImages()`
- `getPageRenderTree()`
- `getPageTextLayout()`
- `getParaPropertiesAt()`
- `getParaPropertiesInHf()`
- `getParagraphCount()`
- `getParagraphLength()`
- `getPictureProperties()`
- `getPositionOfPage()`
- `getSectionCount()`
- `getSectionDef()`
- `getSelectionRects()`
- `getSelectionRectsInCell()`
- `getShapeBBox()`
- `getShapeProperties()`
- `getShowControlCodes()`
- `getShowTransparentBorders()`
- `getSourceFormat()`
- `getStyleAt()`
- `getStyleDetail()`
- `getStyleList()`
- `getTableBBox()`
- `getTableCellBboxes()`
- `getTableCellBboxesByPath()`
- `getTableDimensions()`
- `getTableDimensionsByPath()`
- `getTableProperties()`
- `getTextBoxControlIndex()`
- `getTextInCell()`
- `getTextInCellByPath()`
- `getTextRange()`
- `getValidationWarnings()`
- `groupShapes()`
- `hasInternalClipboard()`
- `hitTest()`
- `hitTestBodyFootnoteMarker()`
- `hitTestFootnote()`
- `hitTestHeaderFooter()`
- `hitTestInFootnote()`
- `hitTestInHeaderFooter()`
- `injectExternalImage()`
- `insertColumnBreak()`
- `insertEquation()`
- `insertFieldInHf()`
- `insertFootnote()`
- `insertNewNumber()`
- `insertPageBreak()`
- `insertParagraph()`
- `insertPicture()`
- `insertTableColumn()`
- `insertTableRow()`
- `insertText()`
- `insertTextInCell()`
- `insertTextInCellByPath()`
- `insertTextInFootnote()`
- `insertTextInHeaderFooter()`
- `insertTextLogical()`
- `logicalToTextOffset()`
- `measureWidthDiagnostic()`
- `mergeParagraph()`
- `mergeParagraphInCell()`
- `mergeParagraphInCellByPath()`
- `mergeParagraphInFootnote()`
- `mergeParagraphInHeaderFooter()`
- `mergeTableCells()`
- `moveLineEndpoint()`
- `moveTableOffset()`
- `moveVertical()`
- `moveVerticalByPath()`
- `navigateHeaderFooterByPage()`
- `navigateNextEditable()`
- `pageCount()`
- `pasteControl()`
- `pasteHtml()`
- `pasteHtmlInCell()`
- `pasteInternal()`
- `pasteInternalInCell()`
- `reflowLinesegs()`
- `removeFieldAt()`
- `removeFieldAtInCell()`
- `renameBookmark()`
- `renderEquationPreview()`
- `renderPageCanvas()`
- `renderPageCanvasLegacy()`
- `renderPageHtml()`
- `renderPageSvg()`
- `renderPageToCanvas()`
- `renderPageToCanvasFiltered()`
- `renderPageToCanvasLegacy()`
- `replaceAll()`
- `replaceOne()`
- `replaceText()`
- `resizeTableCells()`
- `restoreSnapshot()`
- `saveSnapshot()`
- `searchAllText()`
- `searchText()`
- `setActiveField()`
- `setActiveFieldByPath()`
- `setActiveFieldInCell()`
- `setCellProperties()`
- `setClipEnabled()`
- `setColumnDef()`
- `setDpi()`
- `setEquationProperties()`
- `setFallbackFont()`
- `setFieldValue()`
- `setFieldValueByName()`
- `setFileName()`
- `setFormValue()`
- `setFormValueInCell()`
- `setHeaderFooterPictureProperties()`
- `setNumberingRestart()`
- `setPageDef()`
- `setPageHide()`
- `setPictureProperties()`
- `setSectionDef()`
- `setSectionDefAll()`
- `setShapeProperties()`
- `setShowControlCodes()`
- `setShowParagraphMarks()`
- `setShowTransparentBorders()`
- `setTableProperties()`
- `set_debug_overlay()`
- `set_respect_vpos_reset()`
- `splitParagraph()`
- `splitParagraphInCell()`
- `splitParagraphInCellByPath()`
- `splitParagraphInFootnote()`
- `splitParagraphInHeaderFooter()`
- `splitTableCell()`
- `splitTableCellInto()`
- `splitTableCellsInRange()`
- `textToLogicalOffset()`
- `toggleHideHeaderFooter()`
- `ungroupShape()`
- `updateClickHereProps()`
- `updateConnectorsInSection()`
- `updateStyle()`
- `updateStyleShapes()`

### `HwpViewer`
- `__destroy_into_raw()`
- `free()`
- `pageCount()`
- `pendingTaskCount()`
- `renderPageHtml()`
- `renderPageSvg()`
- `setZoom()`
- `updateViewport()`
- `visiblePages()`
