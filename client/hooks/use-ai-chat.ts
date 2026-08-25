import { useState, useCallback, useRef } from 'react';
import { aiChatClient, ChatMessage, ChatStreamEvent, QuickAction } from '@/lib/api/ai';
import { getAuthToken } from '@/lib/auth/auth-client';
import { useLocale } from './useLocale';

export interface UseChatOptions {
  onError?: (error: Error) => void;
}

// Helper function to get user-friendly error messages
function getFriendlyErrorMessage(error: Error, language: string): string {
  const errorMessage = error.message.toLowerCase();
  
  // Network errors
  if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
    return language === 'es'
      ? '🔌 Parece que hay un problema de conexión. Por favor verifica tu internet y vuelve a intentar.'
      : '🔌 It looks like there\'s a connection issue. Please check your internet and try again.';
  }
  
  // Authentication errors
  if (errorMessage.includes('401') || errorMessage.includes('unauthorized') || errorMessage.includes('token')) {
    return language === 'es'
      ? '🔐 Tu sesión ha expirado. Por favor recarga la página e inicia sesión nuevamente.'
      : '🔐 Your session has expired. Please refresh the page and log in again.';
  }
  
  // API errors
  if (errorMessage.includes('500') || errorMessage.includes('internal server')) {
    return language === 'es'
      ? '⚠️ Estamos teniendo problemas técnicos en este momento. Por favor intenta de nuevo en unos segundos.'
      : '⚠️ We\'re experiencing technical difficulties right now. Please try again in a few seconds.';
  }
  
  // Rate limit errors
  if (errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
    return language === 'es'
      ? '⏱️ Has enviado muchas solicitudes. Por favor espera un momento antes de intentar nuevamente.'
      : '⏱️ You\'ve sent too many requests. Please wait a moment before trying again.';
  }
  
  // API key errors
  if (errorMessage.includes('api key') || errorMessage.includes('gemini_api_key')) {
    return language === 'es'
      ? '🔑 Hay un problema con la configuración del servicio. Por favor contacta al administrador.'
      : '🔑 There\'s an issue with the service configuration. Please contact the administrator.';
  }
  
  // Timeout errors
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    return language === 'es'
      ? '⏰ La solicitud está tomando demasiado tiempo. Por favor intenta con una pregunta más específica.'
      : '⏰ The request is taking too long. Please try with a more specific question.';
  }
  
  // Generic fallback
  return language === 'es'
    ? '😔 Algo salió mal. No te preocupes, puedes intentar reformular tu pregunta o intentar nuevamente.'
    : '😔 Something went wrong. Don\'t worry, you can try rephrasing your question or try again.';
}

export function useAiChat(options: UseChatOptions = {}) {
  const { language } = useLocale(['ai', 'common']);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      // Add user message
      const userMessage: ChatMessage = {
        role: 'user',
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setStreamingMessage('');

      // Set token for API client (legacy support)
      // ✅ Note: With HttpOnly cookies, authentication is handled automatically
      // via credentials: 'include' in fetch requests
      const token = getAuthToken();
      if (token) {
        aiChatClient.setToken(token);
      }

      const toolCalls: Array<{ name: string; args: any; result: any }> = [];
      let quickActions: QuickAction[] = [];
      let fullResponse = '';

      try {
        const stream = aiChatClient.streamChat(content, messages, language);

        for await (const event of stream) {
          switch (event.type) {
            case 'text':
              if (event.content) {
                fullResponse += event.content;
                setStreamingMessage(fullResponse);
              }
              break;

            case 'tool':
              if (event.tool) {
                toolCalls.push({
                  name: event.tool,
                  args: event.args,
                  result: event.result,
                });
              }
              break;

            case 'actions':
              if (event.actions) {
                quickActions = event.actions;
              }
              break;

            case 'error':
              throw new Error(event.message || 'Chat error');

            case 'done':
              // Finalize assistant message
              const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: fullResponse,
                timestamp: new Date().toISOString(),
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                quickActions: quickActions.length > 0 ? quickActions : undefined,
              };
              setMessages((prev) => [...prev, assistantMessage]);
              setStreamingMessage('');
              break;
          }
        }
      } catch (error) {
        console.error('Chat error:', error);
        const errorObj = error instanceof Error ? error : new Error('Unknown error');
        options.onError?.(errorObj);
        
        // Get friendly error message
        const errorContent = getFriendlyErrorMessage(errorObj, language);
        
        // Add helpful tip
        const helpTip = language === 'es'
          ? '\n\n💡 Tip: Intenta hacer preguntas específicas como "Buscar paquete ABC123" o "Mostrar paquetes pendientes".'
          : '\n\n💡 Tip: Try asking specific questions like "Track package ABC123" or "Show pending packages".';
        
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: errorContent + helpTip,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
        setStreamingMessage('');
      }
    },
    [messages, isLoading, options, language],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingMessage('');
  }, []);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
    setStreamingMessage('');
  }, []);

  return {
    messages,
    isLoading,
    streamingMessage,
    sendMessage,
    clearMessages,
    stopGeneration,
  };
}
