import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { CartProvider } from './hooks/useCart';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import CompleteProfilePage from './pages/auth/CompleteProfilePage';
import SellerRegisterPage from './pages/auth/SellerRegisterPage';
import HubRegisterPage from './pages/auth/HubRegisterPage';
import CourierRegisterPage from './pages/auth/CourierRegisterPage';
import LogisticsLayout from './pages/logistics/LogisticsLayout';
import LogisticsDashboardPage from './pages/logistics/LogisticsDashboardPage';
import LogisticsHubsPage from './pages/logistics/LogisticsHubsPage';
import LogisticsRidersPage from './pages/logistics/LogisticsRidersPage';
import LogisticsParcelsPage from './pages/logistics/LogisticsParcelsPage';
import LogisticsReportsPage from './pages/logistics/LogisticsReportsPage';
import LogisticsMoneyPage from './pages/logistics/LogisticsMoneyPage';
import LogisticsShippingPage from './pages/logistics/LogisticsShippingPage';
import AdminCourierApplicationsPage from './pages/admin/AdminCourierApplicationsPage';
import HubLoginPage from './pages/auth/HubLoginPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';
import RiderActivatePage from './pages/auth/RiderActivatePage';
import RiderLoginPage from './pages/auth/RiderLoginPage';
import RiderLayout from './pages/rider/RiderLayout';
import RiderDashboardPage from './pages/rider/RiderDashboardPage';
import RiderDeliveriesPage from './pages/rider/RiderDeliveriesPage';
import RiderPickupsPage from './pages/rider/RiderPickupsPage';
import RiderEarningsPage from './pages/rider/RiderEarningsPage';
import RiderAccountPage from './pages/rider/RiderAccountPage';
import HubLayout from './pages/hub/HubLayout';
import HubDashboardPage from './pages/hub/HubDashboardPage';
import HubIntakePage from './pages/hub/HubIntakePage';
import HubDeliveriesPage from './pages/hub/HubDeliveriesPage';
import HubDispatchPage from './pages/hub/HubDispatchPage';
import HubSortingPage from './pages/hub/HubSortingPage';
import HubRidersPage from './pages/hub/HubRidersPage';
import HubReportsPage from './pages/hub/HubReportsPage';
import HubEarningsPage from './pages/hub/HubEarningsPage';
import HubMessagesPage from './pages/hub/HubMessagesPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import SellerLayout from './pages/seller/SellerLayout';
import SellerDashboard from './pages/seller/SellerDashboard';
import SellerProductsPage from './pages/seller/SellerProductsPage';
import SellerAddProductPage from './pages/seller/SellerAddProductPage';
import SellerOrdersPage from './pages/seller/SellerOrdersPage';
import WaybillPage from './pages/seller/WaybillPage';
import SellerEarningsPage from './pages/seller/SellerEarningsPage';
import SellerPaymentsPage from './pages/seller/SellerPaymentsPage';
import SellerShopProfilePage from './pages/seller/SellerShopProfilePage';
import SellerStoreCategoriesPage from './pages/seller/SellerStoreCategoriesPage';
import SellerPromotionsPage from './pages/seller/SellerPromotionsPage';
import SellerReviewsPage from './pages/seller/SellerReviewsPage';
import SellerVouchersPage from './pages/seller/SellerVouchersPage';
import AdminVouchersPage from './pages/admin/AdminVouchersPage';
import SellerAccountSettingsPage from './pages/seller/SellerAccountSettingsPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminBuyerApplicationsPage from './pages/admin/AdminBuyerApplicationsPage';
import AdminSellerApplicationsPage from './pages/admin/AdminSellerApplicationsPage';
import AdminSortingCenterApplicationsPage from './pages/admin/AdminSortingCenterApplicationsPage';
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
import PaymentPage from './pages/PaymentPage';
import CatalogPage from './pages/CatalogPage';
import ProductDetailPage from './pages/ProductDetailPage';
import ShopProfilePage from './pages/ShopProfilePage';
import PrivacyPolicyPage from './pages/legal/PrivacyPolicyPage';
import TermsOfServicePage from './pages/legal/TermsOfServicePage';
import CookiePolicyPage from './pages/legal/CookiePolicyPage';
import SafetyHelpPage from './pages/help/SafetyHelpPage';
import AboutUsPage from './pages/AboutUsPage';
import PartnerPage from './pages/PartnerPage';
import {
  SettingsLayout,
  SettingsAccount,
  SettingsAddresses,
  SettingsOrders,
  SettingsReturns,
  SettingsCancellations,
  SettingsReviews,
  SettingsVouchers,
  SettingsWishlist,
} from './pages/SettingsPage';
import type { ReactNode } from 'react';
import type { Role } from './types';
import ScrollToTop from './components/ScrollToTop';
import { ToastProvider } from './components/ui/Toast';

/**
 * A Google sign-up starts without a mobile number or birthday and finishes them on /complete-profile. Accounts made
 * with the registration form already have both; identity documents are optional and added from the account.
 */
function isProfileIncomplete(user: ReturnType<typeof useAuth>['user']) {
  return user?.role === 'buyer' && (!user.date_of_birth || !user.phone);
}

/**
 * The seller centre: an approved seller, or one whose application is still waiting (A18), who can prepare product
 * drafts. Everything else in it is for approved stores only (ApprovedSellerOnly).
 */
function RequireSellerApplicant({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-sm text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  const status = user.seller_profile?.application_status;
  if (status !== 'approved' && status !== 'pending') return <Navigate to="/register/seller" replace />;
  return <>{children}</>;
}

function ApprovedSellerOnly() {
  const { user } = useAuth();
  if (user?.seller_profile?.application_status !== 'approved') return <Navigate to="/seller/products" replace />;
  return <Outlet />;
}

/**
 * An approved seller or an admin (the printable waybill opens from both). A seller keeps users.role "buyer", so this
 * reads the seller profile; a role check alone sent sellers back to the home page.
 */
function RequireSellerOrAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-sm text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin' || user.role === 'seller' || user.seller_profile?.application_status === 'approved') return <>{children}</>;
  return <Navigate to="/" replace />;
}

/** The courier company portal: only the team of an approved courier; anyone else sees their application status. */
function RequireApprovedCourier({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-sm text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login?next=%2Flogistics" replace />;
  if (user.logistics_company?.status !== 'APPROVED') return <Navigate to="/register/courier" replace />;
  return <>{children}</>;
}

function RequireApprovedSortingCenter({ children }: { children: ReactNode }) {
  const { user, loading, clearAuth } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-sm text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/hub/login" replace />;
  if (!user.sorting_center) return <Navigate to="/register/hub" replace />;
  // The hub application page shows the pending or rejected status of the signed-in account's application.
  if (user.sorting_center.status === 'PENDING') return <Navigate to="/register/hub" replace />;
  if (user.sorting_center.status === 'REJECTED') return <Navigate to="/register/hub" replace />;
  if (user.sorting_center.status === 'SUSPENDED') {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-gray-50">
        <div className="w-full max-w-md p-8 text-center bg-white border border-red-200 shadow-xl rounded-2xl">
          <div className="flex items-center justify-center mx-auto mb-4 w-14 h-14 rounded-2xl bg-red-50 text-brand-red">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="mb-2 text-xl font-black text-gray-900">Hub Account Suspended</h1>
          <p className="mb-6 text-sm text-gray-500">
            Your sorting center hub account has been suspended by platform administration. Please contact support for assistance.
          </p>
          <button
            onClick={() => { clearAuth(); window.location.href = '/hub/login'; }}
            className="w-full py-2.5 px-4 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>
    );
  }
  if (user.sorting_center.status !== 'APPROVED') return <Navigate to="/register/hub" replace />;
  return <>{children}</>;
}

function RequireActiveRider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-sm text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/rider/login" replace />;
  // Riders are added by their courier company (A13). Active riders work; a suspended rider still opens the pages to
  // see why (every action is refused by the API). Anyone else goes back to the rider sign-in page.
  if (!user.rider || !['ACTIVE', 'SUSPENDED'].includes(user.rider.status)) return <Navigate to="/rider/login" replace />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-sm text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isProfileIncomplete(user)) return <Navigate to="/complete-profile" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function SuspendedScreen() {
  const { clearAuth } = useAuth();
  return (
    <div className="flex items-center justify-center min-h-screen p-6 bg-gray-50">
      <div className="w-full max-w-md p-8 text-center bg-white border border-red-100 shadow-xl rounded-2xl">
        <div className="flex items-center justify-center mx-auto mb-4 w-14 h-14 rounded-2xl bg-red-50">
          <svg className="w-7 h-7 text-brand-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h1 className="mb-2 text-xl font-black text-gray-900">Account Suspended</h1>
        <p className="mb-6 text-sm text-gray-500">
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
      <Route path="/pay/:token" element={!user ? <Navigate to="/login" replace /> : <PaymentPage />} />
      <Route path="/search" element={<CatalogPage />} />
      <Route path="/category/:parentId" element={<CatalogPage />} />
      <Route path="/products/:id" element={<ProductDetailPage />} />
      <Route path="/shop/:slug" element={<ShopProfilePage />} />
      <Route path="/store/:id" element={<ShopProfilePage />} />

      {/* Auth pages — redirect away if already logged in */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route path="/register/seller" element={<SellerRegisterPage />} />
      <Route path="/register/hub" element={<HubRegisterPage />} />
      <Route path="/register/courier" element={<CourierRegisterPage />} />
      <Route path="/register/hub/pending" element={<Navigate to="/register/hub" replace />} />
      <Route path="/register/sorting-center" element={<Navigate to="/register/hub" replace />} />
      {/* Riders cannot register themselves: their courier company adds them and they activate from an email (A13) */}
      <Route path="/register/rider" element={<Navigate to="/rider/login" replace />} />
      <Route path="/register/rider/pending" element={<Navigate to="/rider/login" replace />} />
      <Route path="/rider/activate" element={<RiderActivatePage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/rider/login" element={<RiderLoginPage />} />
      <Route path="/hub/login" element={<HubLoginPage />} />
      <Route path="/partner" element={<PartnerPage />} />
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
        <Route path="vouchers"      element={<SettingsVouchers />} />
        <Route path="wishlist"      element={<SettingsWishlist />} />
      </Route>

      {/* Seller centre: products and account open to a waiting applicant; the rest needs an approved store */}
      <Route
        path="/seller"
        element={
          <RequireSellerApplicant>
            <SellerLayout />
          </RequireSellerApplicant>
        }
      >
        <Route path="products"          element={<SellerProductsPage />} />
        <Route path="products/new"      element={<SellerAddProductPage />} />
        <Route path="products/:id/edit" element={<SellerAddProductPage />} />
        <Route path="account"           element={<SellerAccountSettingsPage />} />
        <Route element={<ApprovedSellerOnly />}>
          <Route index element={<SellerDashboard />} />
          <Route path="store-categories"  element={<SellerStoreCategoriesPage />} />
          <Route path="promotions"        element={<SellerPromotionsPage />} />
          <Route path="vouchers"          element={<SellerVouchersPage />} />
          <Route path="orders"            element={<SellerOrdersPage />} />
          <Route path="inventory"         element={<Navigate to="/seller/products" replace />} />
          <Route path="payments"          element={<SellerPaymentsPage />} />
          <Route path="earnings"          element={<SellerEarningsPage />} />
          <Route path="payouts"           element={<SellerEarningsPage />} />
          <Route path="reports"           element={<SellerReportsPage />} />
          <Route path="messages"          element={<SellerMessagesPage />} />
          <Route path="reviews"           element={<SellerReviewsPage />} />
          <Route path="shop-profile"      element={<SellerShopProfilePage />} />
        </Route>
      </Route>

      {/* Standalone Printable Waybill for Seller & Admin */}
      <Route
        path="/seller/orders/:id/waybill"
        element={
          <RequireSellerOrAdmin>
            <WaybillPage />
          </RequireSellerOrAdmin>
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
        <Route path="messages"            element={<AdminMessagesPage />} />
        <Route path="buyer-applications"          element={<AdminBuyerApplicationsPage />} />
        <Route path="seller-applications"         element={<AdminSellerApplicationsPage />} />
        <Route path="sorting-center-applications" element={<AdminSortingCenterApplicationsPage />} />
        <Route path="courier-applications"        element={<AdminCourierApplicationsPage />} />
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
        <Route path="vouchers"            element={<AdminVouchersPage />} />
        <Route path="reviews"             element={<AdminReviewsPage />} />
        <Route path="reports"             element={<AdminReportsPage />} />
        <Route path="settings"            element={<AdminPlatformSettingsPage />} />
        <Route path="activity-log"        element={<AdminActivityLogPage />} />
      </Route>

      {/* Courier company portal (J&T, Flash, the default courier): its own hubs, riders and parcels */}
      <Route
        path="/logistics"
        element={
          <RequireApprovedCourier>
            <LogisticsLayout />
          </RequireApprovedCourier>
        }
      >
        <Route index element={<LogisticsDashboardPage />} />
        <Route path="hubs" element={<LogisticsHubsPage />} />
        <Route path="riders" element={<LogisticsRidersPage />} />
        <Route path="parcels" element={<LogisticsParcelsPage />} />
        <Route path="reports" element={<LogisticsReportsPage />} />
        <Route path="money" element={<LogisticsMoneyPage />} />
        <Route path="shipping" element={<LogisticsShippingPage />} />
      </Route>

      {/* Logistics / Sorting Center Hub Portal */}
      <Route
        path="/hub"
        element={
          <RequireApprovedSortingCenter>
            <HubLayout />
          </RequireApprovedSortingCenter>
        }
      >
        <Route index element={<Navigate to="/hub/dashboard" replace />} />
        <Route path="dashboard" element={<HubDashboardPage />} />
        <Route path="intake" element={<HubIntakePage />} />
        <Route path="sorting" element={<HubSortingPage />} />
        <Route path="dispatch" element={<HubDispatchPage />} />
        <Route path="deliveries" element={<HubDeliveriesPage />} />
        <Route path="riders" element={<HubRidersPage />} />
        <Route path="reports" element={<HubReportsPage />} />
        <Route path="earnings" element={<HubEarningsPage />} />
        <Route path="messages" element={<HubMessagesPage />} />
      </Route>

      {/* Rider / Courier Station — gated */}
      <Route path="/rider" element={<Navigate to="/rider/dashboard" replace />} />
      <Route
        path="/rider"
        element={
          <RequireActiveRider>
            <RiderLayout />
          </RequireActiveRider>
        }
      >
        <Route path="dashboard" element={<RiderDashboardPage />} />
        <Route path="pickups" element={<RiderPickupsPage />} />
        <Route path="deliveries" element={<RiderDeliveriesPage />} />
        <Route path="earnings" element={<RiderEarningsPage />} />
        <Route path="account" element={<RiderAccountPage />} />
      </Route>

      <Route path="/about"             element={<AboutUsPage />} />
      <Route path="/company"           element={<Navigate to="/about" replace />} />
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
            <ToastProvider>
              <ScrollToTop />
              <AppRoutes />
              <BuyerFloatingChat />
            </ToastProvider>
          </ChatProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
