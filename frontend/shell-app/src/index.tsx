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
  const apiBase = "http://localhost:8080/api/v1";

  useEffect(() => {
    void remotes[view]?.();
  }, [view]);

  useEffect(() => {
    const onFlowSelected = (event: Event) => setSelectedFlowId((event as CustomEvent<{ flowId: string }>).detail.flowId);
    window.addEventListener("flowSelected", onFlowSelected);
    return () => window.removeEventListener("flowSelected", onFlowSelected);
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">Operation MOCKINGBIRD</div>
        <span>demo tenant</span>
      </header>
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
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

