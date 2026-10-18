"""Deep inspection of 1001tracklists track rows."""
import re
import sys

from lxml import html as LH


def cls(el):
    return (el.get("class") or "").split()


def norm(s):
    return " ".join((s or "").split())


def outline(el, depth=0, maxdepth=3, out=None):
    out = out if out is not None else []
    if not isinstance(el.tag, str):
        return out
    pad = "  " * depth
    text = norm(el.text_content())
    out.append(
        f"{pad}<{el.tag} class='{el.get('class','')}' id='{el.get('id','')}'> "
        f"text={text[:90]!r}"
    )
    if depth < maxdepth:
        for ch in el:
            outline(ch, depth + 1, maxdepth, out)
    return out


def main():
    path = sys.argv[1]
    with open(path, "rb") as fh:
        doc = LH.fromstring(fh.read())

    items = doc.xpath("//div[contains(concat(' ', normalize-space(@class), ' '), ' tlpItem ')]")
    print("rows:", len(items))

    no_name = 0
    no_trackvalue = 0
    ids = 0
    for idx, it in enumerate(items):
        names = it.xpath(".//meta[@itemprop='name']/@content")
        tv = it.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' trackValue ')]")
        if not names:
            no_name += 1
        if not tv:
            no_trackvalue += 1
        text = norm(tv[0].text_content()) if tv else ""
        if "ID" in text.split(" - ")[0].split():
            ids += 1
        if idx < 40:
            print(f"{idx:3d} id={it.get('data-id')} tid={it.get('data-trackid')} "
                  f"name={norm(names[0]) if names else None!r}")
    print("no meta name:", no_name, "no trackValue:", no_trackvalue, "ID rows:", ids)

    # Структура одной строки целиком.
    print("\n== outline of row 0 ==")
    print("\n".join(outline(items[0], 0, 4)))

    # Все варианты детей .trackValue.
    print("\n== trackValue children variants ==")
    seen = {}
    for it in items:
        tv = it.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' trackValue ')]")
        if not tv:
            continue
        sig = "|".join(f"{ch.tag}.{'.'.join(cls(ch))}" for ch in tv[0] if isinstance(ch.tag, str))
        seen.setdefault(sig, []).append(norm(tv[0].text_content())[:80])
    for sig, sample in seen.items():
        print(f"  [{len(sample):2d}] {sig}")
        for s in sample[:2]:
            print(f"       {s!r}")

    # Родитель trackValue и соседи.
    print("\n== parents of trackValue ==")
    parents = {}
    for it in items:
        tv = it.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' trackValue ')]")
        if not tv:
            continue
        p = tv[0].getparent()
        sig = f"{p.tag}#{p.get('id','')}.{'.'.join(cls(p))}"
        parents[sig] = parents.get(sig, 0) + 1
    for k, v in parents.items():
        print(f"  {v:3d}  {k}")

    # Соседи последнего span внутри trackValue (куда вставлять кнопку).
    print("\n== last child of trackValue ==")
    lasts = {}
    for it in items:
        tv = it.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' trackValue ')]")
        if not tv:
            continue
        kids = [k for k in tv[0] if isinstance(k.tag, str)]
        if not kids:
            continue
        last = kids[-1]
        sig = f"{last.tag}.{'.'.join(cls(last))}"
        lasts[sig] = lasts.get(sig, 0) + 1
    for k, v in lasts.items():
        print(f"  {v:3d}  {k}")

    # Строки с маш-апом.
    print("\n== mashup rows ==")
    for it in items:
        mash = it.get("data-mashup") or it.get("data-mashpos")
        if mash:
            print("  ", it.get("data-id"), "mashup=", it.get("data-mashup"), "pos=", it.get("data-mashpos"))


if __name__ == "__main__":
    main()
