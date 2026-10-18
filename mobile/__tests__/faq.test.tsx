import { fireEvent, render, screen } from '@testing-library/react-native';

import { FaqScreen } from '../src/features/faq/FaqScreen';
import { FAQ, filterFaq } from '../src/features/faq/data';

describe('FAQ content', () => {
  it('has no placeholder text, other product names, money figures or licence claims', () => {
    const text = JSON.stringify(FAQ);
    expect(text).not.toMatch(/lorem|ipsum|tradebase/i);
    expect(text).not.toMatch(/₦\s?\d|£\s?\d|\$\s?\d/);
    // The only percentage allowed is the approved 1% coordination fee (ADR-021).
    expect(text.match(/\d+(\.\d+)?\s?%/g)).toEqual(['1%']);
    expect(FAQ.find((i) => i.id === 'cost')?.answer).toMatch(/1% of the money each side sends/);
    expect(text).not.toMatch(/licen[cs]ed|regulated|guarantee/i);
    expect(text).not.toMatch(/wallet balance|your balance/i);
  });

  it('filters by topic and keyword across questions and answers', () => {
    expect(filterFaq(FAQ, '', 'sell').every((i) => i.topic === 'sell')).toBe(true);
    expect(filterFaq(FAQ, 'BORDER', null).map((i) => i.id)).toEqual(['hold-money']);
    expect(filterFaq(FAQ, 'zzz', null)).toHaveLength(0);
  });
});

describe('FAQ screen', () => {
  it('renders the Figma layout with the first question open', async () => {
    await render(<FaqScreen onBack={jest.fn()} />);
    expect(screen.getByText('How can we help you?')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter your keyword')).toBeTruthy();
    for (const t of ['Getting Started', 'How to Sell', 'Payments']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByText('Top Questions')).toBeTruthy();
    expect(screen.getByTestId('faq-answer-create-account')).toBeTruthy();
    expect(screen.getAllByTestId(/^faq-answer-/)).toHaveLength(1);
  });

  it('expands one question at a time', async () => {
    await render(<FaqScreen onBack={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('faq-hold-money'));
    expect(screen.getByTestId('faq-answer-hold-money')).toBeTruthy();
    expect(screen.queryByTestId('faq-answer-create-account')).toBeNull();
    await fireEvent.press(screen.getByTestId('faq-hold-money'));
    expect(screen.queryByTestId('faq-answer-hold-money')).toBeNull();
  });

  it('View all shows every question', async () => {
    await render(<FaqScreen onBack={jest.fn()} />);
    const top = FAQ.filter((i) => i.top).length;
    expect(screen.getAllByTestId(/^faq-(?!answer|topic|search|back|view|screen|empty)/)).toHaveLength(top);
    await fireEvent.press(screen.getByTestId('faq-view-all'));
    expect(screen.getAllByTestId(/^faq-(?!answer|topic|search|back|view|screen|empty)/)).toHaveLength(FAQ.length);
  });

  it('topic cards and search filter, with an empty state', async () => {
    await render(<FaqScreen onBack={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('faq-topic-payments'));
    expect(screen.getByTestId('faq-cost')).toBeTruthy();
    expect(screen.queryByTestId('faq-how-to-sell')).toBeNull();
    await fireEvent.press(screen.getByTestId('faq-topic-payments'));
    await fireEvent.changeText(screen.getByTestId('faq-search'), 'qwerty');
    expect(screen.getByTestId('faq-empty')).toBeTruthy();
  });
});
