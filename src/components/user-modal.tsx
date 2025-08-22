
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

interface UserModalProps {
  open: boolean;
  onSave: (username: string) => Promise<boolean>;
}

export function UserModal({ open, onSave }: UserModalProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (username.trim().length < 2) {
      setError("Username must be at least 2 characters long.");
      return;
    }
    setError("");
    const success = await onSave(username.trim());
    if (!success) {
      setError("Account not found. Please check your username.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={!open ? () => {} : undefined}>
      <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="font-headline">Welcome to Bit Sim</DialogTitle>
          <DialogDescription>
            Please enter a username to start trading. Your progress will be
            saved.
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
            />
          </div>
          {error && <p className="col-span-4 text-center text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleSave}>Login</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
