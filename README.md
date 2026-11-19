# NgertiHukum — Surat Hukum, Dibikin Ngerti
*(Legal letters, made understandable)*

A phone-first web app that helps ordinary Indonesians understand the official
and legal letters they receive — debt-collection letters (*somasi*), bank
billing notices, summonses, contracts — written in formal legal Indonesian that
most people cannot read. Paste a letter and NgertiHukum explains it in plain
Bahasa Indonesia: what it says, what matters in it, and what to do next.

**Live demo:** https://dordador.github.io/ngertihukum/
**Built for:** SLAY HACKS 2026 — solo entry, first-time hackathon participant.

## The problem

Ordinary Indonesians regularly receive official letters they cannot understand.
Deadlines are buried in paragraphs, amounts are written in formal legal style,
and the language is intimidating. Many people panic, ignore the letter (and
miss a deadline that matters), or pay an intermediary just to be told what the
letter says. The law is written in a language its subjects can't read.

## Features

### 📖 Baca Surat — "Explain my letter"
- Paste any official/legal letter in Bahasa Indonesia, or load one of the two
  built-in sample letters in one tap (a *somasi* from a financing company's
  lawyer; a bank billing notice).
- **Key-fact extraction:** letter type (somasi / tagihan / panggilan / kontrak /
  umum), sender/institution, recipient, reference numbers, all dates with
  their roles, the deadline with a plain relative label ("sekitar 16 hari
  lagi" — about 16 days from now), and money amounts (Rp…).
- **Plain-language summary** generated from the extracted facts — for a somasi
  it states the amount, the due date, the deadline, and the court threat, and
  makes clear that a somasi is **not** a court decision.
- **Tap-to-explain:** legal terms in the letter are highlighted; tapping one
  shows its plain-language meaning.
- **Next-steps checklist** tailored to the letter type, always ending with the
  free legal-aid (LBH) route.

### ✉️ Balas Surat — Reply-letter drafter
- A guided form generates a polite, correctly formal Indonesian reply letter
  in three styles: *klarifikasi* (ask for clarification), *sanggahan*
  (object/dispute), *keringanan* (request leniency/installments).
- After explaining a letter, one tap pre-fills the drafter with the sender as
  recipient, the subject (including the letter's reference number), and the
  likely reply type.
- Copy to clipboard, or print / save as PDF.

### 📚 Kamus Hukum — Legal glossary
- 46 common legal terms explained in plain language, searchable and sorted.

## Privacy & responsible use

- **Everything runs in the browser.** Letter text is processed entirely on the
  user's device and never leaves it — no server, no accounts, no tracking.
- A permanent banner states the guardrail: NgertiHukum explains *language*
  only. It is **not a lawyer and not legal advice**; for real cases it points
  users to LBH (Lembaga Bantuan Hukum), Indonesia's free legal-aid service.

## How it works (tech)

Plain static **HTML + CSS + vanilla JavaScript** — zero build step, zero
dependencies, zero backend. It runs from any static host and even offline.

```
index.html        App shell: Baca Surat / Balas Surat / Kamus Hukum tabs
css/styles.css    Mobile-first styling
js/data.js        Glossary (46 terms) + 2 sample letters
js/engine.js      Pure client-side NLP pipeline (no DOM, unit-tested):
                  letter-type detection; date/deadline, amount, reference
                  number, sender and recipient extraction; template-based
                  plain-language summary; next-steps checklist; reply-letter
                  builder; legal-term highlighting
js/ai-adapter.js  LLM seam (see "AI use" below)
js/app.js         DOM wiring: tabs, results rendering, tap-to-explain,
                  drafter form, copy/print, glossary search
```

The extraction/summarisation engine is covered by **62 automated assertions**
(engine behaviour on both sample letters + the full app flow end-to-end under a
DOM stub) — all passing.

### Run it locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## AI use — disclosure

NgertiHukum's "AI layer" is deliberately honest and hybrid:

1. **Always-on engine (what the live demo runs on):** a rule-based,
   client-side NLP pipeline written for this project — Indonesian legal-term
   matching, deadline/amount/entity extraction, and template-based
   summarisation. It needs no API key and no network, so the demo can never
   break and no letter text ever leaves the device.
2. **Optional LLM seam:** `js/ai-adapter.js` defines a single interface
   (`explainWithLLM`). It returns `null` by default. A user who wants richer
   summaries can plug in **their own** OpenAI-compatible endpoint via
   `NH_AI.configure(...)`; letter text then goes only to that user-chosen
   endpoint, with silent fallback to the built-in engine. The judged demo
   ships with the seam **unconfigured** (key-free).
3. **Development assistance:** the project's code and copy were drafted with
   the help of an AI coding assistant, directed and reviewed by the author —
   a first-time hackathon participant and semester-6 law student who designed
   the product around a problem from his own community.

## Author

Built solo by a semester-6 law student from Brebes, Indonesia — a first-time
hackathon entrant who watches family and neighbours struggle with letters like
these, and built the tool he wished they had.

## License

MIT
