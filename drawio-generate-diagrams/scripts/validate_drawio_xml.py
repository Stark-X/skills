#!/usr/bin/env python3
"""Validate core draw.io XML rules from the official AI-generation guide."""

from __future__ import annotations

import argparse
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path


@dataclass
class CellInfo:
    cell_id: str
    parent: str | None
    vertex: bool
    edge: bool
    source: str | None
    target: str | None


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def first_child(element: ET.Element, name: str) -> ET.Element | None:
    for child in element:
        if local_name(child.tag) == name:
            return child
    return None


def load_xml(path: str) -> str:
    if path == "-":
        return sys.stdin.read()
    return Path(path).read_text(encoding="utf-8")


def extract_graph_model(root: ET.Element) -> tuple[ET.Element | None, list[str], str]:
    tag = local_name(root.tag)
    if tag == "mxGraphModel":
        return root, [], "mxGraphModel"
    if tag != "mxfile":
        return None, [f"Unsupported root element: {tag}"], tag

    diagram = first_child(root, "diagram")
    if diagram is None:
        return None, ["mxfile is missing a diagram child"], tag

    graph_model = first_child(diagram, "mxGraphModel")
    if graph_model is None:
        return None, ["diagram is missing an mxGraphModel child"], tag

    return graph_model, [], tag


def extract_cells(root: ET.Element) -> tuple[list[CellInfo], list[str]]:
    errors: list[str] = []
    cells: list[CellInfo] = []

    for child in root:
        tag = local_name(child.tag)
        if tag == "mxCell":
            cell_id = child.get("id")
            if not cell_id:
                errors.append("Found mxCell without id")
                continue
            cells.append(
                CellInfo(
                    cell_id=cell_id,
                    parent=child.get("parent"),
                    vertex=child.get("vertex") == "1",
                    edge=child.get("edge") == "1",
                    source=child.get("source"),
                    target=child.get("target"),
                )
            )
            continue

        if tag not in {"object", "UserObject"}:
            continue

        nested_cell = first_child(child, "mxCell")
        if nested_cell is None:
            errors.append(f"{tag} wrapper is missing an mxCell child")
            continue

        wrapper_id = child.get("id")
        nested_id = nested_cell.get("id")
        if wrapper_id and nested_id and wrapper_id != nested_id:
            errors.append(
                f"{tag} wrapper id '{wrapper_id}' does not match nested mxCell id '{nested_id}'"
            )
            continue

        cell_id = wrapper_id or nested_id
        if not cell_id:
            errors.append(f"{tag} wrapper and nested mxCell are both missing id")
            continue

        cells.append(
            CellInfo(
                cell_id=cell_id,
                parent=nested_cell.get("parent"),
                vertex=nested_cell.get("vertex") == "1",
                edge=nested_cell.get("edge") == "1",
                source=nested_cell.get("source"),
                target=nested_cell.get("target"),
            )
        )

    return cells, errors


def validate_cells(cells: list[CellInfo]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    ids = {cell.cell_id for cell in cells}

    for cell in cells:
        if cell.cell_id in seen:
            errors.append(f"Duplicate id: {cell.cell_id}")
        seen.add(cell.cell_id)

        if cell.vertex and cell.edge:
            errors.append(f"Cell '{cell.cell_id}' cannot be both vertex and edge")

        if cell.cell_id not in {"0", "1"} and not cell.vertex and not cell.edge:
            errors.append(
                f"Cell '{cell.cell_id}' must declare vertex=\"1\" or edge=\"1\""
            )

        if cell.source and cell.source not in ids:
            errors.append(
                f"Edge '{cell.cell_id}' references missing source id '{cell.source}'"
            )

        if cell.target and cell.target not in ids:
            errors.append(
                f"Edge '{cell.cell_id}' references missing target id '{cell.target}'"
            )

    root_cell = next((cell for cell in cells if cell.cell_id == "0"), None)
    layer_cell = next((cell for cell in cells if cell.cell_id == "1"), None)

    if root_cell is None:
        errors.append("Missing required structural cell id='0'")
    if layer_cell is None:
        errors.append("Missing required structural cell id='1'")
    elif layer_cell.parent != "0":
        errors.append("Structural cell id='1' must have parent='0'")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate core draw.io XML rules for AI-generated diagrams."
    )
    parser.add_argument(
        "input",
        help="Path to a .drawio/.xml file, or '-' to read XML from stdin",
    )
    args = parser.parse_args()

    try:
        xml_text = load_xml(args.input)
        root = ET.fromstring(xml_text)
    except FileNotFoundError:
        print(f"File not found: {args.input}", file=sys.stderr)
        return 1
    except ET.ParseError as exc:
        print(f"XML parse error: {exc}", file=sys.stderr)
        return 1

    graph_model, errors, detected_root = extract_graph_model(root)
    if graph_model is None:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    diagram_root = first_child(graph_model, "root")
    if diagram_root is None:
        print("mxGraphModel is missing a root child", file=sys.stderr)
        return 1

    cells, extract_errors = extract_cells(diagram_root)
    errors.extend(extract_errors)
    errors.extend(validate_cells(cells))

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    vertex_count = sum(1 for cell in cells if cell.vertex)
    edge_count = sum(1 for cell in cells if cell.edge)
    print(
        f"OK: valid draw.io XML ({detected_root} root, {len(cells)} cells, "
        f"{vertex_count} vertices, {edge_count} edges)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
