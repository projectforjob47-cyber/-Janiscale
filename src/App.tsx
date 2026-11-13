import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore, ADMIN_ALLOWLIST } from './stores/authStore';

// Lazy-load pages
import { Suspense, lazy } from 'react';
import MaintenancePage from './pages/MaintenancePage';

// ─── SYSTEM MAINTENANCE FLAG ─────────────────────────────────
// Set to TRUE: Shows "กำลังพัฒนาแอป กรุณาเข้าใช้งานภายหลัง"
// Set to FALSE: Opens the app normally
export const IS_MAINTENANCE_MODE = false;

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const AppointmentDetailPage = lazy(() => import('./pages/AppointmentDetailPage'));
const AppointmentSummaryPage = lazy(() => import('./pages/AppointmentSummaryPage'));
const POListPage = lazy(() => import('./pages/POListPage'));
const SKUListPage = lazy(() => import('./pages/SKUListPage'));
const SamplingGroupPage = lazy(() => import('./pages/SamplingGroupPage'));
const OTMQueuePage = lazy(() => import('./pages/OTMQueuePage'));
const OTMSignPage = lazy(() => import('./pages/OTMSignPage'));
const CNTrackingPage = lazy(() => import('./pages/CNTrackingPage'));
const BackOfficePage = lazy(() => import('./pages/BackOfficePage'));
const BasketMasterPage = lazy(() => import('./pages/BasketMasterPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const ExcelViewerPage = lazy(() => import('./pages/ExcelViewerPage'));
const DailySamplingPlanPage = lazy(() => import('./pages/DailySamplingPlanPage'));

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-500 text-sm">กำลังโหลด...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, currentUser } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const isAllowlistedAdmin = ADMIN_ALLOWLIST.includes(currentUser?.email || '') || ADMIN_ALLOWLIST.includes(currentUser?.username || '');
  if (currentUser?.role !== 'ADMIN' && currentUser?.role !== 'SUPERVISOR' && !isAllowlistedAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function OtmRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hasRole } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!hasRole('OTM')) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated, currentUser } = useAuthStore();
  const location = useLocation();

  const isAllowlistedAdmin = ADMIN_ALLOWLIST.includes(currentUser?.email || '') || ADMIN_ALLOWLIST.includes(currentUser?.username || '');
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPERVISOR' || isAllowlistedAdmin;

  // Check if admin bypass is requested via ?bypass=smartdc or already set
  const searchParams = new URLSearchParams(window.location.search);
  const isBypassed = searchParams.get('bypass') === 'smartdc' ||
    sessionStorage.getItem('SMART_DC_MAINTENANCE_BYPASS') === 'true' ||
    localStorage.getItem('SMART_DC_MAINTENANCE_BYPASS') === 'true';

  if (searchParams.get('bypass') === 'smartdc') {
    sessionStorage.setItem('SMART_DC_MAINTENANCE_BYPASS', 'true');
    localStorage.setItem('SMART_DC_MAINTENANCE_BYPASS', 'true');
  }

  // If Maintenance Mode is active:
  // - Admins (authenticated or bypassed) can access and develop the app normally
  // - Allow access to /login (so Admin can sign in)
  // - Block non-admin staff and show "กำลังพัฒนาแอป กรุณาเข้าใช้งานภายหลัง"
  if (IS_MAINTENANCE_MODE && !isAdmin && !isBypassed) {
    if (location.pathname !== '/login') {
      return <MaintenancePage />;
    }
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/login" element={
          (isAuthenticated && (!IS_MAINTENANCE_MODE || isAdmin || isBypassed)) ? <Navigate to="/dashboard" replace /> : <LoginPage />
        } />
        <Route path="/" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />

        {/* Protected routes */}
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/import" element={<AdminRoute><ImportPage /></AdminRoute>} />
        <Route path="/appointment/:apptNbr" element={<ProtectedRoute><AppointmentDetailPage /></ProtectedRoute>} />
        <Route path="/appointment/:apptNbr/summary" element={<ProtectedRoute><AppointmentSummaryPage /></ProtectedRoute>} />
        <Route path="/appointment/:apptNbr/vendor/:vendorNbr/pos" element={<ProtectedRoute><POListPage /></ProtectedRoute>} />
        <Route path="/appointment/:apptNbr/vendor/:vendorNbr/po/:poNbr/skus" element={<ProtectedRoute><SKUListPage /></ProtectedRoute>} />
        <Route path="/sampling-group/:id" element={<ProtectedRoute><SamplingGroupPage /></ProtectedRoute>} />
        <Route path="/otm-queue" element={<Navigate to="/dashboard" replace />} />
        <Route path="/otm-sign/:samplingGroupId" element={<Navigate to="/dashboard" replace />} />
        <Route path="/cn" element={<ProtectedRoute><CNTrackingPage /></ProtectedRoute>} />
        <Route path="/sampling-plan" element={<ProtectedRoute><DailySamplingPlanPage /></ProtectedRoute>} />
        <Route path="/backoffice" element={<AdminRoute><BackOfficePage /></AdminRoute>} />
        <Route path="/basket-master" element={<AdminRoute><BasketMasterPage /></AdminRoute>} />
        <Route path="/history" element={<ProtectedRoute><ExcelViewerPage /></ProtectedRoute>} />
        <Route path="/sheets" element={<ProtectedRoute><ExcelViewerPage /></ProtectedRoute>} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </Suspense>
  );
}
