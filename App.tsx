import { Routes, Route, Link } from "react-router-dom";
import { Home } from "lucide-react";
import Display from "./Display";
import HomePage from "./HomePage";

export default function App() {
  return (
    <div>

      <Routes>
        <Route path="/" element={<Display />} />
        <Route path="/home" element={<HomePage />} />
      </Routes>
    </div>
  );
}
