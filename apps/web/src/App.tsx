import { Route, Routes } from 'react-router';

function Home() {
  return <h1 className="p-6 text-2xl font-semibold">Logbook</h1>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}
