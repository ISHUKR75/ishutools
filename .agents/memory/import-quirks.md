---
name: IshuTools pdfminer import quirks
description: Which pdfminer.layout symbols are safe to import in this project
---

## Rule
Only import `LTTextBox` from `pdfminer.layout`. Do NOT import `LTAnon`, `LTTable`, or any other layout class — they don't exist in the installed version.

**Why:** Discovered during startup; `LTAnon` and `LTTable` caused ImportError crashing the whole Flask server. Fix: remove those imports from pdf_redact.py and pdf_to_excel.py.

**How to apply:** Any new tool that does PDF text extraction via pdfminer should only use `from pdfminer.layout import LTTextBox`.
