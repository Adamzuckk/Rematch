# Ask the Analyst orchestration

- The Decision Explorer browser sends chat text and the current `matchId`/`eventId` to the Azure Function at `/api/orchestrate`.
- The Function calls the Foundry Responses endpoint using its system-assigned Managed Identity.
- Foundry/Entra access tokens stay server-side and are never included in the frontend bundle or Function response.
- The Function returns the assistant's extracted reply text; the chat renders it as a readable message bubble.
- Decision data may be synthetic demo data and is not official match statistics.
- Code calculates the scores; AI explains returned backend evidence and must not invent scores or numbers.
