const { app } = require('@azure/functions');
const { ManagedIdentityCredential } = require('@azure/identity');

const DEFAULT_ORCHESTRATOR_URL =
  'https://Rematch.services.ai.azure.com/api/projects/Rematch_Project/agents/rematch-Orchestrator/endpoint/protocols/openai/responses';

function getOrchestratorUrl() {
  const url = new URL(process.env.ORCHESTRATOR_URL || DEFAULT_ORCHESTRATOR_URL);
  if (!url.searchParams.has('api-version')) url.searchParams.set('api-version', 'v1');
  return url.toString();
}

function extractReply(payload) {
  const response = payload && typeof payload === 'object' && payload.response && typeof payload.response === 'object'
    ? payload.response
    : payload;
  const output = response && typeof response === 'object' && Array.isArray(response.output)
    ? response.output
    : [];
  const outputText = output.flatMap((item) => {
    if (item?.type !== 'message' || !Array.isArray(item.content)) return [];
    return item.content.flatMap((content) =>
      content?.type === 'output_text' && typeof content.text === 'string' ? [content.text] : []
    );
  }).join('\n').trim();
  if (outputText) return outputText;

  for (const key of ['reply', 'message', 'content']) {
    if (typeof payload?.[key] === 'string' && payload[key].trim()) return payload[key].trim();
  }
  return '';
}

app.http('orchestrate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      context.log(400);
      return {
        status: 400,
        jsonBody: { error: 'Invalid request', details: 'Request body must be valid JSON.' }
      };
    }

    const userMessage = typeof body?.message === 'string' ? body.message : body?.input;
    if (typeof userMessage !== 'string' || !userMessage.trim()) {
      context.log(400);
      return {
        status: 400,
        jsonBody: { error: 'Invalid request', details: 'A non-empty message or input string is required.' }
      };
    }

    if ((body.matchId != null && typeof body.matchId !== 'string') ||
        (body.eventId != null && typeof body.eventId !== 'string')) {
      context.log(400);
      return {
        status: 400,
        jsonBody: { error: 'Invalid request', details: 'matchId and eventId must be strings when provided.' }
      };
    }

    const contextLines = [];
    if (body.matchId?.trim()) contextLines.push(`matchId: ${body.matchId.trim()}`);
    if (body.eventId?.trim()) contextLines.push(`eventId: ${body.eventId.trim()}`);

    const input = [
      userMessage.trim(),
      ...(contextLines.length ? [`Decision context:\n${contextLines.join('\n')}`] : []),
      'Use the Rematch backend tools and orchestration pipeline. Ground every claim in returned backend data. Do not invent or estimate scores, statistics, or any numbers; say when the data is unavailable.'
    ].join('\n\n');

    let tokenResponse;
    try {
      const credential = new ManagedIdentityCredential();
      tokenResponse = await credential.getToken('https://ai.azure.com/.default');
    } catch {
      context.log(500);
      return {
        status: 500,
        jsonBody: { error: 'Authentication failed', details: 'Unable to acquire a managed identity token.' }
      };
    }

    if (!tokenResponse?.token) {
      context.log(500);
      return {
        status: 500,
        jsonBody: { error: 'Authentication failed', details: 'Unable to acquire a managed identity token.' }
      };
    }

    let response;
    try {
      response = await fetch(getOrchestratorUrl(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenResponse.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ input })
      });
    } catch {
      context.log(502);
      return {
        status: 502,
        jsonBody: { error: 'Orchestrator unavailable', details: 'The Foundry orchestrator request could not be completed.' }
      };
    }

    context.log(response.status);
    try {
      const data = await response.json();
      if (!response.ok) return { status: response.status, jsonBody: data };
      return { status: response.status, jsonBody: { reply: extractReply(data) } };
    } catch {
      context.log(502);
      return {
        status: 502,
        jsonBody: { error: 'Invalid orchestrator response', details: 'The Foundry orchestrator did not return valid JSON.' }
      };
    }
  }
});
