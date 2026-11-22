// The household dashboard is served by the Node service (server/ui.mjs),
// which reads the plan from SQLite. This Next.js entry carries no plan data.
export default function Home() {
  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="large-empty">
          <h3>Kitchen Plan runs on the kitchen server</h3>
          <p>Start it with <code>npm start</code> and open the private app address. See deploy/operations.md.</p>
        </div>
      </section>
    </main>
  );
}
