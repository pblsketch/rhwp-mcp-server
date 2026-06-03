# rhwp applyCharFormat Probe Report

Generated: 2026-06-03T10:59:34.029Z
rhwp/core version: 0.7.13

## Purpose

Confirm the runtime signature of `HwpDocument.applyCharFormat` so that
Sprint 2.7 can chain it after `insertText` in `hwp_insert_text` without
relying on undocumented assumptions about the props JSON shape.

## Method signature (from catalog)

`applyCharFormat(section_idx, para_idx, start_offset, end_offset, props_json) → string`

## Probe attempts

### fontSize only (1200 = 12pt × 100)

Props sent:
```json
{
  "fontSize": 1200
}
```

Raw return:
```
{"ok":true}
```

Parsed return:
```json
{
  "ok": true
}
```

### bold + textColor (#1A1A1A)

Props sent:
```json
{
  "bold": true,
  "textColor": "#1A1A1A"
}
```

Raw return:
```
{"ok":true}
```

Parsed return:
```json
{
  "ok": true
}
```

### full set: fontSize, bold, italic, underline, textColor, fontFamily

Props sent:
```json
{
  "fontSize": 1400,
  "bold": true,
  "italic": false,
  "underline": true,
  "textColor": "#FF0000",
  "fontFamily": "함초롬바탕"
}
```

Raw return:
```
{"ok":true}
```

Parsed return:
```json
{
  "ok": true
}
```

### empty props {}

Props sent:
```json
{}
```

Raw return:
```
{"ok":true}
```

Parsed return:
```json
{
  "ok": true
}
```
