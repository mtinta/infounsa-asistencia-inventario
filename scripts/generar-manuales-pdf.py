#!/usr/bin/env python3
"""Genera en Manuales/pdf/ una versión PDF de cada manual (Manuales/*.md).

Requiere: Python 3 con el paquete `markdown-it-py` (pip install markdown-it-py) y Electron
(ya incluido al ejecutar `pnpm install`). Uso:  python scripts/generar-manuales-pdf.py
"""
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

from markdown_it import MarkdownIt

RAIZ = pathlib.Path(__file__).resolve().parent.parent
MANUALES = RAIZ / "Manuales"
SALIDA = MANUALES / "pdf"

CSS = """
@page { size: A4; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1f2937; }
h1 { color: #7f1d1d; border-bottom: 3px solid #7f1d1d; padding-bottom: 6px; font-size: 22pt; }
h2 { color: #7f1d1d; margin-top: 26px; border-bottom: 1px solid #d1d5db; padding-bottom: 3px; page-break-after: avoid; }
h3, h4 { color: #111827; page-break-after: avoid; }
code { font-family: Consolas, 'DejaVu Sans Mono', monospace; background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 9.5pt; }
pre { background: #111827; color: #f9fafb; padding: 10px 12px; border-radius: 6px; white-space: pre-wrap; word-wrap: break-word; page-break-inside: avoid; }
pre code { background: none; color: inherit; padding: 0; font-size: 9pt; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10pt; }
tr { page-break-inside: avoid; }
th, td { border: 1px solid #d1d5db; padding: 5px 8px; vertical-align: top; text-align: left; }
th { background: #f3f4f6; }
img { max-width: 100%; height: auto; display: block; margin: 10px auto; border: 1px solid #e5e7eb; page-break-inside: avoid; }
blockquote { border-left: 4px solid #d97706; background: #fffbeb; margin: 10px 0; padding: 6px 12px; }
a { color: #1d4ed8; text-decoration: none; }
"""


def main() -> int:
    mds = sorted(MANUALES.glob("*.md"))
    mds = [m for m in mds if m.name.lower() != "readme.md"]
    if not mds:
        print("No hay manuales en", MANUALES)
        return 1
    electron = shutil.which("electron")
    if not electron:
        for candidato in (
            RAIZ / "apps/asistencia/desktop/node_modules/.bin/electron",
            RAIZ / "apps/asistencia/desktop/node_modules/.bin/electron.cmd",
        ):
            if candidato.exists():
                electron = str(candidato)
                break
    if not electron:
        print("No se encontró Electron. Ejecuta `pnpm install` en la raíz.")
        return 1

    SALIDA.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        argumentos = []
        for md in mds:
            cuerpo = MarkdownIt("commonmark").enable("table").render(md.read_text(encoding="utf-8"))
            html = (
                '<!doctype html><html lang="es"><head><meta charset="utf-8">'
                f'<base href="{MANUALES.as_uri()}/"><style>{CSS}</style></head><body>{cuerpo}</body></html>'
            )
            entrada = pathlib.Path(tmp) / (md.stem + ".html")
            entrada.write_text(html, encoding="utf-8")
            argumentos += [str(entrada), str(SALIDA / (md.stem + ".pdf"))]
        # Las rutas de salida/entrada se pasan tras el script de Electron
        cmd = [electron, "--no-sandbox", str(RAIZ / "scripts/manuales-a-pdf.js")] + argumentos
        entorno = {k: v for k, v in os.environ.items() if k != "ELECTRON_RUN_AS_NODE"}
        return subprocess.call(cmd, env=entorno)


if __name__ == "__main__":
    sys.exit(main())
