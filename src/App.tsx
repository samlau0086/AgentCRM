/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./Layout";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import EditCustomer from "./pages/EditCustomer";
import Sales from "./pages/Sales";
import Media from "./pages/Media";
import Inbox from "./pages/Inbox";
import KnowledgeBase from "./pages/KnowledgeBase";
import AgentCenter from "./pages/AgentCenter";
import Settings from "./pages/Settings";
import UserManagement from "./pages/UserManagement";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import { LanguageProvider } from "./i18n";
import { ThemeProvider } from "./theme";
import { startAgentScheduler } from "./services/agentScheduler";
import { hydrateCrmDataFromServer } from "./services/db";
import { loadAppSettingsFromServer } from "./services/appSettings";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem("crm_logged_in") === "true";
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    Promise.allSettled([
      loadAppSettingsFromServer(),
      hydrateCrmDataFromServer(),
    ]).catch(console.error);
    return startAgentScheduler();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <ThemeProvider>
        <Login onLogin={() => setIsAuthenticated(true)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <LanguageProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="customers/:id/edit" element={<EditCustomer />} />
              <Route path="sales" element={<Sales />} />
              <Route path="media" element={<Media />} />
              <Route path="inbox" element={<Inbox />} />
              <Route path="knowledge" element={<KnowledgeBase />} />
              <Route path="agent-center" element={<AgentCenter />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="profile" element={<Profile />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  );
}
