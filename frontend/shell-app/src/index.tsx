import "./styles.css";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const remotes: Record<string, () => Promise<unknown>> = {
  flows: () => import("flowBuilder/element"),
  campaigns: () => import("campaignManager/element"),
  users: () => import("userManager/element"),
  analytics: () => import("analyticsDashboard/element")
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "flow-builder": { "api-base": string };
      "campaign-manager": { "api-base": string };
      "user-manager": { "api-base": string };
      "analytics-dashboard": { "api-base": string; "flow-id"?: string };
    }
  }
}

function App() {
  const [view, setView] = useState("flows");
  const [selectedFlowId, setSelectedFlowId] = useState<string>();
  const [email, setEmail] = useState("admin@mockingbird.local");
  const [password, setPassword] = useState("mockingbird");
  const [token, setToken] = useState(() => localStorage.getItem("mockingbirdToken") ?? "");
  const [loginError, setLoginError] = useState("");
  const apiBase = "http://localhost:8080/api/v1";

  useEffect(() => {
    void remotes[view]?.();
  }, [view]);

  useEffect(() => {
    const onFlowSelected = (event: Event) => setSelectedFlowId((event as CustomEvent<{ flowId: string }>).detail.flowId);
    window.addEventListener("flowSelected", onFlowSelected);
    return () => window.removeEventListener("flowSelected", onFlowSelected);
  }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoginError("");
    const response = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      setLoginError("Invalid credentials");
      return;
    }
    const payload = await response.json();
    localStorage.setItem("mockingbirdToken", payload.token);
    setToken(payload.token);
  }

  function logout() {
    localStorage.removeItem("mockingbirdToken");
    setToken("");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">Operation MOCKINGBIRD</div>
        {token ? <button className="session" onClick={logout}>Sign out</button> : <span>demo tenant</span>}
      </header>
      {!token ? (
        <form className="login" onSubmit={login}>
          <h1>Command console</h1>
          <input value={email} onChange={(event) => setEmail(event.target.value)} aria-label="Email" />
          <input value={password} onChange={(event) => setPassword(event.target.value)} aria-label="Password" type="password" />
          <button type="submit">Sign in</button>
          {loginError && <strong>{loginError}</strong>}
        </form>
      ) : (
        <div className="workspace">
          <nav className="nav">
            {["flows", "campaigns", "users", "analytics"].map((item) => (
              <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>
                {item}
              </button>
            ))}
          </nav>
          <section className="surface">
            {view === "flows" && <flow-builder api-base={apiBase} />}
            {view === "campaigns" && <campaign-manager api-base={apiBase} />}
            {view === "users" && <user-manager api-base={apiBase} />}
            {view === "analytics" && <analytics-dashboard api-base={apiBase} flow-id={selectedFlowId} />}
          </section>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
