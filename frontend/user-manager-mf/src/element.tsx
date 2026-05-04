import "./style.css";
import React, { useState } from "react";
import { createRoot, Root } from "react-dom/client";

type User = { id: string; name: string; phone: string; tags: string[] };

function UserManager({ apiBase }: { apiBase: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ name: "Ada Lovelace", phone: "+1555010101", tags: "lead,founder" });
  const token = localStorage.getItem("mockingbirdToken");

  async function createUser() {
    const response = await fetch(`${apiBase}/users`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: token ? `Bearer ${token}` : "" },
      body: JSON.stringify({ name: form.name, phone: form.phone, tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean), credits: 10 })
    });
    const user = await response.json();
    setUsers((current) => [user, ...current]);
    window.dispatchEvent(new CustomEvent("userCreated", { detail: user }));
  }

  async function loadLeads() {
    const response = await fetch(`${apiBase}/users?tag=lead`, { headers: { authorization: token ? `Bearer ${token}` : "" } });
    setUsers(await response.json());
  }

  return (
    <div className="user-mf">
      <section className="editor">
        <h2>Users</h2>
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
        <div>
          <button onClick={createUser}>Add</button>
          <button className="secondary" onClick={loadLeads}>Load leads</button>
        </div>
      </section>
      <section className="list">
        {users.map((user) => (
          <article key={user.id}>
            <strong>{user.name}</strong>
            <span>{user.phone}</span>
            <small>{user.tags.join(", ")}</small>
          </article>
        ))}
      </section>
    </div>
  );
}

class UserManagerElement extends HTMLElement {
  private root?: Root;
  connectedCallback() {
    this.root = createRoot(this);
    this.root.render(<UserManager apiBase={this.getAttribute("api-base") ?? "http://localhost:8080/api/v1"} />);
  }
  disconnectedCallback() {
    this.root?.unmount();
  }
}
if (!customElements.get("user-manager")) customElements.define("user-manager", UserManagerElement);

