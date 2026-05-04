import "@xyflow/react/dist/style.css";
import "./style.css";
import React, { useCallback, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import ReactFlow, { addEdge, Background, Controls, Edge, Node, useEdgesState, useNodesState } from "@xyflow/react";

const initialNodes: Node[] = [
  { id: "welcome", position: { x: 40, y: 80 }, data: { label: "Welcome message", content: "Hi, ready to talk?" } },
  { id: "qualify", position: { x: 320, y: 80 }, data: { label: "Lead question", content: "What is your team size?" } }
];
const initialEdges: Edge[] = [{ id: "welcome-qualify", source: "welcome", target: "qualify" }];

function FlowBuilder({ apiBase }: { apiBase: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [name, setName] = useState("Lead Qualification");

  const save = async () => {
    const response = await fetch(`${apiBase}/flows`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: localStorage.getItem("mockingbirdToken") ? `Bearer ${localStorage.getItem("mockingbirdToken")}` : "" },
      body: JSON.stringify({ name, nodes, edges })
    });
    const flow = await response.json();
    window.dispatchEvent(new CustomEvent("flowSaved", { detail: flow }));
    window.dispatchEvent(new CustomEvent("flowSelected", { detail: { flowId: flow.id } }));
  };

  const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <div className="mf">
      <header>
        <input value={name} onChange={(event) => setName(event.target.value)} />
        <button onClick={save}>Save</button>
      </header>
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

