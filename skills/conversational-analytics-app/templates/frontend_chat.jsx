// Minimal chat UI for the Conversational Analytics backend's /chat SSE endpoint.
// See ../reference/frontend-ux.md for the full component checklist (data
// tables, Vega-Lite charts, debug drawer, session sidebar, etc).
import { useState } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  async function sendMessage() {
    if (!input.trim()) return;
    const userText = input;
    setMessages((m) => [...m, { role: "user", text: userText }]);
    setInput("");
    setThinking(true);

    const res = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop();

      for (const event of events) {
        const line = event.replace(/^data: /, "");
        if (line) handleMessage(JSON.parse(line));
      }
    }
    setThinking(false);
  }

  function handleMessage(payload) {
    const text = payload.systemMessage?.text;
    if (!text) return;
    // textType serializes as an int or a string depending on the SDK version.
    if (text.textType === "FINAL_RESPONSE" || text.textType === 1) {
      setMessages((m) => [...m, { role: "agent", text: text.parts?.join("") }]);
    }
  }

  return (
    <div>
      <div className="thread">
        {messages.map((m, i) => (
          <div key={i} className={m.role}>
            {m.text}
          </div>
        ))}
        {thinking && <div className="thinking">Thinking...</div>}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}
