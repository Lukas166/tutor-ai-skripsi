# Pembaca OOXML hanya mengambil nilai sel; workbook tidak pernah diubah atau dieksekusi.
import re
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
SHEETS = ("RPS RPL", "Materi RPL", "Indikator RPL", "Soal Pre-Post RPL", "Soal Latihan RPL")


def read_workbook(path: Path) -> dict[str, list[dict[str, str]]]:
    with zipfile.ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = [
                "".join(node.itertext())
                for node in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", NS)
            ]
        relationships = {
            r.attrib["Id"]: r.attrib["Target"]
            for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        }
        result = {}
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).findall("m:sheets/m:sheet", NS):
            target = relationships[
                sheet.attrib[
                    "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
                ]
            ]
            target = target.lstrip("/") if target.startswith("/") else "xl/" + target
            rows = []
            for node in ET.fromstring(archive.read(target)).findall("m:sheetData/m:row", NS):
                cells = {}
                for cell in node:
                    column = re.sub(r"\d", "", cell.attrib["r"])
                    value, inline = cell.find("m:v", NS), cell.find("m:is", NS)
                    text = (
                        value.text or ""
                        if value is not None
                        else ("".join(inline.itertext()) if inline is not None else "")
                    )
                    cells[column] = strings[int(text)] if cell.attrib.get("t") == "s" else text
                if any(cells.values()):
                    rows.append(cells)
            if not rows:
                raise ValueError(f"Tab kosong: {sheet.attrib['name']}")
            headers = rows[0]
            result[sheet.attrib["name"]] = [
                {header: row.get(column, "") for column, header in headers.items()}
                for row in rows[1:]
            ]
    validate_workbook(result)
    return result


def codes(value: str) -> list[str]:
    return [code.strip() for code in value.split(";") if code.strip()]


def validate_workbook(data: dict[str, list[dict[str, str]]]) -> None:
    # Validasi dilakukan seluruhnya sebelum transaksi impor, sehingga gagal tidak meninggalkan data.
    if set(data) != set(SHEETS):
        raise ValueError("Workbook harus memuat lima tab RPL yang ditentukan.")
    topics = data["Materi RPL"]
    indicators = data["Indikator RPL"]
    topic_ids = {row["ID Materi"] for row in topics}
    indicator_map = {row["ID Indikator"]: row["ID Materi"] for row in indicators}
    if topic_ids != {f"RPL-M{i:02d}" for i in range(1, 8)} or len(topics) != 7:
        raise ValueError("ID/jumlah materi tidak sesuai (RPL-M01–RPL-M07).")
    if set(indicator_map) != {f"RPL-I{i:02d}" for i in range(1, 15)} or len(indicators) != 14:
        raise ValueError("ID/jumlah indikator tidak sesuai (RPL-I01–RPL-I14).")
    if Counter(indicator_map.values()) != Counter({topic: 2 for topic in topic_ids}):
        raise ValueError("Setiap materi harus memiliki tepat dua indikator.")
    outcome_ids = {
        re.findall(r"Sub-CPMK\s+(\d+\.\d+)", row["Sub-CPMK"])[0] for row in data["RPS RPL"]
    }
    for row in topics + indicators:
        if not set(codes(row["Sub-CPMK"])).issubset(outcome_ids):
            raise ValueError(f"Pemetaan Sub-CPMK tidak valid: {row}")
    for sheet, prefix, count, per_indicator in [
        ("Soal Pre-Post RPL", "RPL-PP-", 14, 1),
        ("Soal Latihan RPL", "RPL-L-", 28, 2),
    ]:
        rows = data[sheet]
        if len(rows) != count or {r["ID Soal"] for r in rows} != {
            f"{prefix}{i:02d}" for i in range(1, count + 1)
        }:
            raise ValueError(f"ID/jumlah soal tidak valid pada {sheet}.")
        if Counter(r["ID Indikator"] for r in rows) != Counter(
            {i: per_indicator for i in indicator_map}
        ):
            raise ValueError(f"Sebaran soal per indikator tidak valid pada {sheet}.")
        for row in rows:
            if indicator_map.get(row["ID Indikator"]) != row["ID Materi"]:
                raise ValueError(f"Relasi soal tidak valid: {row['ID Soal']}")
            required = [
                "Pertanyaan",
                "Penjelasan Jawaban",
                "Sumber PDF",
                "Halaman PDF",
                "Status Validasi",
                *[f"Opsi {letter}" for letter in "ABCDE"],
            ]
            if (
                row["Kunci"] not in "ABCDE"
                or len(row["Kunci"]) != 1
                or any(not row.get(field, "").strip() for field in required)
            ):
                raise ValueError(f"Kolom soal kosong/kunci tidak valid: {row['ID Soal']}")
    if next(r for r in topics if r["ID Materi"] == "RPL-M03")["Judul Materi"] != "Pengumpulan Data":
        raise ValueError("Gunakan revisi workbook Pengumpulan Data.")
