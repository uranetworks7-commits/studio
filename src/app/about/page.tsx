
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ThumbsDown, X, User, Code2, BrainCircuit } from 'lucide-react';
import Image from 'next/image';

export default function AboutPage() {
  const [username, setUsername] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showDevInfo, setShowDevInfo] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);

  const handleDislikeClick = () => {
    setShowFeedback(true);
    setShowDevInfo(false);
  };

  const handleDevInfoClick = () => {
    setShowDevInfo(true);
    setShowFeedback(false);
  }

  const handleFeedbackSubmit = () => {
    if (feedbackText.trim()) {
      console.log('Feedback submitted:', feedbackText);
      toast({
        title: 'Feedback Submitted',
        description: 'Thank you for your valuable input!',
      });
      setShowFeedback(false);
      setFeedbackText('');
    } else {
        toast({
            title: 'Empty Feedback',
            description: 'Please write something before submitting.',
            variant: 'destructive'
        })
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4">
      <Image
        src="https://i.postimg.cc/xCTsPPn5/background-realistic-abstract-technology-particle-23-2148431735.jpg"
        alt="Abstract background"
        layout="fill"
        objectFit="cover"
        className="z-0"
        data-ai-hint="abstract technology"
      />
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10"></div>
      
      <Card className="z-20 w-full max-w-2xl bg-card/80 border-border/50">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-headline text-primary">About URA Trade</CardTitle>
          <div className="absolute top-4 right-4">
            <Link href="/" passHref>
              <Button variant="ghost" size="icon">
                <X className="h-6 w-6" />
                <span className="sr-only">Exit to Dashboard</span>
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 text-center">
          <div className="flex items-center justify-center gap-2 text-lg">
            <User className="h-5 w-5 text-primary" />
            <span>Account: <strong>{username || 'Guest'}</strong></span>
          </div>

          <div className="text-muted-foreground space-y-1">
             <p>This Program Is Owned By URA-Networks And Terminal.io</p>
             <p>&copy; {new Date().getFullYear()} URA-Networks. All Rights Reserved.</p>
          </div>
          
          <div className="flex justify-center gap-4">
            {!showFeedback && (
              <Button variant="outline" onClick={handleDislikeClick}>
                <ThumbsDown className="mr-2 h-4 w-4" />
                Dislike Something?
              </Button>
            )}
             {!showDevInfo && (
              <Button variant="outline" onClick={handleDevInfoClick}>
                <Code2 className="mr-2 h-4 w-4" />
                Developers
              </Button>
            )}
          </div>

          {showFeedback && (
            <div className="space-y-4 pt-4 border-t border-border/50">
              <h3 className="font-semibold">We're sorry to hear that. What can we improve?</h3>
              <Textarea
                placeholder="Tell us what you didn't like or what could be better..."
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                className="bg-background/80"
              />
              <div className="flex justify-center gap-4">
                <Button onClick={handleFeedbackSubmit}>Submit Feedback</Button>
                <Button variant="secondary" onClick={() => setShowFeedback(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {showDevInfo && (
            <div className="space-y-4 pt-4 text-left border-t border-border/50">
              <h3 className="text-center font-semibold text-primary">Development Team</h3>
               <ul className="list-disc list-inside space-y-2 text-sm text-foreground/90 mx-auto max-w-md">
                 <li><strong>Developed By:</strong> Yash Singh</li>
                 <li><strong>Programming:</strong> Raj Singh</li>
                 <li><strong>UI Design:</strong> Utkarsh Singh</li>
                 <li><strong>Algorithm Design:</strong> Ankit</li>
                 <li className='flex items-center gap-2'>
                    <BrainCircuit className='h-4 w-4 text-primary' />
                    <strong>Algorithm:</strong> Gemini 2.5 Flash
                 </li>
                 <li><strong>Managed by:</strong> URA SV-09 Pro</li>
               </ul>
              <div className="flex justify-center">
                 <Button variant="secondary" onClick={() => setShowDevInfo(false)}>Close</Button>
              </div>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
