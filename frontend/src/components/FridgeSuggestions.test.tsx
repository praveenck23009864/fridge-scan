import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FridgeSuggestions from '../features/shopping-lists/FridgeSuggestions';
import { addFridgeSuggestions } from '../services/api';
vi.mock('../services/api', () => ({ addFridgeSuggestions: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const list = { id: 1, name: 'Weekly', items: [] };
const data = { scan_id: 7, is_mock: false, items: [{ id: 11, name: 'Milk', stock_status: 'low' as const }, { id: 12, name: 'Tomatoes', stock_status: 'low' as const }] };
it('requires approval, bulk adds selected IDs and blocks repeated clicks', async () => {
    let resolve!: (value: typeof list) => void;
    vi.mocked(addFridgeSuggestions).mockImplementation(() => new Promise(r => { resolve = r; }));
    const updated = vi.fn(); const user = userEvent.setup(); render(<FridgeSuggestions list={list} data={data} loading={false} error="" onRefresh={vi.fn()} onUpdated={updated} />);
    expect(addFridgeSuggestions).not.toHaveBeenCalled();
    for (const checkbox of screen.getAllByRole('checkbox')) await user.click(checkbox);
    await user.dblClick(screen.getByRole('button', { name: 'Add selected suggestions (2)' }));
    expect(addFridgeSuggestions).toHaveBeenCalledTimes(1); expect(addFridgeSuggestions).toHaveBeenCalledWith(1, 7, [11, 12]);
    resolve(list); await screen.findByText('Selected fridge suggestions are now in your list.'); expect(updated).toHaveBeenCalledWith(list);
});
it('handles empty state, failures and retry without losing selections', async () => {
    const user = userEvent.setup(); const props = { list, data, loading: false, error: '', onRefresh: vi.fn(), onUpdated: vi.fn() }; const view = render(<FridgeSuggestions {...props} data={{ ...data, items: [] }} />);
    expect(screen.getByText(/No low-stock ingredients found/)).toBeTruthy(); view.rerender(<FridgeSuggestions {...props} />);
    vi.mocked(addFridgeSuggestions).mockRejectedValueOnce(new Error('Try again')).mockResolvedValueOnce(list);
    await user.click(screen.getAllByRole('checkbox')[0]); await user.click(screen.getByRole('button', { name: 'Add selected suggestions (1)' })); await screen.findByRole('alert');
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Add selected suggestions (1)' })); await screen.findByText('Selected fridge suggestions are now in your list.');
});
it('disables existing names and exposes loading and API failure states', () => {
    const props = { list: { ...list, items: [{ id: 1, shopping_list_id: 1, name: ' MILK ', quantity: 1, completed: true }] }, data, loading: false, error: '', onRefresh: vi.fn(), onUpdated: vi.fn() };
    const view = render(<FridgeSuggestions {...props} />); expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).disabled).toBe(true); expect(screen.getByText('Already in list')).toBeTruthy();
    view.rerender(<FridgeSuggestions {...props} loading />); expect(screen.getByRole('status').textContent).toContain('Loading');
    view.rerender(<FridgeSuggestions {...props} error="Could not load suggestions" />); expect(screen.getByRole('alert').textContent).toContain('Could not load');
});
