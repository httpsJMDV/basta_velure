import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import SellerRegisterPage from './pages/auth/SellerRegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import SellerDashboard from './pages/seller/SellerDashboard';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminSellerApplicationsPage from './pages/admin/AdminSellerApplicationsPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminActivityLogPage from './pages/admin/AdminActivityLogPage';
import AdminPlaceholderPage from './pages/admin/AdminPlaceholderPage';
import HomePage from './pages/HomePage';
import CartPage from './pages/CartPage';
import PrivacyPolicyPage from './pages/legal/PrivacyPolicyPage';
import TermsOfServicePage from './pages/legal/TermsOfServicePage';
import CookiePolicyPage from './pages/legal/CookiePolicyPage';
import {
  SettingsLayout,
  SettingsAccount,
  SettingsAddresses,
  SettingsOrders,
  SettingsReturns,
  SettingsCancellations,
  SettingsReviews,
  SettingsWishlist,
} from './pages/SettingsPage';
import type { ReactNode } from 'react';
import type { Role } from './types';
import ScrollToTop from './components/ScrollToTop';

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      {/* Guest-first: homepage is always accessible */}
      <Route path="/" element={<HomePage />} />
      <Route path="/cart" element={<CartPage />} />

      {/* Auth pages — redirect away if already logged in */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route path="/register/seller" element={<SellerRegisterPage />} />
      <Route path="/forgot-password" element={user ? <Navigate to="/" replace /> : <ForgotPasswordPage />} />
      <Route path="/reset-password" element={user ? <Navigate to="/" replace /> : <ResetPasswordPage />} />

      {/* Settings — requires login */}
      <Route
        path="/settings"
        element={
          <RequireRole roles={['buyer', 'seller', 'admin', 'rider']}>
            <SettingsLayout />
          </RequireRole>
        }
      >
        <Route index element={<SettingsAccount />} />
        <Route path="addresses"     element={<SettingsAddresses />} />
        <Route path="orders"        element={<SettingsOrders />} />
        <Route path="returns"       element={<SettingsReturns />} />
        <Route path="cancellations" element={<SettingsCancellations />} />
        <Route path="reviews"       element={<SettingsReviews />} />
        <Route path="wishlist"      element={<SettingsWishlist />} />
      </Route>

      {/* Protected role routes */}
      <Route
        path="/seller/dashboard"
        element={
          <RequireRole roles={['seller']}>
            <SellerDashboard />
          </RequireRole>
        }
      />
      {/* Admin — nested layout, all routes role-gated */}
      <Route
        path="/admin"
        element={
          <RequireRole roles={['admin']}>
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="seller-applications" element={<AdminSellerApplicationsPage />} />
        <Route path="rider-applications"  element={<AdminPlaceholderPage title="Rider Applications" />} />
        <Route path="sellers"             element={<AdminUsersPage />} />
        <Route path="buyers"              element={<AdminUsersPage />} />
        <Route path="riders"              element={<AdminUsersPage />} />
        <Route path="categories"          element={<AdminPlaceholderPage title="Categories" />} />
        <Route path="products"            element={<AdminPlaceholderPage title="Products" />} />
        <Route path="orders"              element={<AdminPlaceholderPage title="Orders" />} />
        <Route path="payments"            element={<AdminPlaceholderPage title="Payments & Payouts" />} />
        <Route path="disputes"            element={<AdminPlaceholderPage title="Disputes / Returns" />} />
        <Route path="reviews"             element={<AdminPlaceholderPage title="Reviews" />} />
        <Route path="reports"             element={<AdminPlaceholderPage title="Reports" />} />
        <Route path="settings"            element={<AdminPlaceholderPage title="Platform Settings" />} />
        <Route path="activity-log"        element={<AdminActivityLogPage />} />
      </Route>

      <Route path="/privacy-policy"   element={<PrivacyPolicyPage />} />
      <Route path="/terms-of-service"  element={<TermsOfServicePage />} />
      <Route path="/cookie-policy"     element={<CookiePolicyPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
