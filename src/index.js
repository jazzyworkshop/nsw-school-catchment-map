import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Actively unregister and clear any existing service workers causing network hangs
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (let registration of registrations) {
      registration.unregister().then(() => {
        console.log("🧹 Broken Service Worker successfully cleared out.");
      });
    }
  }).catch((error) => {
    console.error("Error clearing service worker:", error);
  });
}

reportWebVitals();