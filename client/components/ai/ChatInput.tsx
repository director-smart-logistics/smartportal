import { useState, useRef, useEffect } from "react";
import { Send, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onStop,
  disabled,
  isLoading,
  placeholder = "Ask about packages, customers, deliveries...",
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // Auto-focus when AI finishes responding
  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isLoading]);

  const handleSubmit = () => {
    if (input.trim() && !disabled && !isLoading) {
      onSend(input.trim());
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.blur(); // Remove focus while AI is thinking
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="border-t bg-border/40 p-4"
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || isLoading}
              className={cn(
                "min-h-[56px] max-h-[200px] resize-none pr-12",
                "bg-background border-input",
                "focus-visible:ring-[0.5px] focus-visible:ring-muted-foreground/30",
                "rounded-2xl shadow-md",
              )}
              rows={1}
            />
            <div className="absolute bottom-3 right-3 flex gap-1">
              {isLoading && onStop ? (
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={onStop}
                    className="h-8 w-8 rounded-full hover:bg-accent"
                    title="Stop generation"
                  >
                    <StopCircle className="h-4 w-4" />
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={handleSubmit}
                    disabled={!input.trim() || disabled || isLoading}
                    className="h-8 w-8 rounded-full hover:bg-primary/10 disabled:opacity-50"
                    title="Send message (Enter)"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
