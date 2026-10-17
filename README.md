# MatchMind ⚽

> **Don't just watch what happened. Understand why it happened.**

MatchMind is an explainable football intelligence platform designed to
help fans and analysts understand the decisions behind key moments in a
match. Instead of showing statistics alone, MatchMind aims to compare a
player's actual action with plausible alternatives and explain the
difference using calculated values and traceable evidence.

Built as a project for the **Microsoft Inside the Game Hackathon**.

## The Problem

Traditional match dashboards show events and statistics, but they often
do not explain why a decision mattered. AI-generated commentary can also
sound convincing without being grounded in match evidence.

MatchMind aims to bridge that gap by combining deterministic football
analytics with evidence-grounded explanations.

## Our Approach

MatchMind is designed around one key question:

**"What could have happened if the player had chosen differently?"**

For a selected decision---such as a pass, shot, or carry---the system
aims to:

1.  Identify the action that actually happened.
2.  Evaluate the resulting state using the project's decision-value
    model.
3.  Identify plausible alternatives where the available data allows it.
4.  Compare the actual action with those alternatives.
5.  Explain the comparison in clear language.
6.  Let users inspect the events and calculations supporting the
    explanation.

Values produced by the system are estimates from our model. They should
not be interpreted as objective probabilities or guaranteed predictions
about real-world outcomes.

## Planned Features

-   **Interactive Match View:** A 2D pitch, match score, event timeline,
    and key moments.
-   **Decision Explorer:** Compare an actual action with plausible
    alternatives.
-   **Match Insights:** Summaries, player metrics, and match-momentum
    visualizations.
-   **Evidence Drawer:** Inspect the events and calculations behind an
    analytical claim.
-   **Fan and Analyst Modes:** Choose between accessible explanations
    and more detailed analysis.
-   **English and Arabic UI:** Language support planned for the user
    interface and explanations.
-   **System Metrics:** Measure evidence support, verifier outcomes, and
    explanation latency.
-   **Synthetic Match Simulation:** Generate fictional match events for
    repeatable demos and testing.

> Features are planned and may change during development. Only mark a
> feature as complete when it has been implemented and tested in the
> repository.

## How It Works

The intended processing pipeline is:

1.  **Ingest:** Receive synthetic match events such as passes, shots,
    tackles, pressure events, and possession changes.
2.  **Interpret:** Update match state and calculate statistics using
    deterministic code.
3.  **Evaluate:** Calculate decision values and compare plausible
    alternatives.
4.  **Explain:** Generate a human-readable explanation based on
    calculated results.
5.  **Verify:** Check that claims are supported by available event IDs
    and calculations.
6.  **Render:** Display the analysis, evidence, and match events in the
    frontend.

The core principle is that **code calculates the values; AI helps
explain them**. The system should not ask a language model to invent
match statistics.

## Pages

  -----------------------------------------------------------------------
  Page                                Purpose
  ----------------------------------- -----------------------------------
  Dashboard                           Browse matches and open a match
                                      analysis

  Match Analysis                      Explore the pitch, score, timeline,
                                      and key moments

  Decision Explorer                   Compare a player's actual decision
                                      with alternatives

  Match Insights                      Review match summaries and
                                      performance insights

  System Metrics                      Inspect reliability and performance
                                      measurements

  Settings (optional)                 Choose language and analysis mode
  -----------------------------------------------------------------------

## Technology Stack

The planned stack is:

-   **Frontend:** React, TypeScript, and SVG-based pitch visualizations
-   **Backend API:** Python and FastAPI
-   **Live updates:** WebSockets, if needed for the event stream
-   **Data storage:** SQLite initially; PostgreSQL only if required
-   **Analytics and simulation:** Python, with NumPy/Pandas where useful
-   **AI orchestration:** Microsoft Foundry and Microsoft Agent
    Framework, subject to implementation and availability
-   **Testing:** pytest for backend and analytics tests
-   **Version control and automation:** Git, GitHub, and GitHub Actions

This list describes the intended architecture. Update it to reflect the
technologies actually used in the final implementation.

## Data and Responsible Use

-   The demo is intended to use **synthetic football data**.
-   Fictional teams and players should be used unless data rights and
    hackathon rules permit otherwise.
-   Decision values are model estimates, not certainties.
-   Explanations should link back to supporting events and calculations.
-   Unsupported claims should be rejected, corrected, or replaced with a
    safe fallback.
-   MatchMind is an analytics and explanation prototype, not a betting
    or gambling product.

## Getting Started

Setup instructions will be added once the repository structure and
dependencies are finalized.

The intended development workflow is:

1.  Clone the repository.
2.  Install frontend and backend dependencies separately.
3.  Configure environment variables using an example file.
4.  Start the backend API.
5.  Start the frontend development server.
6.  Open the local application and select a sample match.

Do not commit secrets, API keys, credentials, or local environment
files.

## Project Structure

The repository is expected to evolve toward a structure similar to:

``` text
MatchMind/
├── frontend/
├── backend/
├── docs/
├── tests/
├── .gitignore
└── README.md
```

Adjust this tree to match the actual repository. Do not create empty
folders just to match the example.

## Evaluation and Testing

Planned measurements include:

-   **Evidence support rate:** How many explanation claims are supported
    by the referenced events and calculations?
-   **Verifier rejection rate:** How often are unsupported claims
    rejected?
-   **Correction success rate:** How often does a corrected explanation
    pass verification?
-   **Explanation latency:** How long does it take to display an
    explanation after an event arrives?
-   **Key-moment coverage:** How many important moments receive
    analysis?

Metrics should be calculated from recorded test runs and reported
honestly. Do not publish placeholder numbers as measured results.

## Current Status

**Status: In development.**

This README describes the project direction and planned architecture.
Replace this section with an accurate implementation checklist as
features are completed.

-   [ ] Repository and API foundation
-   [ ] Frontend core pages
-   [ ] Frontend/backend integration
-   [ ] Synthetic match simulator and validation tests
-   [ ] Decision-value calculations and alternative comparison
-   [ ] Evidence-linked explanations and verification
-   [ ] Demo deployment and final testing

## Demo

-   **Live demo:** Add the public demo URL when available.
-   **Demo video:** Add the video URL when available.
-   **Screenshots:** Add screenshots of the actual working application.

## Team

Add the team members and their contributions here.

## Acknowledgements

Developed for the Microsoft Inside the Game Hackathon. Microsoft, the
Premier League, and their respective marks belong to their owners. This
project is an independent hackathon submission and does not imply
official endorsement.

------------------------------------------------------------------------

**MatchMind --- Every explanation should have evidence.**
