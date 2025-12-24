import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { OperationsMobileShell } from "./operations/OperationsMobileShell";

interface OperationsDashboardProps {
  userId: string;
  userRole?: string;
}

export const OperationsDashboard = ({ userId, userRole }: OperationsDashboardProps) => {
  const [operationsUsers, setOperationsUsers] = useState<Array<{ id: string; full_name: string | null; email: string }>>([]);
  const [currentUserName, setCurrentUserName] = useState<string>('Operations');
  const isMobile = useIsMobile();

  // Fetch operations team members
  const fetchOperationsUsers = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id, profiles(id, full_name, email)')
        .eq('role', 'operations');
      
      if (data) {
        const users = data
          .map(d => d.profiles)
          .filter(Boolean) as Array<{ id: string; full_name: string | null; email: string }>;
        setOperationsUsers(users);

        // Get current user's name
        const currentUser = users.find(u => u.id === userId);
        if (currentUser) {
          setCurrentUserName(currentUser.full_name || currentUser.email || 'Operations');
        }
      }
    } catch (error) {
      console.error('Error fetching operations users:', error);
    }
  }, [userId]);

  useEffect(() => {
    fetchOperationsUsers();
  }, [fetchOperationsUsers]);

  // Always use mobile layout for operations - it's designed for field use
  return (
    <div className="h-full w-full">
      <OperationsMobileShell
        userId={userId}
        userName={currentUserName}
        operationsUsers={operationsUsers}
      />
    </div>
  );
};
