
"use client";

import { useEffect, useState } from "react";
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
  onSave: (username: string) => void;
  error?: string | null;
}

export function UserModal({ open, onSave, error: initialError }: UserModalProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError])

  const handleSave = () => {
    if (username.trim().length < 3) {
      setError("Username must be at least 3 characters long.");
      return;
    }
    setError("");
    onSave(username.trim());
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-headline">Welcome to URA Trade Pro</DialogTitle>
          <DialogDescription>
            Please enter your username to log in and start trading.
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

    