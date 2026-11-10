import { fireEvent, render, screen } from '@testing-library/react-native';

import { SelectCountryScreen } from '../src/features/profile/SelectCountryScreen';
import { DESTINATION_COUNTRIES, searchCountries } from '../src/features/profile/data';

describe('destination countries', () => {
  it('lists the launch corridor countries (ADR-043, ADR-100)', () => {
    expect(DESTINATION_COUNTRIES.map((c) => c.currency).sort()).toEqual(['CAD', 'EUR', 'GBP', 'NGN', 'USD']);
    expect(DESTINATION_COUNTRIES.filter((c) => c.available).map((c) => c.currency).sort()).toEqual(['CAD', 'EUR', 'GBP', 'NGN', 'USD']);
  });

  it('searches by name or currency code', () => {
    expect(searchCountries(DESTINATION_COUNTRIES, 'kingdom').map((c) => c.currency)).toEqual(['GBP']);
    expect(searchCountries(DESTINATION_COUNTRIES, 'ngn').map((c) => c.name)).toEqual(['Nigeria']);
    expect(searchCountries(DESTINATION_COUNTRIES, 'canada').map((c) => c.currency)).toEqual(['CAD']);
    expect(searchCountries(DESTINATION_COUNTRIES, '  ')).toHaveLength(5);
    expect(searchCountries(DESTINATION_COUNTRIES, 'france').map((c) => c.currency)).toEqual(['EUR']);
    expect(searchCountries(DESTINATION_COUNTRIES, 'Afghanistan')).toHaveLength(0);
  });
});

describe('Select Destination Country screen', () => {
  it('renders the Figma text and selects an available country', async () => {
    const onSelect = jest.fn();
    await render(<SelectCountryScreen onBack={jest.fn()} onSelect={onSelect} />);
    expect(screen.getByText('Select Destination Country')).toBeTruthy();
    expect(screen.getByText('Choose the country you want to send money to')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search country')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('country-GBP'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ currency: 'GBP' }));
  });

  it('selects the US and Canada, which launch with the UK', async () => {
    const onSelect = jest.fn();
    await render(<SelectCountryScreen onBack={jest.fn()} onSelect={onSelect} />);
    await fireEvent.press(screen.getByTestId('country-USD'));
    await fireEvent.press(screen.getByTestId('country-CAD'));
    expect(onSelect.mock.calls.map((c) => c[0].currency)).toEqual(['USD', 'CAD']);
  });

  it('filters and shows an empty state', async () => {
    await render(<SelectCountryScreen onBack={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('select-country-search'), 'zzz');
    expect(screen.getByTestId('select-country-empty')).toBeTruthy();
  });

  it('goes back', async () => {
    const onBack = jest.fn();
    await render(<SelectCountryScreen onBack={onBack} />);
    await fireEvent.press(screen.getByTestId('select-country-back'));
    expect(onBack).toHaveBeenCalled();
  });
});
