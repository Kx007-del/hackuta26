import React from "react";
import { createRoot } from "react-dom/client";
import App from "./FortniteShowcase";
import "./styles.css";
import "./showcase-polish.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
