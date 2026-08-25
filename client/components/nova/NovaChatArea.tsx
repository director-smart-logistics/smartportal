import { memo, forwardRef } from "react";
import { NovaMessage } from "./NovaMessage";
import type { NovaMessage as NovaMessageType } from "@/hooks/use-nova-chat";

export interface NovaChatAreaProps {
  messages: NovaMessageType[];
  onDownload?: () => void;
}

export const NovaChatArea = memo(
  forwardRef<HTMLDivElement, NovaChatAreaProps>(function NovaChatArea(
    { messages, onDownload },
    ref,
  ) {
    return (
      <div className="max-w-4xl mx-auto w-full space-y-4">
        {messages.map((message, idx) => (
          <NovaMessage
            key={message.id}
            message={message}
            onDownload={onDownload}
            isLatest={idx === messages.length - 1}
            initialExchangeRate={
              message.resultData?.exchangeRate
                ? String(message.resultData.exchangeRate)
                : undefined
            }
          />
        ))}
        <div ref={ref} />
      </div>
    );
  }),
);
