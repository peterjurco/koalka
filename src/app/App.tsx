import { useEffect, useState } from "react";
import {
  DEFAULT_COUNTRY_ID,
  DEFAULT_ELECTION_ID,
} from "../config/elections.ts";
import { CoalitionPage } from "../features/coalitions/CoalitionPage.tsx";
import { TrendyPage } from "../features/trends/TrendyPage.tsx";
import "../index.css";
import { useStore } from "../state/store.ts";

type Page = "trendy" | "koalicie";

function App() {
  const { setElection, config, loading, error } = useStore();
  const [page, setPage] = useState<Page>("trendy");

  useEffect(() => {
    setElection(DEFAULT_COUNTRY_ID, DEFAULT_ELECTION_ID);
  }, [setElection]);

  if (loading && !config) {
    return (
      <div className="app">
        <h1>🐨 Koalka</h1>
        <p>Načítavam…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <h1>🐨 Koalka</h1>
        <p className="error">{error}</p>
      </div>
    );
  }

  return (
    <div className={`app ${page === "trendy" ? "app--trendy-full" : ""}`}>
      <header className="app-header">
        <div className="app-header-top">
          <h1>🐨 Koalka</h1>
          <nav className="app-nav" aria-label="Hlavná navigácia">
            <button
              type="button"
              className={`app-nav-link ${page === "trendy" ? "active" : ""}`}
              onClick={() => setPage("trendy")}
            >
              Trendy
            </button>
            <button
              type="button"
              className={`app-nav-link ${page === "koalicie" ? "active" : ""}`}
              onClick={() => setPage("koalicie")}
            >
              Koalície
            </button>
          </nav>
        </div>
        <p className="tagline">Koaličná kalkulačka</p>
      </header>

      <main className="app-main">
        {page === "trendy" && <TrendyPage />}
        {page === "koalicie" && <CoalitionPage />}
      </main>
    </div>
  );
}

export default App;
