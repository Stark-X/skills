---
name: drawio-generate-diagrams
description: Generate native draw.io / diagrams.net XML, repair invalid `.drawio` or mxGraphModel content, validate core structure, and optionally produce direct `app.diagrams.net` `#create` URLs. Use when Codex needs to create architecture diagrams, flowcharts, process maps, infrastructure diagrams, or any other diagram that must open in draw.io, especially when the user asks for `.drawio` XML, mxGraphModel output, diagrams.net content, or a browser edit/view link.
---

# Draw.io Generate Diagrams

Generate uncompressed draw.io XML first. Prefer a bare `<mxGraphModel>` for single-page diagrams. Use full `<mxfile>` only when the user needs multi-page output, file-level `vars`, or explicit page metadata.

## Workflow

1. Reduce the request to nodes, groups, and edges before writing XML.
2. Choose the output form:
   - Use `<mxGraphModel>` for most single-page diagrams.
   - Use full `<mxfile>` when the diagram needs `vars`, named pages, or multiple pages.
3. Start from the mandatory skeleton with `id="0"` and `id="1" parent="0"`.
4. Add vertices first, then edges, then optional metadata wrappers.
5. Run `scripts/validate_drawio_xml.py` on the generated XML before returning it.
6. If the user wants a clickable editor link, run `scripts/make_drawio_url.py`.

## Generation Rules

- Keep XML uncompressed and human-readable. Do not emit the compressed `<diagram>` payload that draw.io saves by default.
- Ensure every cell ID is unique inside the diagram.
- Use `vertex="1"` for shapes and `edge="1"` for connectors. Never set both on the same cell.
- Keep styles as semicolon-separated `key=value` pairs.
- Escape HTML in `value` with XML entities.
- Use top-left coordinates. For grouped children, coordinates are relative to the parent.
- Use `object` or `UserObject` wrappers when the user needs editable custom metadata.
- Read `references/drawio-ai-generation.md` when you need placeholders, `vars`, group/layer metadata, viewer embedding, or the official validation checklist.

## Minimal Template

```xml
<mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <mxCell id="n1" value="Start" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="120" y="80" width="120" height="60" as="geometry" />
    </mxCell>
    <mxCell id="n2" value="Next" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="320" y="80" width="120" height="60" as="geometry" />
    </mxCell>
    <mxCell id="e1" value="" style="endArrow=classic;html=1;" edge="1" parent="1" source="n1" target="n2">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>
```

## Repair Strategy

- If a returned diagram does not open, inspect the root tag first. Convert compressed content back to plain XML before editing.
- If ids `0` or `1` are missing, rebuild the root and re-parent all top-level elements to `1`.
- If a shape has no visible styling, add `whiteSpace=wrap;html=1;` and explicit fill/stroke values when appropriate.
- If the user gives Mermaid, CSV, or prose, translate it into native XML unless they explicitly asked for another diagram language.

## Scripts

### `scripts/validate_drawio_xml.py`
Validate the core structural rules from the official draw.io AI-generation guide for either a full `<mxfile>` document or a bare `<mxGraphModel>`.

Example:

```bash
python3 /abs/path/to/drawio-generate-diagrams/scripts/validate_drawio_xml.py architecture.drawio
```

### `scripts/make_drawio_url.py`
Convert plain XML into an `app.diagrams.net` `#create` URL for quick browser editing.

Example:

```bash
python3 /abs/path/to/drawio-generate-diagrams/scripts/make_drawio_url.py architecture.drawio
```

## References

- Read `references/drawio-ai-generation.md` before using placeholders, file-level `vars`, layer metadata, or viewer embedding.
- Source article: `https://www.drawio.com/doc/faq/ai-drawio-generation`
