import { NavLink, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Wall } from "./pages/Wall";
import { Chog } from "./pages/Chog";
import { About, NotFound } from "./pages/Info";
import { Pack } from "./pages/Pack";
import { CardPage, Collection, LastPrints, Odds } from "./pages/Mine";
import { Duel } from "./pages/Duel";
import { Album, Inbox } from "./pages/Album";

export function App() {
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <header className="top">
        <NavLink to="/" className="logo" aria-label="Last Print home">Last Print</NavLink>
        <nav aria-label="Main">
          <NavLink to="/pack">Pack</NavLink>
          <NavLink to="/wall">Wall</NavLink>
          <NavLink to="/duel">Duel</NavLink>
          <NavLink to="/collection">My cards</NavLink>
        </nav>
      </header>
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pack" element={<Pack />} />
          <Route path="/wall" element={<Wall />} />
          <Route path="/chog/:id" element={<Chog />} />
          <Route path="/collection" element={<Collection />} />
          <Route path="/duel" element={<Duel />} />
          <Route path="/album" element={<Album />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/card/:id" element={<CardPage />} />
          <Route path="/last-prints" element={<LastPrints />} />
          <Route path="/odds" element={<Odds />} />
          <Route path="/how" element={<About />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="foot">
        <p>Chog Genesis art by CHOGLABS. Unofficial Chogathon entry.</p>
        <nav className="foot__links" aria-label="More">
          <NavLink to="/how">How it works</NavLink>
          <NavLink to="/odds">Odds and fairness</NavLink>
          <NavLink to="/last-prints">Hall of Last Prints</NavLink>
          <NavLink to="/album">Albums</NavLink>
          <NavLink to="/inbox">Alerts</NavLink>
        </nav>
      </footer>
    </>
  );
}
