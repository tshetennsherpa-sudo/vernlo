import { useState, useCallback, useRef } from "react";

const MODEL = "claude-haiku-4-5-20251001";

const DOC_TYPES = {
  lease: { label: "Lease Agreement", icon: "🏠", accent: "#16a34a" },
  employment: { label: "Employment Contract", icon: "💼", accent: "#2563eb" },
  medical: { label: "Medical Report", icon: "🩺", accent: "#dc2626" },
  insurance: { label: "Insurance Policy", icon: "🛡️", accent: "#7c3aed" },
  loan: { label: "Loan Agreement", icon: "🏦", accent: "#d97706" },
  legal: { label: "Legal Document", icon: "⚖️", accent: "#0891b2" },
  other: { label: "Document", icon: "📄", accent: "#6b7280" },
};

const SYSTEM_PROMPT = `You are Vernlo, an expert document analyst. Your mission: make ANY confusing document crystal clear to a regular person. No legal or medical jargon.

Respond with ONLY a valid JSON object — no markdown, no backticks, no preamble:
{
  "docType": "lease|employment|medical|insurance|loan|legal|other",
  "title": "Short descriptive title of this document",
  "summary": "2-3 sentences explaining what this document is and what it means for the person reading it",
  "keyPoints": [
    {"label": "Short label", "detail": "Plain English explanation of this point", "severity": "green|yellow|red"}
  ],
  "redFlags": ["Specific concerning clause or finding in plain English — be direct"],
  "bottomLine": "ONE sentence: the single most important thing this person needs to know or do"
}

Severity guide — green=normal/expected, yellow=pay attention/understand this, red=concerning/unusual/potentially harmful.

For lease: rent terms, termination penalties, repair responsibilities, deposit conditions, rent increases, restrictions.
For employment: compensation, non-compete clauses, IP ownership, termination terms, probation, benefits.
For medical: abnormal values, diagnoses, medications, follow-up actions, critical findings.
For insurance: what is NOT covered, claim process, exclusions, excess amounts, renewal terms.
For loan: interest rates, fees, early repayment penalties, default consequences.
For legal/other: obligations, deadlines, penalties, rights, key parties.

Always include 5-8 key points. Be specific, not generic. If something seems unfair or unusual, flag it red.`;

export default function Vernlo() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const chatEndRef = useRef(null);

  const msgs = [
    "Reading your document...",
    "Identifying what matters...",
    "Flagging any concerns...",
    "Almost ready..."
  ];

  const readAsBase64 = (f) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(f);
  });

  const readAsText = (f) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsText(f);
  });

  const analyze = useCallback(async (f) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setChat([]);
    setLoadingMsg(msgs[0]);
    if (f.size > 5 * 1024 * 1024) {
      setError("File too large. Please upload a PDF under 5MB.");
      setLoading(false);
    return;
}

    const interval = setInterval(() => {
      setLoadingMsg(prev => {
        const i = msgs.indexOf(prev);
        return msgs[Math.min(i + 1, msgs.length - 1)];
      });
    }, 1800);

    try {
      let content;
      if (f.type === "application/pdf") {
        const b64 = await readAsBase64(f);
        content = [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: "Analyze this document and return the JSON object as instructed." }
        ];
      } else {
        const text = await readAsText(f);
        content = [{ type: "text", text: `Analyze this document:\n\n${text}\n\nReturn the JSON object as instructed.` }];
      }

      const res = await fetch("http://localhost:3001/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content }]
        })
      });

      const data = await res.json();
      const raw = (data.content || []).map(c => c.text || "").join("").replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(raw);
      setResult(parsed);
    } catch (err) {
      console.log("Analysis error:", err);
      setError("Couldn't analyze this document. Please try a PDF or text file.");
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); analyze(f); }
  }, [analyze]);

  const onFile = (e) => {
    const f = e.target.files[0];
    if (f) { setFile(f); analyze(f); }
  };

  const sendQuestion = async () => {
    if (!question.trim() || !result) return;
    const q = question.trim();
    setQuestion("");
    const history = [...chat, { role: "user", content: q }];
    setChat(history);
    setChatLoading(true);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
    const system = `You analyzed a ${result.docType} document titled "${result.title}".
Summary: ${result.summary}
Key points: ${result.keyPoints?.map(p => `${p.label}: ${p.detail}`).slice(0, 4).join("; ")}
Bottom line: ${result.bottomLine}

Answer the user's question in plain English. Be concise and helpful. No jargon.`;

      const res = await fetch("http://localhost:3001/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          system,
          messages: history.map(m => ({ role: m.role, content: m.content }))
        })
      });

      const data = await res.json();
      console.log("Chat response:", data);
      const answer = (data.content || []).map(c => c.text || "").join("") || "Sorry, couldn't get an answer.";
      setChat([...history, { role: "assistant", content: answer }]);
    } catch (err) {
      console.log("Chat error:", err);
      setChat([...history, { role: "assistant", content: "Sorry, something went wrong." }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  const docCfg = result ? (DOC_TYPES[result.docType] || DOC_TYPES.other) : null;

  const severityColor = { green: "#16a34a", yellow: "#d97706", red: "#dc2626" };
  const severityBg = { green: "#f0fdf4", yellow: "#fffbeb", red: "#fef2f2" };
  const severityBorder = { green: "#bbf7d0", yellow: "#fde68a", red: "#fecaca" };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f0f0f",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: "#f5f5f5"
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Header */}
      <header style={{
        padding: "20px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #1f1f1f"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "32px", height: "32px",
            background: "#e8ff6b",
            borderRadius: "8px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "16px"
          }}>V</div>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: "22px", letterSpacing: "-0.5px", color: "#f5f5f5" }}>
            Vernlo
          </span>
          <span style={{
            fontSize: "11px", color: "#555", letterSpacing: "0.12em",
            textTransform: "uppercase", marginLeft: "4px"
          }}>beta</span>
        </div>
        <p style={{ fontSize: "13px", color: "#555", margin: 0 }}>
          Understand any document in plain English
        </p>
      </header>

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 24px" }}>

        {/* Upload screen */}
        {!result && !loading && (
          <>
            <div style={{ textAlign: "center", marginBottom: "48px" }}>
              <h1 style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: "52px",
                fontWeight: "400",
                lineHeight: "1.15",
                margin: "0 0 16px",
                letterSpacing: "-1px"
              }}>
                Confused by a<br />
                <span style={{ color: "#e8ff6b" }}>document?</span>
              </h1>
              <p style={{ fontSize: "17px", color: "#888", maxWidth: "420px", margin: "0 auto", lineHeight: "1.6" }}>
                Upload any contract, medical report, lease, or legal document. Get plain English instantly.
              </p>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => document.getElementById("fi").click()}
              style={{
                border: `1.5px dashed ${dragging ? "#e8ff6b" : "#2a2a2a"}`,
                borderRadius: "16px",
                padding: "56px 40px",
                textAlign: "center",
                cursor: "pointer",
                background: dragging ? "#1a1a00" : "#141414",
                transition: "all 0.2s",
                marginBottom: "32px"
              }}
            >
              <input id="fi" type="file" accept=".pdf,.txt,.doc,.docx" onChange={onFile} style={{ display: "none" }} />
              <div style={{ fontSize: "40px", marginBottom: "16px" }}>📂</div>
              <div style={{ fontSize: "18px", fontWeight: "500", marginBottom: "8px" }}>
                Drop your document here
              </div>
              <div style={{ color: "#555", fontSize: "14px", marginBottom: "24px" }}>
                PDF, TXT, DOC supported
              </div>
              <div style={{
                display: "inline-block",
                padding: "10px 28px",
                background: "#e8ff6b",
                color: "#0f0f0f",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "600"
              }}>Browse files</div>
            </div>

            {/* Doc type pills */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
              {Object.entries(DOC_TYPES).slice(0, 6).map(([k, v]) => (
                <div key={k} style={{
                  padding: "6px 14px",
                  background: "#1a1a1a",
                  border: "1px solid #2a2a2a",
                  borderRadius: "20px",
                  fontSize: "13px",
                  color: "#888"
                }}>{v.icon} {v.label}</div>
              ))}
            </div>
          </>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{
              width: "56px", height: "56px",
              border: "2px solid #2a2a2a",
              borderTop: "2px solid #e8ff6b",
              borderRadius: "50%",
              margin: "0 auto 28px",
              animation: "spin 1s linear infinite"
            }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ fontSize: "18px", fontWeight: "500", marginBottom: "8px" }}>{loadingMsg}</div>
            <div style={{ color: "#555", fontSize: "14px" }}>{file?.name}</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: "#1a0000", border: "1px solid #3a0000",
            borderRadius: "12px", padding: "24px", textAlign: "center"
          }}>
            <div style={{ fontSize: "24px", marginBottom: "8px" }}>⚠️</div>
            <div style={{ color: "#f87171", marginBottom: "16px" }}>{error}</div>
            <button onClick={() => { setError(null); setFile(null); }}
              style={{ padding: "8px 20px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}>
              Try again
            </button>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div>
            {/* Doc header */}
            <div style={{
              background: "#141414",
              border: "1px solid #2a2a2a",
              borderRadius: "16px",
              padding: "24px",
              marginBottom: "20px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <span style={{ fontSize: "20px" }}>{docCfg?.icon}</span>
                    <span style={{
                      fontSize: "11px", fontWeight: "600", letterSpacing: "0.1em",
                      textTransform: "uppercase", color: docCfg?.accent,
                      background: `${docCfg?.accent}18`,
                      padding: "3px 10px", borderRadius: "20px"
                    }}>{docCfg?.label}</span>
                  </div>
                  <h2 style={{
                    fontFamily: "'DM Serif Display', serif",
                    fontSize: "24px", fontWeight: "400",
                    margin: "0 0 12px", color: "#f5f5f5"
                  }}>{result.title}</h2>
                  <p style={{ color: "#aaa", lineHeight: "1.6", fontSize: "15px", margin: 0 }}>{result.summary}</p>
                </div>
                <button onClick={() => { setResult(null); setFile(null); setChat([]); }}
                  style={{
                    padding: "8px 16px", background: "transparent",
                    border: "1px solid #2a2a2a", color: "#888",
                    borderRadius: "8px", cursor: "pointer", fontSize: "13px",
                    whiteSpace: "nowrap"
                  }}>+ New</button>
              </div>
            </div>

            {/* Bottom line */}
            <div style={{
              background: "#e8ff6b",
              borderRadius: "12px",
              padding: "16px 20px",
              marginBottom: "20px",
              display: "flex", alignItems: "flex-start", gap: "12px"
            }}>
              <span style={{ fontSize: "18px", marginTop: "1px" }}>💡</span>
              <div>
                <div style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "0.1em", textTransform: "uppercase", color: "#555", marginBottom: "4px" }}>
                  Bottom line
                </div>
                <div style={{ fontSize: "15px", fontWeight: "600", color: "#0f0f0f", lineHeight: "1.5" }}>
                  {result.bottomLine}
                </div>
              </div>
            </div>

            {/* Red flags */}
            {result.redFlags?.length > 0 && (
              <div style={{
                background: "#1a0000",
                border: "1px solid #3a0000",
                borderRadius: "12px",
                padding: "20px",
                marginBottom: "20px"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                  <span style={{ fontSize: "16px" }}>🚨</span>
                  <span style={{ fontWeight: "600", color: "#f87171", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Watch out for these
                  </span>
                </div>
                {result.redFlags.map((flag, i) => (
                  <div key={i} style={{
                    display: "flex", gap: "10px", alignItems: "flex-start",
                    marginBottom: i < result.redFlags.length - 1 ? "10px" : 0
                  }}>
                    <span style={{ color: "#f87171", fontWeight: "600", marginTop: "1px" }}>→</span>
                    <span style={{ color: "#fca5a5", fontSize: "14px", lineHeight: "1.6" }}>{flag}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Key points */}
            <div style={{ marginBottom: "28px" }}>
              <h3 style={{ fontSize: "13px", fontWeight: "600", color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>
                What you need to know
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {result.keyPoints?.map((point, i) => {
                  const sev = point.severity || "green";
                  return (
                    <div key={i} style={{
                      background: "#141414",
                      border: `1px solid #2a2a2a`,
                      borderLeft: `3px solid ${severityColor[sev]}`,
                      borderRadius: "10px",
                      padding: "14px 16px",
                      display: "flex", gap: "12px",
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0
                    }}>
                      <div style={{
                        width: "8px", height: "8px", minWidth: "8px",
                        borderRadius: "50%",
                        background: severityColor[sev],
                        marginTop: "6px"
                      }} />
                      <div>
                        <div style={{ fontWeight: "600", color: "#f5f5f5", fontSize: "14px", marginBottom: "4px" }}>
                          {point.label}
                        </div>
                        <div style={{ color: "#aaa", fontSize: "14px", lineHeight: "1.55" }}>
                          {point.detail}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chat */}
            <div style={{
              background: "#141414",
              border: "1px solid #2a2a2a",
              borderRadius: "16px",
              overflow: "hidden"
            }}>
              <div style={{
                padding: "16px 20px",
                borderBottom: "1px solid #1f1f1f",
                display: "flex", alignItems: "center", gap: "8px"
              }}>
                <span style={{ fontSize: "16px" }}>💬</span>
                <span style={{ fontWeight: "500", fontSize: "14px" }}>Ask anything about this document</span>
              </div>

              {chat.length > 0 && (
                <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px", maxHeight: "300px", overflowY: "auto" }}>
                  {chat.map((m, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "82%",
                        background: m.role === "user" ? "#e8ff6b" : "#1f1f1f",
                        color: m.role === "user" ? "#0f0f0f" : "#d4d4d4",
                        padding: "10px 14px",
                        borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                        fontSize: "14px", lineHeight: "1.55"
                      }}><span dangerouslySetInnerHTML={{
                        __html: m.content
                          .replace(/##\s(.+)/g, '<strong>$1</strong>')
                          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                          .replace(/\n/g, '<br/>')
                      }}/></div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ display: "flex" }}>
                      <div style={{ background: "#1f1f1f", padding: "10px 14px", borderRadius: "14px 14px 14px 4px", color: "#555", fontSize: "14px" }}>
                        Thinking...
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              <div style={{
                padding: "14px 16px",
                borderTop: chat.length > 0 ? "1px solid #1f1f1f" : "none",
                display: "flex", gap: "8px"
              }}>
                <input
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendQuestion()}
                  placeholder='e.g. "Can I leave early?" or "What happens if I miss a payment?"'
                  style={{
                    flex: 1, padding: "10px 14px",
                    background: "#0f0f0f",
                    border: "1px solid #2a2a2a",
                    borderRadius: "8px", color: "#f5f5f5",
                    fontSize: "14px", outline: "none",
                    fontFamily: "inherit"
                  }}
                />
                <button
                  onClick={sendQuestion}
                  disabled={!question.trim() || chatLoading}
                  style={{
                    padding: "10px 18px",
                    background: question.trim() ? "#e8ff6b" : "#1f1f1f",
                    color: question.trim() ? "#0f0f0f" : "#555",
                    border: "none", borderRadius: "8px",
                    cursor: question.trim() ? "pointer" : "default",
                    fontSize: "14px", fontWeight: "600",
                    transition: "all 0.15s"
                  }}>Ask</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
