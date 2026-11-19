// NgertiHukum — engine: pure client-side NLP pipeline (no DOM, no network).
// Functions here are deterministic and unit-testable (see ../test/smoke.js):
//   extractDates / extractAmounts / extractRefs / extractSender /
//   extractRecipient / detectType / analyze / summarize / buildChecklist /
//   buildReply / matchedTerms / highlightHTML.
// Everything runs in the browser; letter text never leaves the device.
(function () {
  "use strict";

  const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
    "Agustus", "September", "Oktober", "November", "Desember"];
  const MONTH_IDX = {};
  MONTHS.forEach((m, i) => { MONTH_IDX[m.toLowerCase()] = i; });

  const escapeHTML = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /* ---------- Dates ---------- */
  // Returns [{ raw, date|null, role }] — role: "deadline" | "surat" | "biasa".
  function extractDates(text) {
    const out = [];
    const seen = new Set();
    const push = (raw, date, idx) => {
      const key = raw.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return;
      seen.add(key);
      const before = text.slice(Math.max(0, idx - 90), idx).toLowerCase();
      let role = "biasa";
      if (/jatuh tempo|sampai dengan|paling lambat|batas waktu|selambat|tenggat|dibayar sebelum/.test(before)) role = "deadline";
      else if (/tanggal\s*:?\s*$/.test(before.trimEnd()) || /tanggal\s*:\s*$/.test(before)) role = "surat";
      out.push({ raw: raw.replace(/\s+/g, " ").trim(), date: date, role: role });
    };
    const reLong = new RegExp("(\\d{1,2})\\s+(" + MONTHS.join("|") + ")\\s+(\\d{4})", "gi");
    let m;
    while ((m = reLong.exec(text)) !== null) {
      push(m[0], new Date(+m[3], MONTH_IDX[m[2].toLowerCase()], +m[1]), m.index);
    }
    const reNum = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g;
    while ((m = reNum.exec(text)) !== null) {
      let y = +m[3]; if (y < 100) y += 2000;
      const d = new Date(y, +m[2] - 1, +m[1]);
      if (d.getMonth() === +m[2] - 1) push(m[0], d, m.index);
    }
    return out;
  }

  function pickDeadline(dates) {
    const dl = dates.filter((d) => d.role === "deadline" && d.date);
    const pool = dl.length ? dl : dates.filter((d) => d.date);
    if (!pool.length) return null;
    return pool.reduce((a, b) => (a.date > b.date ? a : b));
  }

  function relativeLabel(date) {
    if (!date) return "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const that = new Date(date); that.setHours(0, 0, 0, 0);
    const days = Math.round((that - today) / 86400000);
    if (days === 0) return "hari ini";
    if (days === 1) return "besok";
    if (days > 1) return "sekitar " + days + " hari lagi";
    if (days === -1) return "kemarin — sudah lewat 1 hari";
    return "sudah lewat " + Math.abs(days) + " hari";
  }

  /* ---------- Money / references / parties ---------- */
  function extractAmounts(text) {
    const found = new Set();
    (text.match(/Rp\.?\s?[\d.]+(?:,\d{2})?/g) || []).forEach((a) => found.add(a.trim()));
    return [...found];
  }

  function extractRefs(text) {
    const found = new Set();
    const re = /(?:Nomor|No)\.?\s*:?\s*([0-9][0-9A-Za-z\/\-.]*[0-9A-Za-z]|[0-9]+)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[1].length >= 4) found.add(m[1]);
    }
    return [...found];
  }

  function titleCase(s) {
    return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function extractSender(text) {
    let m = text.match(/kuasa hukum dari\s+(.+?)(?:\s+dengan ini|[.,;\n]|$)/i);
    if (m) return m[1].trim();
    m = text.match(/Hormat kami,\s*\n\s*([^\n]+)/i);
    if (m) return m[1].trim().replace(/[.\s]+$/, "");
    const firstLine = (text.split("\n").map((l) => l.trim()).filter(Boolean)[0]) || "";
    if (/^(PT|CV|UD|Bank|Yayasan|Koperasi|Kantor|Firma)\b/i.test(firstLine)) {
      const head = firstLine.split(/[—–|]/)[0].trim();
      return head === head.toUpperCase() ? titleCase(head) : head;
    }
    return null;
  }

  function extractRecipient(text) {
    const m = text.match(/(?:Kepada\s+Yth\.?|Yth\.)\s*\n?\s*(?:Bapak|Ibu|Sdr\.?|Saudara\/i|Saudara)?\s*\.?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,3})/);
    if (m) return m[1].trim();
    return null;
  }

  /* ---------- Letter type ---------- */
  function detectType(text) {
    const t = text.toLowerCase();
    if (/somasi|teguran hukum/.test(t)) return "somasi";
    if (/surat panggilan|panggilan sidang|diminta (untuk )?menghadap|agar menghadap/.test(t)) return "panggilan";
    if (/pemberitahuan tagihan|surat tagihan|tagihan|kartu kredit/.test(t)) return "tagihan";
    if (/perjanjian|kesepakatan/.test(t) && /pasal/.test(t)) return "kontrak";
    return "umum";
  }

  const TYPE_LABEL = {
    somasi: "Surat somasi / teguran hukum",
    tagihan: "Surat pemberitahuan tagihan",
    panggilan: "Surat panggilan resmi",
    kontrak: "Dokumen perjanjian / kontrak",
    umum: "Surat resmi"
  };

  /* ---------- Glossary matching / highlighting ---------- */
  function matchedTerms(text, glossary) {
    return glossary.filter((g) => new RegExp("\\b" + escapeRe(g.term) + "\\b", "i").test(text));
  }

  function highlightHTML(text, glossary) {
    let out = escapeHTML(text);
    const terms = [...glossary].sort((a, b) => b.term.length - a.term.length);
    terms.forEach((g) => {
      const re = new RegExp("\\b(" + escapeRe(g.term) + ")\\b", "gi");
      out = out.replace(re, '<mark data-term="' + g.term + '">$1</mark>');
    });
    return out;
  }

  /* ---------- Analysis bundle ---------- */
  function analyze(text, glossary) {
    const dates = extractDates(text);
    return {
      type: detectType(text),
      dates: dates,
      deadline: pickDeadline(dates),
      amounts: extractAmounts(text),
      refs: extractRefs(text),
      sender: extractSender(text),
      recipient: extractRecipient(text),
      terms: matchedTerms(text, glossary)
    };
  }

  /* ---------- Plain-language summary ---------- */
  function summarize(a, text) {
    const dari = a.sender ? " dari " + a.sender : "";
    const amt = a.amounts.length ? a.amounts[0] : null;
    const dl = a.deadline ? a.deadline.raw + " (" + relativeLabel(a.deadline.date) + ")" : null;
    let s;
    if (a.type === "somasi") {
      s = "Ini surat teguran resmi (somasi)" + dari + ". Intinya, pengirim menganggap Anda belum memenuhi kewajiban";
      s += amt ? " — ada tunggakan sebesar " + amt : "";
      const due = a.dates.find((d) => d.role === "deadline" && d !== a.deadline);
      if (due) s += " yang sudah jatuh tempo pada " + due.raw;
      s += ".";
      if (dl) s += " Anda diberi batas waktu sampai " + dl + " untuk melunasinya.";
      s += " Kalau batas itu dilewati, pengirim mengancam menempuh jalur pengadilan (gugatan) dan menuntut ganti rugi.";
      s += " Penting: somasi BUKAN putusan pengadilan — Anda masih bisa menanggapi, memeriksa kebenarannya, dan bernegosiasi.";
    } else if (a.type === "tagihan") {
      s = "Ini surat pemberitahuan tagihan" + dari + ".";
      s += amt ? " Jumlah yang ditagihkan sebesar " + amt + "." : "";
      if (dl) s += " Tanggal jatuh temponya " + dl + ".";
      s += " Sifat surat ini pemberitahuan, bukan somasi dan bukan putusan pengadilan. Kalau Anda sudah membayar, surat ini boleh diabaikan — simpan saja bukti bayarnya. Kalau belum, bayar sebelum jatuh tempo supaya tidak kena denda dan catatan kredit memburuk.";
    } else if (a.type === "panggilan") {
      s = "Ini surat panggilan resmi" + dari + ". Anda diminta hadir sesuai tanggal, jam, dan tempat yang tertulis di surat.";
      if (dl) s += " Tanggal pentingnya: " + dl + ".";
      s += " Panggilan resmi jangan diabaikan — ketidakhadiran tanpa keterangan bisa berakibat hukum. Catat jadwalnya dan siapkan KTP serta dokumen yang berkaitan.";
    } else if (a.type === "kontrak") {
      s = "Ini dokumen perjanjian/kontrak" + dari + ". Baca terutama bagian kewajiban Anda, jangka waktu, jumlah pembayaran";
      s += amt ? " (disebut " + amt + ")" : "";
      s += ", denda keterlambatan, dan cara mengakhiri perjanjian. Jangan menandatangani sebelum paham isinya — perjanjian yang sudah ditandatangani mengikat seperti undang-undang bagi yang membuatnya.";
    } else {
      const first = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s/).find((x) => x.length > 25) || text.replace(/\s+/g, " ").slice(0, 160);
      s = "Surat resmi" + dari + ". Intinya: " + first;
      if (dl) s += " Tanggal penting yang disebut: " + dl + ".";
      if (amt) s += " Jumlah uang yang disebut: " + amt + ".";
    }
    if (a.terms.length) s += " Ketuk kata yang disorot kuning untuk arti sederhananya.";
    return s;
  }

  /* ---------- Next-steps checklist ---------- */
  function buildChecklist(a) {
    const steps = ["Jangan panik, dan jangan abaikan surat ini. Simpan surat beserta amplop/dokumen aslinya sebagai bukti."];
    if (a.deadline) steps.push("Tandai batas waktunya: " + a.deadline.raw + " (" + relativeLabel(a.deadline.date) + "). Siapkan tanggapan SEBELUM tanggal itu.");
    else if (a.dates.length) steps.push("Catat tanggal yang disebut (" + a.dates.map((d) => d.raw).join("; ") + ") ke kalender HP Anda.");
    if (a.type === "somasi") {
      steps.push("Periksa kebenarannya: cocokkan jumlah tunggakan" + (a.amounts.length ? " (" + a.amounts[0] + ")" : "") + (a.refs.length ? " dan nomor perjanjian " + a.refs[0] : "") + " dengan catatan serta bukti pembayaran Anda.");
      steps.push("Kalau ada yang tidak benar, sampaikan sanggahan tertulis lewat tab Balas Surat — jangan hanya lisan.");
      steps.push("Kalau benar tetapi belum sanggup membayar penuh, mohon penjadwalan ulang/angsuran secara tertulis sebelum batas waktu berakhir.");
    } else if (a.type === "tagihan") {
      steps.push("Cocokkan jumlah tagihan" + (a.amounts.length ? " (" + a.amounts[0] + ")" : "") + " dengan mutasi rekening/catatan Anda.");
      steps.push("Kalau belum membayar, bayar sebelum jatuh tempo atau hubungi layanan pelanggan pengirim untuk meminta rincian.");
      steps.push("Kalau sudah membayar, simpan bukti bayarnya; surat ini boleh diabaikan.");
    } else if (a.type === "panggilan") {
      steps.push("Catat tanggal, jam, dan tempat kehadiran yang tertulis di surat; usahakan datang tepat waktu.");
      steps.push("Bawa KTP dan dokumen yang berkaitan dengan perkara; berpakaian rapi dan bersikap sopan.");
      steps.push("Jangan mangkir tanpa kabar — bila benar-benar berhalangan, sampaikan keterangan tertulis secepatnya.");
    } else if (a.type === "kontrak") {
      steps.push("Baca pasal tentang kewajiban, jangka waktu, denda, dan cara mengakhiri perjanjian sebelum menandatangani.");
      steps.push("Minta salinan dokumen untuk Anda simpan; foto setiap halaman sebagai cadangan.");
    } else {
      if (a.amounts.length) steps.push("Cek apakah jumlah " + a.amounts[0] + " sesuai catatan/bukti Anda; kumpulkan bukti yang Anda punya.");
      steps.push("Kalau isinya tidak sesuai fakta, buat surat balasan lewat tab Balas Surat.");
    }
    steps.push("Kalau ragu, jumlahnya besar, atau ada ancaman pidana, konsultasikan gratis ke LBH (Lembaga Bantuan Hukum) terdekat atau pos bantuan hukum di pengadilan negeri.");
    return steps;
  }

  /* ---------- Reply-letter drafter ---------- */
  const OPENINGS = {
    klarifikasi: "Sehubungan dengan surat Bapak/Ibu perihal tersebut di atas, saya mohon penjelasan dan rincian lebih lanjut agar tidak terjadi kesalahpahaman di kemudian hari.",
    sanggahan: "Sehubungan dengan surat Bapak/Ibu perihal tersebut di atas, dengan hormat saya menyampaikan sanggahan/keberatan atas isi surat dimaksud, dengan penjelasan sebagai berikut.",
    keringanan: "Sehubungan dengan surat Bapak/Ibu perihal tersebut di atas, dengan hormat saya memohon keringanan berupa penjadwalan ulang/angsuran atas kewajiban saya, mengingat kondisi ekonomi saya saat ini."
  };

  function todayID(now) {
    const d = now || new Date();
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }

  function buildReply(f, now) {
    const v = (x) => (x && String(x).trim()) || "—";
    let letter = v(f.alamat) + ", " + todayID(now) + "\n\n";
    if (f.nomor && String(f.nomor).trim()) letter += "Nomor: " + String(f.nomor).trim() + "\n";
    letter += "Perihal: Tanggapan atas " + v(f.perihal) + "\n\n";
    letter += "Kepada Yth.\n" + v(f.tujuan) + "\ndi Tempat\n\n";
    letter += "Dengan hormat,\n\n";
    letter += (OPENINGS[f.jenis] || OPENINGS.klarifikasi) + "\n\n";
    letter += v(f.isi) + "\n\n";
    letter += "Demikian surat ini saya sampaikan. Atas perhatian dan kebijaksanaan Bapak/Ibu, saya ucapkan terima kasih.\n\n";
    letter += "Hormat saya,\n\n\n" + v(f.nama);
    return letter;
  }

  window.NH_ENGINE = {
    MONTHS, escapeHTML, extractDates, pickDeadline, relativeLabel,
    extractAmounts, extractRefs, extractSender, extractRecipient,
    detectType, TYPE_LABEL, matchedTerms, highlightHTML, analyze,
    summarize, buildChecklist, OPENINGS, buildReply, todayID
  };
})();
