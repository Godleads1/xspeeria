import { render, screen } from '@testing-library/react-native';
import { color, interaction } from '@xspeeria/tokens';

import {
  Amount,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  StatusChip,
} from '../src/components/primitives';

describe('Amount', () => {
  it('renders integer minor units exactly, with no floating point', async () => {
    await render(<Amount minor={1234} currency="GBP" scale={2} />);
    expect(screen.getByText('12.34 GBP')).toBeTruthy();
  });

  it('pads the fractional part', async () => {
    await render(<Amount minor={1205} currency="NGN" scale={2} />);
    expect(screen.getByText('12.05 NGN')).toBeTruthy();
  });

  it('handles a zero-scale currency', async () => {
    await render(<Amount minor={500} currency="JPY" scale={0} />);
    expect(screen.getByText('500 JPY')).toBeTruthy();
  });

  it('renders negative amounts', async () => {
    await render(<Amount minor={-250} currency="GBP" scale={2} />);
    expect(screen.getByText('-2.50 GBP')).toBeTruthy();
  });

  it('refuses a float rather than silently rounding it', async () => {
    await expect(render(<Amount minor={12.34} currency="GBP" scale={2} />)).rejects.toThrow(
      /integer minor units/,
    );
  });

  it('exposes an accessible label including the value', async () => {
    await render(<Amount minor={1000} currency="GBP" scale={2} label="Allocation" />);
    expect(screen.getByLabelText('Allocation: 10.00 GBP')).toBeTruthy();
  });
});

describe('PrimaryButton', () => {
  it('announces its disabled state rather than relying on colour', async () => {
    await render(<PrimaryButton label="Continue" disabled testID="btn" />);
    const button = screen.getByTestId('btn');
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(button.props.accessibilityRole).toBe('button');
  });

  it('uses the disabled fill swap rather than dimming the enabled fill', async () => {
    const { unmount } = await render(<PrimaryButton label="Continue" disabled testID="btn" />);
    expect(screen.getByTestId('btn')).toHaveStyle({
      backgroundColor: interaction.primary.disabledFill,
    });
    await unmount();

    // A genuine swap: the disabled surface is a different colour, not the same colour
    // at lower opacity, whose contrast would depend on whatever sits behind it.
    await render(<PrimaryButton label="Continue" testID="btn" />);
    expect(screen.getByTestId('btn')).toHaveStyle({
      backgroundColor: interaction.primary.default,
    });
    expect(interaction.primary.disabledFill).not.toBe(interaction.primary.default);
  });

  it('labels the disabled state with the disabled text token, not the on-fill token', async () => {
    await render(<PrimaryButton label="Continue" disabled testID="btn" />);
    expect(screen.getByText('Continue')).toHaveStyle({
      color: interaction.primary.disabledLabel,
    });
  });
});

describe('StatusChip', () => {
  it('carries the status as text, not colour alone', async () => {
    await render(<StatusChip label="Preparation" tone="warning" />);
    expect(screen.getByText('Preparation')).toBeTruthy();
    expect(screen.getByLabelText('Status: Preparation')).toBeTruthy();
  });

  it('uses the status family text colour, never the raw fill, for its label', async () => {
    await render(<StatusChip label="Complete" tone="success" />);
    const label = screen.getByText('Complete');
    const flat = Array.isArray(label.props.style)
      ? Object.assign({}, ...label.props.style.flat())
      : label.props.style;
    expect(flat.color).toBe(color.success.text);
    expect(flat.color).not.toBe(color.success.fill);
  });
});

describe('states', () => {
  it('exposes loading to assistive technology', async () => {
    await render(<LoadingState label="Loading offers" />);
    expect(screen.getByLabelText('Loading offers')).toBeTruthy();
  });

  it('gives every empty state a next action', async () => {
    await render(<EmptyState title="Nothing here" actionLabel="Create one" />);
    expect(screen.getByText('Create one')).toBeTruthy();
  });

  it('announces errors and offers a retry', async () => {
    await render(<ErrorState title="That did not work" />);
    expect(screen.getByText('That did not work')).toBeTruthy();
    expect(screen.getByTestId('error-retry')).toBeTruthy();
  });
});
