import { ChatMessage as ChatMessageType, QuickAction } from "@/lib/api/ai";
import { useState } from "react";
import { User, Bot, ChevronDown, ChevronUp, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuickActions } from "./QuickActions";
import { motion } from "framer-motion";

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
  onActionExecute?: (action: QuickAction) => Promise<void>;
}

export function ChatMessage({
  message,
  isStreaming,
  onActionExecute,
}: ChatMessageProps) {
  const [showTools, setShowTools] = useState(false);
  const isUser = message.role === "user";
  const isError =
    (!isUser && message.content.includes("🔌")) ||
    message.content.includes("🔐") ||
    message.content.includes("⚠️") ||
    message.content.includes("⏱️") ||
    message.content.includes("🔑") ||
    message.content.includes("⏰") ||
    message.content.includes("😔");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "flex gap-3 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser ? "bg-primary/10" : "bg-muted",
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-primary" />
        ) : (
          <Bot className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          "flex-1 max-w-[80%] space-y-2",
          isUser && "flex flex-col items-end",
        )}
      >
        {/* Message Bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm",
            isUser
              ? "bg-primary/10 ml-auto"
              : isError
                ? "bg-destructive/10 border border-destructive/20"
                : "bg-muted",
            isStreaming && "animate-pulse",
          )}
        >
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
        </div>

        {/* Tool Calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTools(!showTools)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Package className="w-3 h-3 mr-1" />
              {message.toolCalls.length} database{" "}
              {message.toolCalls.length === 1 ? "query" : "queries"}
              {showTools ? (
                <ChevronUp className="w-3 h-3 ml-1" />
              ) : (
                <ChevronDown className="w-3 h-3 ml-1" />
              )}
            </Button>

            {showTools && (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                {message.toolCalls.map((tool, idx) => (
                  <Card key={idx} className="p-3 bg-accent/50 border-dashed">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="text-xs font-mono"
                        >
                          {tool.name}
                        </Badge>
                      </div>
                      {tool.args && (
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Args:</span>{" "}
                          <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
                            {JSON.stringify(tool.args)}
                          </code>
                        </div>
                      )}
                      {tool.result && (
                        <div className="text-xs flex gap-2">
                          {tool.result.found !== undefined && (
                            <Badge
                              variant={
                                tool.result.found ? "default" : "secondary"
                              }
                              className="text-xs"
                            >
                              {tool.result.found ? "Found" : "Not Found"}
                            </Badge>
                          )}
                          {tool.result.count !== undefined && (
                            <Badge variant="outline" className="text-xs">
                              {tool.result.count} results
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        {message.quickActions &&
          message.quickActions.length > 0 &&
          onActionExecute && (
            <QuickActions
              actions={message.quickActions}
              onActionExecute={onActionExecute}
            />
          )}

        {/* Timestamp */}
        {message.timestamp && (
          <div className="text-xs text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    </motion.div>
  );
}
