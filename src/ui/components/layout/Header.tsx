import { Button } from "@/ui/components/ui/button";
import { useTheme } from "@/ui/hooks/useTheme";
import { Lock, Moon, Sun } from "lucide-react";
import { Logo } from "./Logo";

interface HeaderProps {
  locked?: boolean;
  lockMessage?: string;
}

export function Header({ locked, lockMessage }: HeaderProps) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 py-4 flex items-center justify-center relative">
        {/* Centered logo */}
        <Logo size="xl" className="text-foreground" />

        {/* Right side controls */}
        <div className="absolute right-4 flex items-center gap-2">
          {locked && (
            <div
              className="text-muted-foreground"
              title={lockMessage || "System is locked. Unlock via CLI to make changes."}
            >
              <Lock className="h-5 w-5" />
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
