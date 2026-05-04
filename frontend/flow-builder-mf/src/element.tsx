import "@xyflow/react/dist/style.css";
import "./style.css";
import React, { useCallback, useEffect, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { addEdge, Background, Controls, Edge, Node, ReactFlow, useEdgesState, useNodesState } from "@xyflow/react";

const initialNodes: Node[] = [
  { id: "welcome", position: { x: 40, y: 80 }, data: { label: "Welcome message", content: "Hi, ready to talk?" } },
  { id: "qualify", position: { x: 320, y: 80 }, data: { label: "Lead question", content: "What is your team size?" } }
];
const initialEdges: Edge[] = [{ id: "welcome-qualify", source: "welcome", target: "qualify" }];

function FlowBuilder({ apiBase }: { apiBase: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [name, setName] = useState("Lead Qualification");
  const [flows, setFlows] = useState<Array<{ id: string; name: string; version: number }>>([]);
  const token = localStorage.getItem("mockingbirdToken");

  const loadFlows = useCallback(async () => {
    const response = await fetch(`${apiBase}/flows`, {
      headers: { authorization: token ? `Bearer ${token}` : "" }
    });
    if (response.ok) setFlows(await response.json());
  }, [apiBase, token]);

  useEffect(() => {
    void loadFlows();
  }, [loadFlows]);

  const save = async () => {
    const response = await fetch(`${apiBase}/flows`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: token ? `Bearer ${token}` : "" },
      body: JSON.stringify({ name, nodes, edges })
    });
    const flow = await response.json();
    await loadFlows();
    window.dispatchEvent(new CustomEvent("flowSaved", { detail: flow }));
    window.dispatchEvent(new CustomEvent("flowSelected", { detail: { flowId: flow.id } }));
  };

  const addMessageNode = () => {
    const id = `message-${nodes.length + 1}`;
    setNodes((current) => [
      ...current,
      {
        id,
        position: { x: 120 + current.length * 80, y: 220 },
        data: { label: "Message", content: "New step" }
      }
    ]);
  };

  const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <div className="mf">
      <header>
        <input value={name} onChange={(event) => setName(event.target.value)} />
        <button onClick={addMessageNode}>Add node</button>
        <button onClick={save}>Save</button>
      </header>
      <aside className="flow-list">
        {flows.map((flow) => (
          <button key={flow.id} onClick={() => window.dispatchEvent(new CustomEvent("flowSelected", { detail: { flowId: flow.id } }))}>
            {flow.name} v{flow.version}
          </button>
        ))}
      </aside>
      <div className="canvas">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

class FlowBuilderElement extends HTMLElement {
  private root?: Root;

  connectedCallback() {
    this.root = createRoot(this);
    this.root.render(<FlowBuilder apiBase={this.getAttribute("api-base") ?? "http://localhost:8080/api/v1"} />);
  }

  disconnectedCallback() {
    this.root?.unmount();
  }
}

if (!customElements.get("flow-builder")) {
  customElements.define("flow-builder", FlowBuilderElement);
}
