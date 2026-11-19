// NgertiHukum — AI adapter seam.
//
// Default behaviour: the app runs on the transparent client-side pipeline in
// engine.js (term matching, date/amount extraction, template summarisation).
// It always works, offline, with no key, and never sends text anywhere.
//
// A real LLM can be plugged in behind this single interface to upgrade
// summaries. Contract:
//   explainWithLLM(text) -> Promise<{ summary: string, facts: string[] } | null>
// Return null (the default) and the app falls back to the built-in pipeline.
//
// To enable an LLM, the USER configures their own OpenAI-compatible endpoint:
//   NH_AI.configure({ endpoint: "https://…/v1/chat/completions",
//                     apiKey: "…", model: "…" })
// Privacy rule: with a configuration, text goes ONLY to the endpoint the user
// themselves configured — there is no default server, no analytics, no key
// stored anywhere by this app.
window.NH_AI = {
  _config: null,

  configure(cfg) {
    this._config = cfg && cfg.endpoint ? cfg : null;
  },

  async explainWithLLM(text) {
    const cfg = this._config;
    if (!cfg) return null; // demo path: key-free, built-in pipeline
    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.apiKey ? { Authorization: "Bearer " + cfg.apiKey } : {})
        },
        body: JSON.stringify({
          model: cfg.model || "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "Kamu menjelaskan surat resmi/hukum Indonesia dalam bahasa sederhana untuk warga awam. Balas HANYA dengan JSON: {\"summary\": string, \"facts\": string[]}. Ringkasan maksimal 4 kalimat, tanpa nasihat hukum."
            },
            { role: "user", content: text }
          ],
          temperature: 0.2
        })
      });
      if (!res.ok) return null;
      const data = await res.json();
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) return null;
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed.summary !== "string") return null;
      return {
        summary: parsed.summary,
        facts: Array.isArray(parsed.facts) ? parsed.facts.filter((x) => typeof x === "string") : []
      };
    } catch (e) {
      return null; // any failure -> silent fallback to the built-in pipeline
    }
  }
};
