// NgertiHukum — app wiring (vanilla JS, no dependencies).
// Analysis lives in engine.js (pure + testable); this file is DOM only.
// All processing is client-side: letter text never leaves the device.
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const data = window.NH_DATA;
  const E = window.NH_ENGINE;
  const esc = E.escapeHTML;
  let lastAnalysis = null;

  /* ---------- Tabs ---------- */
  function showTab(name) {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    $("#panel-" + name).classList.add("active");
  }
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  /* ---------- Baca Surat ---------- */
  document.querySelectorAll("[data-sample]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("#letter-input").value = data.samples[btn.dataset.sample];
      $("#letter-input").focus();
    });
  });

  function showTerm(term) {
    const g = data.glossary.find((x) => x.term === term);
    if (!g) return;
    const box = $("#term-box");
    box.innerHTML = "<strong>" + esc(g.term) + "</strong> — " + esc(g.plain);
    box.classList.remove("hidden");
  }

  $("#btn-explain").addEventListener("click", async () => {
    const text = $("#letter-input").value.trim();
    if (!text) { alert("Tempel dulu isi suratnya, atau pilih surat contoh."); return; }

    // AI adapter seam: a user-configured LLM may upgrade the summary; default null.
    const llm = await window.NH_AI.explainWithLLM(text);

    const a = E.analyze(text, data.glossary);
    lastAnalysis = a;

    // Facts
    const facts = [];
    facts.push("🏷️ Jenis surat: <strong>" + esc(E.TYPE_LABEL[a.type]) + "</strong>");
    if (a.sender) facts.push("✉️ Pengirim: <strong>" + esc(a.sender) + "</strong>");
    if (a.recipient) facts.push("👤 Ditujukan kepada: <strong>" + esc(a.recipient) + "</strong>");
    a.dates.forEach((d) => {
      if (a.deadline && d.raw === a.deadline.raw && d.role === "deadline") {
        facts.push("⏰ <strong>Batas waktu: " + esc(d.raw) + " (" + esc(E.relativeLabel(d.date)) + ")</strong>");
      } else {
        facts.push("📅 Tanggal disebut: <strong>" + esc(d.raw) + "</strong>");
      }
    });
    a.amounts.forEach((x) => facts.push("💰 Jumlah uang disebut: <strong>" + esc(x) + "</strong>"));
    a.refs.forEach((r) => facts.push("🔢 Nomor surat/perjanjian: <strong>" + esc(r) + "</strong>"));
    if (a.terms.length) facts.push("📖 Ada " + a.terms.length + " istilah hukum yang dijelaskan di bawah.");
    if (llm && llm.facts && llm.facts.length) {
      llm.facts.forEach((f) => facts.push("🤖 " + esc(f)));
    }
    $("#facts").innerHTML = facts.map((f) => "<li>" + f + "</li>").join("");

    // Summary (LLM result wins when the user configured one)
    $("#summary").textContent = llm && llm.summary ? llm.summary : E.summarize(a, text);

    // Highlighted body + tappable term chips
    $("#highlighted").innerHTML = E.highlightHTML(text, data.glossary);
    $("#term-box").classList.add("hidden");
    $("#term-chips").innerHTML = a.terms
      .map((g) => '<button class="chip-term" data-term="' + esc(g.term) + '">' + esc(g.term) + "</button>")
      .join("");

    // Checklist
    $("#checklist").innerHTML = E.buildChecklist(a).map((x) => "<li>" + esc(x) + "</li>").join("");

    $("#result").classList.remove("hidden");
    $("#result").scrollIntoView({ behavior: "smooth" });
  });

  $("#highlighted").addEventListener("click", (e) => {
    const mark = e.target.closest("mark[data-term]");
    if (mark) showTerm(mark.dataset.term);
  });
  $("#term-chips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-term]");
    if (chip) showTerm(chip.dataset.term);
  });

  // Cross-feature: draft a reply pre-filled from the letter just explained.
  $("#btn-balas").addEventListener("click", () => {
    if (lastAnalysis) {
      if (lastAnalysis.sender) $("#f-tujuan").value = lastAnalysis.sender;
      if (lastAnalysis.type === "somasi") {
        $("#f-perihal").value = "Somasi" + (lastAnalysis.refs.length ? " Nomor " + lastAnalysis.refs[0] : "");
        $("#reply-type").value = lastAnalysis.amounts.length ? "sanggahan" : "klarifikasi";
      } else if (lastAnalysis.type === "tagihan") {
        $("#f-perihal").value = "Pemberitahuan tagihan" + (lastAnalysis.refs.length ? " Nomor " + lastAnalysis.refs[0] : "");
        $("#reply-type").value = "klarifikasi";
      }
    }
    showTab("balas");
  });

  /* ---------- Balas Surat ---------- */
  $("#btn-draft").addEventListener("click", () => {
    const letter = E.buildReply({
      jenis: $("#reply-type").value,
      nama: $("#f-nama").value,
      alamat: $("#f-alamat").value,
      tujuan: $("#f-tujuan").value,
      perihal: $("#f-perihal").value,
      nomor: $("#f-nomor").value,
      isi: $("#f-isi").value
    });
    const out = $("#reply-output");
    out.value = letter;
    out.classList.remove("hidden");
    $("#btn-copy").classList.remove("hidden");
    $("#btn-print").classList.remove("hidden");
  });

  $("#btn-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#reply-output").value); alert("Draf tersalin."); }
    catch (e) { $("#reply-output").select(); document.execCommand("copy"); }
  });

  $("#btn-print").addEventListener("click", () => {
    const w = window.open("", "_blank");
    if (!w) { alert("Popup diblokir browser. Salin draf lalu cetak dari aplikasi catatan/dokumen."); return; }
    w.document.write("<!DOCTYPE html><html lang=\"id\"><head><meta charset=\"UTF-8\"><title>Surat Balasan</title>" +
      "<style>body{font-family:Georgia,serif;padding:40px;line-height:1.6}pre{white-space:pre-wrap;font:inherit}</style></head><body><pre>" +
      esc($("#reply-output").value) + "</pre></body></html>");
    w.document.close();
    w.focus();
    w.print();
  });

  /* ---------- Kamus ---------- */
  function renderGlossary(filter) {
    const q = (filter || "").toLowerCase();
    const items = data.glossary
      .filter((g) => !q || g.term.includes(q) || g.plain.toLowerCase().includes(q))
      .sort((x, y) => x.term.localeCompare(y.term));
    $("#glossary-list").innerHTML = items.length
      ? items.map((g) => '<div class="g-item"><strong>' + esc(g.term) + "</strong><p>" + esc(g.plain) + "</p></div>").join("")
      : "<p>Tidak ada istilah yang cocok.</p>";
  }
  $("#glossary-search").addEventListener("input", (e) => renderGlossary(e.target.value));
  $("#glossary-count").textContent = data.glossary.length + " istilah, dijelaskan dengan bahasa sehari-hari.";
  renderGlossary("");
})();
