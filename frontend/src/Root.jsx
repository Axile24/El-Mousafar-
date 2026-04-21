import { useEffect, useState } from "react";
import App from "./App.jsx";
import AccountView from "./AccountView.jsx";

function routeFromHash() {
  if (typeof window === "undefined") return "app";
  const h = window.location.hash.replace(/^#\/?/, "");
  const pathOnly = h.split("?")[0];
  const seg0 = pathOnly.split("/")[0] || "";
  if (seg0 === "compte" || seg0 === "account") return "account";
  if (seg0 === "chauffeur" || seg0 === "driver") return "account";
  return "app";
}

export default function Root() {
  const [route, setRoute] = useState(() => routeFromHash());

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (route === "account") return <AccountView />;
  return <App />;
}
