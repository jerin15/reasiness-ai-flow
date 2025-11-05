import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { VoiceRecorder } from './VoiceRecorder';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AITaskInputProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskParsed: (taskData: any) => void;
}

interface ParsedField {
  value: any;
  confidence: number;
}

interface ParsedData {
  title?: ParsedField;
  description?: ParsedField;
  client_name?: ParsedField;
  supplier_name?: ParsedField;
  priority?: ParsedField;
  type?: ParsedField;
  due_date?: ParsedField;
  ai_generated?: boolean;
  ai_confidence_score?: number;
  original_input?: string;
}

export const AITaskInput: React.FC<AITaskInputProps> = ({
  open,
  onOpenChange,
  onTaskParsed
}) => {
  const [textInput, setTextInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('text');

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.5) return 'Medium';
    return 'Low';
  };

  const processInput = async (input: string) => {
    if (!input.trim()) {
      toast.error('Please provide task details');
      return;
    }

    setIsProcessing(true);
    setParsedData(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in');
        return;
      }

      const { data, error } = await supabase.functions.invoke('ai-task-parser', {
        body: { input, userId: user.id }
      });

      if (error) throw error;

      if (data?.success && data?.parsedData) {
        setParsedData(data.parsedData);
        toast.success('✨ Task parsed successfully!');
      } else {
        throw new Error('Failed to parse task');
      }
    } catch (error) {
      console.error('Error parsing task:', error);
      toast.error('Failed to parse task. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTextSubmit = () => {
    processInput(textInput);
  };

  const handleVoiceTranscript = (transcript: string) => {
    setTextInput(transcript);
    processInput(transcript);
  };

  const handleCreateTask = () => {
    if (!parsedData) return;

    // Transform parsed data to match task structure
    const taskData: any = {
      title: parsedData.title,
      description: parsedData.description || '',
      client_name: parsedData.client_name || '',
      supplier_name: parsedData.supplier_name || '',
      priority: parsedData.priority || 'medium',
      type: parsedData.type || 'general',
      due_date: parsedData.due_date ? new Date(parsedData.due_date).toISOString() : null,
      ai_generated: true,
      ai_confidence_score: parsedData.ai_confidence_score || 0,
      original_input: parsedData.original_input || textInput
    };

    onTaskParsed(taskData);
    onOpenChange(false);
    
    // Reset state
    setTextInput('');
    setParsedData(null);
    setActiveTab('text');
  };

  const handleReset = () => {
    setParsedData(null);
    setTextInput('');
  };

  const renderConfidenceIndicator = (field: string, value: any, confidence: number) => {
    if (!value) return null;

    return (
      <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
        <div className="flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-1">{field}</p>
          <p className="text-sm font-medium">{String(value)}</p>
        </div>
        <Badge variant="outline" className={getConfidenceColor(confidence)}>
          {getConfidenceBadge(confidence)}
        </Badge>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Task Assistant
          </DialogTitle>
          <DialogDescription>
            Create tasks using natural language or voice. AI will automatically extract task details.
          </DialogDescription>
        </DialogHeader>

        {!parsedData ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text">Type Task</TabsTrigger>
              <TabsTrigger value="voice">Voice Input</TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Describe your task</label>
                <Textarea
                  placeholder="Example: Create urgent quotation task for Al Ain Zoo, supplier Al Baraka, deadline Friday"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Tip: Include client, supplier, priority (urgent/high/medium/low), type (quotation/invoice/design), and deadline
                </p>
              </div>

              <Button 
                onClick={handleTextSubmit} 
                disabled={isProcessing || !textInput.trim()}
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Parsing with AI...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Parse Task with AI
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="voice" className="space-y-4">
              <Card className="p-6">
                <VoiceRecorder 
                  onTranscript={handleVoiceTranscript}
                  onRecordingChange={(recording) => {
                    if (recording) {
                      setTextInput('');
                    }
                  }}
                />
              </Card>
              
              {isProcessing && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Processing your voice input...</span>
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Task Parsed Successfully!</span>
            </div>

            <div className="space-y-3">
              {parsedData.title && renderConfidenceIndicator(
                'Title', 
                parsedData.title, 
                parsedData.confidence_scores?.title || 0.8
              )}
              
              {parsedData.description && renderConfidenceIndicator(
                'Description', 
                parsedData.description, 
                parsedData.confidence_scores?.description || 0.7
              )}
              
              {parsedData.client_name && renderConfidenceIndicator(
                'Client', 
                parsedData.client_name, 
                parsedData.confidence_scores?.client_name || 0.8
              )}
              
              {parsedData.supplier_name && renderConfidenceIndicator(
                'Supplier', 
                parsedData.supplier_name, 
                parsedData.confidence_scores?.supplier_name || 0.8
              )}
              
              {parsedData.priority && renderConfidenceIndicator(
                'Priority', 
                parsedData.priority.toUpperCase(), 
                parsedData.confidence_scores?.priority || 0.9
              )}
              
              {parsedData.type && renderConfidenceIndicator(
                'Type', 
                parsedData.type.charAt(0).toUpperCase() + parsedData.type.slice(1), 
                parsedData.confidence_scores?.type || 0.8
              )}
              
              {parsedData.due_date && renderConfidenceIndicator(
                'Due Date', 
                new Date(parsedData.due_date).toLocaleDateString(), 
                parsedData.confidence_scores?.due_date || 0.7
              )}
            </div>

            {parsedData.ai_confidence_score && parsedData.ai_confidence_score < 0.7 && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                  Some fields have low confidence. Please review before creating the task.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleReset} variant="outline" className="flex-1">
                Start Over
              </Button>
              <Button onClick={handleCreateTask} className="flex-1">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Create Task
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};