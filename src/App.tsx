import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ReminderNotification } from "@/components/ReminderNotification";
import { ChatNotification } from "@/components/ChatNotification";
import { VoiceCallNotification } from "@/components/VoiceCallNotification";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { VoiceAnnouncementPlayer } from "@/components/VoiceAnnouncementPlayer";
import { UrgentNotificationModal } from "@/components/UrgentNotificationModal";
import { UserPresenceIndicator } from "@/components/UserPresenceIndicator";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";

import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ReminderNotification />
      <ChatNotification />
      <VoiceCallNotification />
      <VoiceAnnouncementPlayer />
      <UrgentNotificationModal />
      <OfflineIndicator />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/auth" element={<Auth />} />
          
          <Route path="/analytics" element={<Analytics />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <div className="fixed bottom-4 right-4 z-50 w-80">
          <UserPresenceIndicator />
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
