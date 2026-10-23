# Decision What-If (frame-accurate)

## What it is
Side-by-side comparison of the **observed** action and one **hypothetical alternative** from `GET .../decision-analysis`.

## What it is not
- Not Monte Carlo of the rest of the match
- Not win probability or invented xG
- Not frontend re-scoring

## UI
Decision Explorer → **Decision What-If** panel. Selection shares state with Pick Your Pass when coordinates exist.

## Agent / Foundry
Explain comparisons only from tool JSON (`observed`, `alternatives`, `ranking`, `claims`). Refuse future-score what-ifs.
