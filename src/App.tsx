/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './Layout';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import EditCustomer from './pages/EditCustomer';
import Inbox from './pages/Inbox';
import KnowledgeBase from './pages/KnowledgeBase';
import AgentCenter from './pages/AgentCenter';
import Settings from './pages/Settings';
import UserManagement from './pages/UserManagement';
import { LanguageProvider } from './i18n';
import { ThemeProvider } from './theme';

export default function App() {
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
              <Route path="inbox" element={<Inbox />} />
              <Route path="knowledge" element={<KnowledgeBase />} />
              <Route path="agent-center" element={<AgentCenter />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  );
}
