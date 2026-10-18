"""Inspect saved 1001tracklists HTML: class histogram + track row extraction.

Uses plain XPath (no cssselect dependency).
"""
import collections
import sys

from lxml import html as LH


def cls(el):
    return (el.get("class") or "").split()


def has(el, name):
    return name in cls(el)


def q(doc, xp):
    return doc.xpath(xp)


def hist(doc, limit=45):
    cc, cd = collections.Counter(), collections.Counter()
    for el in doc.iter():
        if not isinstance(el.tag, str):
            continue
        for c in cls(el):
            cc[c] += 1
        for k in el.attrib:
            if k.startswith("data-"):
                cd[k] += 1
    print("== classes ==")
    for k, v in cc.most_common(limit):
        print(f"  {v:5d}  .{k}")
    print("== data-* attributes ==")
    for k, v in cd.most_common(limit):
        print(f"  {v:5d}  {k}")


def txt(node):
    return " ".join(node.text_content().split()) if node is not None else None


def rows(doc):
    items = q(doc, "//div[contains(concat(' ', normalize-space(@class), ' '), ' tlpItem ')]")
    print("\n== tlpItem rows ==")
    print("count:", len(items))
    for it in items[:4]:
        print("-" * 72)
        print("data-id", it.get("data-id"), "data-trackid", it.get("data-trackid"), "trno", it.get("data-trno"))
        for prop in ("name", "byArtist", "publisher", "url", "genre", "duration"):
            print(f"  meta[{prop:9s}]", q(it, f".//meta[@itemprop='{prop}']/@content"))
        tv = q(it, ".//*[contains(concat(' ', normalize-space(@class), ' '), ' trackValue ')]")
        if tv:
            t = tv[0]
            print("  trackValue id", t.get("id"), "| text:", txt(t)[:200])
            for a in q(t, ".//a"):
                print(f"    a href={a.get('href')} title={a.get('title')} text={txt(a)!r}")
            kids = [f"{k.tag}.{'.'.join(cls(k))}" for k in t if isinstance(k.tag, str)]
            print("  trackValue children:", kids)
        print("  row children:", [f"{k.tag}.{'.'.join(cls(k))}" for k in it if isinstance(k.tag, str)])


def other(doc):
    print("\n== counts ==")
    for xp, label in (
        ("//div[contains(@class,'tlpItem')]", "div.tlpItem"),
        ("//div[contains(@class,'bItm')]", "div.bItm"),
        ("//*[contains(@class,'trackValue')]", ".trackValue"),
        ("//*[contains(@class,'mediaRow')]", ".mediaRow"),
        ("//*[contains(@class,'bCont')]", ".bCont"),
        ("//*[@id='tracklistTable']", "#tracklistTable"),
        ("//*[contains(@class,'bPlay')]", ".bPlay"),
        ("//div[@id='tlp_14587689']", "#tlp_14587689"),
    ):
        print(f"  {label:22s} {len(q(doc, xp))}")


def main():
    path = sys.argv[1]
    with open(path, "rb") as fh:
        doc = LH.fromstring(fh.read())
    mode = sys.argv[2] if len(sys.argv) > 2 else "all"
    if mode in ("all", "hist"):
        hist(doc)
    if mode in ("all", "rows"):
        rows(doc)
    if mode in ("all", "other"):
        other(doc)


if __name__ == "__main__":
    main()
