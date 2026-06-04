#!/usr/bin/env python3
import os
import sys
import time

import uno
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


def set_property(target, name, value):
    if has_property(target, name):
        target.setPropertyValue(name, value)


def get_property(target, name, fallback=None):
    if has_property(target, name):
        return target.getPropertyValue(name)
    return fallback


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


def used_range(sheet):
    cursor = sheet.createCursor()
    cursor.gotoStartOfUsedArea(False)
    cursor.gotoEndOfUsedArea(True)
    address = cursor.getRangeAddress()
    end_col = max(0, int(address.EndColumn))
    end_row = max(0, int(address.EndRow))
    return end_col, end_row


def thin_border():
    line = BorderLine2()
    line.Color = 0xB8B0A4
    line.LineWidth = 8
    line.OuterLineWidth = 8
    line.InnerLineWidth = 0
    line.LineDistance = 0
    return line


def apply_grid_profile(doc):
    sheets = doc.getSheets()
    page_styles = doc.getStyleFamilies().getByName("PageStyles")
    line = thin_border()

    for sheet_name in sheets.getElementNames():
        sheet = sheets.getByName(sheet_name)
        end_col, end_row = used_range(sheet)
        cell_range = sheet.getCellRangeByPosition(0, 0, end_col, end_row)

        set_property(cell_range, "TopBorder", line)
        set_property(cell_range, "BottomBorder", line)
        set_property(cell_range, "LeftBorder", line)
        set_property(cell_range, "RightBorder", line)
        set_property(cell_range, "VertBorder", line)
        set_property(cell_range, "HoriBorder", line)

        page_style_name = get_property(sheet, "PageStyle", "Default")
        if page_styles.hasByName(page_style_name):
            page_style = page_styles.getByName(page_style_name)
        else:
            page_style = page_styles.getByName("Default")

        set_property(page_style, "PrintGrid", True)
        set_property(page_style, "PrintHeaders", True)
        set_property(page_style, "ScaleToPagesX", 1)
        set_property(page_style, "ScaleToPagesY", 0)
        set_property(page_style, "IsLandscape", end_col >= 8)


def main():
    if len(sys.argv) < 6:
        raise SystemExit("usage: spreadsheet_to_pdf.py input output ext port csv_filter_options")

    input_path = os.path.abspath(sys.argv[1])
    output_path = os.path.abspath(sys.argv[2])
    ext = sys.argv[3].lower()
    port = int(sys.argv[4])
    csv_filter_options = sys.argv[5]

    ctx = connect(port)
    desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)

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

    try:
        apply_grid_profile(doc)
        store_props = (
            prop("FilterName", "calc_pdf_Export"),
            prop("Overwrite", True),
        )
        doc.storeToURL(uno.systemPathToFileUrl(output_path), store_props)
    finally:
        try:
            doc.close(True)
        except Exception:
            doc.dispose()


if __name__ == "__main__":
    main()
