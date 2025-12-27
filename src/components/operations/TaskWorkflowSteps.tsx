import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { pushNotification } from "@/components/MobileNotificationToast";
import { 
  Plus, 
  Trash2, 
  CheckCircle, 
  Circle, 
  MapPin, 
  Truck, 
  Package, 
  ChevronDown, 
  ChevronUp,
  Clock,
  PlayCircle,
  AlertCircle,
  ArrowRight,
  GripVertical
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface StepProduct {
  id: string;
  product_name: string;
  quantity: number | null;
  unit: string | null;
  supplier_name: string | null;
}

interface WorkflowStep {
  id: string;
  task_id: string;
  step_order: number;
  step_type: 'collect' | 'deliver_to_supplier' | 'deliver_to_client' | 'supplier_to_supplier';
  supplier_name: string | null;
  location_address: string | null;
  location_notes: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_profile?: {
    full_name: string | null;
    email: string;
  };
  notes: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  products?: StepProduct[];
}

interface TaskWorkflowStepsProps {
  taskId: string;
  taskTitle: string;
  readOnly?: boolean;
  onStepChange?: () => void;
}

const stepTypeConfig = {
  collect: {
    icon: Package,
    label: 'Collect from Supplier',
    color: 'text-blue-600 bg-blue-100 dark:bg-blue-950',
    shortLabel: 'Collect'
  },
  deliver_to_supplier: {
    icon: Truck,
    label: 'Deliver to Supplier',
    color: 'text-amber-600 bg-amber-100 dark:bg-amber-950',
    shortLabel: 'To Supplier'
  },
  deliver_to_client: {
    icon: MapPin,
    label: 'Deliver to Client',
    color: 'text-green-600 bg-green-100 dark:bg-green-950',
    shortLabel: 'To Client'
  },
  supplier_to_supplier: {
    icon: ArrowRight,
    label: 'Supplier to Supplier',
    color: 'text-purple-600 bg-purple-100 dark:bg-purple-950',
    shortLabel: 'S→S Transfer'
  }
};

const statusConfig = {
  pending: {
    icon: Circle,
    label: 'Pending',
    color: 'text-muted-foreground bg-muted',
    badgeVariant: 'secondary' as const
  },
  in_progress: {
    icon: PlayCircle,
    label: 'In Progress',
    color: 'text-blue-600 bg-blue-100 dark:bg-blue-950',
    badgeVariant: 'default' as const
  },
  completed: {
    icon: CheckCircle,
    label: 'Completed',
    color: 'text-green-600 bg-green-100 dark:bg-green-950',
    badgeVariant: 'outline' as const
  },
  skipped: {
    icon: AlertCircle,
    label: 'Skipped',
    color: 'text-muted-foreground bg-muted/50',
    badgeVariant: 'outline' as const
  }
};

export const TaskWorkflowSteps = ({ 
  taskId, 
  taskTitle,
  readOnly = false,
  onStepChange
}: TaskWorkflowStepsProps) => {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // New step form state
  const [newStepType, setNewStepType] = useState<WorkflowStep['step_type']>('collect');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  
  // For supplier_to_supplier step
  const [fromSupplierName, setFromSupplierName] = useState('');
  const [fromSupplierAddress, setFromSupplierAddress] = useState('');

  const fetchSteps = useCallback(async () => {
    try {
      const { data: stepsData, error } = await supabase
        .from('task_workflow_steps')
        .select('*')
        .eq('task_id', taskId)
        .order('step_order', { ascending: true });

      if (error) throw error;

      // Fetch products for this task
      const { data: productsData } = await supabase
        .from('task_products')
        .select('id, workflow_step_id, product_name, quantity, unit, supplier_name')
        .eq('task_id', taskId);

      // Fetch completed_by profiles
      const completedByIds = (stepsData || [])
        .filter(s => s.completed_by)
        .map(s => s.completed_by);
      
      let completedByProfiles: Record<string, { full_name: string | null; email: string }> = {};
      if (completedByIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', completedByIds);
        
        (profilesData || []).forEach(p => {
          completedByProfiles[p.id] = { full_name: p.full_name, email: p.email };
        });
      }

      // Map products and completed_by profiles to steps
      const stepsWithProducts = (stepsData || []).map(step => ({
        ...step,
        completed_by_profile: step.completed_by ? completedByProfiles[step.completed_by] : undefined,
        products: (productsData || [])
          .filter(p => p.workflow_step_id === step.id || (!p.workflow_step_id))
          .map(p => ({
            id: p.id,
            product_name: p.product_name,
            quantity: p.quantity,
            unit: p.unit,
            supplier_name: p.supplier_name
          })) as StepProduct[]
      }));

      setSteps(stepsWithProducts as WorkflowStep[] || []);
    } catch (error: any) {
      console.error('Error fetching workflow steps:', error);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();
    fetchSteps();
  }, [fetchSteps]);

  // Real-time subscription for step updates
  useEffect(() => {
    const channel = supabase
      .channel(`workflow-steps-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_workflow_steps',
          filter: `task_id=eq.${taskId}`
        },
        (payload) => {
          console.log('📦 Workflow step changed:', payload);
          fetchSteps();
          onStepChange?.();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, fetchSteps, onStepChange]);

  const handleAddStep = async () => {
    // Validation for supplier_to_supplier
    if (newStepType === 'supplier_to_supplier') {
      if (!fromSupplierName.trim()) {
        toast.error('Please enter the "From" supplier name');
        return;
      }
      if (!newSupplierName.trim()) {
        toast.error('Please enter the "To" supplier name');
        return;
      }
    } else if (!newSupplierName.trim() && newStepType !== 'deliver_to_client') {
      toast.error('Please enter a supplier/location name');
      return;
    }

    setAdding(true);
    try {
      const newOrder = steps.length > 0 ? Math.max(...steps.map(s => s.step_order)) + 1 : 0;

      // For supplier_to_supplier, store from info in location_notes
      const notesWithFromInfo = newStepType === 'supplier_to_supplier'
        ? `FROM: ${fromSupplierName.trim()}${fromSupplierAddress ? ` (${fromSupplierAddress.trim()})` : ''}\n${newNotes.trim() || ''}`
        : newNotes.trim() || null;

      const { error } = await supabase
        .from('task_workflow_steps')
        .insert({
          task_id: taskId,
          step_order: newOrder,
          step_type: newStepType,
          supplier_name: newSupplierName.trim() || null,
          location_address: newAddress.trim() || null,
          location_notes: notesWithFromInfo,
          due_date: newDueDate || null,
          status: 'pending'
        });

      if (error) throw error;

      toast.success('Step added');
      setNewSupplierName('');
      setNewAddress('');
      setNewNotes('');
      setNewDueDate('');
      setNewStepType('collect');
      setFromSupplierName('');
      setFromSupplierAddress('');
      fetchSteps();
      onStepChange?.();
    } catch (error: any) {
      console.error('Error adding step:', error);
      toast.error('Failed to add step');
    } finally {
      setAdding(false);
    }
  };

  const handleUpdateStepStatus = async (stepId: string, newStatus: WorkflowStep['status']) => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    try {
      const updates: Partial<WorkflowStep> = {
        status: newStatus,
      };

      if (newStatus === 'in_progress' && !step.started_at) {
        updates.started_at = new Date().toISOString();
      }

      if (newStatus === 'completed') {
        updates.completed_at = new Date().toISOString();
        updates.completed_by = currentUserId;
      }

      const { error } = await supabase
        .from('task_workflow_steps')
        .update(updates)
        .eq('id', stepId);

      if (error) throw error;

      // Push local notification for status change
      const stepConfig = stepTypeConfig[step.step_type];
      pushNotification({
        type: newStatus === 'completed' ? 'task' : 'reminder',
        title: newStatus === 'completed' ? '✅ Step Completed' : '🔄 Step In Progress',
        body: `${stepConfig.shortLabel}: ${step.supplier_name || 'Delivery'} - ${taskTitle}`,
        priority: 'normal'
      });

      // Create bell notification for step completion
      if (newStatus === 'completed' && currentUserId) {
        const { data: currentUserProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', currentUserId)
          .single();
        
        const completedByName = currentUserProfile?.full_name || 'Team member';
        
        await supabase
          .from('urgent_notifications')
          .insert({
            sender_id: currentUserId,
            recipient_id: null,
            is_broadcast: true,
            title: `✅ Step Completed: ${stepConfig.shortLabel}`,
            message: `${completedByName} completed "${stepConfig.shortLabel}" step for task "${taskTitle}".\n\nSupplier: ${step.supplier_name || 'N/A'}\nCompleted at: ${format(new Date(), 'MMM d, yyyy h:mm a')}`,
            priority: 'medium',
            is_acknowledged: false
          });
      }

      toast.success(`Step marked as ${newStatus.replace('_', ' ')}`);
      fetchSteps();
      onStepChange?.();
    } catch (error: any) {
      console.error('Error updating step:', error);
      toast.error('Failed to update step');
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    try {
      const { error } = await supabase
        .from('task_workflow_steps')
        .delete()
        .eq('id', stepId);

      if (error) throw error;

      toast.success('Step removed');
      fetchSteps();
      onStepChange?.();
    } catch (error: any) {
      console.error('Error deleting step:', error);
      toast.error('Failed to remove step');
    }
  };

  const handleUpdateNotes = async (stepId: string, notes: string) => {
    try {
      const { error } = await supabase
        .from('task_workflow_steps')
        .update({ notes: notes.trim() || null })
        .eq('id', stepId);

      if (error) throw error;
      fetchSteps();
    } catch (error: any) {
      console.error('Error updating notes:', error);
    }
  };

  // Calculate progress
  const completedCount = steps.filter(s => s.status === 'completed').length;
  const totalSteps = steps.length;
  const progressPercent = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Progress */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Workflow Steps</h3>
          {totalSteps > 0 && (
            <Badge variant="outline" className="ml-2">
              {completedCount}/{totalSteps}
            </Badge>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {totalSteps > 0 && (
        <div className="w-full bg-muted rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Steps List */}
      <div className="space-y-3">
        {steps.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No workflow steps yet</p>
              <p className="text-xs mt-1">Add steps to track collections and deliveries</p>
            </CardContent>
          </Card>
        ) : (
          steps.map((step, index) => {
            const typeConfig = stepTypeConfig[step.step_type];
            const statusCfg = statusConfig[step.status];
            const StepIcon = typeConfig.icon;
            const StatusIcon = statusCfg.icon;
            const isExpanded = expandedStep === step.id;
            const isLast = index === steps.length - 1;

            return (
              <div key={step.id} className="relative">
                {/* Connector Line */}
                {!isLast && (
                  <div className="absolute left-5 top-12 w-0.5 h-[calc(100%-2rem)] bg-border z-0" />
                )}

                <Card className={cn(
                  "relative z-10 transition-all duration-200",
                  step.status === 'completed' && "bg-green-50/50 dark:bg-green-950/10 border-green-200",
                  step.status === 'in_progress' && "bg-blue-50/50 dark:bg-blue-950/10 border-blue-200 ring-2 ring-blue-500/20"
                )}>
                  <Collapsible open={isExpanded} onOpenChange={(open) => setExpandedStep(open ? step.id : null)}>
                    <div className="p-3">
                      {/* Main Row */}
                      <div className="flex items-start gap-3">
                        {/* Step Number & Icon */}
                        <div className={cn(
                          "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm",
                          typeConfig.color
                        )}>
                          {step.status === 'completed' ? (
                            <CheckCircle className="h-5 w-5" />
                          ) : (
                            index + 1
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <Badge variant={statusCfg.badgeVariant} className="text-xs mb-1">
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {statusCfg.label}
                              </Badge>
                              {(() => {
                                // Parse FROM supplier info from location_notes for S→S transfers
                                const fromLine = step.step_type === 'supplier_to_supplier' && step.location_notes?.startsWith('FROM:')
                                  ? step.location_notes.split('\n')[0].replace(/^FROM:\s*/i, '').trim()
                                  : null;
                                const remainingLocationNotes = step.step_type === 'supplier_to_supplier' && step.location_notes?.startsWith('FROM:')
                                  ? step.location_notes.split('\n').slice(1).join('\n').trim() || null
                                  : step.location_notes;

                                // Parse FROM supplier name and address separately
                                let fromSupplierName = '';
                                let fromSupplierAddress = '';
                                if (fromLine) {
                                  const addressMatch = fromLine.match(/^([^(]+)(?:\s*\(([^)]+)\))?$/);
                                  if (addressMatch) {
                                    fromSupplierName = addressMatch[1]?.trim() || '';
                                    fromSupplierAddress = addressMatch[2]?.trim() || '';
                                  } else {
                                    fromSupplierName = fromLine;
                                  }
                                }

                                return (
                                  <>
                                    {/* Step Type Header */}
                                    <div className="flex items-center gap-2">
                                      <StepIcon className="h-4 w-4" />
                                      <h4 className="font-semibold text-sm">{typeConfig.shortLabel}</h4>
                                    </div>

                                    {/* Due Date - Prominent */}
                                    {step.due_date && (
                                      <p className="text-xs text-destructive font-medium flex items-center gap-1 mt-1">
                                        <Clock className="h-3 w-3" />
                                        Due: {format(new Date(step.due_date), 'MMM d, h:mm a')}
                                      </p>
                                    )}

                                    {/* COLLECT FROM Section */}
                                    {(step.step_type === 'collect' || step.step_type === 'supplier_to_supplier') && (
                                      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md px-2.5 py-2 mt-2">
                                        <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 mb-1">
                                          <Package className="h-3 w-3" />
                                          📦 COLLECT FROM:
                                        </div>
                                        <div className="text-sm font-medium">
                                          {step.step_type === 'supplier_to_supplier' ? fromSupplierName : step.supplier_name || 'Supplier'}
                                        </div>
                                        {step.step_type === 'supplier_to_supplier' && fromSupplierAddress && (
                                          <div className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                                            <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                                            <span>{fromSupplierAddress}</span>
                                          </div>
                                        )}
                                        {step.step_type === 'collect' && step.location_address && (
                                          <div className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                                            <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                                            <span>{step.location_address}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* DELIVER TO Section */}
                                    {(step.step_type === 'deliver_to_supplier' || step.step_type === 'deliver_to_client' || step.step_type === 'supplier_to_supplier') && (
                                      <div className={cn(
                                        "border rounded-md px-2.5 py-2 mt-2",
                                        step.step_type === 'deliver_to_client' 
                                          ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                                          : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                                      )}>
                                        <div className={cn(
                                          "text-xs font-semibold flex items-center gap-1.5 mb-1",
                                          step.step_type === 'deliver_to_client'
                                            ? "text-green-700 dark:text-green-300"
                                            : "text-amber-700 dark:text-amber-300"
                                        )}>
                                          <Truck className="h-3 w-3" />
                                          🚚 DELIVER TO:
                                        </div>
                                        <div className="text-sm font-medium">
                                          {step.supplier_name || (step.step_type === 'deliver_to_client' ? 'Client' : 'Supplier')}
                                        </div>
                                        {step.location_address && (
                                          <div className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                                            <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                                            <span>{step.location_address}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Products List - ALWAYS SHOW with full details */}
                                    {step.products && step.products.length > 0 && (
                                      <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-md px-2.5 py-2 mt-2">
                                        <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1.5 mb-1.5">
                                          <Package className="h-3 w-3" />
                                          📋 PRODUCTS ({step.products.length}):
                                        </div>
                                        <div className="space-y-1">
                                          {step.products.map((product) => (
                                            <div key={product.id} className="text-sm flex items-start gap-2 bg-background/50 rounded px-2 py-1">
                                              <span className="font-bold text-primary min-w-[40px]">
                                                {product.quantity || 1} {product.unit || 'pcs'}
                                              </span>
                                              <span className="flex-1 font-medium">{product.product_name}</span>
                                              {product.supplier_name && (
                                                <span className="text-xs text-muted-foreground">from {product.supplier_name}</span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Show remaining notes/instructions */}
                                    {remainingLocationNotes && (
                                      <p className="text-xs text-muted-foreground mt-2 bg-muted/50 rounded px-2 py-1.5">
                                        📍 {remainingLocationNotes}
                                      </p>
                                    )}

                                    {step.notes && (
                                      <p className="text-xs text-muted-foreground mt-1 italic bg-muted/30 rounded px-2 py-1">
                                        📝 {step.notes}
                                      </p>
                                    )}

                                    {/* Completed by audit */}
                                    {step.status === 'completed' && step.completed_at && (
                                      <div className="flex items-center gap-1.5 text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 rounded px-2 py-1.5 mt-2 border border-green-200 dark:border-green-800">
                                        <CheckCircle className="h-3 w-3 shrink-0" />
                                        <span>
                                          Completed by{' '}
                                          <span className="font-semibold">
                                            {step.completed_by_profile?.full_name || step.completed_by_profile?.email || 'Team member'}
                                          </span>
                                          {' '}at {format(new Date(step.completed_at), 'MMM d, h:mm a')}
                                        </span>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>

                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                            </CollapsibleTrigger>
                          </div>

                          {/* Quick Actions */}
                          {!readOnly && step.status !== 'completed' && (
                            <div className="flex gap-2 mt-3">
                              {step.status === 'pending' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-9 text-xs flex-1"
                                  onClick={() => handleUpdateStepStatus(step.id, 'in_progress')}
                                >
                                  <PlayCircle className="h-3.5 w-3.5 mr-1" />
                                  Start
                                </Button>
                              )}
                              {step.status === 'in_progress' && (
                                <Button
                                  size="sm"
                                  className="h-9 text-xs flex-1 bg-green-600 hover:bg-green-700"
                                  onClick={() => handleUpdateStepStatus(step.id, 'completed')}
                                >
                                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                  Complete
                                </Button>
                              )}
                            </div>
                          )}

                          {/* Completed Info */}
                          {step.status === 'completed' && step.completed_at && (
                            <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Completed {format(new Date(step.completed_at), 'MMM d, h:mm a')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    <CollapsibleContent>
                      <div className="px-3 pb-3 space-y-3 border-t mt-2 pt-3">
                        {step.location_notes && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Location Notes</Label>
                            <p className="text-sm">{step.location_notes}</p>
                          </div>
                        )}

                        {!readOnly && (
                          <>
                            <div>
                              <Label htmlFor={`notes-${step.id}`} className="text-xs">Progress Notes</Label>
                              <Textarea
                                id={`notes-${step.id}`}
                                placeholder="Add notes about this step..."
                                value={step.notes || ''}
                                onChange={(e) => {
                                  const newSteps = steps.map(s => 
                                    s.id === step.id ? { ...s, notes: e.target.value } : s
                                  );
                                  setSteps(newSteps);
                                }}
                                onBlur={() => handleUpdateNotes(step.id, step.notes || '')}
                                rows={2}
                                className="mt-1 text-sm"
                              />
                            </div>

                            <div className="flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteStep(step.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Remove
                              </Button>
                            </div>
                          </>
                        )}

                        {step.started_at && (
                          <p className="text-xs text-muted-foreground">
                            Started: {format(new Date(step.started_at), 'MMM d, h:mm a')}
                          </p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              </div>
            );
          })
        )}
      </div>

      {/* Add New Step Form */}
      {!readOnly && (
        <Card className="border-dashed border-2">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Plus className="h-4 w-4" />
              Add Workflow Step
            </div>

            <div className="grid gap-4">
              {/* Step Type */}
              <div>
                <Label className="text-xs">Step Type</Label>
                <Select value={newStepType} onValueChange={(v) => setNewStepType(v as WorkflowStep['step_type'])}>
                  <SelectTrigger className="h-11 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="collect">
                      <span className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-blue-600" />
                        Collect from Supplier
                      </span>
                    </SelectItem>
                    <SelectItem value="deliver_to_supplier">
                      <span className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-amber-600" />
                        Deliver to Supplier (for processing)
                      </span>
                    </SelectItem>
                    <SelectItem value="supplier_to_supplier">
                      <span className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-purple-600" />
                        Supplier to Supplier
                      </span>
                    </SelectItem>
                    <SelectItem value="deliver_to_client">
                      <span className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-green-600" />
                        Deliver to Client
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Supplier fields - conditional based on step type */}
              {newStepType === 'supplier_to_supplier' ? (
                <>
                  {/* FROM Supplier */}
                  <div className="border rounded-lg p-3 space-y-2 bg-blue-50 dark:bg-blue-950/30">
                    <Label className="text-xs text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-2">
                      <Package className="h-3 w-3" />
                      Collect FROM
                    </Label>
                    <Input
                      value={fromSupplierName}
                      onChange={(e) => setFromSupplierName(e.target.value)}
                      placeholder="From Supplier Name"
                      className="h-10"
                    />
                    <Input
                      value={fromSupplierAddress}
                      onChange={(e) => setFromSupplierAddress(e.target.value)}
                      placeholder="From Supplier Address"
                      className="h-10"
                    />
                  </div>

                  {/* TO Supplier */}
                  <div className="border rounded-lg p-3 space-y-2 bg-purple-50 dark:bg-purple-950/30">
                    <Label className="text-xs text-purple-700 dark:text-purple-400 font-semibold flex items-center gap-2">
                      <Truck className="h-3 w-3" />
                      Deliver TO
                    </Label>
                    <Input
                      value={newSupplierName}
                      onChange={(e) => setNewSupplierName(e.target.value)}
                      placeholder="To Supplier Name"
                      className="h-10"
                    />
                    <Input
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      placeholder="To Supplier Address"
                      className="h-10"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label className="text-xs">
                      {newStepType === 'deliver_to_client' ? 'Client Name (optional)' : 'Supplier Name'}
                    </Label>
                    <Input
                      value={newSupplierName}
                      onChange={(e) => setNewSupplierName(e.target.value)}
                      placeholder={newStepType === 'deliver_to_client' ? 'Client name' : 'Enter supplier name'}
                      className="h-11 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Address</Label>
                    <Input
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      placeholder="Enter location address"
                      className="h-11 mt-1"
                    />
                  </div>
                </>
              )}

              {/* Due Date */}
              <div>
                <Label className="text-xs">Due Date (optional)</Label>
                <Input
                  type="datetime-local"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="h-11 mt-1"
                />
              </div>

              {/* Notes */}
              <div>
                <Label className="text-xs">Location Notes (optional)</Label>
                <Textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Any special instructions..."
                  rows={2}
                  className="mt-1"
                />
              </div>

              <Button 
                onClick={handleAddStep} 
                disabled={adding}
                className="h-11 w-full"
              >
                {adding ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Step
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
