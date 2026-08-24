# EPL Score Predictor - Scoring Engine Specification

This document details the exact scoring methodology used by the Premier League Score Predictor system.

---

## 🎯 1. Base Points (Mutually Exclusive)

For any given match, players earn points based on the highest applicable tier:

| Tier | Icon | Title | Description | Base Pts | Example |
| :---: | :---: | :--- | :--- | :---: | :--- |
| **Tier 1** | 🔮 | **The Oracle** | Exact match scoreline | **6 pts** | Actual `3–1` \| Predicted `3–1` |
| **Tier 2** | 📋 | **The Manager** | Correct outcome (Home Win / Away Win / Draw) AND exact goal difference ($GD = \text{Home} - \text{Away}$) | **4 pts** | Actual `3–1` ($GD=+2$) \| Predicted `2–0` ($GD=+2$)<br>Actual `2–2` ($GD=0$) \| Predicted `1–1` ($GD=0$) |
| **Tier 3** | 🎙️ | **The Pundit** | Correct outcome, incorrect GD, but correctly predicted home or away score | **3 pts** | Actual `3–1` \| Predicted `3–0` or `2–1` |
| **Tier 4** | 📣 | **The Fan** | Correct outcome only; GD and team scores are both incorrect | **2 pts** | Actual `3–1` \| Predicted `4–0` or `1–0` |
| **Tier 5** | 🎲 | **The Lucky Guess** | Incorrect outcome, but correctly predicted one team's exact goal tally | **1 pt** | Actual `3–1` (Home Win) \| Predicted `3–3` (Draw) or `0–1` (Away Win) |
| **Tier 6** | 🛋️ | **The Casual** | Incorrect outcome and zero correct team goals | **0 pts** | Actual `3–1` \| Predicted `0–2` |

---

## 🔥 2. Bonus Points (Additive)

Bonus points stack on top of base points when their criteria are met:

### 1. High-Scoring Thriller Bonus (+1 pt)
* **Trigger**: Total actual match goals $\ge 4$ (e.g., `3–1`, `2–2`, `4–0`, `4–3`).
* **Condition**: Player must have earned at least Tier 1, 2, 3, or 4 base points (must have correctly predicted the match outcome).

### 2. Exact Draw Premium (+1 pt)
* **Trigger**: Match ends in a draw, and the player correctly predicts the exact draw scoreline (e.g., actual `2–2`, predicted `2–2`).
* **Stacking**: An exact draw yields $6\text{ (The Oracle)} + 1\text{ (Draw Premium)} = \mathbf{7\text{ pts}}$ (or $\mathbf{8\text{ pts}}$ if total goals $\ge 4$, e.g., `2–2` or `3–3`).

---

## 📊 3. Comprehensive Point Scenarios Matrix

| Actual Score | Predicted Score | Base Tier Met | Base Pts | High-Scoring (+1) | Draw Premium (+1) | Total Pts |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: |
| **3–1** (Total: 4) | **3–1** | 🔮 Tier 1 - The Oracle | 6 | +1 (Goals $\ge 4$) | - | **7 pts** |
| **3–1** (Total: 4) | **2–0** | 📋 Tier 2 - The Manager ($+2$) | 4 | +1 (Goals $\ge 4$) | - | **5 pts** |
| **3–1** (Total: 4) | **3–0** | 🎙️ Tier 3 - The Pundit | 3 | +1 (Goals $\ge 4$) | - | **4 pts** |
| **3–1** (Total: 4) | **4–0** | 📣 Tier 4 - The Fan | 2 | +1 (Goals $\ge 4$) | - | **3 pts** |
| **3–1** (Total: 4) | **1–1** | 🎲 Tier 5 - The Lucky Guess | 1 | 0 (Wrong outcome) | - | **1 pt** |
| **3–1** (Total: 4) | **0–2** | 🛋️ Tier 6 - The Casual | 0 | 0 | - | **0 pts** |
| **2–2** (Total: 4) | **2–2** | 🔮 Tier 1 - The Oracle | 6 | +1 (Goals $\ge 4$) | +1 (Exact Draw) | **8 pts** |
| **1–1** (Total: 2) | **1–1** | 🔮 Tier 1 - The Oracle | 6 | 0 (Goals $< 4$) | +1 (Exact Draw) | **7 pts** |
| **2–2** (Total: 4) | **1–1** | 📋 Tier 2 - The Manager ($0$) | 4 | +1 (Goals $\ge 4$) | 0 (Not exact) | **5 pts** |
| **1–0** (Total: 1) | **1–0** | 🔮 Tier 1 - The Oracle | 6 | 0 (Goals $< 4$) | - | **6 pts** |

---

## ⚡ 4. Evaluation Algorithm Flowchart

```
1. Calculate Match Outcomes:
   actOutcome  = sign(actual_home - actual_away)
   predOutcome = sign(pred_home - pred_away)

2. Evaluate Base Conditions:
   isCorrectOutcome   = (actOutcome == predOutcome)
   isExactScore        = (actual_home == pred_home) AND (actual_away == pred_away)
   isExactGD           = (actual_home - actual_away) == (pred_home - pred_away)
   isOneTeamGoalsExact = (actual_home == pred_home) OR (actual_away == pred_away)

3. Determine Base Tier & Points:
   IF isExactScore                              --> Base = 6 (Tier 1)
   ELSE IF isCorrectOutcome AND isExactGD       --> Base = 4 (Tier 2)
   ELSE IF isCorrectOutcome AND isOneTeamGoals Exact --> Base = 3 (Tier 3)
   ELSE IF isCorrectOutcome                     --> Base = 2 (Tier 4)
   ELSE IF isOneTeamGoalsExact                  --> Base = 1 (Tier 5)
   ELSE                                         --> Base = 0 (Tier 6)

4. Compute Bonus Points:
   highScoringBonus = (actual_home + actual_away >= 4 AND predicted_home + predicted_away >= 4 AND isCorrectOutcome) ? 1 : 0
   drawBonus        = (actual_home == actual_away AND isExactScore) ? 1 : 0

5. Total Score Calculation:
   Total Points = Base + highScoringBonus + drawBonus
```
