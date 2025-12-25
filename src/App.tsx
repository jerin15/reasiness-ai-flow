import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { AppUpdateNotifier } from "@/components/AppUpdateNotifier";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MobileNotificationToast } from "@/components/MobileNotificationToast";

// Lazy load heavy components to reduce initial bundle
const ReminderNotification = lazy(() => import("@/components/ReminderNotification").then(m => ({ default: m.ReminderNotification })));
const VoiceCallNotification = lazy(() => import("@/components/VoiceCallNotification").then(m => ({ default: m.VoiceCallNotification })));
const VoiceAnnouncementPlayer = lazy(() => import("@/components/VoiceAnnouncementPlayer").then(m => ({ default: m.VoiceAnnouncementPlayer })));
const UrgentNotificationModal = lazy(() => import("@/components/UrgentNotificationModal").then(m => ({ default: m.UrgentNotificationModal })));
const DailyTaskReviewDialog = lazy(() => import("@/components/DailyTaskReviewDialog").then(m => ({ default: m.DailyTaskReviewDialog })));
const EstimationBlockingModal = lazy(() => import("@/components/EstimationBlockingModal").then(m => ({ default: m.EstimationBlockingModal })));
const EstimationForcedCheckIn = lazy(() => import("@/components/EstimationForcedCheckIn").then(m => ({ default: m.EstimationForcedCheckIn })));

// Lazy load pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Auth = lazy(() => import("./pages/Auth"));
const BrainGames = lazy(() => import("./pages/BrainGames"));
const Analytics = lazy(() => import("./pages/Analytics"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reduce refetch frequency to improve performance
      staleTime: 30000, // Data stays fresh for 30 seconds
      gcTime: 5 * 60 * 1000, // Cache for 5 minutes (formerly cacheTime)
      refetchOnWindowFocus: false, // Don't refetch on every focus
      retry: 1, // Only retry once on failure
    },
  },
});

// Loading fallback for lazy components
const LoadingFallback = () => null;

const AppContent = () => {
  const location = useLocation();
  const isAuthPage = location.pathname === '/auth';
  
  // Check for version updates
  useVersionCheck();

  return (
    <>
      <Suspense fallback={<LoadingFallback />}>
        <UrgentNotificationModal />
      </Suspense>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/brain-games" element={<BrainGames />} />
          <Route path="/analytics" element={<Analytics />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppUpdateNotifier />
        {/* Mobile-first notification system - works on all devices */}
        <MobileNotificationToast />
        <Suspense fallback={<LoadingFallback />}>
          <ReminderNotification />
          <VoiceCallNotification />
          <VoiceAnnouncementPlayer />
          <DailyTaskReviewDialog />
          <EstimationBlockingModal />
          <EstimationForcedCheckIn />
        </Suspense>
        <OfflineIndicator />
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
