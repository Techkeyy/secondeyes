// The SecondEyes tool for agents.
//
//   secondeyes-agent                 runs as an MCP server, for agent apps that plug in tools
//   secondeyes-agent budget          prints the budget as JSON, for anything else
//   secondeyes-agent pay --payee x.testnet --amount 0.1 --purpose "Invoice 12"
//
// Settings come from the environment: AGENT_KEY, SECONDEYES_BUDGET, SECONDEYES_SITE,
// and optionally SECONDEYES_CONTRACT and SECONDEYES_RPC.
import { parseArgs } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getBudget, loadConfig, pay } from './pay.mjs';

const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const failed = (e) => ({ isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] });

async function serve(config) {
  const server = new McpServer({ name: 'secondeyes', version: '0.1.0' });

  server.registerTool(
    'secondeyes_budget',
    {
      title: 'Check the SecondEyes budget',
      description: 'Shows what this budget allows: the owner’s instruction, the money left, the limits, and every payment attempted so far. Read it before paying.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        return text(await getBudget(config));
      } catch (e) {
        return failed(e);
      }
    },
  );

  server.registerTool(
    'secondeyes_pay',
    {
      title: 'Make a payment through SecondEyes',
      description:
        'Pays from the budget. Each payment is checked against the owner’s instruction before any money moves, and it may be refused. Use this for every payment. status "paid" means the money was sent. status "refused" means it was not: do not retry with different wording, tell the owner.',
      inputSchema: {
        payee: z.string().describe('The NEAR account to pay'),
        amount_near: z.string().describe('The amount in NEAR, as a plain number such as 0.1'),
        purpose: z.string().max(200).describe('Honestly, what this payment is for, such as the invoice number'),
      },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        return text(await pay(config, args));
      } catch (e) {
        return failed(e);
      }
    },
  );

  await server.connect(new StdioServerTransport());
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const config = loadConfig();
  if (!command) return serve(config);
  if (command === 'budget') return console.log(JSON.stringify(await getBudget(config), null, 2));
  if (command === 'pay') {
    const { values: v } = parseArgs({ args: rest, options: { payee: { type: 'string' }, amount: { type: 'string' }, purpose: { type: 'string', default: '' } } });
    if (!v.payee || !v.amount) throw new Error('Usage: secondeyes-agent pay --payee <account> --amount <NEAR> [--purpose <text>]');
    const result = await pay(config, { payee: v.payee, amount_near: v.amount, purpose: v.purpose });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'paid' ? 0 : 1;
    return;
  }
  throw new Error(`Unknown command "${command}". Use budget or pay, or no command to run as an MCP server.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
