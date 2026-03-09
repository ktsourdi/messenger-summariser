import { formatQuickDigest, formatFullDigest, formatActionOnly } from '../delivery/telegram';
import type { SummaryResponse } from '../models/types';

function makeSummaryResponse(overrides?: Partial<SummaryResponse>): SummaryResponse {
  return {
    id: 'summary-1',
    conversationTitle: 'Team Chat',
    summaryType: 'manual',
    shortSummary: '5 messages from Alice, Bob',
    detailedSummary: '**Alice:** said hello\n**Bob:** replied',
    actionItems: ['Alice: Please review the PR', 'Bob: Need to update docs'],
    unansweredQuestions: ['Alice: When is the deadline?'],
    decisions: ['Bob: We decided to use TypeScript'],
    mentions: ['@Charlie'],
    needsReplyScore: 30,
    voiceNoteHighlights: ['Voice note from Alice at 10:00'],
    createdAt: '2024-01-01T10:00:00Z',
    ...overrides,
  };
}

describe('formatQuickDigest', () => {
  it('produces expected format with title, summary, and action items', () => {
    const summary = makeSummaryResponse();
    const output = formatQuickDigest(summary);

    expect(output).toContain('📝 *Team Chat*');
    expect(output).toContain('5 messages from Alice, Bob');
    expect(output).toContain('*Action items:*');
    expect(output).toContain('Alice: Please review the PR');
    expect(output).toContain('Bob: Need to update docs');
  });

  it('shows needs-reply warning when score > 50', () => {
    const summary = makeSummaryResponse({ needsReplyScore: 75 });
    const output = formatQuickDigest(summary);

    expect(output).toContain('⚠️ Needs reply (score: 75/100)');
  });

  it('does not show needs-reply warning when score <= 50', () => {
    const summary = makeSummaryResponse({ needsReplyScore: 30 });
    const output = formatQuickDigest(summary);

    expect(output).not.toContain('⚠️ Needs reply');
  });

  it('truncates action items to 3 and shows overflow count', () => {
    const summary = makeSummaryResponse({
      actionItems: [
        'Item 1: Do this',
        'Item 2: Do that',
        'Item 3: Do another',
        'Item 4: Do more',
        'Item 5: Do extra',
      ],
    });
    const output = formatQuickDigest(summary);

    expect(output).toContain('Item 1: Do this');
    expect(output).toContain('Item 2: Do that');
    expect(output).toContain('Item 3: Do another');
    expect(output).not.toContain('Item 4: Do more');
    expect(output).not.toContain('Item 5: Do extra');
    expect(output).toContain('…and 2 more');
  });

  it('handles no action items gracefully', () => {
    const summary = makeSummaryResponse({ actionItems: [] });
    const output = formatQuickDigest(summary);

    expect(output).toContain('📝 *Team Chat*');
    expect(output).not.toContain('*Action items:*');
  });
});

describe('formatFullDigest', () => {
  it('includes all sections', () => {
    const summary = makeSummaryResponse();
    const output = formatFullDigest(summary);

    expect(output).toContain('📝 *Team Chat*');
    expect(output).toContain('_manual summary_');
    expect(output).toContain('*Summary:*');
    expect(output).toContain('*Details:*');
    expect(output).toContain('*Action Items:*');
    expect(output).toContain('*Unanswered Questions:*');
    expect(output).toContain('❓');
    expect(output).toContain('*Decisions:*');
    expect(output).toContain('✅');
    expect(output).toContain('*Mentions:*');
    expect(output).toContain('@Charlie');
    expect(output).toContain('*Voice Notes:*');
    expect(output).toContain('🎤');
    expect(output).toContain('Reply score: 30/100');
  });

  it('omits empty sections', () => {
    const summary = makeSummaryResponse({
      detailedSummary: undefined,
      actionItems: [],
      unansweredQuestions: [],
      decisions: [],
      mentions: [],
      voiceNoteHighlights: [],
    });
    const output = formatFullDigest(summary);

    expect(output).not.toContain('*Details:*');
    expect(output).not.toContain('*Action Items:*');
    expect(output).not.toContain('*Unanswered Questions:*');
    expect(output).not.toContain('*Decisions:*');
    expect(output).not.toContain('*Mentions:*');
    expect(output).not.toContain('*Voice Notes:*');
    // Reply score is always shown
    expect(output).toContain('Reply score: 30/100');
  });
});

describe('formatActionOnly', () => {
  it('shows action items with title', () => {
    const summary = makeSummaryResponse();
    const output = formatActionOnly(summary);

    expect(output).toContain('📋 *Action Items – Team Chat*');
    expect(output).toContain('Alice: Please review the PR');
    expect(output).toContain('Bob: Need to update docs');
  });

  it('shows "no action items" message when empty', () => {
    const summary = makeSummaryResponse({ actionItems: [] });
    const output = formatActionOnly(summary);

    expect(output).toContain('_No action items found._');
  });

  it('includes unanswered questions section', () => {
    const summary = makeSummaryResponse();
    const output = formatActionOnly(summary);

    expect(output).toContain('*Unanswered Questions:*');
    expect(output).toContain('❓ Alice: When is the deadline?');
  });

  it('omits unanswered questions section when empty', () => {
    const summary = makeSummaryResponse({ unansweredQuestions: [] });
    const output = formatActionOnly(summary);

    expect(output).not.toContain('*Unanswered Questions:*');
  });
});
