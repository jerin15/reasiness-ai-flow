import { useState, useEffect, useCallback } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { 
  CalendarDays, 
  Plus,
  Trash2,
  StickyNote,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

interface PersonalReminder {
  id: string;
  title: string;
  notes: string | null;
  reminder_date: string;
  is_completed: boolean;
}

interface PersonalCalendarWidgetProps {
  userId: string;
}

export const PersonalCalendarWidget = ({ userId }: PersonalCalendarWidgetProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [reminders, setReminders] = useState<PersonalReminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderNotes, setNewReminderNotes] = useState('');

  // Fetch personal reminders
  const fetchReminders = useCallback(async () => {
    if (!userId) return;
    
    setIsLoading(true);
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      
      const { data, error } = await supabase
        .from('operations_personal_reminders')
        .select('*')
        .eq('user_id', userId)
        .gte('reminder_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('reminder_date', format(monthEnd, 'yyyy-MM-dd'))
        .order('reminder_date', { ascending: true });

      if (error) throw error;
      setReminders(data || []);
    } catch (error) {
      console.error('Error fetching reminders:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, currentMonth]);

  useEffect(() => {
    if (isOpen) {
      fetchReminders();
    }
  }, [fetchReminders, isOpen]);

  // Get reminders for selected date
  const selectedDayReminders = reminders.filter(r => 
    r.reminder_date === format(selectedDate, 'yyyy-MM-dd')
  );

  // Get dates with reminders for highlighting
  const datesWithReminders = reminders.reduce((acc, r) => {
    acc[r.reminder_date] = (acc[r.reminder_date] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Add reminder
  const handleAddReminder = async () => {
    if (!newReminderTitle.trim()) {
      toast.error('Please enter a title');
      return;
    }

    try {
      const { error } = await supabase
        .from('operations_personal_reminders')
        .insert({
          user_id: userId,
          title: newReminderTitle.trim(),
          notes: newReminderNotes.trim() || null,
          reminder_date: format(selectedDate, 'yyyy-MM-dd')
        });

      if (error) throw error;
      
      toast.success('Reminder added');
      setNewReminderTitle('');
      setNewReminderNotes('');
      setShowAddReminder(false);
      fetchReminders();
    } catch (error: any) {
      console.error('Error adding reminder:', error);
      toast.error(error.message || 'Failed to add reminder');
    }
  };

  // Toggle reminder completion
  const handleToggleReminder = async (reminder: PersonalReminder) => {
    try {
      const { error } = await supabase
        .from('operations_personal_reminders')
        .update({
          is_completed: !reminder.is_completed,
          completed_at: !reminder.is_completed ? new Date().toISOString() : null
        })
        .eq('id', reminder.id);

      if (error) throw error;
      fetchReminders();
    } catch (error) {
      console.error('Error updating reminder:', error);
      toast.error('Failed to update reminder');
    }
  };

  // Delete reminder
  const handleDeleteReminder = async (id: string) => {
    try {
      const { error } = await supabase
        .from('operations_personal_reminders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Reminder deleted');
      fetchReminders();
    } catch (error) {
      console.error('Error deleting reminder:', error);
      toast.error('Failed to delete reminder');
    }
  };

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const pendingCount = reminders.filter(r => !r.is_completed).length;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start text-white font-semibold hover:bg-white/15 gap-2"
        >
          <CalendarDays className="h-4 w-4" />
          <span className="font-semibold">My Calendar</span>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="ml-auto bg-orange-500/80 text-white text-xs">
              {pendingCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-primary" />
            My Calendar
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-primary">
                {format(currentMonth, 'MMM').toUpperCase()}
              </span>
              <span className="text-xl font-bold text-muted-foreground">
                {format(currentMonth, 'yyyy')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Calendar */}
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                className="p-0 pointer-events-auto"
                classNames={{
                  months: "w-full",
                  month: "w-full space-y-2",
                  caption: "hidden",
                  nav: "hidden",
                  table: "w-full border-collapse",
                  head_row: "flex w-full",
                  head_cell: cn(
                    "flex-1 text-center text-xs font-medium text-muted-foreground py-2",
                    "last:text-primary last:font-semibold last:bg-primary/10"
                  ),
                  row: "flex w-full",
                  cell: cn(
                    "flex-1 text-center p-0.5 relative",
                    "last:bg-primary/5"
                  ),
                  day: cn(
                    "w-full h-10 rounded-lg text-sm font-normal flex flex-col items-center justify-center",
                    "hover:bg-accent/50 transition-colors cursor-pointer",
                    "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                  ),
                  day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  day_today: "bg-accent font-bold ring-1 ring-primary/30",
                  day_outside: "text-muted-foreground/40",
                  day_disabled: "text-muted-foreground/40",
                }}
                components={{
                  DayContent: ({ date }) => {
                    const dateKey = format(date, 'yyyy-MM-dd');
                    const hasReminders = datesWithReminders[dateKey] > 0;
                    return (
                      <div className="flex flex-col items-center">
                        <span className="text-sm">{date.getDate()}</span>
                        {hasReminders && (
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-0.5" />
                        )}
                      </div>
                    );
                  }
                }}
              />
            </div>

            {/* Reminders Panel */}
            <Card className="border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-950/20">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StickyNote className="h-4 w-4 text-orange-600" />
                    <span>{format(selectedDate, 'MMM d, yyyy')}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-orange-600 hover:text-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/50"
                    onClick={() => setShowAddReminder(true)}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ScrollArea className="h-[200px]">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Add Reminder Form */}
                      {showAddReminder && (
                        <div className="p-2 bg-background rounded-lg border space-y-2 mb-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium">Add reminder</p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => setShowAddReminder(false)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          <Input
                            placeholder="Title..."
                            value={newReminderTitle}
                            onChange={(e) => setNewReminderTitle(e.target.value)}
                            className="h-8 text-sm"
                          />
                          <Input
                            placeholder="Notes (optional)"
                            value={newReminderNotes}
                            onChange={(e) => setNewReminderNotes(e.target.value)}
                            className="h-8 text-sm"
                          />
                          <Button 
                            className="w-full h-8" 
                            size="sm"
                            onClick={handleAddReminder}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                        </div>
                      )}

                      {/* Reminders List */}
                      {selectedDayReminders.length > 0 ? (
                        selectedDayReminders.map((reminder) => (
                          <div
                            key={reminder.id}
                            className={cn(
                              "p-2 rounded-lg border bg-background flex items-start gap-2",
                              reminder.is_completed && "opacity-60"
                            )}
                          >
                            <Checkbox
                              checked={reminder.is_completed}
                              onCheckedChange={() => handleToggleReminder(reminder)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "text-sm font-medium",
                                reminder.is_completed && "line-through text-muted-foreground"
                              )}>
                                {reminder.title}
                              </p>
                              {reminder.notes && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {reminder.notes}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteReminder(reminder.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))
                      ) : !showAddReminder && (
                        <div className="text-center py-6">
                          <StickyNote className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                          <p className="text-sm text-muted-foreground">No reminders</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2 text-orange-600"
                            onClick={() => setShowAddReminder(true)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add one
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 justify-center text-xs mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-muted-foreground">Has reminders</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-primary/10 border border-primary/30" />
              <span className="text-muted-foreground">Sunday</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
