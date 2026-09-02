import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { CartProvider } from './hooks/useCart';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import CompleteProfilePage from './pages/auth/CompleteProfilePage';
import SellerRegisterPage from './pages/auth/SellerRegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import SellerLayout from './pages/seller/SellerLayout';
import SellerDashboard from './pages/seller/SellerDashboard';
import SellerProductsPage from './pages/seller/SellerProductsPage';
import SellerAddProductPage from './pages/seller/SellerAddProductPage';
import SellerOrdersPage from './pages/seller/SellerOrdersPage';
import SellerEarningsPage from './pages/seller/SellerEarningsPage';
import SellerShopProfilePage from './pages/seller/SellerShopProfilePage';
import SellerAccountSettingsPage from './pages/seller/SellerAccountSettingsPage';
import AdminPlaceholderPage from './pages/admin/AdminPlaceholderPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminBuyerApplicationsPage from './pages/admin/AdminBuyerApplicationsPage';
import AdminSellerApplicationsPage from './pages/admin/AdminSellerApplicationsPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminActivityLogPage from './pages/admin/AdminActivityLogPage';
import AdminOrdersPage from './pages/admin/AdminOrdersPage';
import AdminPaymentsPage from './pages/admin/AdminPaymentsPage';
import AdminDisputesPage from './pages/admin/AdminDisputesPage';
import AdminReviewsPage from './pages/admin/AdminReviewsPage';
import AdminProductsPage from './pages/admin/AdminProductsPage';
import AdminProductReviewPage from './pages/admin/AdminProductReviewPage';
import AdminMessagesPage from './pages/admin/AdminMessagesPage';
import AdminReportsPage from './pages/admin/AdminReportsPage';
import AdminPlatformSettingsPage from './pages/admin/AdminPlatformSettingsPage';
import AdminCategoriesPage from './pages/admin/AdminCategoriesPage';
import SellerReportsPage from './pages/seller/SellerReportsPage';
import SellerMessagesPage from './pages/seller/SellerMessagesPage';
import BuyerMessagesPage from './pages/buyer/BuyerMessagesPage';
import BuyerFloatingChat from './components/chat/BuyerFloatingChat';
import { ChatProvider } from './hooks/useChat';
import HomePage from './pages/HomePage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import CatalogPage from './pages/CatalogPage';
import ProductDetailPage from './pages/ProductDetailPage';
import ShopProfilePage from './pages/ShopProfilePage';
import PrivacyPolicyPage from './pages/legal/PrivacyPolicyPage';
import TermsOfServicePage from './pages/legal/TermsOfServicePage';
import CookiePolicyPage from './pages/legal/CookiePolicyPage';
import SafetyHelpPage from './pages/help/SafetyHelpPage';
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

function isProfileIncomplete(user: ReturnType<typeof useAuth>['user']) {
  return user?.role === 'buyer' && (!user.date_of_birth || !user.sex || !user.government_id_type);
}

function RequireApprovedSeller({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.seller_profile?.application_status !== 'approved') return <Navigate to="/register/seller" replace />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isProfileIncomplete(user)) return <Navigate to="/complete-profile" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function SuspendedScreen() {
  const { clearAuth } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-2xl shadow-xl border border-red-100 max-w-md w-full p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-brand-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h1 className="text-xl font-black text-gray-900 mb-2">Account Suspended</h1>
        <p className="text-sm text-gray-500 mb-6">
          Your account has been suspended due to a violation of our platform
          rules or policies. If you believe this is a mistake, please contact
          our support team for assistance.
        </p>
        <button
          onClick={clearAuth}
          className="w-full py-2.5 rounded-xl bg-brand-red text-white text-sm font-bold hover:bg-[#8a2424] transition-colors"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading, suspended } = useAuth();
  if (loading) return null;
  if (suspended) return <SuspendedScreen />;

  return (
    <Routes>
      {/* Guest-first: homepage is always accessible; admin is redirected to their dashboard */}
      <Route
        path="/"
        element={
          isProfileIncomplete(user)
            ? <Navigate to="/complete-profile" replace />
            : user?.role === 'admin'
            ? <Navigate to="/admin" replace />
            : <HomePage />
        }
      />
      <Route path="/cart" element={<CartPage />} />
      <Route
        path="/checkout"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : (
            <CheckoutPage />
          )
        }
      />
      <Route path="/search" element={<CatalogPage />} />
      <Route path="/category/:parentId" element={<CatalogPage />} />
      <Route path="/products/:id" element={<ProductDetailPage />} />
      <Route path="/shop/:slug" element={<ShopProfilePage />} />
      <Route path="/store/:id" element={<ShopProfilePage />} />

      {/* Auth pages — redirect away if already logged in */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route path="/register/seller" element={<SellerRegisterPage />} />
      <Route
        path="/complete-profile"
        element={
          !user
            ? <Navigate to="/login" replace />
            : isProfileIncomplete(user)
            ? <CompleteProfilePage />
            : <Navigate to="/" replace />
        }
      />
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
        <Route path="messages"      element={<BuyerMessagesPage />} />
        <Route path="addresses"     element={<SettingsAddresses />} />
        <Route path="orders"        element={<SettingsOrders />} />
        <Route path="returns"       element={<SettingsReturns />} />
        <Route path="cancellations" element={<SettingsCancellations />} />
        <Route path="reviews"       element={<SettingsReviews />} />
        <Route path="wishlist"      element={<SettingsWishlist />} />
      </Route>

      {/* Seller — nested layout, all routes approved-seller-gated */}
      <Route
        path="/seller"
        element={
          <RequireApprovedSeller>
            <SellerLayout />
          </RequireApprovedSeller>
        }
      >
        <Route index element={<SellerDashboard />} />
        <Route path="products"         element={<SellerProductsPage />} />
        <Route path="products/new"      element={<SellerAddProductPage />} />
        <Route path="products/:id/edit" element={<SellerAddProductPage />} />
        <Route path="orders"            element={<SellerOrdersPage />} />
        <Route path="inventory"         element={<AdminPlaceholderPage title="Inventory / Stock" />} />
        <Route path="earnings"          element={<SellerEarningsPage />} />
        <Route path="payouts"           element={<SellerEarningsPage />} />
        <Route path="reports"           element={<SellerReportsPage />} />
        <Route path="messages"          element={<SellerMessagesPage />} />
        <Route path="reviews"           element={<AdminPlaceholderPage title="Reviews & Ratings" />} />
        <Route path="shop-profile"      element={<SellerShopProfilePage />} />
        <Route path="account"           element={<SellerAccountSettingsPage />} />
      </Route>
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
        <Route path="messages"            element={<AdminMessagesPage />} />
        <Route path="buyer-applications"  element={<AdminBuyerApplicationsPage />} />
        <Route path="seller-applications" element={<AdminSellerApplicationsPage />} />
        <Route path="rider-applications"  element={<AdminPlaceholderPage title="Rider Applications" />} />
        <Route path="sellers"             element={<AdminUsersPage />} />
        <Route path="buyers"              element={<AdminUsersPage />} />
        <Route path="riders"              element={<AdminUsersPage />} />
        <Route path="categories"          element={<AdminCategoriesPage />} />
        <Route path="products"            element={<AdminProductsPage />} />
        <Route path="products/:id"        element={<AdminProductReviewPage />} />
        <Route path="products/:id/review" element={<AdminProductReviewPage />} />
        <Route path="orders"              element={<AdminOrdersPage />} />
        <Route path="payments"            element={<AdminPaymentsPage />} />
        <Route path="disputes"            element={<AdminDisputesPage />} />
        <Route path="reviews"             element={<AdminReviewsPage />} />
        <Route path="reports"             element={<AdminReportsPage />} />
        <Route path="settings"            element={<AdminPlatformSettingsPage />} />
        <Route path="activity-log"        element={<AdminActivityLogPage />} />
      </Route>

      <Route path="/privacy-policy"   element={<PrivacyPolicyPage />} />
      <Route path="/terms-of-service"  element={<TermsOfServicePage />} />
      <Route path="/cookie-policy"     element={<CookiePolicyPage />} />
      <Route path="/help/safety"       element={<SafetyHelpPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <ChatProvider>
            <ScrollToTop />
            <AppRoutes />
            <BuyerFloatingChat />
          </ChatProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
