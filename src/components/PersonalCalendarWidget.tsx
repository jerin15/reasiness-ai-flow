import { useState, useEffect, useCallback } from 'react';
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
import { format, startOfMonth, endOfMonth, addMonths, subMonths, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, getDay } from 'date-fns';
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

  // Generate calendar days - REA style (Mon-Sun)
  const generateCalendarDays = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    // Start from Monday of the week containing the 1st
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    // End on Sunday of the week containing the last day
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    const days: Date[] = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  };

  const calendarDays = generateCalendarDays();
  const weeks = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

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
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col p-0 bg-white dark:bg-slate-900">
        <DialogHeader className="p-4 pb-3 border-b bg-gradient-to-r from-teal-600 to-cyan-500">
          <DialogTitle className="flex items-center gap-2 text-lg text-white">
            <CalendarDays className="h-5 w-5" />
            My Calendar
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden p-5">
          {/* Month Navigation - REA Style */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-teal-600 tracking-tight">
                {format(currentMonth, 'MMM').toUpperCase()}
              </span>
              <span className="text-3xl font-bold text-pink-500 tracking-tight">
                {format(currentMonth, 'yyyy')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handlePrevMonth} 
                className="h-8 w-8 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleNextMonth} 
                className="h-8 w-8 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-[1.2fr,1fr]">
            {/* Calendar - REA PDF Style */}
            <div className="rounded-xl overflow-hidden">
              {/* Week Header */}
              <div className="grid grid-cols-7 mb-1">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                  <div 
                    key={day} 
                    className={cn(
                      "py-2 text-center text-sm font-semibold",
                      i === 6 
                        ? "text-white bg-pink-400/90 rounded-t-lg" 
                        : "text-gray-600 dark:text-gray-300"
                    )}
                  >
                    {day}
                  </div>
                ))}
              </div>
              
              {/* Calendar Grid */}
              <div className="border-t border-gray-200 dark:border-gray-700">
                {weeks.map((week, weekIdx) => (
                  <div key={weekIdx} className="grid grid-cols-7">
                    {week.map((day, dayIdx) => {
                      const dateKey = format(day, 'yyyy-MM-dd');
                      const hasReminders = datesWithReminders[dateKey] > 0;
                      const isCurrentMonth = isSameMonth(day, currentMonth);
                      const isSelected = isSameDay(day, selectedDate);
                      const isToday = isSameDay(day, new Date());
                      const isSunday = dayIdx === 6;
                      
                      return (
                        <button
                          key={dayIdx}
                          onClick={() => setSelectedDate(day)}
                          className={cn(
                            "h-11 flex flex-col items-center justify-center text-sm font-medium transition-colors relative",
                            isSunday && "bg-pink-100/70 dark:bg-pink-900/20",
                            !isCurrentMonth && "text-gray-300 dark:text-gray-600",
                            isCurrentMonth && !isSunday && "text-gray-700 dark:text-gray-200",
                            isCurrentMonth && isSunday && "text-pink-600 dark:text-pink-400",
                            isSelected && "bg-teal-500 text-white rounded-lg",
                            isToday && !isSelected && "font-bold text-teal-600",
                            "hover:bg-teal-100 dark:hover:bg-teal-900/30 cursor-pointer"
                          )}
                        >
                          <span>{day.getDate()}</span>
                          {hasReminders && !isSelected && (
                            <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-orange-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Reminders Panel */}
            <Card className="border-orange-200 dark:border-orange-900/50 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StickyNote className="h-4 w-4 text-orange-600" />
                    <span className="text-gray-700 dark:text-gray-200">{format(selectedDate, 'MMM d, yyyy')}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-teal-600 hover:text-teal-700 hover:bg-teal-100 dark:hover:bg-teal-900/50"
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
                      <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Add Reminder Form */}
                      {showAddReminder && (
                        <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-teal-200 dark:border-teal-800 space-y-2 mb-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">Add reminder</p>
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
                            className="w-full h-8 bg-teal-600 hover:bg-teal-700" 
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
                              "p-2 rounded-lg border bg-white dark:bg-slate-800 flex items-start gap-2",
                              reminder.is_completed && "opacity-60"
                            )}
                          >
                            <Checkbox
                              checked={reminder.is_completed}
                              onCheckedChange={() => handleToggleReminder(reminder)}
                              className="mt-0.5 border-teal-500 data-[state=checked]:bg-teal-500"
                            />
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "text-sm font-medium",
                                reminder.is_completed && "line-through text-gray-400"
                              )}>
                                {reminder.title}
                              </p>
                              {reminder.notes && (
                                <p className="text-xs text-gray-500 truncate">
                                  {reminder.notes}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => handleDeleteReminder(reminder.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))
                      ) : !showAddReminder && (
                        <div className="text-center py-6">
                          <StickyNote className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                          <p className="text-sm text-gray-500">No reminders</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2 text-teal-600 hover:text-teal-700"
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

          {/* Legend - REA Style */}
          <div className="flex flex-wrap gap-4 justify-center text-xs mt-4 pt-3 border-t">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
              <span className="text-gray-600 dark:text-gray-400">Has reminders</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-pink-100 border border-pink-300" />
              <span className="text-gray-600 dark:text-gray-400">Sunday</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
