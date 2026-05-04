import "./shared.css";
import React, { useState } from "react";
import { createRoot, Root } from "react-dom/client";

function CampaignManager({ apiBase }: { apiBase: string }) {
  const [form, setForm] = useState({ name: "May Reactivation", flowId: "", tag: "lead", schedule: "" });
  const [status, setStatus] = useState("draft");
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; status: string; flow_id: string }>>([]);
  const token = localStorage.getItem("mockingbirdToken");

  async function loadCampaigns() {
    const response = await fetch(`${apiBase}/campaigns`, { headers: { authorization: token ? `Bearer ${token}` : "" } });
    if (response.ok) setCampaigns(await response.json());
  }

  async function createCampaign() {
    const response = await fetch(`${apiBase}/campaigns`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: token ? `Bearer ${token}` : "" },
      body: JSON.stringify({ name: form.name, flowId: form.flowId, segmentation: { tag: form.tag }, schedule: form.schedule || "now" })
    });
    const campaign = await response.json();
    setStatus(campaign.status ?? "created");
    await loadCampaigns();
    window.dispatchEvent(new CustomEvent("campaignCreated", { detail: campaign }));
  }

  async function activateCampaign(id: string) {
    const response = await fetch(`${apiBase}/campaigns/${id}/activate`, {
      method: "POST",
      headers: { authorization: token ? `Bearer ${token}` : "" }
    });
    setStatus(response.ok ? "activated" : "activation failed");
    await loadCampaigns();
  }

  return (
    <div className="panel">
      <h2>Campaigns</h2>
      <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Name" />
      <input value={form.flowId} onChange={(event) => setForm({ ...form, flowId: event.target.value })} placeholder="Flow ID" />
      <input value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} placeholder="Segment tag" />
      <input value={form.schedule} onChange={(event) => setForm({ ...form, schedule: event.target.value })} placeholder="Cron or blank for immediate" />
      <button onClick={createCampaign}>Create</button>
      <button onClick={loadCampaigns}>Refresh</button>
      <strong>{status}</strong>
      <div className="rows">
        {campaigns.map((campaign) => (
          <article key={campaign.id}>
            <span>{campaign.name}</span>
            <small>{campaign.status}</small>
            <button onClick={() => activateCampaign(campaign.id)}>Activate</button>
          </article>
        ))}
      </div>
    </div>
  );
}

class CampaignManagerElement extends HTMLElement {
  private root?: Root;
  connectedCallback() {
    this.root = createRoot(this);
    this.root.render(<CampaignManager apiBase={this.getAttribute("api-base") ?? "http://localhost:8080/api/v1"} />);
  }
  disconnectedCallback() {
    this.root?.unmount();
  }
}
if (!customElements.get("campaign-manager")) customElements.define("campaign-manager", CampaignManagerElement);
