import React from "react";
import { Scroll3DSection } from "./components/Scroll3DSection.jsx";
import { scroll3dConfig } from "./config/scroll3dConfig.js";

export default function App() {
  return <Scroll3DSection config={scroll3dConfig} />;
}
