# Browser Smoke Test Checklist

## Scope
- Flow: `Landing -> Tarot(3 cards) -> Birth Input -> Final Questions(3) -> Result`
- Target: desktop Chrome latest, mobile viewport (iPhone 12 size or similar)

## Preconditions
- Open app entry page and confirm first paint renders without JS error text.
- Ensure card assets load from `card/` and back image `card_back_purple.svg`.

## Test Cases
1. Landing
- Primary CTA text is `타로부터 시작하기`.
- Click CTA moves to `/tarot`.

2. Tarot Draw (3 cards)
- Initial screen shows deck strip and three empty slots.
- `카드 뽑기 (1/3)` draws first card.
- Repeat to `카드 뽑기 (3/3)` and verify each slot has a card image.
- After 3 cards, button text changes to `사주 입력으로 이동`.
- Click moves to `/birth` with `tarotSpread` in route state.

3. Birth Input
- Date/time controls are interactive.
- Continue button text is `질문 3개로 마무리하기`.
- Click moves to `/final-questions` with both `birthData` and `tarotSpread`.

4. Final Questions
- Progress bar advances across 3 questions.
- Selecting one option per question auto-advances.
- Last answer moves to `/result3`.

5. Result
- Result page renders zodiac card/image and summary blocks.
- Fallback message (missing state) says `타로 3장 뽑기부터 다시 진행해주세요.`
- `다시 시작하기` returns to `/tarot`.

6. Regression Quick Checks
- Browser back navigation works across each step.
- No broken image icons on tarot cards/result image.
- No console runtime errors during full flow.

## Pass Criteria
- Full flow completes once without reload.
- All required state handoffs work (`tarotSpread`, `birthData`, `finalScores`, `finalAnswers`).
