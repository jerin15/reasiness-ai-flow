import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Card } from './ui/card';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Megaphone, Mic, AlertTriangle, Users } from 'lucide-react';

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
}

export const AdminCommunicationPanel = () => {
  const [open, setOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { toast } = useToast();

  // Voice Announcement State
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [voiceRecipient, setVoiceRecipient] = useState<string>('');
  const [voiceMessage, setVoiceMessage] = useState('');
  const [voiceType, setVoiceType] = useState<'individual' | 'broadcast'>('individual');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Urgent Notification State
  const [urgentTitle, setUrgentTitle] = useState('');
  const [urgentMessage, setUrgentMessage] = useState('');
  const [urgentRecipient, setUrgentRecipient] = useState<string>('');
  const [urgentType, setUrgentType] = useState<'individual' | 'broadcast'>('individual');

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();
    fetchTeamMembers();
  }, []);

  const fetchTeamMembers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name');

    if (data) setTeamMembers(data);
  };

  // Voice Recording Functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast({
        title: '🎤 Recording',
        description: 'Speak your message now...',
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: 'Error',
        description: 'Could not access microphone',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast({
        title: '✓ Recording Stopped',
        description: 'You can now send the announcement',
      });
    }
  };

  const sendVoiceAnnouncement = async () => {
    if (!audioBlob || !currentUserId) return;

    if (voiceType === 'individual' && !voiceRecipient) {
      toast({
        title: 'Select Recipient',
        description: 'Please select a team member',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Upload audio to storage with user ID folder for RLS
      const fileName = `${currentUserId}/voice-${Date.now()}.webm`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(fileName, audioBlob);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(fileName);

      // Create announcement record
      const { error: insertError } = await supabase
        .from('voice_announcements')
        .insert({
          sender_id: currentUserId,
          recipient_id: voiceType === 'individual' ? voiceRecipient : null,
          audio_url: publicUrl,
          duration: 0,
          message_text: voiceMessage || null,
          is_broadcast: voiceType === 'broadcast'
        });

      if (insertError) throw insertError;

      toast({
        title: '✓ Announcement Sent',
        description: voiceType === 'broadcast' ? 'Sent to all team members' : 'Sent successfully',
      });

      // Reset form
      setAudioBlob(null);
      setVoiceMessage('');
      setVoiceRecipient('');
      setOpen(false);
    } catch (error) {
      console.error('Error sending announcement:', error);
      toast({
        title: 'Error',
        description: 'Failed to send announcement',
        variant: 'destructive',
      });
    }
  };

  const sendUrgentNotification = async () => {
    if (!currentUserId || !urgentTitle || !urgentMessage) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }

    if (urgentType === 'individual' && !urgentRecipient) {
      toast({
        title: 'Select Recipient',
        description: 'Please select a team member',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('urgent_notifications')
        .insert({
          sender_id: currentUserId,
          recipient_id: urgentType === 'individual' ? urgentRecipient : null,
          title: urgentTitle,
          message: urgentMessage,
          priority: 'high',
          is_broadcast: urgentType === 'broadcast'
        });

      if (error) throw error;

      toast({
        title: '✓ Urgent Alert Sent',
        description: urgentType === 'broadcast' ? 'Sent to all team members' : 'Sent successfully',
      });

      // Reset form
      setUrgentTitle('');
      setUrgentMessage('');
      setUrgentRecipient('');
      setOpen(false);
    } catch (error) {
      console.error('Error sending notification:', error);
      toast({
        title: 'Error',
        description: 'Failed to send notification',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Megaphone className="h-4 w-4" />
          ANNOUNCEMENT
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            ANNOUNCEMENT Center
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="voice" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="voice">
              <Mic className="h-4 w-4 mr-2" />
              Voice Announcement
            </TabsTrigger>
            <TabsTrigger value="urgent">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Urgent Alert
            </TabsTrigger>
          </TabsList>

          <TabsContent value="voice" className="space-y-4">
            <Card className="p-4">
              <div className="space-y-4">
                <div>
                  <Label>Send To</Label>
                  <RadioGroup value={voiceType} onValueChange={(v) => setVoiceType(v as any)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="individual" id="voice-individual" />
                      <Label htmlFor="voice-individual">Individual</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="broadcast" id="voice-broadcast" />
                      <Label htmlFor="voice-broadcast">Broadcast to All</Label>
                    </div>
                  </RadioGroup>
                </div>

                {voiceType === 'individual' && (
                  <div>
                    <Label>Select Team Member</Label>
                    <Select value={voiceRecipient} onValueChange={setVoiceRecipient}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose recipient..." />
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers.map(member => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label>Optional Text Message</Label>
                  <Input
                    placeholder="e.g., 'Please come to my desk'"
                    value={voiceMessage}
                    onChange={(e) => setVoiceMessage(e.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  {!isRecording && !audioBlob && (
                    <Button onClick={startRecording} className="flex-1">
                      <Mic className="h-4 w-4 mr-2" />
                      Start Recording
                    </Button>
                  )}
                  {isRecording && (
                    <Button onClick={stopRecording} variant="destructive" className="flex-1">
                      ⏹ Stop Recording
                    </Button>
                  )}
                  {audioBlob && !isRecording && (
                    <>
                      <Button onClick={() => setAudioBlob(null)} variant="outline">
                        🔄 Re-record
                      </Button>
                      <Button onClick={sendVoiceAnnouncement} className="flex-1">
                        📢 Send Announcement
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="urgent" className="space-y-4">
            <Card className="p-4">
              <div className="space-y-4">
                <div>
                  <Label>Send To</Label>
                  <RadioGroup value={urgentType} onValueChange={(v) => setUrgentType(v as any)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="individual" id="urgent-individual" />
                      <Label htmlFor="urgent-individual">Individual</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="broadcast" id="urgent-broadcast" />
                      <Label htmlFor="urgent-broadcast">Broadcast to All</Label>
                    </div>
                  </RadioGroup>
                </div>

                {urgentType === 'individual' && (
                  <div>
                    <Label>Select Team Member</Label>
                    <Select value={urgentRecipient} onValueChange={setUrgentRecipient}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose recipient..." />
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers.map(member => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label>Alert Title</Label>
                  <Input
                    placeholder="e.g., 'Urgent Meeting Now'"
                    value={urgentTitle}
                    onChange={(e) => setUrgentTitle(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Message</Label>
                  <Textarea
                    placeholder="Enter your urgent message..."
                    value={urgentMessage}
                    onChange={(e) => setUrgentMessage(e.target.value)}
                    rows={4}
                  />
                </div>

                <Button onClick={sendUrgentNotification} className="w-full" variant="destructive">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Send Urgent Alert
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};