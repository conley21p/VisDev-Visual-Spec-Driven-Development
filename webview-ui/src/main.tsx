import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ReactFlowProvider } from 'reactflow';

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  </React.StrictMode>
);
