import { useState } from "react";
import { Outlet } from "react-router-dom";
import SideMenu from "./SideMenu";
import Header from "./Header";

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app-layout">
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={closeSidebar}
        />
      )}
      <SideMenu isOpen={sidebarOpen} onNavigate={closeSidebar} />
      <main className="main-content">
        <Header onMenuToggle={() => setSidebarOpen((open) => !open)} />
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
