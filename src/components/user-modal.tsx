
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface UserModalProps {
  open: boolean;
  onSave: (username: string) => Promise<'success' | 'not_found'>;
}

export function UserModal({ open, onSave }: UserModalProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const handleSave = async () => {
    if (username.trim().length < 2) {
      setError("Username must be at least 2 characters long.");
      return;
    }
    setError("");
    setIsChecking(true);
    const result = await onSave(username.trim());
    if (result === 'not_found') {
      setError("Account not found. Please try again.");
    }
    setIsChecking(false);
  };

  return (
    <Dialog open={open} onOpenChange={!open ? () => {} : undefined}>
      <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="font-headline">Welcome to URA Trade Pro</DialogTitle>
          <DialogDescription>
            Enter your username to start trading.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              Username
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="col-span-3"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              disabled={isChecking}
            />
          </div>
          {error && <p className="col-span-4 text-center font-semibold text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleSave} disabled={isChecking} className="w-full">
            {isChecking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Login
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
