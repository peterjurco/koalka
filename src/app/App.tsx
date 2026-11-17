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
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <div className="app-header-brand">
            <img className="app-logo" src={`${import.meta.env.BASE_URL}favicon-96x96.png`} alt="" />
            <div className="app-header-titles">
              <h1>Koalka</h1>
              <p className="tagline">Koaličná kalkulačka</p>
            </div>
          </div>
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
      </header>

      <main className="app-main">
        {page === "trendy" && <TrendyPage />}
        {page === "koalicie" && <CoalitionPage />}
      </main>

      <footer className="app-footer">
        Prieskumy: AKO, Focus, Ipsos, NMS. Prepočet na mandáty a koalície je
        vlastný výpočet Koalky.
      </footer>
    </div>
  );
}

export default App;
