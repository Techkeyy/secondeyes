import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { budgetSummary, openLink, payFromBudget } from '@/lib/server/connector';
import { overGlobalLimit, rateLimited } from '@/lib/server/limit';

export const dynamic = 'force-dynamic';

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
const failed = (e: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: e instanceof Error ? e.message : 'The request failed.' }] });

async function handle(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const link = await openLink((await params).token);
  if (!link) return new Response('Not found', { status: 404 });
  if (rateLimited('connector', String(link.id), 30) || overGlobalLimit('connector')) return new Response('Too many requests. Wait a minute and try again.', { status: 429 });

  const server = new McpServer({ name: 'secondeyes', version: '0.1.0' });
  server.registerTool(
    'secondeyes_budget',
    {
      title: 'Check the SecondEyes budget',
      description: 'Shows what this budget allows: the owner’s instruction, the money left, the limits, and every payment attempted so far. Read it before paying.',
      annotations: { readOnlyHint: true },
    },
    async () => budgetSummary(link.id).then(text, failed),
  );
  server.registerTool(
    'secondeyes_pay',
    {
      title: 'Make a payment through SecondEyes',
      description:
        'Pays from the budget. Each payment is checked against the owner’s instruction before any money moves, and it may be refused. Use this for every payment. status is "paid" only when the money was sent. If it is refused, do not retry with different wording: tell the person who owns this budget.',
      inputSchema: {
        payee: z.string().max(64).describe('The NEAR account to pay'),
        amount_near: z.string().max(40).describe('The amount in NEAR, as a plain number such as 0.1'),
        purpose: z.string().max(200).describe('Honestly, what this payment is for, such as the invoice number'),
      },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async (args) => payFromBudget(link.id, link.key, args).then(text, failed),
  );

  // Stateless: a new server per request, and nothing kept once it answers.
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
