# Micro-frontends

Each micro-frontend exposes one custom element as its DOM contract:

- `flow-builder-mf`: `<flow-builder>`
- `campaign-manager-mf`: `<campaign-manager>`
- `user-manager-mf`: `<user-manager>`
- `analytics-dashboard-mf`: `<analytics-dashboard>`

Browser events are the integration boundary. For example, `flow-builder` emits `flowSaved` and `flowSelected`.

Run one micro-frontend locally:

```powershell
cd frontend/flow-builder-mf
npm install
npm run dev
```

Run the composed shell through Docker:

```powershell
docker compose up --build frontend-proxy
```

