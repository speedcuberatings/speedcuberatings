import { NextRequest } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ProgressNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Streaming endpoint for the /ask chat interface.
 *
 * Forwards a user question to the Devin MCP server's `ask_question` tool,
 * scoped to this exact repo. Returns a text/event-stream response so the
 * client can render progress as it arrives.
 *
 * Env:
 *   - DEVIN_API_KEY : Devin API key (bearer). Server-only; never exposed.
 *
 * The MCP `tools/call` RPC is request/response, but the server can emit
 * `notifications/progress` events mid-call if it wants to stream partial
 * content. We subscribe to those and forward them as SSE `progress` frames;
 * the final tool result comes through as a `final` frame. Clients that
 * only care about the answer can ignore `progress` and render `final`.
 */

const REPO = 'speedcuberatings/speedcuberatings';
const MCP_URL = 'https://mcp.devin.ai/mcp';
const QUESTION_MAX = 4000;

interface AskPayload {
  question?: unknown;
  history?: unknown;
}

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

function isHistory(v: unknown): v is HistoryTurn[] {
  return (
    Array.isArray(v) &&
    v.every(
      (t) =>
        t &&
        typeof t === 'object' &&
        (t as HistoryTurn).role &&
        typeof (t as HistoryTurn).content === 'string',
    )
  );
}

function buildQuestion(question: string, history: HistoryTurn[]): string {
  if (history.length === 0) return question;
  // ask_question is one-shot; fold prior turns into the prompt so follow-ups
  // have context. Kept compact to stay under any server-side length cap.
  const prior = history
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
    .join('\n\n');
  return `Conversation so far:\n${prior}\n\nCurrent question: ${question}`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEVIN_API_KEY;
  if (!apiKey) {
    return new Response('Ask endpoint not configured', { status: 503 });
  }

  let raw: AskPayload;
  try {
    raw = (await req.json()) as AskPayload;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const question =
    typeof raw.question === 'string' ? raw.question.trim() : '';
  if (!question) return new Response('Missing question', { status: 400 });
  if (question.length > QUESTION_MAX) {
    return new Response('Question too long', { status: 400 });
  }
  const history = isHistory(raw.history) ? raw.history.slice(-10) : [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      let client: Client | null = null;
      try {
        const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
          requestInit: {
            headers: { Authorization: `Bearer ${apiKey}` },
          },
        });
        client = new Client(
          { name: 'speedcuberatings-ask', version: '0.1.0' },
          { capabilities: {} },
        );

        // Forward MCP progress notifications (if any) to the SSE client.
        client.setNotificationHandler(
          ProgressNotificationSchema,
          async (n) => {
            const params = n.params ?? {};
            send('progress', {
              progress: params.progress,
              total: params.total,
              message: (params as { message?: string }).message,
            });
          },
        );

        await client.connect(transport);
        send('status', { state: 'connected' });

        const result = await client.callTool({
          name: 'ask_question',
          arguments: {
            question: buildQuestion(question, history),
            repoName: REPO,
          },
        });

        // `content` is an array of MCP content blocks; we only render text.
        const content = Array.isArray(result.content) ? result.content : [];
        const text = content
          .filter(
            (c): c is { type: 'text'; text: string } =>
              !!c && typeof c === 'object' && (c as { type?: string }).type === 'text',
          )
          .map((c) => c.text)
          .join('\n\n');

        send('final', { text, isError: !!result.isError });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send('error', { message });
      } finally {
        try {
          await client?.close();
        } catch {
          // ignore
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
