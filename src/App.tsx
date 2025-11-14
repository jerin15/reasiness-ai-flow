import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ReminderNotification } from "@/components/ReminderNotification";
import { ChatNotification } from "@/components/ChatNotification";
import { VoiceCallNotification } from "@/components/VoiceCallNotification";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { VoiceAnnouncementPlayer } from "@/components/VoiceAnnouncementPlayer";
import { UrgentNotificationModal } from "@/components/UrgentNotificationModal";
import { AppUpdateNotifier } from "@/components/AppUpdateNotifier";
import { DailyTaskReviewDialog } from "@/components/DailyTaskReviewDialog";
import { EstimationBlockingModal } from "@/components/EstimationBlockingModal";
import { EstimationForcedCheckIn } from "@/components/EstimationForcedCheckIn";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";

import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppContent = () => {
  const location = useLocation();
  const isAuthPage = location.pathname === '/auth';
  
  // Check for version updates every 2 minutes
  useVersionCheck();

  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/auth" element={<Auth />} />
        
        <Route path="/analytics" element={<Analytics />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
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
        <ReminderNotification />
        <ChatNotification />
        <VoiceCallNotification />
        <VoiceAnnouncementPlayer />
        <UrgentNotificationModal />
        <DailyTaskReviewDialog />
        <EstimationBlockingModal />
        <EstimationForcedCheckIn />
        <OfflineIndicator />
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
