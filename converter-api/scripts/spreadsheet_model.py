#!/usr/bin/env python3
import json
import os
import re
import sys
import time

import uno
from com.sun.star.awt import Point, Size
from com.sun.star.beans import PropertyValue
from com.sun.star.table import BorderLine2


def prop(name, value):
    item = PropertyValue()
    item.Name = name
    item.Value = value
    return item


def has_property(target, name):
    try:
        return target.getPropertySetInfo().hasPropertyByName(name)
    except Exception:
        return False


def get_property(target, name, fallback=None):
    try:
        if has_property(target, name):
            return target.getPropertyValue(name)
    except Exception:
        pass
    return fallback


def set_property(target, name, value):
    try:
        if has_property(target, name):
            target.setPropertyValue(name, value)
    except Exception:
        pass


def uno_enum(name, value):
    return uno.Enum(name, value)


def connect(port):
    local_ctx = uno.getComponentContext()
    resolver = local_ctx.ServiceManager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver",
        local_ctx,
    )
    last_error = None
    for _ in range(60):
        try:
            return resolver.resolve(
                "uno:socket,host=127.0.0.1,port={};urp;StarOffice.ComponentContext".format(port)
            )
        except Exception as exc:
            last_error = exc
            time.sleep(0.5)
    raise RuntimeError("LibreOffice UNO connection failed: {}".format(last_error))


def color_to_hex(value, fallback=""):
    try:
        value = int(value)
    except Exception:
        return fallback
    if value < 0:
        return fallback
    return "#{:06X}".format(value & 0xFFFFFF)


def hex_to_color(value, fallback=-1):
    if not isinstance(value, str) or not re.match(r"^#[0-9a-fA-F]{6}$", value):
        return fallback
    return int(value[1:], 16)


def hmm_to_px(value, fallback):
    try:
        return max(1, round(float(value) / 26.4583))
    except Exception:
        return fallback


def px_to_hmm(value, fallback):
    try:
        return max(1, int(round(float(value) * 26.4583)))
    except Exception:
        return fallback


def overlay_px_to_hmm(value, offset=0):
    try:
        return px_to_hmm(max(0, float(value or 0) - offset), 0)
    except Exception:
        return 0


def safe_sheet_name(name, index):
    raw = str(name or "Sheet {}".format(index + 1))
    cleaned = re.sub(r"[:\\/?*\[\]]", " ", raw).strip() or "Sheet {}".format(index + 1)
    return cleaned[:31]


def used_range(sheet):
    cursor = sheet.createCursor()
    cursor.gotoStartOfUsedArea(False)
    cursor.gotoEndOfUsedArea(True)
    address = cursor.getRangeAddress()
    return max(0, int(address.EndColumn)), max(0, int(address.EndRow))


def load_document(desktop, input_path, ext, csv_filter_options):
    load_props = [prop("Hidden", True), prop("ReadOnly", False), prop("UpdateDocMode", 0)]
    if ext == ".csv":
        load_props.extend([
            prop("FilterName", "Text - txt - csv (StarCalc)"),
            prop("FilterOptions", csv_filter_options),
        ])
    doc = desktop.loadComponentFromURL(
        uno.systemPathToFileUrl(input_path),
        "_blank",
        0,
        tuple(load_props),
    )
    if not doc:
        raise RuntimeError("LibreOffice could not open spreadsheet")
    return doc


def parse_workbook(doc, max_rows=1000, max_cols=120):
    sheets = doc.getSheets()
    workbook = {
        "version": 1,
        "activeSheetId": "",
        "truncated": False,
        "limits": {
            "maxRows": int(max_rows or 1000),
            "maxColumns": int(max_cols or 120),
        },
        "sheets": [],
    }
    for sheet_index, sheet_name in enumerate(sheets.getElementNames()):
        sheet = sheets.getByName(sheet_name)
        end_col, end_row = used_range(sheet)
        source_row_count = end_row + 1
        source_column_count = end_col + 1
        row_count = min(source_row_count, int(max_rows or source_row_count or 1))
        column_count = min(source_column_count, int(max_cols or source_column_count or 1))
        truncated = row_count < source_row_count or column_count < source_column_count
        if truncated:
            workbook["truncated"] = True
        sheet_id = "sheet-{}".format(sheet_index + 1)
        parsed_sheet = {
            "id": sheet_id,
            "name": str(sheet_name),
            "rowCount": row_count,
            "columnCount": column_count,
            "sourceRowCount": source_row_count,
            "sourceColumnCount": source_column_count,
            "truncated": truncated,
            "cells": {},
            "rowHeights": {},
            "columnWidths": {},
            "overlays": [],
        }
        if not workbook["activeSheetId"]:
            workbook["activeSheetId"] = sheet_id

        for col in range(column_count):
            try:
                width = hmm_to_px(sheet.Columns.getByIndex(col).Width, 96)
                if width and width != 96:
                    parsed_sheet["columnWidths"][str(col)] = width
            except Exception:
                pass

        for row in range(row_count):
            try:
                height = hmm_to_px(sheet.Rows.getByIndex(row).Height, 28)
                if height and height != 28:
                    parsed_sheet["rowHeights"][str(row)] = height
            except Exception:
                pass

            for col in range(column_count):
                cell = sheet.getCellByPosition(col, row)
                value = str(cell.String or "")
                fill = color_to_hex(get_property(cell, "CellBackColor", -1), "")
                text_color = color_to_hex(get_property(cell, "CharColor", -1), "")
                if value or fill or text_color:
                    item = {"value": value}
                    if fill:
                        item["fillColor"] = fill
                    if text_color:
                        item["textColor"] = text_color
                    parsed_sheet["cells"]["{}:{}".format(row, col)] = item
        workbook["sheets"].append(parsed_sheet)
    return workbook


def thin_border():
    line = BorderLine2()
    line.Color = 0xB8B0A4
    line.LineWidth = 8
    line.OuterLineWidth = 8
    line.InnerLineWidth = 0
    line.LineDistance = 0
    return line


def apply_pdf_grid_profile(doc):
    sheets = doc.getSheets()
    page_styles = doc.getStyleFamilies().getByName("PageStyles")
    line = thin_border()
    for sheet_name in sheets.getElementNames():
        sheet = sheets.getByName(sheet_name)
        end_col, end_row = used_range(sheet)
        cell_range = sheet.getCellRangeByPosition(0, 0, end_col, end_row)
        for border_name in ["TopBorder", "BottomBorder", "LeftBorder", "RightBorder", "VertBorder", "HoriBorder"]:
            set_property(cell_range, border_name, line)

        page_style_name = get_property(sheet, "PageStyle", "Default")
        page_style = page_styles.getByName(page_style_name) if page_styles.hasByName(page_style_name) else page_styles.getByName("Default")
        used_columns = end_col + 1
        landscape = used_columns >= 6
        pages_wide = 1
        if used_columns > 28:
            pages_wide = 3
        elif used_columns > 14:
            pages_wide = 2
        set_property(page_style, "PrintGrid", True)
        set_property(page_style, "PrintHeaders", True)
        set_property(page_style, "LeftMargin", 500)
        set_property(page_style, "RightMargin", 500)
        set_property(page_style, "TopMargin", 700)
        set_property(page_style, "BottomMargin", 700)
        set_property(page_style, "IsLandscape", landscape)
        if landscape:
            set_property(page_style, "Width", 29700)
            set_property(page_style, "Height", 21000)
        else:
            set_property(page_style, "Width", 21000)
            set_property(page_style, "Height", 29700)
        set_property(page_style, "ScaleToPagesX", pages_wide)
        set_property(page_style, "ScaleToPagesY", 0)


def build_document(desktop, model):
    doc = desktop.loadComponentFromURL("private:factory/scalc", "_blank", 0, (prop("Hidden", True),))
    sheets = doc.getSheets()
    model_sheets = model.get("sheets") or [{"id": "sheet-1", "name": "Sheet 1", "rowCount": 1, "columnCount": 1, "cells": {}}]

    existing = list(sheets.getElementNames())
    while len(existing) < len(model_sheets):
        sheets.insertNewByName("Sheet {}".format(len(existing) + 1), len(existing))
        existing = list(sheets.getElementNames())

    for index, sheet_model in enumerate(model_sheets):
        sheet = sheets.getByIndex(index)
        sheet.Name = safe_sheet_name(sheet_model.get("name"), index)
        row_heights = sheet_model.get("rowHeights") or {}
        column_widths = sheet_model.get("columnWidths") or {}
        cells = sheet_model.get("cells") or {}

        for col_key, width in column_widths.items():
            try:
                sheet.Columns.getByIndex(int(col_key)).Width = px_to_hmm(width, 2540)
            except Exception:
                pass

        for row_key, height in row_heights.items():
            try:
                sheet.Rows.getByIndex(int(row_key)).Height = px_to_hmm(height, 740)
            except Exception:
                pass

        for key, cell_model in cells.items():
            try:
                row_text, col_text = str(key).split(":", 1)
                row = int(row_text)
                col = int(col_text)
            except Exception:
                continue
            cell = sheet.getCellByPosition(col, row)
            cell.String = str(cell_model.get("value", ""))
            fill = hex_to_color(cell_model.get("fillColor"), -1)
            text_color = hex_to_color(cell_model.get("textColor"), -1)
            if fill >= 0:
                set_property(cell, "CellBackColor", fill)
            if text_color >= 0:
                set_property(cell, "CharColor", text_color)

        draw_sheet_overlays(doc, sheet, sheet_model)

    for sheet_name in list(sheets.getElementNames())[len(model_sheets):]:
        sheets.removeByName(sheet_name)
    return doc


def style_shape(shape, overlay, fill=False):
    color = hex_to_color(overlay.get("color"), 0xEB5E28)
    set_property(shape, "LineColor", color)
    set_property(shape, "LineWidth", max(10, px_to_hmm(overlay.get("strokeWidth") or 2, 50)))
    if fill:
        set_property(shape, "FillStyle", uno_enum("com.sun.star.drawing.FillStyle", "SOLID"))
        set_property(shape, "FillColor", color)
        set_property(shape, "FillTransparence", 86)
    else:
        set_property(shape, "FillStyle", uno_enum("com.sun.star.drawing.FillStyle", "NONE"))


def add_line_shape(doc, draw_page, x1, y1, x2, y2, overlay):
    shape = doc.createInstance("com.sun.star.drawing.LineShape")
    left = min(x1, x2)
    top = min(y1, y2)
    shape.Position = Point(left, top)
    shape.Size = Size(abs(x2 - x1), abs(y2 - y1))
    style_shape(shape, overlay, False)
    draw_page.add(shape)


def draw_sheet_overlays(doc, sheet, sheet_model):
    overlays = sheet_model.get("overlays") or []
    if not overlays:
      return
    draw_page = sheet.getDrawPage()
    for overlay in overlays:
        try:
            overlay_type = str(overlay.get("type") or "")
            if overlay_type == "pen":
                points = overlay.get("points") or []
                for index in range(1, len(points)):
                    previous = points[index - 1]
                    current = points[index]
                    add_line_shape(
                        doc,
                        draw_page,
                        overlay_px_to_hmm(previous.get("x"), 54),
                        overlay_px_to_hmm(previous.get("y"), 32),
                        overlay_px_to_hmm(current.get("x"), 54),
                        overlay_px_to_hmm(current.get("y"), 32),
                        overlay,
                    )
                continue

            x = overlay_px_to_hmm(overlay.get("x"), 54)
            y = overlay_px_to_hmm(overlay.get("y"), 32)
            x2 = overlay_px_to_hmm(overlay.get("x2", overlay.get("x", 0) + overlay.get("width", 0)), 54)
            y2 = overlay_px_to_hmm(overlay.get("y2", overlay.get("y", 0) + overlay.get("height", 0)), 32)
            left = min(x, x2)
            top = min(y, y2)
            width = max(120, abs(x2 - x))
            height = max(120, abs(y2 - y))

            if overlay_type == "line":
                add_line_shape(doc, draw_page, x, y, x2, y2, overlay)
            elif overlay_type == "rectangle":
                shape = doc.createInstance("com.sun.star.drawing.RectangleShape")
                shape.Position = Point(left, top)
                shape.Size = Size(width, height)
                style_shape(shape, overlay, True)
                draw_page.add(shape)
            elif overlay_type == "ellipse":
                shape = doc.createInstance("com.sun.star.drawing.EllipseShape")
                shape.Position = Point(left, top)
                shape.Size = Size(width, height)
                style_shape(shape, overlay, True)
                draw_page.add(shape)
            elif overlay_type in ["text", "note"]:
                shape = doc.createInstance("com.sun.star.drawing.TextShape")
                shape.Position = Point(x, y)
                shape.Size = Size(max(1800, width), max(520, height))
                style_shape(shape, overlay, False)
                set_property(shape, "LineTransparence", 100)
                set_property(shape, "CharColor", hex_to_color(overlay.get("color"), 0xEB5E28))
                set_property(shape, "CharHeight", 12)
                shape.String = str(overlay.get("text") or "")
                draw_page.add(shape)
        except Exception:
            pass


def store_pdf(doc, output_path):
    apply_pdf_grid_profile(doc)
    doc.storeToURL(
        uno.systemPathToFileUrl(output_path),
        (prop("FilterName", "calc_pdf_Export"), prop("Overwrite", True)),
    )


def main():
    if len(sys.argv) < 3:
        raise SystemExit("usage: spreadsheet_model.py parse|prepare|export ...")

    mode = sys.argv[1]
    if mode == "parse":
        if len(sys.argv) < 7:
            raise SystemExit("usage: spreadsheet_model.py parse input output_json ext port csv_filter_options")
        input_path = os.path.abspath(sys.argv[2])
        output_json = os.path.abspath(sys.argv[3])
        ext = sys.argv[4].lower()
        port = int(sys.argv[5])
        csv_filter_options = sys.argv[6]
        ctx = connect(port)
        desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
        doc = load_document(desktop, input_path, ext, csv_filter_options)
        try:
            with open(output_json, "w", encoding="utf-8") as handle:
                json.dump(parse_workbook(doc), handle)
        finally:
            try:
                doc.close(True)
            except Exception:
                doc.dispose()
        return

    if mode == "prepare":
        if len(sys.argv) < 10:
            raise SystemExit("usage: spreadsheet_model.py prepare input output_pdf output_json ext port csv_filter_options max_rows max_cols")
        input_path = os.path.abspath(sys.argv[2])
        output_pdf = os.path.abspath(sys.argv[3])
        output_json = os.path.abspath(sys.argv[4])
        ext = sys.argv[5].lower()
        port = int(sys.argv[6])
        csv_filter_options = sys.argv[7]
        max_rows = int(sys.argv[8])
        max_cols = int(sys.argv[9])
        ctx = connect(port)
        desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
        doc = load_document(desktop, input_path, ext, csv_filter_options)
        model = None
        model_error = ""
        try:
            store_pdf(doc, output_pdf)
            try:
                model = parse_workbook(doc, max_rows, max_cols)
            except Exception as exc:
                model_error = str(exc) or "spreadsheet_model_unavailable"
                model = {
                    "version": 1,
                    "activeSheetId": "",
                    "truncated": False,
                    "modelError": model_error,
                    "limits": {
                        "maxRows": max_rows,
                        "maxColumns": max_cols,
                    },
                    "sheets": [],
                }
            if model_error:
                model["modelError"] = model_error
            with open(output_json, "w", encoding="utf-8") as handle:
                json.dump(model, handle)
        finally:
            try:
                doc.close(True)
            except Exception:
                doc.dispose()
        return

    if mode == "export":
        if len(sys.argv) < 6:
            raise SystemExit("usage: spreadsheet_model.py export input_json output_file format port")
        input_json = os.path.abspath(sys.argv[2])
        output_file = os.path.abspath(sys.argv[3])
        export_format = sys.argv[4].lower()
        port = int(sys.argv[5])
        with open(input_json, "r", encoding="utf-8") as handle:
            model = json.load(handle)
        ctx = connect(port)
        desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
        doc = build_document(desktop, model)
        try:
            if export_format == "pdf":
                store_pdf(doc, output_file)
                return
            else:
                store_props = (prop("FilterName", "Calc MS Excel 2007 XML"), prop("Overwrite", True))
            doc.storeToURL(uno.systemPathToFileUrl(output_file), store_props)
        finally:
            try:
                doc.close(True)
            except Exception:
                doc.dispose()
        return

    raise SystemExit("unknown mode: {}".format(mode))


if __name__ == "__main__":
    main()
