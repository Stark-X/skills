# draw.io AI generation reference

Source: https://www.drawio.com/doc/faq/ai-drawio-generation

Use this file when the task needs more than the short checklist in `SKILL.md`.

## Primary references

- Read the official FAQ first: it explains the supported XML forms, required cells, metadata wrappers, and `#create` editor URLs.
- Open the linked Style Reference from that FAQ when you need exhaustive style keys, shape names, routing options, or full examples.
- Open the linked `mxfile.xsd` from that FAQ when you need schema-level XML validation before saving or delivering output.

## Supported XML forms

### Prefer `mxGraphModel`

Use a bare `<mxGraphModel>` for most AI-generated diagrams. It is valid draw.io XML, has fewer nesting levels, and draw.io will wrap it in `<mxfile>` and `<diagram>` automatically when opened.

### Use full `mxfile` only when needed

Use `<mxfile>` when the task needs:

- multiple pages
- explicit diagram names or page ids
- file-level `vars`
- file-level metadata

## Mandatory structure

Every valid diagram needs these structural cells inside `<root>`:

```xml
<mxCell id="0" />
<mxCell id="1" parent="0" />
```

Treat `0` as the root container and `1` as the default layer. Re-parent normal top-level shapes and edges to `1` unless the diagram uses explicit group containers or custom layers.

## Core generation rules

1. Generate plain XML, not draw.io's compressed Base64 payload.
2. Keep ids unique within one diagram.
3. Use `vertex="1"` for shapes and `edge="1"` for connectors.
4. Keep style strings in `key=value;` form.
5. Escape HTML in labels with XML entities.
6. Match shape and perimeter for non-rectangular nodes.
7. Remember coordinates use a top-left origin.
8. Use relative coordinates for children inside groups.

## Metadata wrappers

Wrap a cell in `object` or `UserObject` when the user needs editable custom metadata in draw.io's data editor.

Example:

```xml
<object id="srv1" label="Web Server" ip="10.0.1.10" environment="production">
  <mxCell style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
    <mxGeometry x="100" y="100" width="140" height="70" as="geometry" />
  </mxCell>
</object>
```

Use the shorter `object` form unless there is a specific reason to keep `UserObject`.

## File variables and placeholders

Only full `<mxfile>` documents support file-level `vars`. These are JSON key-value pairs stored on the `<mxfile>` element.

To resolve `%name%` placeholders inside labels or tooltips:

- set `placeholders="1"` on the `object` or `UserObject`
- or use a plain `mxCell` style that enables placeholders

Placeholder resolution walks upward in this order:

1. current object
2. parent container
3. layer
4. root container
5. file-level `vars`

Use this to define defaults at the file or layer level and override them closer to the leaf nodes.

## Minimal edge pattern

```xml
<mxCell id="e1" value="" style="endArrow=classic;html=1;" edge="1" parent="1" source="n1" target="n2">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
```

## Browser editor URL

To open generated XML directly in draw.io, compress the plain XML with raw DEFLATE, Base64-encode it, and embed it in a URL hash:

```text
https://app.diagrams.net/?pv=0&grid=0#create=ENCODED_JSON
```

The JSON payload uses:

```json
{"type":"xml","compressed":true,"data":"BASE64_DEFLATED_XML"}
```

Use `scripts/make_drawio_url.py` instead of rebuilding this logic ad hoc.

## Viewer embedding

When the user needs an embeddable viewer instead of the full editor, follow the FAQ's `viewer-static.min.js` pattern and pass raw uncompressed XML via `data-mxgraph`.

Read the official FAQ before implementing viewer embedding because the container width and viewer options matter.
