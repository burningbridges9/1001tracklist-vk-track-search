# -*- coding: utf-8 -*-
"""Нарезает фикстуры из сохранённых страниц 1001tracklists.

Читает (пути по умолчанию):

    _ref/tracklist.html    — живая страница треклиста;
    _ref/wb_track.html     — снимок страницы трека из Wayback (строки .bItm —
                             это треклисты, а не треки: фикстура для проверки,
                             что кнопок там не появляется).

Пишет:

    test/fixture.html                   10 строк треклиста, вырезанных verbatim;
    test/fixture-other.html             строка треклиста вместо трека;
    test/reference/tracklist-page.html  полный снимок живой страницы (без скриптов).

Строки берутся из настоящей разметки: меняется только обвязка, чтобы фикстура
была маленькой, но оставалась разметкой сайта.

Запуск:
    python tools/research/cut-fixtures.py
"""
import os
import re
import sys

from lxml import html as LH

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
REF = os.path.join(ROOT, "_ref")
TEST = os.path.join(ROOT, "test")

# Порядок важен: он же порядок строк в фикстуре.
WANTED = [
    ("14587689", "3 артиста через &"),
    ("14587690", "ft. в подписи"),
    ("14587691", "два лейбла через /"),
    ("14587692", "микс в скобках"),
    ("14587694", "название с $ и миксом"),
    ("14587697", "машап: несколько треков в одной строке"),
    ("14587722", "подстрока машапа"),
    ("14587699", "микс «Sunset Ibiza Mix»"),
    ("14587700", "ремикс от двух артистов в скобках"),
    ("14587702", "строка ID - ID без meta[name]"),
]


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    print("written", os.path.relpath(path, ROOT), len(text), "bytes")


def one_line(markup):
    return re.sub(r">\s+<", "><", markup)


def strip_noise(doc):
    """Убираем <script>/<iframe>/<noscript>: тестам нужна разметка, а не JS сайта."""
    for tag in ("script", "iframe", "noscript"):
        for el in doc.xpath("//" + tag):
            el.getparent().remove(el)
    return doc


def build_fixture():
    doc = LH.fromstring(open(os.path.join(REF, "tracklist.html"), "rb").read())
    rows = {}
    for row in doc.xpath("//div[contains(concat(' ', normalize-space(@class), ' '), ' tlpItem ')]"):
        rows[row.get("data-id")] = row

    chunks = []
    for data_id, comment in WANTED:
        row = rows.get(data_id)
        if row is None:
            raise SystemExit("row %s not found" % data_id)
        chunks.append(
            "        <!-- %s (data-id=%s) -->\n        %s\n"
            % (comment, data_id, one_line(LH.tostring(row, encoding="unicode")))
        )

    head = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dom Dolla &amp; KETTAMA @ Head Trip, United States 2026-10-11</title>
</head>
<body>
<div class="csRoot">
  <div class="csMiddle">
    <div class="container">
      <div class="tlTab" id="tlpTogTable">
"""
    tail = """      </div>
    </div>
  </div>
</div>
</body>
</html>
"""
    write(os.path.join(TEST, "fixture.html"), head + "".join(chunks) + tail)


def build_other():
    """Страница трека: строки .bItm — это треклисты, а не треки. Кнопок быть не должно."""
    doc = strip_noise(LH.fromstring(open(os.path.join(REF, "wb_track.html"), "rb").read()))
    rows = doc.xpath("//div[contains(concat(' ', normalize-space(@class), ' '), ' bItm ')]")

    chunks = []
    for i, row in enumerate(rows[:3]):
        chunks.append(
            "        <!-- «появляется в треклистах», строка %d -->\n        %s\n"
            % (i + 1, one_line(LH.tostring(row, encoding="unicode")))
        )

    head = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>M.J.E &amp; Michael Chodo - I Am a G [STRAKTON]</title>
</head>
<body>
<div class="csRoot">
  <div class="csMiddle">
    <div class="container">
      <div id="pageTitle"><h1 class="notranslate"><a href="/artist/13k4zzy4/m.j.e-and-michael-chodo/index.html" class="notranslate">M.J.E &amp; Michael Chodo</a> <span class="spL"><a href="/label/86qf51r/strakton-records/index.html" class="notranslate trackLabel" title="open label page">STRAKTON</a></span></h1></div>
      <div class="tlTab" id="tlpTable">
"""
    tail = """      </div>
    </div>
  </div>
</div>
</body>
</html>
"""
    write(os.path.join(TEST, "fixture-other.html"), head + "".join(chunks) + tail)


def build_reference():
    """Полная живая страница треклиста — для прогона настоящего content script."""
    doc = strip_noise(LH.fromstring(open(os.path.join(REF, "tracklist.html"), "rb").read()))
    markup = LH.tostring(doc, encoding="unicode", method="html")
    note = (
        "<!-- Снимок живой страницы 1001tracklists (треклист Dom Dolla & KETTAMA\n"
        "     @ Head Trip, United States 2026-10-11). Скрипты и iframe вырезаны:\n"
        "     тестам нужна разметка, а не JS сайта. Адреса картинок оставлены. -->\n"
    )
    write(os.path.join(TEST, "reference", "tracklist-page.html"), note + markup)


if __name__ == "__main__":
    if not os.path.isdir(REF):
        sys.exit("нет папки _ref/ — сначала скачайте страницы (tools/research/fetch.py)")
    build_fixture()
    build_other()
    build_reference()
