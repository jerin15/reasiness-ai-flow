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

interface WorkflowStep {
  id: string;
  task_id: string;
  step_order: number;
  step_type: 'collect' | 'deliver_to_supplier' | 'deliver_to_client';
  supplier_name: string | null;
  location_address: string | null;
  location_notes: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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

  const fetchSteps = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('task_workflow_steps')
        .select('*')
        .eq('task_id', taskId)
        .order('step_order', { ascending: true });

      if (error) throw error;
      setSteps(data as WorkflowStep[] || []);
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
    if (!newSupplierName.trim() && newStepType !== 'deliver_to_client') {
      toast.error('Please enter a supplier/location name');
      return;
    }

    setAdding(true);
    try {
      const newOrder = steps.length > 0 ? Math.max(...steps.map(s => s.step_order)) + 1 : 0;

      const { error } = await supabase
        .from('task_workflow_steps')
        .insert({
          task_id: taskId,
          step_order: newOrder,
          step_type: newStepType,
          supplier_name: newSupplierName.trim() || null,
          location_address: newAddress.trim() || null,
          location_notes: newNotes.trim() || null,
          status: 'pending'
        });

      if (error) throw error;

      toast.success('Step added');
      setNewSupplierName('');
      setNewAddress('');
      setNewNotes('');
      setNewStepType('collect');
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

      // Push notification for status change
      const stepConfig = stepTypeConfig[step.step_type];
      pushNotification({
        type: newStatus === 'completed' ? 'task' : 'reminder',
        title: newStatus === 'completed' ? '✅ Step Completed' : '🔄 Step In Progress',
        body: `${stepConfig.shortLabel}: ${step.supplier_name || 'Delivery'} - ${taskTitle}`,
        priority: 'normal'
      });

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
                              <h4 className="font-medium text-sm">
                                {typeConfig.shortLabel}: {step.supplier_name || 'Client'}
                              </h4>
                              {step.location_address && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <MapPin className="h-3 w-3" />
                                  {step.location_address}
                                </p>
                              )}
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
                    <SelectItem value="deliver_to_client">
                      <span className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-green-600" />
                        Deliver to Client
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Supplier/Location Name */}
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

              {/* Address */}
              <div>
                <Label className="text-xs">Address</Label>
                <Input
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="Enter location address"
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
