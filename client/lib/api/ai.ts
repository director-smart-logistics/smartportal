// AI Chat API Client

export interface QuickAction {
  id: string;
  label: string;
  type: 'update_status' | 'create_package' | 'assign_route' | 'update_delivery_status' | 'add_tracking_note' | 'view_package_details' | 'custom';
  data: any;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
  variant?: 'default' | 'destructive' | 'outline';
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  toolCalls?: Array<{
    name: string;
    args: any;
    result: any;
  }>;
  quickActions?: QuickAction[];
}

export interface ChatStreamEvent {
  type: 'text' | 'tool' | 'error' | 'done' | 'actions';
  content?: string;
  tool?: string;
  args?: any;
  result?: any;
  message?: string;
  actions?: QuickAction[];
}

export class AiChatClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl = `${import.meta.env.VITE_API_URL || '/api'}/ai`) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string) {
    this.token = token;
  }

  async executeAction(action: QuickAction): Promise<any> {
    const response = await fetch(`${this.baseUrl}/execute-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      credentials: 'include', // ✅ Send HttpOnly cookies
      body: JSON.stringify({
        actionType: action.type,
        actionData: action.data,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Action execution failed' }));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async *streamChat(
    message: string,
    history: ChatMessage[] = [],
    language: string = 'es',
  ): AsyncGenerator<ChatStreamEvent> {
    try {
      const response = await fetch(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        credentials: 'include', // ✅ Send HttpOnly cookies
        body: JSON.stringify({ message, history, language }),
      });

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        
        // Try to get error details from response
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const event = JSON.parse(data) as ChatStreamEvent;
              yield event;
            } catch (e) {
              console.error('Failed to parse SSE data:', data, e);
            }
          }
        }
      }
    } catch (error) {
      // Re-throw with better context
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error occurred while connecting to AI service');
    }
  }
}

export const aiChatClient = new AiChatClient();
