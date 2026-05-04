import "./style.css";
import React, { useEffect, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Metrics = { flowId: string; messagesSent: number; messagesFailed: number; conversions: number; successRate: number };

function AnalyticsDashboard({ apiBase, flowId }: { apiBase: string; flowId?: string }) {
  const [metrics, setMetrics] = useState<Metrics>({ flowId: flowId ?? "unknown", messagesSent: 0, messagesFailed: 0, conversions: 0, successRate: 0 });
  const token = localStorage.getItem("mockingbirdToken");

  useEffect(() => {
    if (!flowId) return;
    fetch(`${apiBase}/analytics/${flowId}`, { headers: { authorization: token ? `Bearer ${token}` : "" } })
      .then((response) => response.json())
      .then(setMetrics)
      .catch(() => undefined);
  }, [apiBase, flowId, token]);

  const chart = [
    { name: "Sent", value: metrics.messagesSent },
    { name: "Failed", value: metrics.messagesFailed },
    { name: "Conversions", value: metrics.conversions }
  ];

  return (
    <div className="analytics-mf">
      <header>
        <h2>Analytics</h2>
        <span>{metrics.flowId}</span>
      </header>
      <div className="kpis">
        <article><strong>{metrics.messagesSent}</strong><span>sent</span></article>
        <article><strong>{metrics.messagesFailed}</strong><span>failed</span></article>
        <article><strong>{Math.round(metrics.successRate * 100)}%</strong><span>success</span></article>
      </div>
      <div className="chart">
        <ResponsiveContainer>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" fill="#0e5a53" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

class AnalyticsDashboardElement extends HTMLElement {
  private root?: Root;
  static get observedAttributes() {
    return ["flow-id"];
  }
  connectedCallback() {
    this.render();
  }
  attributeChangedCallback() {
    this.render();
  }
  disconnectedCallback() {
    this.root?.unmount();
  }
  private render() {
    this.root ??= createRoot(this);
    this.root.render(<AnalyticsDashboard apiBase={this.getAttribute("api-base") ?? "http://localhost:8080/api/v1"} flowId={this.getAttribute("flow-id") ?? undefined} />);
  }
}
if (!customElements.get("analytics-dashboard")) customElements.define("analytics-dashboard", AnalyticsDashboardElement);

