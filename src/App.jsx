import { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import { ConfirmDialog, Toasts } from './components/Toasts.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Donations from './pages/Donations.jsx';
import Riders from './pages/Riders.jsx';
import Shelters from './pages/Shelters.jsx';
import DispatchCenter from './pages/DispatchCenter.jsx';
import FailureSimulator from './pages/FailureSimulator.jsx';
import ActivityLogs from './pages/ActivityLogs.jsx';

const PAGES = {
  overview: Dashboard,
  donations: Donations,
  riders: Riders,
  shelters: Shelters,
  dispatch: DispatchCenter,
  simulator: FailureSimulator,
  logs: ActivityLogs,
};

function Shell() {
  const { route } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const Page = PAGES[route.page] ?? Dashboard;
  return (
    <div className="app">
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <div className="main">
        <Header onMenu={() => setMenuOpen((o) => !o)} />
        <Page />
      </div>
      <Toasts />
      <ConfirmDialog />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
