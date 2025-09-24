import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..', '..', '..');

const targetUrl = process.env.PLAYWRIGHT_MCP_TARGET ?? 'http://127.0.0.1:3100';
const urlObject = new URL(targetUrl);
const targetPort = urlObject.port || '80';
const expectedTitle = process.env.MCP_EXPECTED_TITLE ?? 'Create Next App';
const expectedHeading = process.env.MCP_EXPECTED_HEADING ?? 'Mindful Journal';


async function startWebApp() {
  console.log(`Starting Next.js dev server for ${targetUrl} ...`);
  const serverEnv = {
    ...process.env,
    PORT: targetPort,
    NEXT_PUBLIC_SUPABASE_TEST_STUB: process.env.NEXT_PUBLIC_SUPABASE_TEST_STUB ?? '1',
  };

  const child = spawn('npm', ['--workspace', 'app/web', 'run', 'dev'], {
    cwd: repoRoot,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk) => {
    process.stdout.write(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk);
  });

  await waitForServerReady(targetUrl, child);

  return child;
}

async function waitForServerReady(url, child) {
  const timeoutMs = 60000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Dev server exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        console.log('Next.js dev server is ready.');
        return;
      }
    } catch (error) {
      // ignore until ready
    }

    await delay(1000);
  }

  throw new Error(`Timed out waiting for ${url} to become ready.`);
}

async function stopWebApp(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  const terminate = new Promise((resolve) => {
    child.once('exit', resolve);
  });
  child.kill('SIGTERM');
  const timeout = delay(5000).then(() => {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
  });
  await Promise.race([terminate, timeout]);
}

async function run() {
  const serverEntry = require.resolve('playwright-mcp/dist/server.js');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    cwd: path.join(__dirname, '..'),
    env: process.env,
    stderr: 'pipe'
  });

  const client = new Client({ name: 'playwright-mcp-sample', version: '0.1.0' });

  let webServerProcess;

  try {
    webServerProcess = await startWebApp();

    await client.connect(transport);
    const tools = await client.listTools();
    console.log('Available tools:', tools.tools.map((tool) => tool.name));

    const initResponse = await client.callTool({
      name: 'init-browser',
      arguments: { url: targetUrl }
    });
    console.log('init-browser response:', initResponse.content?.[0]?.text ?? initResponse);

    const execResponse = await client.callTool({
      name: 'execute-code',
      arguments: {
        code: `async function run(page) {
          await page.waitForLoadState('domcontentloaded');
          return {
            title: await page.title(),
            h1: await page.locator('h1').first().textContent()
          };
        }`
      }
    });
    const execPayloadText = execResponse.content?.[0]?.text;
    if (!execPayloadText) {
      throw new Error('execute-code response did not include textual content.');
    }
    let execPayload;
    try {
      execPayload = JSON.parse(execPayloadText);
    } catch (error) {
      throw new Error(`Unable to parse execute-code payload: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (execPayload.error) {
      throw new Error(`execute-code returned an error: ${JSON.stringify(execPayload)}`);
    }
    const { title, h1 } = execPayload.result ?? {};
    if (title !== expectedTitle) {
      throw new Error(`Unexpected page title. Expected \"${expectedTitle}\", received \"${title}\".`);
    }
    if (!h1 || !h1.includes(expectedHeading)) {
      throw new Error(`Expected first <h1> to include \"${expectedHeading}\" but received \"${h1}\".`);
    }
    console.log('execute-code assertions passed:', execPayloadText);

    const closeResponse = await client.callTool({
      name: 'execute-code',
      arguments: {
        code: `async function run(page) {
          await page.context().browser().close();
          return { closed: true };
        }`
      }
    });
    console.log('close-browser response:', closeResponse.content?.[0]?.text ?? closeResponse);
  } catch (error) {
    console.error('Failed to run sample MCP interaction:', error);
    process.exitCode = 1;
  } finally {
    await transport.close();
    await stopWebApp(webServerProcess);
  }
}

await run();
