const sessionId = (() => {
  const KEY = "civic-concierge-session-id";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
  }
  return id;
})();

const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("chat-input");
const toolLogEl = document.getElementById("tool-log-list");
const modeBannerEl = document.getElementById("mode-banner");

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderToolCalls(toolCalls) {
  toolLogEl.innerHTML = "";
  if (!toolCalls || toolCalls.length === 0) {
    const li = document.createElement("li");
    li.textContent = "(no tool calls this turn)";
    toolLogEl.appendChild(li);
    return;
  }
  for (const call of toolCalls) {
    const li = document.createElement("li");
    if (call.isError) li.classList.add("error");
    const name = document.createElement("div");
    name.className = "tool-name";
    name.textContent = call.name;
    const args = document.createElement("div");
    args.className = "tool-args";
    args.textContent = `args: ${JSON.stringify(call.args)}`;
    const result = document.createElement("div");
    result.className = "tool-result";
    result.textContent = `→ ${call.result.length > 300 ? call.result.slice(0, 300) + "…" : call.result}`;
    li.append(name, args, result);
    toolLogEl.appendChild(li);
  }
}

async function loadMode() {
  try {
    const res = await fetch("/api/mode");
    const data = await res.json();
    modeBannerEl.textContent = `Agent mode: ${data.mode}`;
  } catch {
    modeBannerEl.textContent = "Agent mode: unknown (couldn't reach server)";
  }
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  addMessage("user", text);
  inputEl.value = "";
  inputEl.disabled = true;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: text }),
    });
    const data = await res.json();
    if (!res.ok) {
      addMessage("error", data.error || "Something went wrong.");
    } else {
      addMessage("agent", data.reply);
      renderToolCalls(data.toolCalls);
    }
  } catch (err) {
    addMessage("error", `Network error: ${err.message}`);
  } finally {
    inputEl.disabled = false;
    inputEl.focus();
  }
});

loadMode();
addMessage(
  "agent",
  "Hi, I'm the Civic Concierge for Rio Cardenal, TX (fictional demo city). I can help with food truck permits, utility billing, and 311 service requests. What do you need?"
);
