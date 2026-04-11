// ==========================================
// Multi-Agent Coordinator
// Routes tasks to multiple Copilot Bridge agents — via direct HTTP or Agent Hub
// ==========================================

/**
 * Agent registry format (from .env MULTI_AGENT_REGISTRY JSON):
 * [
 *   { "name": "network-ai", "url": "http://127.0.0.1:3120", "apiKey": "", "skills": ["api", "backend"] },
 *   { "name": "invoicing", "url": "http://127.0.0.1:3121", "apiKey": "secret", "skills": ["frontend", "invoicing"] },
 *   { "name": "sapcode",   "url": "http://127.0.0.1:3122", "apiKey": "", "skills": ["sap", "erp"] }
 * ]
 *
 * Hub mode: set AGENT_HUB_URL and AGENT_HUB_SECRET to route through the WebSocket hub.
 * In hub mode, agents are discovered automatically — no manual registry needed.
 */

const TIMEOUT_MS = 180_000; // 3 minutes per agent task
const HEALTH_TIMEOUT_MS = 3_000;

// ── Hub Configuration ─────────────────────────────────────

const HUB_URL = process.env.AGENT_HUB_URL || ''; // e.g. http://hub.yoursite.com:8090
const HUB_SECRET = process.env.AGENT_HUB_SECRET || '';

function isHubMode() { return !!HUB_URL; }

function hubHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (HUB_SECRET) h['Authorization'] = `Bearer ${HUB_SECRET}`;
  return h;
}

// ── Agent Registry ────────────────────────────────────────

let agents = [];

/**
 * Load agent registry from MULTI_AGENT_REGISTRY env var (JSON array)
 * or auto-discover from MULTI_AGENT_PORTS (comma-separated ports on localhost)
 */
export function loadAgentRegistry() {
  // Hub mode — agents are dynamic, discovered via hub API
  if (isHubMode()) {
    console.log(`[MultiAgent] Hub mode — agents discovered from ${HUB_URL}`);
    return agents;
  }

  // Option 1: Full JSON registry
  const registryJson = process.env.MULTI_AGENT_REGISTRY;
  if (registryJson) {
    try {
      agents = JSON.parse(registryJson);
      console.log(`[MultiAgent] Loaded ${agents.length} agents from registry`);
      return agents;
    } catch (e) {
      console.error(`[MultiAgent] Failed to parse MULTI_AGENT_REGISTRY: ${e.message}`);
    }
  }

  // Option 2: Simple port list — auto-discover names via /health
  const ports = (process.env.MULTI_AGENT_PORTS || '').split(',').map(p => p.trim()).filter(Boolean);
  if (ports.length > 0) {
    agents = ports.map(port => ({
      name: `agent-${port}`,
      url: `http://127.0.0.1:${port}`,
      apiKey: '',
      skills: [],
    }));
    console.log(`[MultiAgent] Created ${agents.length} agents from port list: ${ports.join(', ')}`);
    return agents;
  }

  // Fallback: single agent on default port
  const defaultPort = process.env.COPILOT_BRIDGE_PORT || 3120;
  agents = [{ name: 'default', url: `http://127.0.0.1:${defaultPort}`, apiKey: '', skills: [] }];
  console.log(`[MultiAgent] Single agent mode on port ${defaultPort}`);
  return agents;
}

export function getAgents() {
  return agents;
}

// ── Health & Discovery ────────────────────────────────────

/**
 * Check health + discover workspace info for an agent
 */
async function probeAgent(agent) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(`${agent.url}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { ...agent, online: false };
    const info = await res.json();
    return {
      ...agent,
      online: true,
      workspace: info.workspace,
      workspaceFull: info.workspaceFull,
      agentName: info.agentName || agent.name,
      tools: info.tools,
      model: info.model,
    };
  } catch {
    return { ...agent, online: false };
  }
}

/**
 * Discover all online agents — returns enriched agent objects
 */
export async function discoverAgents() {
  if (isHubMode()) return discoverAgentsViaHub();
  const results = await Promise.all(agents.map(probeAgent));
  // Update registry with discovered names
  for (const r of results) {
    if (r.online && r.agentName) {
      const idx = agents.findIndex(a => a.url === r.url);
      if (idx >= 0) agents[idx].name = r.agentName;
    }
  }
  return results;
}

/**
 * Discover agents via the hub REST API
 */
async function discoverAgentsViaHub() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(`${HUB_URL}/agents`, { headers: hubHeaders(), signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.agents || []).map(a => ({
      ...a,
      online: true,
      agentName: a.name,
      url: `hub:${a.name}`,
    }));
  } catch (e) {
    console.error(`[MultiAgent] Hub discovery failed: ${e.message}`);
    return [];
  }
}

/**
 * Get a summary of all agents for display
 */
export async function getAgentStatus() {
  // Hub status
  let hubLine = '';
  if (isHubMode()) {
    try {
      const res = await fetch(`${HUB_URL}/health`, { signal: AbortSignal.timeout(3000) });
      const info = await res.json();
      hubLine = `🌐 *Hub*: ${HUB_URL} — ${info.agents} agents, uptime ${info.uptime}s\n\n`;
    } catch {
      return `🌐 *Hub*: ${HUB_URL} — ❌ OFFLINE`;
    }
  }

  const discovered = await discoverAgents();
  const lines = discovered.map((a, i) => {
    if (a.online) {
      return `${i + 1}. ✅ ${a.agentName || a.name} — ${a.workspace || '?'} (${a.tools || '?'} tools, skills: ${(a.skills || []).join(', ') || 'general'})`;
    }
    return `${i + 1}. ❌ ${a.name} — offline (${a.url})`;
  });
  const online = discovered.filter(a => a.online).length;
  return `${hubLine}🤖 *Agent Network* — ${online}/${discovered.length} online\n\n${lines.join('\n')}`;
}

// ── Task Execution ────────────────────────────────────────

/**
 * Send a task to a specific agent and get the response.
 * Routes through hub if in hub mode, otherwise direct HTTP.
 */
export async function sendToAgent(agent, message, sender = 'coordinator') {
  if (isHubMode()) return sendToAgentViaHub(agent.name || agent, message, sender);

  const headers = { 'Content-Type': 'application/json' };
  if (agent.apiKey) headers['Authorization'] = `Bearer ${agent.apiKey}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${agent.url}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, sender }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      return { success: false, agent: agent.name, error: err.error || `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { success: true, agent: agent.name, response: data.response };
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Timed out (3 min)' : err.message;
    return { success: false, agent: agent.name, error: msg };
  }
}

/**
 * Send a task to an agent via the hub's REST API
 */
async function sendToAgentViaHub(agentName, message, sender) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${HUB_URL}/task`, {
      method: 'POST',
      headers: hubHeaders(),
      body: JSON.stringify({ agent: agentName, message, sender }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      return { success: false, agent: agentName, error: err.error || `HTTP ${res.status}` };
    }

    return await res.json();
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Timed out (3 min)' : err.message;
    return { success: false, agent: agentName, error: msg };
  }
}

/**
 * Send a task to an agent by name
 */
export async function sendToAgentByName(name, message, sender = 'coordinator') {
  if (isHubMode()) return sendToAgentViaHub(name, message, sender);
  const agent = agents.find(a => a.name.toLowerCase() === name.toLowerCase());
  if (!agent) return { success: false, agent: name, error: `Agent "${name}" not found in registry` };
  return sendToAgent(agent, message, sender);
}

// ── Parallel & Sequential Execution ──────────────────────

/**
 * Execute tasks in parallel across multiple agents
 * @param {Array<{agent: string, task: string}>} taskList
 * @param {string} sender
 * @returns {Promise<Array<{agent: string, success: boolean, response?: string, error?: string}>>}
 */
export async function executeParallel(taskList, sender = 'coordinator') {
  const promises = taskList.map(({ agent: name, task }) => sendToAgentByName(name, task, sender));
  return Promise.all(promises);
}

/**
 * Execute tasks sequentially, passing each result as context to the next
 * @param {Array<{agent: string, task: string}>} taskList
 * @param {string} sender
 * @returns {Promise<Array<{agent: string, success: boolean, response?: string, error?: string}>>}
 */
export async function executeSequential(taskList, sender = 'coordinator') {
  const results = [];
  let previousContext = '';

  for (const { agent: name, task } of taskList) {
    // Inject previous agent's output as context
    const fullTask = previousContext
      ? `Previous agent output:\n---\n${previousContext}\n---\n\nYour task: ${task}`
      : task;

    const result = await sendToAgentByName(name, fullTask, sender);
    results.push(result);

    if (result.success) {
      previousContext = result.response;
    } else {
      previousContext = `[Agent ${name} failed: ${result.error}]`;
    }
  }

  return results;
}

/**
 * Broadcast a message to ALL online agents (e.g., "run your tests")
 */
export async function broadcastToAll(message, sender = 'coordinator') {
  if (isHubMode()) {
    try {
      const res = await fetch(`${HUB_URL}/broadcast`, {
        method: 'POST', headers: hubHeaders(),
        body: JSON.stringify({ message, sender }),
      });
      const data = await res.json();
      return data.results || [];
    } catch (e) {
      return [{ success: false, agent: 'hub', error: e.message }];
    }
  }
  const discovered = await discoverAgents();
  const online = discovered.filter(a => a.online);
  if (online.length === 0) return [{ success: false, agent: 'all', error: 'No agents online' }];
  return Promise.all(online.map(a => sendToAgent(a, message, sender)));
}

// ── Multi-Agent Command Parser ────────────────────────────

/**
 * Check if a message is a multi-agent command
 * Prefixes: !agents, !team, !multi
 */
export function isMultiAgentCommand(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return t.startsWith('!agents') || t.startsWith('!team') || t.startsWith('!multi');
}

/**
 * Handle multi-agent commands:
 *   !agents status          — show all agents
 *   !agents list            — same as status
 *   !agents send <name> <task>  — send task to specific agent
 *   !agents all <task>      — broadcast to all
 *   !team <task description> — auto-decompose and route (uses coordinator agent)
 */
export async function handleMultiAgentCommand(sender, text, coordinatorBridge) {
  const t = text.trim();
  const prefix = t.match(/^!(agents|team|multi)\s*/i);
  if (!prefix) return 'Invalid multi-agent command.';
  const body = t.slice(prefix[0].length).trim();
  const cmd = body.split(/\s+/)[0]?.toLowerCase() || '';

  // !agents status / !agents list
  if (cmd === 'status' || cmd === 'list' || body === '') {
    return getAgentStatus();
  }

  // !agents send <name> <task>
  if (cmd === 'send') {
    const rest = body.slice(4).trim();
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx < 0) return '❌ Usage: `!agents send <agent-name> <task>`';
    const agentName = rest.slice(0, spaceIdx);
    const task = rest.slice(spaceIdx + 1);
    const result = await sendToAgentByName(agentName, task, sender);
    if (result.success) {
      return `✅ *${result.agent}* responded:\n\n${result.response}`;
    }
    return `❌ *${result.agent}* failed: ${result.error}`;
  }

  // !agents all <task>
  if (cmd === 'all') {
    const task = body.slice(3).trim();
    if (!task) return '❌ Usage: `!agents all <task>`';
    const results = await broadcastToAll(task, sender);
    return formatResults(results);
  }

  // !team <complex task> — decompose and route using coordinator agent
  if (prefix[1].toLowerCase() === 'team') {
    return handleTeamTask(sender, body, coordinatorBridge);
  }

  return '❌ Unknown command. Try: `!agents status`, `!agents send <name> <task>`, `!agents all <task>`, or `!team <task>`';
}

/**
 * Team task: uses the coordinator bridge to decompose a complex task into subtasks,
 * then routes them to the appropriate agents
 */
async function handleTeamTask(sender, taskDescription, coordinatorBridge) {
  // First, discover what agents are available
  const discovered = await discoverAgents();
  const online = discovered.filter(a => a.online);

  if (online.length === 0) {
    return '❌ No agents online. Start VS Code windows with Copilot Bridge enabled.';
  }

  if (online.length === 1) {
    // Only one agent — just send it directly
    const result = await sendToAgent(online[0], taskDescription, sender);
    if (result.success) return `✅ *${result.agent}*:\n\n${result.response}`;
    return `❌ *${result.agent}* failed: ${result.error}`;
  }

  // Ask the coordinator to decompose the task
  const agentList = online.map(a => `- "${a.agentName || a.name}" (workspace: ${a.workspace}, skills: ${a.skills?.join(', ') || 'general'})`).join('\n');

  const decompositionPrompt = `You are a task coordinator for a team of AI coding agents. Each agent runs in its own VS Code workspace.

Available agents:
${agentList}

The user wants: "${taskDescription}"

Decompose this into subtasks for each agent. Reply with ONLY a JSON array, no other text:
[
  {"agent": "agent-name", "task": "specific task description", "depends_on": null},
  {"agent": "agent-name", "task": "specific task description", "depends_on": "agent-name"}
]

Rules:
- Use exact agent names from the list above
- Set depends_on to another agent's name if this task needs that agent's output first (sequential)
- Set depends_on to null if the task can run in parallel
- Be specific about what each agent should do in their workspace`;

  // Use the first online agent (or a dedicated coordinator) to decompose
  const decomp = await sendToAgent(online[0], decompositionPrompt, 'coordinator');
  if (!decomp.success) {
    return `❌ Failed to decompose task: ${decomp.error}`;
  }

  // Parse the task plan
  let taskPlan;
  try {
    // Extract JSON from response (might be wrapped in markdown code fences)
    const jsonMatch = decomp.response.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) throw new Error('No JSON array found in decomposition');
    taskPlan = JSON.parse(jsonMatch[0]);
  } catch (e) {
    return `❌ Failed to parse task plan: ${e.message}\n\nRaw response:\n${decomp.response}`;
  }

  // Execute the plan: parallel for independent tasks, sequential for dependent ones
  let status = `📋 *Task Plan* (${taskPlan.length} subtasks for ${online.length} agents):\n\n`;
  for (const [i, t] of taskPlan.entries()) {
    status += `${i + 1}. *${t.agent}*: ${t.task}${t.depends_on ? ` (after ${t.depends_on})` : ' (parallel)'}\n`;
  }
  status += '\n⏳ Executing...\n';

  // Group into waves: parallel tasks first, then sequential chains
  const completed = new Map(); // agent name → result
  const remaining = [...taskPlan];
  const allResults = [];

  while (remaining.length > 0) {
    // Find tasks whose dependencies are satisfied
    const ready = remaining.filter(t =>
      !t.depends_on || completed.has(t.depends_on)
    );

    if (ready.length === 0) {
      // Stuck — circular dependency or missing agent
      status += '\n❌ Stuck: unresolvable dependencies remaining';
      break;
    }

    // Execute ready tasks in parallel
    const wave = ready.map(t => {
      let taskMsg = t.task;
      if (t.depends_on && completed.has(t.depends_on)) {
        const prev = completed.get(t.depends_on);
        taskMsg = `Context from ${t.depends_on}:\n---\n${prev.response?.slice(0, 2000) || '(no output)'}\n---\n\n${t.task}`;
      }
      return { agentName: t.agent, task: taskMsg, original: t };
    });

    const waveResults = await Promise.all(
      wave.map(w => sendToAgentByName(w.agentName, w.task, sender))
    );

    for (let i = 0; i < wave.length; i++) {
      const result = waveResults[i];
      completed.set(wave[i].original.agent, result);
      allResults.push(result);
      // Remove from remaining
      const idx = remaining.indexOf(wave[i].original);
      if (idx >= 0) remaining.splice(idx, 1);
    }
  }

  // Format final results
  status += '\n' + formatResults(allResults);
  return status;
}

/**
 * Format multi-agent results for WhatsApp
 */
function formatResults(results) {
  const lines = results.map(r => {
    if (r.success) {
      const preview = r.response?.length > 500
        ? r.response.slice(0, 500) + '...'
        : r.response;
      return `✅ *${r.agent}*:\n${preview}`;
    }
    return `❌ *${r.agent}*: ${r.error}`;
  });
  const ok = results.filter(r => r.success).length;
  return `Results: ${ok}/${results.length} succeeded\n\n${lines.join('\n\n')}`;
}

// Initialize on import
loadAgentRegistry();
